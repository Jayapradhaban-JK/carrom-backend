import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Tournament } from '../../entities/tournament.entity';
import { Team } from '../../entities/team.entity';
import { Player } from '../../entities/player.entity';
import { Match } from '../../entities/match.entity';
import { TournamentSetting } from '../../entities/tournament-setting.entity';
import { TournamentsService } from './tournaments.service';
import { TournamentsController } from './tournaments.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Tournament,
      Team,
      Player,
      Match,
      TournamentSetting,
    ]),
  ],
  controllers: [TournamentsController],
  providers: [TournamentsService],
  exports: [TournamentsService],
})
export class TournamentsModule {}

