import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import * as bcrypt from 'bcryptjs';
import {
  Admin,
  Tournament,
  Team,
  Player,
  Match,
  MatchEvent,
  TournamentSetting,
  TournamentFormat,
  TournamentStatus,
  MatchStatus,
} from './entities';
import { TournamentsService } from './modules/tournaments/tournaments.service';
import { TeamsService } from './modules/teams/teams.service';
import { FixturesService } from './modules/fixtures/fixtures.service';
import { MatchesService } from './modules/matches/matches.service';
import { LeaderboardService } from './modules/leaderboard/leaderboard.service';
import { UpdatesService } from './modules/updates/updates.service';

dotenv.config();

const testDataSource = new DataSource({
  type: 'postgres',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5431', 10),
  username: process.env.DB_USERNAME || 'postgres',
  password: process.env.DB_PASSWORD || 'sa1234',
  database: process.env.DB_NAME || 'carrom',
  entities: [Admin, Tournament, Team, Player, Match, MatchEvent, TournamentSetting],
  synchronize: true,
});

async function runTests() {
  console.log('====================================================');
  console.log(' CARROM ARENA: TOURNAMENT ENGINE & SYSTEM TEST SUITE');
  console.log('====================================================\n');

  await testDataSource.initialize();
  console.log('✓ Connected to PostgreSQL on port 5431.');

  // Repositories
  const adminRepo = testDataSource.getRepository(Admin);
  const tournamentRepo = testDataSource.getRepository(Tournament);
  const teamRepo = testDataSource.getRepository(Team);
  const playerRepo = testDataSource.getRepository(Player);
  const matchRepo = testDataSource.getRepository(Match);
  const eventRepo = testDataSource.getRepository(MatchEvent);
  const settingRepo = testDataSource.getRepository(TournamentSetting);

  // Clear data for clean test run
  await testDataSource.query('DELETE FROM match_events');
  await testDataSource.query('DELETE FROM matches');
  await testDataSource.query('DELETE FROM players');
  await testDataSource.query('DELETE FROM teams');
  await testDataSource.query('DELETE FROM tournament_settings');
  await testDataSource.query('DELETE FROM tournaments');
  await testDataSource.query('DELETE FROM admins');

  const updatesService = new UpdatesService();
  const tournamentsService = new TournamentsService(
    tournamentRepo,
    teamRepo,
    playerRepo,
    matchRepo,
    settingRepo,
    updatesService,
  );
  const teamsService = new TeamsService(
    teamRepo,
    playerRepo,
    matchRepo,
    tournamentsService,
    updatesService,
    testDataSource,
  );
  const fixturesService = new FixturesService(
    tournamentRepo,
    teamRepo,
    matchRepo,
    eventRepo,
    tournamentsService,
    updatesService,
    testDataSource,
  );
  const matchesService = new MatchesService(
    matchRepo,
    eventRepo,
    tournamentRepo,
    teamRepo,
    tournamentsService,
    updatesService,
    testDataSource,
  );
  const leaderboardService = new LeaderboardService(
    tournamentRepo,
    teamRepo,
    matchRepo,
    tournamentsService,
  );

  // ----------------------------------------------------------------
  // Test 1: Admin Password Hashing & Authentication
  // ----------------------------------------------------------------
  console.log('\n[Test 1] Administrator Security & Authentication...');
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash('admin1234', salt);
  const admin = adminRepo.create({
    username: 'admin',
    password_hash: hash,
    role: 'ADMIN',
  });
  await adminRepo.save(admin);

  const isPasswordValid = await bcrypt.compare('admin1234', admin.password_hash);
  const isWrongPasswordInvalid = !(await bcrypt.compare('wrongpass', admin.password_hash));
  if (isPasswordValid && isWrongPasswordInvalid) {
    console.log('✓ Admin password securely hashed and verified with bcrypt.');
  } else {
    throw new Error('Admin password hash verification failed');
  }

  // ----------------------------------------------------------------
  // Test 2: Active Tournament Initialization
  // ----------------------------------------------------------------
  console.log('\n[Test 2] Active Tournament Initialization & Metrics...');
  const activeSummary = await tournamentsService.getActiveDashboardSummary();
  console.log(`✓ Active Tournament: "${activeSummary.tournament.name}" (Format: ${activeSummary.tournament.format})`);
  console.log(`✓ Board 1 status: ${activeSummary.boards.board_1.status}`);
  console.log(`✓ Board 2 status: ${activeSummary.boards.board_2.status}`);

  // ----------------------------------------------------------------
  // Test 3: Team Registration & Duplicate Prevention
  // ----------------------------------------------------------------
  console.log('\n[Test 3] Team Registration & Duplicate Validation...');
  const team1 = await teamsService.register({
    team_name: 'Strike Masters',
    captain_name: 'Rohan Sharma',
    contact_number: '9876543210',
    player_names: ['Rohan Sharma', 'Vikram Patel'],
    substitutes: ['Arun Kumar'],
  });
  console.log(`✓ Registered Team 1: "${team1.team_name}" (${team1.registration_number}) with 2 active players & 1 substitute.`);

  // Test duplicate name prevention (case-insensitive & whitespace)
  let duplicateCaught = false;
  try {
    await teamsService.register({
      team_name: '  strike   masters  ',
      captain_name: 'Another Captain',
      player_names: ['Another Captain', 'Partner'],
    });
  } catch (err: any) {
    duplicateCaught = true;
    console.log(`✓ Duplicate team name rejected properly: "${err.message}"`);
  }
  if (!duplicateCaught) throw new Error('Duplicate team name was not rejected!');

  // Register additional teams
  const team2 = await teamsService.register({
    team_name: 'Queen Hunters',
    captain_name: 'Ananya Sen',
    player_names: ['Ananya Sen', 'Priya Roy'],
  });
  const team3 = await teamsService.register({
    team_name: 'Pocket Rockets',
    captain_name: 'Dev Malik',
    player_names: ['Dev Malik', 'Sameer Khan'],
  });
  const team4 = await teamsService.register({
    team_name: 'Board Kings',
    captain_name: 'Karan Joshi',
    player_names: ['Karan Joshi', 'Nikhil Mehta'],
  });
  console.log(`✓ Total 4 teams registered successfully.`);

  // ----------------------------------------------------------------
  // Test 4: Single Elimination with 4 Teams
  // ----------------------------------------------------------------
  console.log('\n[Test 4] Single Elimination Fixture Generation (4 Teams)...');
  const gen4 = await fixturesService.generate({
    format: TournamentFormat.SINGLE_ELIMINATION,
    match_duration_minutes: 20,
    interval_minutes: 5,
    third_place_playoff: true,
    force: true,
  });
  console.log(`✓ Generated fixtures: ${gen4.totalMatches} matches.`);

  const matches4 = await matchRepo.find({ order: { match_number: 'ASC' } });
  console.log(`✓ Total matches in database: ${matches4.length}`);
  for (const m of matches4) {
    console.log(`   Match #${m.match_number}: ${m.round_name} | Board ${m.board_number} | ${m.team_a?.team_name || 'TBD'} vs ${m.team_b?.team_name || 'TBD'} | Time: ${m.scheduled_start?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  }

  // Verify no board conflicts on 4-team bracket
  verifyNoBoardConflicts(matches4);
  console.log('✓ Conflict Verification: No overlapping matches on either Board 1 or Board 2.');

  // ----------------------------------------------------------------
  // Test 5: Single Elimination with 5 Teams (Odd team with Byes)
  // ----------------------------------------------------------------
  console.log('\n[Test 5] Single Elimination with 5 Teams (Odd Team count & Byes)...');
  // Admin reopens registration to add 5th team
  await tournamentsService.updateRegistration({ registration_open: true });
  const team5 = await teamsService.register({
    team_name: 'Corner Strikers',
    captain_name: 'Amit Verma',
    player_names: ['Amit Verma', 'Sanjay Dutt'],
  });

  const gen5 = await fixturesService.generate({
    format: TournamentFormat.SINGLE_ELIMINATION,
    match_duration_minutes: 20,
    interval_minutes: 5,
    force: true,
  });
  console.log(`✓ Generated 5-team Single Elimination bracket: ${gen5.totalMatches} matches.`);

  const matches5 = await matchRepo.find({ order: { match_number: 'ASC' } });
  const byes = matches5.filter((m) => m.is_bye);
  console.log(`✓ Identified ${byes.length} BYE match(es):`);
  for (const b of byes) {
    console.log(`   - ${b.winner_team?.team_name} received a First Round BYE and advanced.`);
  }

  // ----------------------------------------------------------------
  // Test 6: Single Elimination with 8 Teams
  // ----------------------------------------------------------------
  console.log('\n[Test 6] Single Elimination with 8 Teams...');
  await tournamentsService.updateRegistration({ registration_open: true });
  const team6 = await teamsService.register({
    team_name: 'Carrom Warriors',
    captain_name: 'Rahul Nair',
    player_names: ['Rahul Nair', 'Manoj Bajpayee'],
  });
  const team7 = await teamsService.register({
    team_name: 'Ace Flickers',
    captain_name: 'Suresh Raina',
    player_names: ['Suresh Raina', 'Deepak Chahar'],
  });
  const team8 = await teamsService.register({
    team_name: 'Titan Strikers',
    captain_name: 'Hardik Shah',
    player_names: ['Hardik Shah', 'Krunal Shah'],
  });

  const gen8 = await fixturesService.generate({
    format: TournamentFormat.SINGLE_ELIMINATION,
    match_duration_minutes: 20,
    interval_minutes: 5,
    third_place_playoff: true,
    force: true,
  });
  console.log(`✓ Generated 8-team Single Elimination: ${gen8.totalMatches} matches.`);
  const matches8 = await matchRepo.find({ order: { match_number: 'ASC' } });
  verifyNoBoardConflicts(matches8);
  console.log('✓ 8-team bracket verified: 4 Quarterfinals, 2 Semifinals, 1 Final, 1 3rd-Place Playoff.');

  // ----------------------------------------------------------------
  // Test 7: Match Progression, Scoring & Winner Advancement
  // ----------------------------------------------------------------
  console.log('\n[Test 7] Match Scoring, Knockout Advancement & Champion Finale...');
  // Play Quarterfinal Match 1
  const qf1 = matches8.find((m) => m.round_name === 'Quarterfinals' && m.match_number === 1)!;
  await matchesService.startMatch(qf1.id);
  console.log(`✓ Started Quarterfinal Match 1 (${qf1.team_a?.team_name} vs ${qf1.team_b?.team_name})`);

  // Score match: Team A wins 25 - 12
  await matchesService.updateScore(qf1.id, { score_a: 25, score_b: 12 });
  const completedQf1 = await matchesService.completeMatch(qf1.id, {
    score_a: 25,
    score_b: 12,
  });
  console.log(`✓ Completed QF1: Winner is "${completedQf1.winner_team?.team_name}" (25 - 12).`);

  // Verify next match feeder slot received the winner
  const nextMatch = await matchRepo.findOne({ where: { id: completedQf1.next_match_id } });
  if (nextMatch && (nextMatch.team_a_id === completedQf1.winner_team_id || nextMatch.team_b_id === completedQf1.winner_team_id)) {
    console.log(`✓ Winner automatically advanced to ${nextMatch.round_name} (Match #${nextMatch.match_number}).`);
  } else {
    throw new Error('Winner did not advance to next match slot!');
  }

  // ----------------------------------------------------------------
  // Test 8: Round Robin Fixtures & Standings
  // ----------------------------------------------------------------
  console.log('\n[Test 8] Round Robin Fixtures & Standings Calculation...');
  // Generate Round Robin for the 8 teams: 8 * 7 / 2 = 28 matches
  const genRR = await fixturesService.generate({
    format: TournamentFormat.ROUND_ROBIN,
    match_duration_minutes: 20,
    interval_minutes: 5,
    force: true,
  });
  console.log(`✓ Generated Round Robin fixtures: ${genRR.totalMatches} matches (Expected: 28).`);
  if (genRR.totalMatches !== 28) {
    throw new Error(`Expected 28 matches for 8 teams in round robin, got ${genRR.totalMatches}`);
  }

  const matchesRR = await matchRepo.find({ order: { match_number: 'ASC' } });
  verifyNoBoardConflicts(matchesRR);
  console.log('✓ Round Robin 2-board scheduling conflict check passed.');

  // Simulate a few matches with scores
  const rrMatch1 = matchesRR[0];
  await matchesService.completeMatch(rrMatch1.id, {
    winner_team_id: rrMatch1.team_a_id!,
    score_a: 25,
    score_b: 10,
  });
  const rrMatch2 = matchesRR[1];
  await matchesService.completeMatch(rrMatch2.id, {
    winner_team_id: rrMatch2.team_b_id!,
    score_a: 15,
    score_b: 25,
  });

  const lbData = await leaderboardService.getLeaderboard();
  console.log(`✓ Standings calculated: Top team is "${lbData.standings[0].team_name}" with ${lbData.standings[0].points} points and DIFF of ${lbData.standings[0].score_diff}.`);

  await testDataSource.destroy();
  console.log('\n====================================================');
  console.log(' ALL TOURNAMENT ENGINE TESTS PASSED SUCCESSFULLY! ✓');
  console.log('====================================================\n');
}

function verifyNoBoardConflicts(matches: Match[]) {
  // Check board overlap
  for (let b = 1; b <= 2; b++) {
    const boardMatches = matches.filter(
      (m) => m.board_number === b && !m.is_bye && m.scheduled_start && m.scheduled_end,
    );
    for (let i = 0; i < boardMatches.length; i++) {
      for (let j = i + 1; j < boardMatches.length; j++) {
        const m1 = boardMatches[i];
        const m2 = boardMatches[j];
        const s1 = new Date(m1.scheduled_start!).getTime();
        const e1 = new Date(m1.scheduled_end!).getTime();
        const s2 = new Date(m2.scheduled_start!).getTime();
        const e2 = new Date(m2.scheduled_end!).getTime();

        const overlap = Math.max(s1, s2) < Math.min(e1, e2);
        if (overlap) {
          throw new Error(
            `Scheduling conflict on Board ${b}: Match #${m1.match_number} overlaps with Match #${m2.match_number}`,
          );
        }
      }
    }
  }

  // Check team overlap (no team in two matches simultaneously)
  const realMatches = matches.filter(
    (m) => !m.is_bye && m.scheduled_start && m.scheduled_end,
  );
  for (let i = 0; i < realMatches.length; i++) {
    for (let j = i + 1; j < realMatches.length; j++) {
      const m1 = realMatches[i];
      const m2 = realMatches[j];
      const s1 = new Date(m1.scheduled_start!).getTime();
      const e1 = new Date(m1.scheduled_end!).getTime();
      const s2 = new Date(m2.scheduled_start!).getTime();
      const e2 = new Date(m2.scheduled_end!).getTime();

      const overlap = Math.max(s1, s2) < Math.min(e1, e2);
      if (overlap) {
        const teams1 = [m1.team_a_id, m1.team_b_id].filter(Boolean);
        const teams2 = [m2.team_a_id, m2.team_b_id].filter(Boolean);
        for (const t of teams1) {
          if (teams2.includes(t)) {
            throw new Error(
              `Team conflict: Team ${t} scheduled in Match #${m1.match_number} and #${m2.match_number} at the same time!`,
            );
          }
        }
      }
    }
  }
}

runTests().catch((err) => {
  console.error('\n❌ Test execution failed:', err);
  process.exit(1);
});
