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
  Unique,
} from 'typeorm';
import { Tournament } from './tournament.entity';
import { Player } from './player.entity';

@Entity('teams')
@Unique(['tournament_id', 'normalized_team_name'])
@Unique(['tournament_id', 'registration_number'])
export class Team {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tournament_id: string;

  @ManyToOne(() => Tournament, (tournament) => tournament.teams, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tournament_id' })
  tournament: Tournament;

  @Column()
  registration_number: string;

  @Column()
  team_name: string;

  @Column()
  normalized_team_name: string;

  @Column()
  captain_name: string;

  @Column({ nullable: true })
  contact_number: string;

  @Column({ default: 'CONFIRMED' })
  status: string;

  @OneToMany(() => Player, (player) => player.team, {
    cascade: true,
    eager: true,
  })
  players: Player[];

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updated_at: Date;
}

