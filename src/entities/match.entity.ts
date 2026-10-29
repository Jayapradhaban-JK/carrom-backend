import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
} from 'typeorm';
import { Tournament } from './tournament.entity';
import { Team } from './team.entity';
import { MatchEvent } from './match-event.entity';

export enum MatchStatus {
  SCHEDULED = 'SCHEDULED',
  READY = 'READY',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

@Entity('matches')
export class Match {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tournament_id: string;

  @ManyToOne(() => Tournament, (tournament) => tournament.matches, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tournament_id' })
  tournament: Tournament;

  @Column({ default: 1 })
  round_number: number;

  @Column({ default: 'Round 1' })
  round_name: string;

  @Column({ default: 1 })
  match_number: number;

  @Column({ default: 1 })
  board_number: number;

  @Column({ nullable: true })
  @Index()
  team_a_id: string;

  @ManyToOne(() => Team, { onDelete: 'SET NULL', eager: true, nullable: true })
  @JoinColumn({ name: 'team_a_id' })
  team_a: Team;

  @Column({ nullable: true })
  @Index()
  team_b_id: string;

  @ManyToOne(() => Team, { onDelete: 'SET NULL', eager: true, nullable: true })
  @JoinColumn({ name: 'team_b_id' })
  team_b: Team;

  @Column({ nullable: true })
  winner_team_id: string;

  @ManyToOne(() => Team, { onDelete: 'SET NULL', eager: true, nullable: true })
  @JoinColumn({ name: 'winner_team_id' })
  winner_team: Team;

  @Column({ default: 0 })
  score_a: number;

  @Column({ default: 0 })
  score_b: number;

  @Column({
    type: 'enum',
    enum: MatchStatus,
    default: MatchStatus.SCHEDULED,
  })
  status: MatchStatus;

  @Column({ type: 'timestamptz', nullable: true })
  scheduled_start: Date;

  @Column({ type: 'timestamptz', nullable: true })
  scheduled_end: Date;

  @Column({ nullable: true })
  next_match_id: string;

  @Column({ nullable: true })
  next_match_slot: string; // 'A' or 'B'

  @Column({ default: false })
  is_bye: boolean;

  @Column({ default: false })
  is_third_place: boolean;

  @Column({ type: 'timestamptz', nullable: true })
  started_at: Date;

  @Column({ type: 'timestamptz', nullable: true })
  completed_at: Date;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @OneToMany(() => MatchEvent, (event) => event.match)
  events: MatchEvent[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}
