import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Match } from '../../entities/match.entity';
import { MatchEvent } from '../../entities/match-event.entity';
import { Tournament } from '../../entities/tournament.entity';
import { Team } from '../../entities/team.entity';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { MatchesService } from './matches.service';
import { MatchesController } from './matches.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Match, MatchEvent, Tournament, Team]),
    TournamentsModule,
  ],
  controllers: [MatchesController],
  providers: [MatchesService],
  exports: [MatchesService],
})
export class MatchesModule {}

