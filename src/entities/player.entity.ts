import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Team } from './team.entity';

@Entity('players')
export class Player {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  team_id: string;

  @ManyToOne(() => Team, (team) => team.players, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'team_id' })
  team: Team;

  @Column()
  player_name: string;

  @Column({ default: false })
  is_captain: boolean;

  @Column({ default: false })
  is_substitute: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

