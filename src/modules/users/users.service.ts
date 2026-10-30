import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { TournamentUser } from '../../entities/tournament-user.entity';
import { Team } from '../../entities/team.entity';
import { Player } from '../../entities/player.entity';
import { TournamentsService } from '../tournaments/tournaments.service';
import { UpdatesService } from '../updates/updates.service';
import { CreateUserDto } from './dto/create-user.dto';
import { BulkCreateUsersDto } from './dto/bulk-create-users.dto';

export interface UserWithStatus {
  id: string;
  name: string;
  normalized_name: string;
  employee_id?: string;
  department?: string;
  email?: string;
  created_at: Date;
  is_registered: boolean;
  registered_team?: {
    id: string;
    team_name: string;
    registration_number: string;
  } | null;
  is_captain?: boolean;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(TournamentUser)
    private readonly userRepo: Repository<TournamentUser>,
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    private readonly tournamentsService: TournamentsService,
    private readonly updatesService: UpdatesService,
    private readonly dataSource: DataSource,
  ) {}

  normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async findAll(search?: string): Promise<{ total: number; availableCount: number; registeredCount: number; users: UserWithStatus[] }> {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();

    const users = await this.userRepo.find({
      where: { tournament_id: tournament.id },
      order: { name: 'ASC' },
    });

    // Find all registered teams with players for this tournament
    const teams = await this.teamRepo.find({
      where: { tournament_id: tournament.id },
      relations: ['players'],
    });

    // Build registered player lookup map: by userId or normalized name
    const registeredMap = new Map<string, { team: Team; isCaptain: boolean }>();
    for (const team of teams) {
      for (const player of team.players || []) {
        const normName = this.normalizeName(player.player_name);
        const info = { team, isCaptain: Boolean(player.is_captain) };
        registeredMap.set(`norm:${normName}`, info);
        if (player.user_id) {
          registeredMap.set(`uid:${player.user_id}`, info);
        }
      }
    }

    let usersWithStatus: UserWithStatus[] = users.map((user) => {
      const reg =
        registeredMap.get(`uid:${user.id}`) ||
        registeredMap.get(`norm:${user.normalized_name}`);

      return {
        id: user.id,
        name: user.name,
        normalized_name: user.normalized_name,
        employee_id: user.employee_id || undefined,
        department: user.department || undefined,
        email: user.email || undefined,
        created_at: user.created_at,
        is_registered: Boolean(reg),
        registered_team: reg
          ? {
              id: reg.team.id,
              team_name: reg.team.team_name,
              registration_number: reg.team.registration_number,
            }
          : null,
        is_captain: reg ? reg.isCaptain : false,
      };
    });

    if (search && search.trim()) {
      const term = search.trim().toLowerCase();
      usersWithStatus = usersWithStatus.filter(
        (u) =>
          u.name.toLowerCase().includes(term) ||
          (u.employee_id && u.employee_id.toLowerCase().includes(term)) ||
          (u.department && u.department.toLowerCase().includes(term)),
      );
    }

    const registeredCount = usersWithStatus.filter((u) => u.is_registered).length;
    const availableCount = usersWithStatus.length - registeredCount;

    return {
      total: usersWithStatus.length,
      availableCount,
      registeredCount,
      users: usersWithStatus,
    };
  }

  async create(dto: CreateUserDto): Promise<TournamentUser> {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();
    const cleanName = dto.name.trim();

    if (!cleanName) {
      throw new BadRequestException('User name is required.');
    }

    const normName = this.normalizeName(cleanName);

    const existing = await this.userRepo.findOne({
      where: {
        tournament_id: tournament.id,
        normalized_name: normName,
      },
    });

    if (existing) {
      throw new ConflictException(`User "${cleanName}" is already present in the tournament user pool.`);
    }

    const user = this.userRepo.create({
      tournament_id: tournament.id,
      name: cleanName,
      normalized_name: normName,
      employee_id: dto.employee_id ? dto.employee_id.trim() : undefined,
      department: dto.department ? dto.department.trim() : undefined,
      email: dto.email ? dto.email.trim() : undefined,
    });

    const saved = await this.userRepo.save(user);

    this.updatesService.emit({
      type: 'USER_ADDED',
      tournamentId: tournament.id,
      data: saved,
    });

    return saved;
  }

  async bulkCreate(dto: BulkCreateUsersDto): Promise<{ createdCount: number; skippedCount: number; totalUsers: number }> {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();

    if (!dto.names || !Array.isArray(dto.names) || dto.names.length === 0) {
      throw new BadRequestException('Please provide a list of user names.');
    }

    // Clean and deduplicate within input
    const seenNorm = new Set<string>();
    const cleanedNames: string[] = [];

    for (const raw of dto.names) {
      const clean = (raw || '').trim();
      if (!clean) continue;
      const norm = this.normalizeName(clean);
      if (!seenNorm.has(norm)) {
        seenNorm.add(norm);
        cleanedNames.push(clean);
      }
    }

    if (cleanedNames.length === 0) {
      throw new BadRequestException('No valid names found in the provided list.');
    }

    // Check existing in DB
    const existingUsers = await this.userRepo.find({
      where: { tournament_id: tournament.id },
    });
    const existingNorms = new Set(existingUsers.map((u) => u.normalized_name));

    const toCreate: TournamentUser[] = [];
    let skippedCount = 0;

    for (const name of cleanedNames) {
      const norm = this.normalizeName(name);
      if (existingNorms.has(norm)) {
        skippedCount++;
      } else {
        existingNorms.add(norm);
        toCreate.push(
          this.userRepo.create({
            tournament_id: tournament.id,
            name,
            normalized_name: norm,
          }),
        );
      }
    }

    if (toCreate.length > 0) {
      await this.userRepo.save(toCreate);
    }

    const totalUsers = await this.userRepo.count({
      where: { tournament_id: tournament.id },
    });

    this.updatesService.emit({
      type: 'USERS_BULK_ADDED',
      tournamentId: tournament.id,
      data: { createdCount: toCreate.length, skippedCount, totalUsers },
    });

    return {
      createdCount: toCreate.length,
      skippedCount,
      totalUsers,
    };
  }

  async delete(id: string): Promise<{ success: boolean; message: string }> {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();
    const user = await this.userRepo.findOne({
      where: { id, tournament_id: tournament.id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID "${id}" not found.`);
    }

    // Check if user is registered in any team
    const teams = await this.teamRepo.find({
      where: { tournament_id: tournament.id },
      relations: ['players'],
    });

    for (const team of teams) {
      const found = (team.players || []).some(
        (p) =>
          p.user_id === user.id ||
          this.normalizeName(p.player_name) === user.normalized_name,
      );
      if (found) {
        throw new ConflictException(
          `Cannot delete user "${user.name}" because they are currently registered in team "${team.team_name}" (${team.registration_number}). Please remove or edit the team first.`,
        );
      }
    }

    await this.userRepo.remove(user);

    this.updatesService.emit({
      type: 'USER_DELETED',
      tournamentId: tournament.id,
      data: { id, name: user.name },
    });

    return {
      success: true,
      message: `User "${user.name}" has been removed from tournament user pool.`,
    };
  }
}

