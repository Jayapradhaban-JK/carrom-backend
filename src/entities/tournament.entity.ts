import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Team } from './team.entity';
import { Match } from './match.entity';

export enum TournamentFormat {
  SINGLE_ELIMINATION = 'SINGLE_ELIMINATION',
  ROUND_ROBIN = 'ROUND_ROBIN',
}

export enum TournamentStatus {
  REGISTRATION_OPEN = 'REGISTRATION_OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
}

export enum ScoringRule {
  HIGHER_SCORE = 'HIGHER_SCORE',
  TARGET_SCORE = 'TARGET_SCORE',
}

@Entity('tournaments')
export class Tournament {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ default: 'Talent Takeaways Infotech PVT LTD - Carrom Tournament 2026' })
  name: string;

  @Column({
    type: 'enum',
    enum: TournamentFormat,
    default: TournamentFormat.SINGLE_ELIMINATION,
  })
  format: TournamentFormat;

  @Column({
    type: 'enum',
    enum: TournamentStatus,
    default: TournamentStatus.REGISTRATION_OPEN,
  })
  status: TournamentStatus;

  @Column({ default: true })
  registration_open: boolean;

  @Column({ default: 2 })
  team_size: number;

  @Column({ default: 20 })
  match_duration_minutes: number;

  @Column({ default: 5 })
  interval_minutes: number;

  @Column({ type: 'timestamptz', nullable: true })
  start_time: Date;

  @Column({ default: false })
  third_place_playoff: boolean;

  @Column({
    type: 'enum',
    enum: ScoringRule,
    default: ScoringRule.HIGHER_SCORE,
  })
  scoring_rule: ScoringRule;

  @Column({ default: 25 })
  target_score: number;

  @Column({ type: 'text', nullable: true })
  banner_url: string;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  settings: Record<string, any>;

  @OneToMany(() => Team, (team) => team.tournament)
  teams: Team[];

  @OneToMany(() => Match, (match) => match.tournament)
  matches: Match[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

