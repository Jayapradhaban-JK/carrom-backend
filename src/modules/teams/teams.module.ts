import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Team } from '../../entities/team.entity';
import { Player } from '../../entities/player.entity';
import { Match } from '../../entities/match.entity';
import { Tournament } from '../../entities/tournament.entity';
import { TournamentUser } from '../../entities/tournament-user.entity';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { TeamsService } from './teams.service';
import { TeamsController } from './teams.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([Team, Player, Match, Tournament, TournamentUser]),
    TournamentsModule,
  ],
  controllers: [TeamsController],
  providers: [TeamsService],
  exports: [TeamsService],
})
export class TeamsModule {}

