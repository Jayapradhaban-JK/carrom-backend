import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tournament } from '../../entities/tournament.entity';
import { Team } from '../../entities/team.entity';
import { Match } from '../../entities/match.entity';
import { MatchEvent } from '../../entities/match-event.entity';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { FixturesService } from './fixtures.service';
import { FixturesController } from './fixtures.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Tournament, Team, Match, MatchEvent]),
    TournamentsModule,
  ],
  controllers: [FixturesController],
  providers: [FixturesService],
  exports: [FixturesService],
})
export class FixturesModule {}

