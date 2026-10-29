import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Match } from './match.entity';

@Entity('match_events')
export class MatchEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  match_id: string;

  @ManyToOne(() => Match, (match) => match.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'match_id' })
  match: Match;

  @Column()
  event_type: string;

  @Column({ type: 'jsonb', nullable: true, default: {} })
  details: Record<string, any>;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

