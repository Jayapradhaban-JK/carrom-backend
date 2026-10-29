import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import * as os from 'os';
import { AppModule } from './app.module';
import { Admin, Tournament, TournamentFormat, TournamentStatus } from './entities';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);
  const port = parseInt(configService.get<string>('PORT', '3000'), 10);
  const host = configService.get<string>('HOST', '0.0.0.0');

  // Set API prefix
  app.setGlobalPrefix('api');

  // Enable CORS for LAN access
  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
  });

  // Enable validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // First-run seed check: verify default admin and tournament exist
  try {
    const adminRepo: Repository<Admin> = app.get(getRepositoryToken(Admin));
    const tournamentRepo: Repository<Tournament> = app.get(
      getRepositoryToken(Tournament),
    );

    const defaultUser = configService.get<string>('ADMIN_DEFAULT_USERNAME', 'admin');
    const defaultPass = configService.get<string>('ADMIN_DEFAULT_PASSWORD', 'admin1234');

    const adminCount = await adminRepo.count();
    if (adminCount === 0) {
      const salt = await bcrypt.genSalt(10);
      const hash = await bcrypt.hash(defaultPass, salt);
      const admin = adminRepo.create({
        username: defaultUser,
        password_hash: hash,
        role: 'ADMIN',
      });
      await adminRepo.save(admin);
      logger.log(`Initialized initial admin account: "${defaultUser}"`);
    }

    const tournamentCount = await tournamentRepo.count();
    if (tournamentCount === 0) {
      const tournament = tournamentRepo.create({
        name: 'Office Carrom Championship',
        format: TournamentFormat.SINGLE_ELIMINATION,
        status: TournamentStatus.REGISTRATION_OPEN,
        registration_open: true,
        team_size: 2,
        match_duration_minutes: 20,
        interval_minutes: 5,
        start_time: new Date(),
        third_place_playoff: false,
      });
      await tournamentRepo.save(tournament);
      logger.log(`Initialized default tournament: "${tournament.name}"`);
    }
  } catch (err) {
    logger.warn(`Initial seed check warning: ${err.message}`);
  }

  await app.listen(port, host);

  // Print helpful LAN connection addresses
  logger.log(`🚀 Carrom Arena Backend is running on http://${host}:${port}`);
  const interfaces = os.networkInterfaces();
  logger.log('--- Office LAN Access URLs ---');
  for (const name of Object.keys(interfaces)) {
    for (const net of interfaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal) {
        logger.log(`   📡 IP: http://${net.address}:${port}/api`);
      }
    }
  }
}

bootstrap();

