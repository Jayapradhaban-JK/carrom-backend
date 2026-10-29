import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  Tournament,
  TournamentFormat,
  TournamentStatus,
} from '../../entities/tournament.entity';
import { Team } from '../../entities/team.entity';
import { Match, MatchStatus } from '../../entities/match.entity';
import { MatchEvent } from '../../entities/match-event.entity';
import { TournamentsService } from '../tournaments/tournaments.service';
import { UpdatesService } from '../updates/updates.service';
import { GenerateFixturesDto } from './dto/generate-fixtures.dto';
import { ResetFixturesDto } from './dto/reset-fixtures.dto';

@Injectable()
export class FixturesService {
  private readonly logger = new Logger(FixturesService.name);

  constructor(
    @InjectRepository(Tournament)
    private readonly tournamentRepo: Repository<Tournament>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(MatchEvent)
    private readonly eventRepo: Repository<MatchEvent>,
    private readonly tournamentsService: TournamentsService,
    private readonly updatesService: UpdatesService,
    private readonly dataSource: DataSource,
  ) {}

  async generate(dto: GenerateFixturesDto) {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();

    // Check existing matches
    const existingCount = await this.matchRepo.count({
      where: { tournament_id: tournament.id },
    });
    if (existingCount > 0 && !dto.force) {
      throw new ConflictException(
        'Fixtures have already been generated for this tournament. Please confirm reset if you wish to regenerate.',
      );
    }

    const teams = await this.teamRepo.find({
      where: { tournament_id: tournament.id },
      order: { created_at: 'ASC' },
    });

    if (teams.length < 2) {
      throw new BadRequestException(
        `At least 2 registered teams are required to generate fixtures. Currently registered: ${teams.length}.`,
      );
    }

    // Apply tournament configuration overrides if provided
    const format = dto.format || tournament.format;
    const matchDuration = dto.match_duration_minutes ?? tournament.match_duration_minutes;
    const interval = dto.interval_minutes ?? tournament.interval_minutes;
    const slotDurationMs = (matchDuration + interval) * 60 * 1000;
    const startTime = dto.start_time
      ? new Date(dto.start_time)
      : tournament.start_time
      ? new Date(tournament.start_time)
      : new Date();
    const thirdPlace = dto.third_place_playoff ?? tournament.third_place_playoff;

    return this.dataSource.transaction(async (manager) => {
      // 1. Delete existing matches and events if regenerating
      if (existingCount > 0) {
        await manager.query(
          `DELETE FROM match_events WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = $1)`,
          [tournament.id],
        );
        await manager.query(
          `DELETE FROM matches WHERE tournament_id = $1`,
          [tournament.id],
        );
      }

      // Update tournament settings
      tournament.format = format;
      tournament.match_duration_minutes = matchDuration;
      tournament.interval_minutes = interval;
      tournament.start_time = startTime;
      tournament.third_place_playoff = thirdPlace;
      tournament.status = TournamentStatus.IN_PROGRESS;
      tournament.registration_open = false; // Freeze registration
      await manager.save(Tournament, tournament);

      let createdMatches: Match[] = [];

      if (format === TournamentFormat.SINGLE_ELIMINATION) {
        createdMatches = await this.generateSingleElimination(
          manager,
          tournament,
          teams,
          startTime,
          matchDuration,
          interval,
          thirdPlace,
        );
      } else {
        createdMatches = await this.generateRoundRobin(
          manager,
          tournament,
          teams,
          startTime,
          matchDuration,
          interval,
        );
      }

      this.logger.log(
        `Generated ${createdMatches.length} fixtures for tournament "${tournament.name}" (${format})`,
      );

      this.updatesService.emit({
        type: 'FIXTURES_GENERATED',
        tournamentId: tournament.id,
        data: {
          totalMatches: createdMatches.length,
          format,
        },
      });

      return {
        success: true,
        message: `Successfully generated ${createdMatches.length} fixtures for ${teams.length} teams.`,
        totalMatches: createdMatches.length,
        format,
      };
    });
  }

  private async generateSingleElimination(
    manager: any,
    tournament: Tournament,
    teams: Team[],
    startTime: Date,
    matchDuration: number,
    interval: number,
    thirdPlacePlayoff: boolean,
  ): Promise<Match[]> {
    const N = teams.length;
    // Calculate nearest power of 2 >= N
    let power = 2;
    while (power < N) {
      power *= 2;
    }
    const totalRounds = Math.log2(power);

    // Get standard round naming
    const getRoundName = (roundNum: number) => {
      const remainingRounds = totalRounds - roundNum + 1;
      if (remainingRounds === 1) return 'Final';
      if (remainingRounds === 2) return 'Semifinals';
      if (remainingRounds === 3) return 'Quarterfinals';
      if (remainingRounds === 4) return 'Round of 16';
      return `Round ${roundNum}`;
    };

    // Build standard tournament seeding array of length `power`
    // For power = 4: [1, 4, 2, 3] -> (1 vs 4), (2 vs 3)
    // For power = 8: [1, 8, 4, 5, 2, 7, 3, 6] -> (1 vs 8), (4 vs 5), (2 vs 7), (3 vs 6)
    const seedOrder = this.getBracketSeedOrder(power);

    // Create match objects layer by layer from Final down to Round 1
    // Matches will be saved to get IDs, then linked with next_match_id
    const roundMatches: { [round: number]: Match[] } = {};
    let globalMatchNumber = 1;

    // 1. Build Final (Round totalRounds)
    const finalMatch = manager.create(Match, {
      tournament_id: tournament.id,
      round_number: totalRounds,
      round_name: 'Final',
      match_number: 0, // will assign later
      status: MatchStatus.SCHEDULED,
      board_number: 1,
    });
    const savedFinal = await manager.save(Match, finalMatch);
    roundMatches[totalRounds] = [savedFinal];

    // Optional 3rd place match
    let savedThirdPlace: Match | null = null;
    if (thirdPlacePlayoff && totalRounds >= 2) {
      const thirdPlaceMatch = manager.create(Match, {
        tournament_id: tournament.id,
        round_number: totalRounds,
        round_name: '3rd Place Playoff',
        match_number: 0,
        status: MatchStatus.SCHEDULED,
        board_number: 2,
        is_third_place: true,
      });
      savedThirdPlace = await manager.save(Match, thirdPlaceMatch);
    }

    // 2. Build intermediate rounds from (totalRounds - 1) down to 1
    for (let r = totalRounds - 1; r >= 1; r--) {
      const parentMatches = roundMatches[r + 1];
      const matchCountInRound = parentMatches.length * 2;
      roundMatches[r] = [];

      for (let i = 0; i < parentMatches.length; i++) {
        const parentMatch = parentMatches[i];

        // Slot A feeder
        const matchA = manager.create(Match, {
          tournament_id: tournament.id,
          round_number: r,
          round_name: getRoundName(r),
          match_number: 0,
          status: MatchStatus.SCHEDULED,
          next_match_id: parentMatch.id,
          next_match_slot: 'A',
        });
        const savedA = await manager.save(Match, matchA);
        roundMatches[r].push(savedA);

        // Slot B feeder
        const matchB = manager.create(Match, {
          tournament_id: tournament.id,
          round_number: r,
          round_name: getRoundName(r),
          match_number: 0,
          status: MatchStatus.SCHEDULED,
          next_match_id: parentMatch.id,
          next_match_slot: 'B',
        });
        const savedB = await manager.save(Match, matchB);
        roundMatches[r].push(savedB);
      }
    }

    // 3. Assign teams and byes to Round 1 matches
    const round1Matches = roundMatches[1];
    const slotDurationMs = (matchDuration + interval) * 60 * 1000;
    let currentSlotTime = new Date(startTime.getTime());

    // Teams array indexed 0 to N-1 (Seeds 1 to N).
    // Indices >= N are BYEs.
    const byesToAdvance: { match: Match; team: Team }[] = [];

    for (let i = 0; i < round1Matches.length; i++) {
      const match = round1Matches[i];
      const seedA = seedOrder[2 * i];
      const seedB = seedOrder[2 * i + 1];

      const teamA = seedA <= N ? teams[seedA - 1] : null;
      const teamB = seedB <= N ? teams[seedB - 1] : null;

      match.team_a_id = teamA ? teamA.id : null;
      match.team_a = teamA;
      match.team_b_id = teamB ? teamB.id : null;
      match.team_b = teamB;

      if (teamA && !teamB) {
        // Team A gets a BYE
        match.is_bye = true;
        match.status = MatchStatus.COMPLETED;
        match.winner_team_id = teamA.id;
        match.winner_team = teamA;
        match.notes = `${teamA.team_name} received a First Round BYE`;
        byesToAdvance.push({ match, team: teamA });
      } else if (!teamA && teamB) {
        // Team B gets a BYE
        match.is_bye = true;
        match.status = MatchStatus.COMPLETED;
        match.winner_team_id = teamB.id;
        match.winner_team = teamB;
        match.notes = `${teamB.team_name} received a First Round BYE`;
        byesToAdvance.push({ match, team: teamB });
      } else if (teamA && teamB) {
        match.is_bye = false;
        match.status = MatchStatus.READY;
      }
    }

    // 4. Schedule matches sequentially across Board 1 and Board 2
    // Round 1 non-bye matches first, then subsequent rounds
    const allMatchesToSchedule: Match[] = [];

    // Collect all matches round by round
    for (let r = 1; r <= totalRounds; r++) {
      for (const m of roundMatches[r]) {
        allMatchesToSchedule.push(m);
      }
    }
    if (savedThirdPlace) {
      allMatchesToSchedule.push(savedThirdPlace);
    }

    // Assign match_number and scheduling time slots
    let matchCounter = 1;
    let timeCursor = new Date(startTime.getTime());
    let currentBoard = 1;

    for (let r = 1; r <= totalRounds; r++) {
      const matchesInThisRound = roundMatches[r];
      // Filter out pure byes for time slot scheduling
      const realMatches = matchesInThisRound.filter((m) => !m.is_bye);

      // Distribute real matches across Board 1 and Board 2
      for (let idx = 0; idx < realMatches.length; idx++) {
        const m = realMatches[idx];
        m.match_number = matchCounter++;
        m.board_number = (idx % 2 === 0) ? 1 : 2;

        const slotIndex = Math.floor(idx / 2);
        const matchStart = new Date(timeCursor.getTime() + slotIndex * slotDurationMs);
        const matchEnd = new Date(matchStart.getTime() + matchDuration * 60 * 1000);

        m.scheduled_start = matchStart;
        m.scheduled_end = matchEnd;
      }

      // Also set match_number on byes so everything has a clean sequence
      for (const b of matchesInThisRound.filter((m) => m.is_bye)) {
        b.match_number = matchCounter++;
        b.scheduled_start = timeCursor;
        b.scheduled_end = new Date(timeCursor.getTime() + matchDuration * 60 * 1000);
      }

      // Advance time cursor for the next round
      const slotsNeeded = Math.ceil(realMatches.length / 2);
      const roundDurationMs = Math.max(1, slotsNeeded) * slotDurationMs;
      timeCursor = new Date(timeCursor.getTime() + roundDurationMs);
    }

    // If 3rd place playoff exists, schedule it just before or parallel to final
    if (savedThirdPlace) {
      savedThirdPlace.match_number = matchCounter++;
      savedThirdPlace.board_number = 2;
      savedThirdPlace.scheduled_start = savedFinal.scheduled_start;
      savedThirdPlace.scheduled_end = savedFinal.scheduled_end;
    }

    // Save all matches
    await manager.save(Match, allMatchesToSchedule);

    // 5. Automatically advance BYE winners into their next match
    for (const bye of byesToAdvance) {
      if (bye.match.next_match_id) {
        const nextMatch = allMatchesToSchedule.find(
          (m) => m.id === bye.match.next_match_id,
        );
        if (nextMatch) {
          if (bye.match.next_match_slot === 'A') {
            nextMatch.team_a_id = bye.team.id;
            nextMatch.team_a = bye.team;
          } else {
            nextMatch.team_b_id = bye.team.id;
            nextMatch.team_b = bye.team;
          }
          if (nextMatch.team_a_id && nextMatch.team_b_id) {
            nextMatch.status = MatchStatus.READY;
          }
          await manager.save(Match, nextMatch);
        }
      }
    }

    return allMatchesToSchedule;
  }

  private async generateRoundRobin(
    manager: any,
    tournament: Tournament,
    teams: Team[],
    startTime: Date,
    matchDuration: number,
    interval: number,
  ): Promise<Match[]> {
    const N = teams.length;
    const teamList: (Team | null)[] = [...teams];
    if (N % 2 !== 0) {
      // Add dummy team representing a bye
      teamList.push(null);
    }

    const numTeams = teamList.length;
    const totalRounds = numTeams - 1;
    const matchesPerRound = numTeams / 2;
    const slotDurationMs = (matchDuration + interval) * 60 * 1000;

    let timeCursor = new Date(startTime.getTime());
    let matchCounter = 1;
    const allMatches: Match[] = [];

    // Circle method
    const rotating = [...teamList];

    for (let r = 0; r < totalRounds; r++) {
      const roundName = `Round ${r + 1}`;
      const roundPairs: { teamA: Team; teamB: Team }[] = [];

      for (let i = 0; i < matchesPerRound; i++) {
        const t1 = rotating[i];
        const t2 = rotating[numTeams - 1 - i];

        if (t1 !== null && t2 !== null) {
          roundPairs.push({ teamA: t1, teamB: t2 });
        }
      }

      // Schedule this round's matches across Board 1 and Board 2
      // Two matches per time slot (one on Board 1, one on Board 2)
      for (let idx = 0; idx < roundPairs.length; idx++) {
        const pair = roundPairs[idx];
        const boardNumber = idx % 2 === 0 ? 1 : 2;
        const slotInRound = Math.floor(idx / 2);

        const matchStart = new Date(timeCursor.getTime() + slotInRound * slotDurationMs);
        const matchEnd = new Date(matchStart.getTime() + matchDuration * 60 * 1000);

        const match = manager.create(Match, {
          tournament_id: tournament.id,
          round_number: r + 1,
          round_name: roundName,
          match_number: matchCounter++,
          board_number: boardNumber,
          team_a_id: pair.teamA.id,
          team_a: pair.teamA,
          team_b_id: pair.teamB.id,
          team_b: pair.teamB,
          status: r === 0 ? MatchStatus.READY : MatchStatus.SCHEDULED,
          scheduled_start: matchStart,
          scheduled_end: matchEnd,
        });

        allMatches.push(match);
      }

      // Advance time cursor for next round
      const slotsInThisRound = Math.ceil(roundPairs.length / 2);
      timeCursor = new Date(timeCursor.getTime() + slotsInThisRound * slotDurationMs);

      // Rotate teams (keep element 0 fixed, rotate others clockwise)
      const last = rotating.pop()!;
      rotating.splice(1, 0, last);
    }

    await manager.save(Match, allMatches);
    return allMatches;
  }

  // Generates standard bracket seed order recursively
  // e.g. for 4: [1, 4, 2, 3]
  // e.g. for 8: [1, 8, 4, 5, 2, 7, 3, 6]
  private getBracketSeedOrder(numSlots: number): number[] {
    let seeds = [1, 2];
    while (seeds.length < numSlots) {
      const next: number[] = [];
      const sum = seeds.length * 2 + 1;
      for (const s of seeds) {
        next.push(s);
        next.push(sum - s);
      }
      seeds = next;
    }
    return seeds;
  }

  async reset(dto: ResetFixturesDto) {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();

    return this.dataSource.transaction(async (manager) => {
      await manager.query(
        `DELETE FROM match_events WHERE match_id IN (SELECT id FROM matches WHERE tournament_id = $1)`,
        [tournament.id],
      );
      await manager.query(`DELETE FROM matches WHERE tournament_id = $1`, [
        tournament.id,
      ]);

      tournament.status = TournamentStatus.REGISTRATION_OPEN;
      if (dto.reopen_registration !== false) {
        tournament.registration_open = true;
      }
      await manager.save(Tournament, tournament);

      this.logger.log(`Fixtures reset for tournament "${tournament.name}"`);

      this.updatesService.emit({
        type: 'FIXTURES_RESET',
        tournamentId: tournament.id,
        data: {
          registration_open: tournament.registration_open,
          status: tournament.status,
        },
      });

      return {
        success: true,
        message: 'Fixtures have been safely reset and registration is reopened.',
      };
    });
  }
}

