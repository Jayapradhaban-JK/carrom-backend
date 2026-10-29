import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  Unique,
} from 'typeorm';

@Entity('tournament_settings')
@Unique(['tournament_id', 'setting_key'])
export class TournamentSetting {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  tournament_id: string;

  @Column()
  setting_key: string;

  @Column({ type: 'text' })
  setting_value: string;
}

