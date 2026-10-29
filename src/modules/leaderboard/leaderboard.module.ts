import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tournament } from '../../entities/tournament.entity';
import { Team } from '../../entities/team.entity';
import { Match } from '../../entities/match.entity';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { LeaderboardService } from './leaderboard.service';
import { LeaderboardController } from './leaderboard.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tournament, Team, Match]),
    TournamentsModule,
  ],
  controllers: [LeaderboardController],
  providers: [LeaderboardService],
  exports: [LeaderboardService],
})
export class LeaderboardModule {}

