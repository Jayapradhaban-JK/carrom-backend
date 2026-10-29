import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, Not, In } from 'typeorm';
import { Match, MatchStatus } from '../../entities/match.entity';
import { MatchEvent } from '../../entities/match-event.entity';
import { Tournament, TournamentStatus } from '../../entities/tournament.entity';
import { Team } from '../../entities/team.entity';
import { UpdatesService } from '../updates/updates.service';
import { TournamentsService } from '../tournaments/tournaments.service';
import { UpdateScoreDto } from './dto/update-score.dto';
import { CompleteMatchDto } from './dto/complete-match.dto';
import { ScheduleMatchDto } from './dto/schedule-match.dto';

@Injectable()
export class MatchesService {
  private readonly logger = new Logger(MatchesService.name);

  constructor(
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    @InjectRepository(MatchEvent)
    private readonly eventRepo: Repository<MatchEvent>,
    @InjectRepository(Tournament)
    private readonly tournamentRepo: Repository<Tournament>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    private readonly tournamentsService: TournamentsService,
    private readonly updatesService: UpdatesService,
    private readonly dataSource: DataSource,
  ) {}

  async findAll(filters?: {
    board?: number;
    status?: MatchStatus;
    round?: number;
  }): Promise<Match[]> {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();
    const query = this.matchRepo
      .createQueryBuilder('match')
      .leftJoinAndSelect('match.team_a', 'team_a')
      .leftJoinAndSelect('match.team_b', 'team_b')
      .leftJoinAndSelect('match.winner_team', 'winner_team')
      .where('match.tournament_id = :tid', { tid: tournament.id });

    if (filters?.board) {
      query.andWhere('match.board_number = :board', { board: filters.board });
    }
    if (filters?.status) {
      query.andWhere('match.status = :status', { status: filters.status });
    }
    if (filters?.round) {
      query.andWhere('match.round_number = :round', { round: filters.round });
    }

    query.orderBy('match.scheduled_start', 'ASC').addOrderBy('match.match_number', 'ASC');
    return query.getMany();
  }

  async findOne(id: string): Promise<Match> {
    const match = await this.matchRepo.findOne({
      where: { id },
      relations: ['team_a', 'team_b', 'winner_team', 'events'],
      order: { events: { created_at: 'ASC' } },
    });
    if (!match) {
      throw new NotFoundException(`Match with ID "${id}" not found`);
    }
    return match;
  }

  async startMatch(id: string): Promise<Match> {
    const match = await this.findOne(id);

    if (match.status === MatchStatus.COMPLETED) {
      throw new BadRequestException('Match has already been completed.');
    }
    if (match.status === MatchStatus.CANCELLED) {
      throw new BadRequestException('Match is cancelled.');
    }
    if (!match.team_a_id || !match.team_b_id) {
      throw new BadRequestException(
        'Cannot start a match until both teams are determined.',
      );
    }

    // 1. Validate board occupancy: check if another match is IN_PROGRESS on the same board
    const occupyingMatch = await this.matchRepo.findOne({
      where: {
        tournament_id: match.tournament_id,
        board_number: match.board_number,
        status: MatchStatus.IN_PROGRESS,
        id: Not(match.id),
      },
    });

    if (occupyingMatch) {
      throw new BadRequestException(
        `Board ${match.board_number} is currently occupied by Match #${occupyingMatch.match_number}. Please pause or complete it first.`,
      );
    }

    // 2. Validate team availability: neither team can be in another IN_PROGRESS match
    const activeMatchForTeams = await this.matchRepo
      .createQueryBuilder('m')
      .where('m.tournament_id = :tid', { tid: match.tournament_id })
      .andWhere('m.status = :status', { status: MatchStatus.IN_PROGRESS })
      .andWhere('m.id != :id', { id: match.id })
      .andWhere(
        '(m.team_a_id = :ta OR m.team_b_id = :ta OR m.team_a_id = :tb OR m.team_b_id = :tb)',
        { ta: match.team_a_id, tb: match.team_b_id },
      )
      .getOne();

    if (activeMatchForTeams) {
      throw new BadRequestException(
        'One of the teams is currently playing another active match. A team cannot play two matches concurrently.',
      );
    }

    match.status = MatchStatus.IN_PROGRESS;
    match.started_at = new Date();

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(Match, match);
      const event = manager.create(MatchEvent, {
        match_id: saved.id,
        event_type: 'MATCH_START',
        details: {
          started_at: saved.started_at,
          board: saved.board_number,
        },
      });
      await manager.save(MatchEvent, event);

      this.updatesService.emit({
        type: 'MATCH_UPDATED',
        tournamentId: match.tournament_id,
        data: saved,
      });

      return saved;
    });
  }

  async updateScore(id: string, dto: UpdateScoreDto): Promise<Match> {
    const match = await this.findOne(id);

    if (match.status === MatchStatus.COMPLETED) {
      // Allow score correction by admin with an audit event
      this.logger.warn(`Admin modifying completed match ${match.id} score`);
    }

    match.score_a = dto.score_a;
    match.score_b = dto.score_b;

    if (match.status === MatchStatus.SCHEDULED || match.status === MatchStatus.READY) {
      match.status = MatchStatus.IN_PROGRESS;
      if (!match.started_at) match.started_at = new Date();
    }

    if (dto.notes) {
      match.notes = dto.notes;
    }

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(Match, match);
      const event = manager.create(MatchEvent, {
        match_id: saved.id,
        event_type: 'SCORE_UPDATE',
        details: {
          score_a: saved.score_a,
          score_b: saved.score_b,
          notes: dto.notes,
        },
      });
      await manager.save(MatchEvent, event);

      this.updatesService.emit({
        type: 'SCORE_UPDATED',
        tournamentId: match.tournament_id,
        data: saved,
      });

      return saved;
    });
  }

  async completeMatch(id: string, dto: CompleteMatchDto): Promise<Match> {
    const match = await this.findOne(id);
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();

    if (match.status === MatchStatus.CANCELLED) {
      throw new BadRequestException('Cannot complete a cancelled match.');
    }

    if (dto.score_a !== undefined) match.score_a = dto.score_a;
    if (dto.score_b !== undefined) match.score_b = dto.score_b;
    if (dto.notes) match.notes = dto.notes;

    // Determine winner
    let winnerId = dto.winner_team_id;

    if (!winnerId) {
      if (match.score_a > match.score_b) {
        winnerId = match.team_a_id;
      } else if (match.score_b > match.score_a) {
        winnerId = match.team_b_id;
      } else {
        // Tied score
        if (tournament.format === 'SINGLE_ELIMINATION') {
          throw new BadRequestException(
            'Scores are tied. Knockout matches require a winner. Please record tiebreaker points or explicitly designate the winner.',
          );
        }
      }
    } else {
      if (winnerId !== match.team_a_id && winnerId !== match.team_b_id) {
        throw new BadRequestException(
          'Winner team must be one of the participating teams in this match.',
        );
      }
    }

    const loserId =
      winnerId === match.team_a_id ? match.team_b_id : match.team_a_id;

    match.winner_team_id = winnerId;
    match.status = MatchStatus.COMPLETED;
    match.completed_at = new Date();

    return this.dataSource.transaction(async (manager) => {
      const savedMatch = await manager.save(Match, match);
      const event = manager.create(MatchEvent, {
        match_id: savedMatch.id,
        event_type: 'MATCH_COMPLETED',
        details: {
          winner_team_id: winnerId,
          score_a: savedMatch.score_a,
          score_b: savedMatch.score_b,
          completed_at: savedMatch.completed_at,
        },
      });
      await manager.save(MatchEvent, event);

      // 1. Advance winner to next match if Single Elimination
      if (match.next_match_id && winnerId) {
        const nextMatch = await manager.findOne(Match, {
          where: { id: match.next_match_id },
        });
        if (nextMatch) {
          if (match.next_match_slot === 'A') {
            nextMatch.team_a_id = winnerId;
          } else {
            nextMatch.team_b_id = winnerId;
          }

          if (nextMatch.team_a_id && nextMatch.team_b_id) {
            nextMatch.status = MatchStatus.READY;
          }
          await manager.save(Match, nextMatch);
        }
      }

      // 2. If 3rd place playoff is enabled and this was a semifinal, advance loser
      if (
        tournament.third_place_playoff &&
        match.round_name === 'Semifinals' &&
        loserId
      ) {
        const thirdPlaceMatch = await manager.findOne(Match, {
          where: { tournament_id: tournament.id, is_third_place: true },
        });
        if (thirdPlaceMatch) {
          if (!thirdPlaceMatch.team_a_id) {
            thirdPlaceMatch.team_a_id = loserId;
          } else if (!thirdPlaceMatch.team_b_id) {
            thirdPlaceMatch.team_b_id = loserId;
          }
          if (thirdPlaceMatch.team_a_id && thirdPlaceMatch.team_b_id) {
            thirdPlaceMatch.status = MatchStatus.READY;
          }
          await manager.save(Match, thirdPlaceMatch);
        }
      }

      // 3. Check if all matches are completed to complete tournament
      const remainingUncompleted = await manager.count(Match, {
        where: {
          tournament_id: tournament.id,
          status: Not(In([MatchStatus.COMPLETED, MatchStatus.CANCELLED])),
        },
      });

      if (remainingUncompleted === 0) {
        tournament.status = TournamentStatus.COMPLETED;
        await manager.save(Tournament, tournament);
      }

      this.updatesService.emit({
        type: 'MATCH_UPDATED',
        tournamentId: match.tournament_id,
        data: savedMatch,
      });

      return savedMatch;
    });
  }

  async scheduleMatch(id: string, dto: ScheduleMatchDto): Promise<Match> {
    const match = await this.findOne(id);
    const targetBoard = dto.board_number ?? match.board_number;
    const targetStart = dto.scheduled_start
      ? new Date(dto.scheduled_start)
      : match.scheduled_start;
    const targetEnd = dto.scheduled_end
      ? new Date(dto.scheduled_end)
      : match.scheduled_end;

    if (targetStart && targetEnd && targetEnd <= targetStart) {
      throw new BadRequestException(
        'Scheduled end time must be strictly after scheduled start time.',
      );
    }

    // Conflict Check 1: No two matches on the same board at the same time
    if (targetStart && targetEnd) {
      const boardConflict = await this.matchRepo
        .createQueryBuilder('m')
        .where('m.tournament_id = :tid', { tid: match.tournament_id })
        .andWhere('m.board_number = :board', { board: targetBoard })
        .andWhere('m.id != :id', { id: match.id })
        .andWhere('m.status NOT IN (:...done)', {
          done: [MatchStatus.COMPLETED, MatchStatus.CANCELLED],
        })
        .andWhere('m.scheduled_start IS NOT NULL AND m.scheduled_end IS NOT NULL')
        .andWhere('m.scheduled_start < :targetEnd AND m.scheduled_end > :targetStart', {
          targetStart,
          targetEnd,
        })
        .getOne();

      if (boardConflict) {
        throw new BadRequestException(
          `Board ${targetBoard} already has Match #${boardConflict.match_number} scheduled during this time slot.`,
        );
      }
    }

    // Conflict Check 2: Neither team scheduled in two matches at the same time
    if (targetStart && targetEnd && (match.team_a_id || match.team_b_id)) {
      const teamIds = [match.team_a_id, match.team_b_id].filter(Boolean);
      const teamConflict = await this.matchRepo
        .createQueryBuilder('m')
        .where('m.tournament_id = :tid', { tid: match.tournament_id })
        .andWhere('m.id != :id', { id: match.id })
        .andWhere('m.status NOT IN (:...done)', {
          done: [MatchStatus.COMPLETED, MatchStatus.CANCELLED],
        })
        .andWhere('m.scheduled_start IS NOT NULL AND m.scheduled_end IS NOT NULL')
        .andWhere('m.scheduled_start < :targetEnd AND m.scheduled_end > :targetStart', {
          targetStart,
          targetEnd,
        })
        .andWhere('(m.team_a_id IN (:...tids) OR m.team_b_id IN (:...tids))', {
          tids: teamIds,
        })
        .getOne();

      if (teamConflict) {
        throw new BadRequestException(
          `One of the teams is already scheduled in Match #${teamConflict.match_number} during this time interval.`,
        );
      }
    }

    match.board_number = targetBoard;
    if (targetStart) match.scheduled_start = targetStart;
    if (targetEnd) match.scheduled_end = targetEnd;

    return this.dataSource.transaction(async (manager) => {
      const saved = await manager.save(Match, match);
      const event = manager.create(MatchEvent, {
        match_id: saved.id,
        event_type: 'SCHEDULE_UPDATE',
        details: {
          board_number: saved.board_number,
          scheduled_start: saved.scheduled_start,
          scheduled_end: saved.scheduled_end,
        },
      });
      await manager.save(MatchEvent, event);

      this.updatesService.emit({
        type: 'MATCH_UPDATED',
        tournamentId: match.tournament_id,
        data: saved,
      });

      return saved;
    });
  }

  async pauseMatch(id: string): Promise<Match> {
    const match = await this.findOne(id);
    if (match.status !== MatchStatus.IN_PROGRESS) {
      throw new BadRequestException('Only active in-progress matches can be paused.');
    }
    match.status = MatchStatus.READY;

    const saved = await this.matchRepo.save(match);
    const event = this.eventRepo.create({
      match_id: saved.id,
      event_type: 'MATCH_PAUSED',
      details: { paused_at: new Date() },
    });
    await this.eventRepo.save(event);

    this.updatesService.emit({
      type: 'MATCH_UPDATED',
      tournamentId: match.tournament_id,
      data: saved,
    });
    return saved;
  }

  async cancelMatch(id: string): Promise<Match> {
    const match = await this.findOne(id);
    match.status = MatchStatus.CANCELLED;

    const saved = await this.matchRepo.save(match);
    const event = this.eventRepo.create({
      match_id: saved.id,
      event_type: 'MATCH_CANCELLED',
      details: { cancelled_at: new Date() },
    });
    await this.eventRepo.save(event);

    this.updatesService.emit({
      type: 'MATCH_UPDATED',
      tournamentId: match.tournament_id,
      data: saved,
    });
    return saved;
  }
}
