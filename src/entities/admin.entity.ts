import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
} from 'typeorm';

@Entity('admins')
export class Admin {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  username: string;

  @Column()
  password_hash: string;

  @Column({ default: 'ADMIN' })
  role: string;

  @CreateDateColumn({ type: 'timestamptz' })
  created_at: Date;
}

