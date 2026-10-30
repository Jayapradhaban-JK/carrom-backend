import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TournamentUser } from '../../entities/tournament-user.entity';
import { Team } from '../../entities/team.entity';
import { Player } from '../../entities/player.entity';
import { Tournament } from '../../entities/tournament.entity';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { TournamentsModule } from '../tournaments/tournaments.module';
import { UpdatesModule } from '../updates/updates.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([TournamentUser, Team, Player, Tournament]),
    TournamentsModule,
    UpdatesModule,
  ],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}

