import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tournament, TournamentFormat, TournamentStatus } from '../../entities/tournament.entity';
import { Team } from '../../entities/team.entity';
import { Match, MatchStatus } from '../../entities/match.entity';
import { TournamentsService } from '../tournaments/tournaments.service';

export interface StandingsRow {
  position: number;
  team_id: string;
  team_name: string;
  captain_name: string;
  players_summary?: string;
  registration_number: string;
  played: number;
  won: number;
  lost: number;
  points: number;
  points_for: number;
  points_against: number;
  score_diff: number;
}

@Injectable()
export class LeaderboardService {
  private readonly logger = new Logger(LeaderboardService.name);

  constructor(
    @InjectRepository(Tournament)
    private readonly tournamentRepo: Repository<Tournament>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    private readonly tournamentsService: TournamentsService,
  ) {}

  async getLeaderboard() {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();
    const [teams, matches] = await Promise.all([
      this.teamRepo.find({
        where: { tournament_id: tournament.id },
        order: { team_name: 'ASC' },
        relations: ['players'],
      }),
      this.matchRepo.find({
        where: { tournament_id: tournament.id },
        order: { match_number: 'ASC' },
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
      (m) => m.status === MatchStatus.COMPLETED && !m.is_bye,
    );
    const totalPlayableMatches = matches.filter((m) => !m.is_bye).length;
    const progressPercent =
      totalPlayableMatches > 0
        ? Math.round((completedMatches.length / totalPlayableMatches) * 100)
        : 0;

    let champion: Team | null = null;
    let runnerUp: Team | null = null;
    let thirdPlace: Team | null = null;

    let standings: StandingsRow[] = [];

    if (tournament.format === TournamentFormat.ROUND_ROBIN) {
      standings = this.calculateRoundRobinStandings(teams, completedMatches);
      if (
        tournament.status === TournamentStatus.COMPLETED ||
        (totalPlayableMatches > 0 && completedMatches.length === totalPlayableMatches)
      ) {
        if (standings.length > 0) {
          champion = teams.find((t) => t.id === standings[0].team_id) || null;
        }
        if (standings.length > 1) {
          runnerUp = teams.find((t) => t.id === standings[1].team_id) || null;
        }
        if (standings.length > 2) {
          thirdPlace = teams.find((t) => t.id === standings[2].team_id) || null;
        }
      }
    } else {
      // Single Elimination
      const finalMatch = matches.find((m) => m.round_name === 'Final');
      if (finalMatch && finalMatch.status === MatchStatus.COMPLETED && finalMatch.winner_team) {
        champion = finalMatch.winner_team;
        // Runner up is the loser of the final
        const runnerUpId =
          finalMatch.winner_team_id === finalMatch.team_a_id
            ? finalMatch.team_b_id
            : finalMatch.team_a_id;
        runnerUp = teams.find((t) => t.id === runnerUpId) || null;
      }

      const thirdPlaceMatch = matches.find((m) => m.is_third_place);
      if (
        thirdPlaceMatch &&
        thirdPlaceMatch.status === MatchStatus.COMPLETED &&
        thirdPlaceMatch.winner_team
      ) {
        thirdPlace = thirdPlaceMatch.winner_team;
      }
    }

    const recentResults = matches
      .filter((m) => m.status === MatchStatus.COMPLETED && !m.is_bye)
      .sort((a, b) => {
        const tA = a.completed_at ? new Date(a.completed_at).getTime() : 0;
        const tB = b.completed_at ? new Date(b.completed_at).getTime() : 0;
        return tB - tA;
      })
      .slice(0, 5);

    const upcomingMatches = matches
      .filter(
        (m) =>
          !m.is_bye &&
          (m.status === MatchStatus.READY ||
            m.status === MatchStatus.SCHEDULED ||
            m.status === MatchStatus.IN_PROGRESS),
      )
      .sort((a, b) => {
        const tA = a.scheduled_start ? new Date(a.scheduled_start).getTime() : 0;
        const tB = b.scheduled_start ? new Date(b.scheduled_start).getTime() : 0;
        return tA - tB;
      })
      .slice(0, 5);

    return {
      tournament,
      format: tournament.format,
      progress: {
        total: totalPlayableMatches,
        completed: completedMatches.length,
        percentage: progressPercent,
      },
      champion,
      runnerUp,
      thirdPlace,
      standings,
      recentResults,
      upcomingMatches,
    };
  }

  private calculateRoundRobinStandings(
    teams: Team[],
    completedMatches: Match[],
  ): StandingsRow[] {
    const tableMap = new Map<string, StandingsRow>();

    for (const team of teams) {
      const p1 = team.captain_name;
      const p2 =
        team.players?.find((p) => !p.is_captain)?.player_name ||
        team.players?.[1]?.player_name ||
        '';
      const playersSummary = p2 ? `${p1} & ${p2}` : p1;

      tableMap.set(team.id, {
        position: 0,
        team_id: team.id,
        team_name: team.team_name,
        captain_name: team.captain_name,
        players_summary: playersSummary,
        registration_number: team.registration_number,
        played: 0,
        won: 0,
        lost: 0,
        points: 0,
        points_for: 0,
        points_against: 0,
        score_diff: 0,
      });
    }

    for (const match of completedMatches) {
      if (!match.team_a_id || !match.team_b_id) continue;
      const rowA = tableMap.get(match.team_a_id);
      const rowB = tableMap.get(match.team_b_id);
      if (!rowA || !rowB) continue;

      rowA.played += 1;
      rowB.played += 1;

      rowA.points_for += match.score_a;
      rowA.points_against += match.score_b;
      rowB.points_for += match.score_b;
      rowB.points_against += match.score_a;

      if (match.winner_team_id === match.team_a_id) {
        rowA.won += 1;
        rowA.points += 2; // 2 points per win
        rowB.lost += 1;
      } else if (match.winner_team_id === match.team_b_id) {
        rowB.won += 1;
        rowB.points += 2;
        rowA.lost += 1;
      }
    }

    const rows = Array.from(tableMap.values());
    for (const r of rows) {
      r.score_diff = r.points_for - r.points_against;
    }

    // Sort by: Points desc, Score difference desc, Points for desc, Alphabetical
    rows.sort((a, b) => {
      if (b.points !== a.points) return b.points - a.points;
      if (b.score_diff !== a.score_diff) return b.score_diff - a.score_diff;
      if (b.points_for !== a.points_for) return b.points_for - a.points_for;
      return a.team_name.localeCompare(b.team_name);
    });

    rows.forEach((r, idx) => {
      r.position = idx + 1;
    });

    return rows;
  }
}

