import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Tournament } from './tournament.entity';

@Entity('tournament_users')
@Unique(['tournament_id', 'normalized_name'])
export class TournamentUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tournament_id: string;

  @ManyToOne(() => Tournament, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tournament_id' })
  tournament: Tournament;

  @Column()
  name: string;

  @Column()
  normalized_name: string;

  @Column({ nullable: true })
  employee_id?: string;

  @Column({ nullable: true })
  department?: string;

  @Column({ nullable: true })
  email?: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

