import { Module, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';

import {
  Admin,
  Tournament,
  Team,
  Player,
  Match,
  MatchEvent,
  TournamentSetting,
  TournamentUser,
  TournamentFormat,
  TournamentStatus,
} from './entities';
import { UpdatesModule } from './modules/updates/updates.module';
import { AuthModule } from './modules/auth/auth.module';
import { TournamentsModule } from './modules/tournaments/tournaments.module';
import { TeamsModule } from './modules/teams/teams.module';
import { FixturesModule } from './modules/fixtures/fixtures.module';
import { MatchesModule } from './modules/matches/matches.module';
import { LeaderboardModule } from './modules/leaderboard/leaderboard.module';
import { UsersModule } from './modules/users/users.module';

// Render Cloud PostgreSQL Database directly hardcoded
const RENDER_DATABASE_URL =
  'postgresql://carrom_user:CvlUgeAEBVxDS3eXsDXggLh33It86QvJ@dpg-dbhhluoae00c73dqc0qg-a.oregon-postgres.render.com/carrom';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 120, // generous limit for LAN dashboard polling and SSE
      },
    ]),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const dbUrl = config.get<string>('DATABASE_URL') || RENDER_DATABASE_URL;

        return {
          type: 'postgres',
          url: dbUrl,
          ssl: { rejectUnauthorized: false },
          entities: [
            Admin,
            Tournament,
            Team,
            Player,
            Match,
            MatchEvent,
            TournamentSetting,
            TournamentUser,
          ],
          synchronize: true, // auto create schema if missing
          logging: false,
        };
      },
    }),
    TypeOrmModule.forFeature([Admin, Tournament]),
    UpdatesModule,
    AuthModule,
    TournamentsModule,
    TeamsModule,
    FixturesModule,
    MatchesModule,
    LeaderboardModule,
    UsersModule,
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule implements OnModuleInit {
  private readonly logger = new Logger(AppModule.name);

  async onModuleInit() {
    this.logger.log('Carrom Arena Application initialized.');
  }
}
