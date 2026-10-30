import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Tournament,
  TournamentStatus,
  TournamentFormat,
} from '../../entities/tournament.entity';
import { Team } from '../../entities/team.entity';
import { Player } from '../../entities/player.entity';
import { Match, MatchStatus } from '../../entities/match.entity';
import { TournamentSetting } from '../../entities/tournament-setting.entity';
import { UpdatesService } from '../updates/updates.service';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';

@Injectable()
export class TournamentsService {
  private readonly logger = new Logger(TournamentsService.name);

  constructor(
    @InjectRepository(Tournament)
    private readonly tournamentRepo: Repository<Tournament>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(TournamentSetting)
    private readonly settingRepo: Repository<TournamentSetting>,
    private readonly updatesService: UpdatesService,
  ) {}

  async getOrCreateActiveTournament(): Promise<Tournament> {
    let tournament = await this.tournamentRepo.findOne({
      where: {},
      order: { created_at: 'DESC' },
    });

    if (!tournament) {
      this.logger.log('No active tournament found, creating default tournament...');
      tournament = this.tournamentRepo.create({
        name: 'Talent Takeaways Infotech PVT LTD - Carrom Tournament 2026',
        format: TournamentFormat.SINGLE_ELIMINATION,
        status: TournamentStatus.REGISTRATION_OPEN,
        registration_open: true,
        team_size: 2,
        match_duration_minutes: 20,
        interval_minutes: 5,
        start_time: new Date('2026-11-05T09:00:00.000Z'),
        third_place_playoff: false,
        settings: {
          company_name: 'Talent Takeaways Infotech PVT LTD',
          event_date: '2026-11-05',
          company_logo: '/company-logo.jpg',
        },
      });
      tournament = await this.tournamentRepo.save(tournament);
    }

    return tournament;
  }

  async getActiveDashboardSummary() {
    const tournament = await this.getOrCreateActiveTournament();

    const [totalTeams, totalPlayers, matches] = await Promise.all([
      this.teamRepo.count({ where: { tournament_id: tournament.id } }),
      this.playerRepo
        .createQueryBuilder('p')
        .innerJoin('p.team', 't')
        .where('t.tournament_id = :tid', { tid: tournament.id })
        .getCount(),
      this.matchRepo.find({
        where: { tournament_id: tournament.id },
        order: { scheduled_start: 'ASC', match_number: 'ASC' },
        relations: [
          'team_a',
          'team_a.players',
          'team_b',
          'team_b.players',
          'winner_team',
        ],
      }),
    ]);

    const completedMatches = matches.filter(
      (m) => m.status === MatchStatus.COMPLETED,
    ).length;
    const inProgressMatches = matches.filter(
      (m) => m.status === MatchStatus.IN_PROGRESS,
    );
    const upcomingMatches = matches.filter(
      (m) => m.status === MatchStatus.SCHEDULED || m.status === MatchStatus.READY,
    ).length;

    // Determine status and active match for Board 1
    const board1Matches = matches.filter((m) => m.board_number === 1);
    const board1InProgress = board1Matches.find(
      (m) => m.status === MatchStatus.IN_PROGRESS,
    );
    const board1Upcoming = board1Matches.find(
      (m) => m.status === MatchStatus.READY || m.status === MatchStatus.SCHEDULED,
    );
    const board1Match = board1InProgress || board1Upcoming || null;
    const board1Status = board1InProgress
      ? 'In Progress'
      : board1Upcoming
      ? 'Upcoming'
      : 'Available';

    // Determine status and active match for Board 2
    const board2Matches = matches.filter((m) => m.board_number === 2);
    const board2InProgress = board2Matches.find(
      (m) => m.status === MatchStatus.IN_PROGRESS,
    );
    const board2Upcoming = board2Matches.find(
      (m) => m.status === MatchStatus.READY || m.status === MatchStatus.SCHEDULED,
    );
    const board2Match = board2InProgress || board2Upcoming || null;
    const board2Status = board2InProgress
      ? 'In Progress'
      : board2Upcoming
      ? 'Upcoming'
      : 'Available';

    return {
      tournament,
      stats: {
        total_teams: totalTeams,
        total_players: totalPlayers,
        total_matches: matches.length,
        completed_matches: completedMatches,
        in_progress_matches: inProgressMatches.length,
        upcoming_matches: upcomingMatches,
      },
      boards: {
        board_1: {
          board_number: 1,
          status: board1Status,
          current_match: board1Match,
        },
        board_2: {
          board_number: 2,
          status: board2Status,
          current_match: board2Match,
        },
      },
    };
  }

  async updateRegistration(dto: UpdateRegistrationDto) {
    const tournament = await this.getOrCreateActiveTournament();

    if (dto.team_size !== undefined && dto.team_size !== tournament.team_size) {
      const matchCount = await this.matchRepo.count({
        where: { tournament_id: tournament.id },
      });
      if (matchCount > 0) {
        throw new BadRequestException(
          'Cannot modify team size after fixtures have been generated. Reset fixtures first.',
        );
      }
      tournament.team_size = dto.team_size;
    }

    if (dto.registration_open !== undefined) {
      tournament.registration_open = dto.registration_open;
    }

    const saved = await this.tournamentRepo.save(tournament);
    this.updatesService.emit({
      type: 'REGISTRATION_STATUS',
      tournamentId: saved.id,
      data: {
        registration_open: saved.registration_open,
        team_size: saved.team_size,
      },
    });

    return saved;
  }

  async updateTournament(dto: UpdateTournamentDto) {
    const tournament = await this.getOrCreateActiveTournament();

    if (dto.name !== undefined) tournament.name = dto.name;
    if (dto.format !== undefined) tournament.format = dto.format;
    if (dto.status !== undefined) tournament.status = dto.status;
    if (dto.match_duration_minutes !== undefined)
      tournament.match_duration_minutes = dto.match_duration_minutes;
    if (dto.interval_minutes !== undefined)
      tournament.interval_minutes = dto.interval_minutes;
    if (dto.start_time !== undefined)
      tournament.start_time = new Date(dto.start_time);
    if (dto.third_place_playoff !== undefined)
      tournament.third_place_playoff = dto.third_place_playoff;
    if (dto.scoring_rule !== undefined)
      tournament.scoring_rule = dto.scoring_rule;
    if (dto.target_score !== undefined)
      tournament.target_score = dto.target_score;
    if (dto.banner_url !== undefined)
      tournament.banner_url = dto.banner_url;

    const saved = await this.tournamentRepo.save(tournament);
    this.updatesService.emit({
      type: 'TOURNAMENT_UPDATED',
      tournamentId: saved.id,
      data: saved,
    });

    return saved;
  }

  async updateSettings(settings: Record<string, any>) {
    const tournament = await this.getOrCreateActiveTournament();
    tournament.settings = {
      ...(tournament.settings || {}),
      ...settings,
    };
    const saved = await this.tournamentRepo.save(tournament);

    // Also persist individual rows into tournament_settings table
    for (const [key, value] of Object.entries(settings)) {
      const stringVal =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
      let row = await this.settingRepo.findOne({
        where: { tournament_id: tournament.id, setting_key: key },
      });
      if (row) {
        row.setting_value = stringVal;
      } else {
        row = this.settingRepo.create({
          tournament_id: tournament.id,
          setting_key: key,
          setting_value: stringVal,
        });
      }
      await this.settingRepo.save(row);
    }

    this.updatesService.emit({
      type: 'TOURNAMENT_UPDATED',
      tournamentId: saved.id,
      data: saved,
    });

    return saved;
  }
}
