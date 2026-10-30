import { DataSource } from "typeorm";
import * as bcrypt from "bcryptjs";
import * as dotenv from "dotenv";
import { Admin } from "./entities/admin.entity";
import {
  Tournament,
  TournamentFormat,
  TournamentStatus,
} from "./entities/tournament.entity";
import { Team } from "./entities/team.entity";
import { Player } from "./entities/player.entity";
import { Match } from "./entities/match.entity";
import { MatchEvent } from "./entities/match-event.entity";
import { TournamentSetting } from "./entities/tournament-setting.entity";
import { TournamentUser } from "./entities/tournament-user.entity";

dotenv.config();

const RENDER_DATABASE_URL =
  "postgresql://carrom_user:CvlUgeAEBVxDS3eXsDXggLh33It86QvJ@dpg-dbhhluoae00c73dqc0qg-a.oregon-postgres.render.com/carrom";

const dbUrl = process.env.DATABASE_URL || RENDER_DATABASE_URL;

const AppDataSource = new DataSource({
  type: "postgres",
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
  synchronize: true,
});

async function runSeed() {
  console.log("Connecting to PostgreSQL database...");
  await AppDataSource.initialize();
  console.log("Connected successfully.");

  const adminRepo = AppDataSource.getRepository(Admin);
  const tournamentRepo = AppDataSource.getRepository(Tournament);

  const adminUser = process.env.ADMIN_DEFAULT_USERNAME || "admin";
  const adminPass = process.env.ADMIN_DEFAULT_PASSWORD || "Login@1234567";

  const existingAdmin = await adminRepo.findOne({
    where: { username: adminUser },
  });
  if (!existingAdmin) {
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(adminPass, salt);
    const admin = adminRepo.create({
      username: adminUser,
      password_hash: hash,
      role: "ADMIN",
    });
    await adminRepo.save(admin);
    console.log(
      `Default administrator "${adminUser}" created with secure hash.`,
    );
  } else {
    console.log(`Administrator "${adminUser}" already exists.`);
  }

  const existingTournament = await tournamentRepo.findOne({
    where: {},
    order: { created_at: "DESC" },
  });
  if (!existingTournament) {
    const t = tournamentRepo.create({
      name: "Office Carrom Championship",
      format: TournamentFormat.SINGLE_ELIMINATION,
      status: TournamentStatus.REGISTRATION_OPEN,
      registration_open: true,
      team_size: 2,
      match_duration_minutes: 20,
      interval_minutes: 5,
      start_time: new Date(),
      third_place_playoff: false,
    });
    await tournamentRepo.save(t);
    console.log("Initial tournament created.");
  } else {
    console.log(
      `Active tournament "${existingTournament.name}" already initialized.`,
    );
  }

  await AppDataSource.destroy();
  console.log("Database seeding complete.");
}

runSeed().catch((err) => {
  console.error("Seeding error:", err);
  process.exit(1);
});
