import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, ILike } from 'typeorm';
import { Team } from '../../entities/team.entity';
import { Player } from '../../entities/player.entity';
import { Tournament } from '../../entities/tournament.entity';
import { Match } from '../../entities/match.entity';
import { TournamentsService } from '../tournaments/tournaments.service';
import { UpdatesService } from '../updates/updates.service';
import { RegisterTeamDto } from './dto/register-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';

@Injectable()
export class TeamsService {
  private readonly logger = new Logger(TeamsService.name);

  constructor(
    @InjectRepository(Team)
    private readonly teamRepo: Repository<Team>,
    @InjectRepository(Player)
    private readonly playerRepo: Repository<Player>,
    @InjectRepository(Match)
    private readonly matchRepo: Repository<Match>,
    private readonly tournamentsService: TournamentsService,
    private readonly updatesService: UpdatesService,
    private readonly dataSource: DataSource,
  ) {}

  normalizeName(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
  }

  async findAll(search?: string, sortBy: 'registration' | 'name' = 'registration') {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();
    const query = this.teamRepo
      .createQueryBuilder('team')
      .leftJoinAndSelect('team.players', 'player')
      .where('team.tournament_id = :tid', { tid: tournament.id });

    if (search && search.trim()) {
      const term = `%${search.trim().toLowerCase()}%`;
      query.andWhere(
        '(LOWER(team.team_name) LIKE :term OR LOWER(team.captain_name) LIKE :term)',
        { term },
      );
    }

    if (sortBy === 'name') {
      query.orderBy('team.team_name', 'ASC');
    } else {
      query.orderBy('team.created_at', 'ASC');
    }

    const teams = await query.getMany();
    return {
      total: teams.length,
      teams,
    };
  }

  async findOne(id: string): Promise<Team> {
    const team = await this.teamRepo.findOne({
      where: { id },
      relations: ['players'],
    });
    if (!team) {
      throw new NotFoundException(`Team with ID "${id}" not found`);
    }
    return team;
  }

  async register(dto: RegisterTeamDto): Promise<Team> {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();

    if (!tournament.registration_open) {
      throw new BadRequestException(
        'Team registration is currently closed by the tournament administrator.',
      );
    }

    const cleanTeamName = dto.team_name.trim();
    const normalizedName = this.normalizeName(cleanTeamName);
    const cleanCaptain = dto.captain_name.trim();

    // Check duplicate team name in this tournament
    const existing = await this.teamRepo.findOne({
      where: {
        tournament_id: tournament.id,
        normalized_team_name: normalizedName,
      },
    });

    if (existing) {
      throw new ConflictException(
        `A team named "${cleanTeamName}" is already registered. Please choose a different team name.`,
      );
    }

    // Process and validate players
    const rawPlayerNames = (dto.player_names || []).map((p) => p.trim()).filter(Boolean);
    const rawSubstitutes = (dto.substitutes || []).map((s) => s.trim()).filter(Boolean);

    // Build unique active players list
    // If the captain name was not included in rawPlayerNames, prepend captain
    let activePlayerNames: string[] = [];
    const captainInPlayers = rawPlayerNames.some(
      (p) => this.normalizeName(p) === this.normalizeName(cleanCaptain),
    );

    if (captainInPlayers) {
      activePlayerNames = [...rawPlayerNames];
    } else {
      activePlayerNames = [cleanCaptain, ...rawPlayerNames];
    }

    // Validate no duplicates among active players
    const seenActive = new Set<string>();
    for (const name of activePlayerNames) {
      const norm = this.normalizeName(name);
      if (seenActive.has(norm)) {
        throw new BadRequestException(
          `Duplicate player name "${name}" detected within the team. All team members must be distinct.`,
        );
      }
      seenActive.add(norm);
    }

    // Validate required team size
    if (activePlayerNames.length !== tournament.team_size) {
      throw new BadRequestException(
        `Team size requirement not met. The tournament requires exactly ${tournament.team_size} active players per team (currently provided: ${activePlayerNames.length}).`,
      );
    }

    // Validate substitutes
    const seenSubs = new Set<string>();
    for (const sub of rawSubstitutes) {
      const norm = this.normalizeName(sub);
      if (seenActive.has(norm)) {
        throw new BadRequestException(
          `Substitute "${sub}" is already listed as an active player for this team.`,
        );
      }
      if (seenSubs.has(norm)) {
        throw new BadRequestException(
          `Duplicate substitute name "${sub}" detected.`,
        );
      }
      seenSubs.add(norm);
    }

    // Run creation inside a transaction
    return this.dataSource.transaction(async (manager) => {
      // Determine next registration number
      const count = await manager.count(Team, {
        where: { tournament_id: tournament.id },
      });
      const regNumber = `CA-${String(count + 1).padStart(3, '0')}`;

      const newTeam = manager.create(Team, {
        tournament_id: tournament.id,
        team_name: cleanTeamName,
        normalized_team_name: normalizedName,
        captain_name: cleanCaptain,
        contact_number: dto.contact_number ? dto.contact_number.trim() : null,
        registration_number: regNumber,
        status: 'CONFIRMED',
      });

      const savedTeam = await manager.save(newTeam);

      // Create player records
      const playerEntities: Player[] = [];

      for (let i = 0; i < activePlayerNames.length; i++) {
        const pName = activePlayerNames[i];
        const isCap = this.normalizeName(pName) === this.normalizeName(cleanCaptain);
        playerEntities.push(
          manager.create(Player, {
            team_id: savedTeam.id,
            player_name: pName,
            is_captain: isCap,
            is_substitute: false,
          }),
        );
      }

      for (const subName of rawSubstitutes) {
        playerEntities.push(
          manager.create(Player, {
            team_id: savedTeam.id,
            player_name: subName,
            is_captain: false,
            is_substitute: true,
          }),
        );
      }

      await manager.save(Player, playerEntities);
      savedTeam.players = playerEntities;

      this.logger.log(
        `Registered team "${savedTeam.team_name}" (${savedTeam.registration_number})`,
      );

      this.updatesService.emit({
        type: 'TEAM_REGISTERED',
        tournamentId: tournament.id,
        data: savedTeam,
      });

      return savedTeam;
    });
  }

  async update(id: string, dto: UpdateTeamDto): Promise<Team> {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();
    const team = await this.findOne(id);

    // Check if matches have been generated
    const matchCount = await this.matchRepo.count({
      where: { tournament_id: tournament.id },
    });
    if (matchCount > 0) {
      throw new BadRequestException(
        'Cannot modify team after fixtures have been generated. Reset fixtures before editing teams.',
      );
    }

    if (dto.team_name) {
      const cleanName = dto.team_name.trim();
      const norm = this.normalizeName(cleanName);
      if (norm !== team.normalized_team_name) {
        const existing = await this.teamRepo.findOne({
          where: { tournament_id: tournament.id, normalized_team_name: norm },
        });
        if (existing) {
          throw new ConflictException(
            `Another team named "${cleanName}" already exists.`,
          );
        }
        team.team_name = cleanName;
        team.normalized_team_name = norm;
      }
    }

    if (dto.captain_name) {
      team.captain_name = dto.captain_name.trim();
    }

    if (dto.contact_number !== undefined) {
      team.contact_number = dto.contact_number ? dto.contact_number.trim() : null;
    }

    return this.dataSource.transaction(async (manager) => {
      if (dto.player_names) {
        // Rebuild players
        await manager.delete(Player, { team_id: team.id });

        const rawPlayerNames = dto.player_names.map((p) => p.trim()).filter(Boolean);
        const rawSubs = (dto.substitutes || []).map((s) => s.trim()).filter(Boolean);

        let activePlayerNames: string[] = [];
        const capNorm = this.normalizeName(team.captain_name);
        const capIncluded = rawPlayerNames.some(
          (p) => this.normalizeName(p) === capNorm,
        );

        if (capIncluded) {
          activePlayerNames = [...rawPlayerNames];
        } else {
          activePlayerNames = [team.captain_name, ...rawPlayerNames];
        }

        if (activePlayerNames.length !== tournament.team_size) {
          throw new BadRequestException(
            `Team size requirement not met. Exactly ${tournament.team_size} active players required.`,
          );
        }

        const playerEntities: Player[] = [];
        for (const pName of activePlayerNames) {
          playerEntities.push(
            manager.create(Player, {
              team_id: team.id,
              player_name: pName,
              is_captain: this.normalizeName(pName) === capNorm,
              is_substitute: false,
            }),
          );
        }

        for (const sName of rawSubs) {
          playerEntities.push(
            manager.create(Player, {
              team_id: team.id,
              player_name: sName,
              is_captain: false,
              is_substitute: true,
            }),
          );
        }

        await manager.save(Player, playerEntities);
        team.players = playerEntities;
      }

      const saved = await manager.save(Team, team);
      this.updatesService.emit({
        type: 'TEAM_UPDATED',
        tournamentId: tournament.id,
        data: saved,
      });

      return saved;
    });
  }

  async remove(id: string): Promise<{ success: boolean; message: string }> {
    const tournament = await this.tournamentsService.getOrCreateActiveTournament();
    const team = await this.findOne(id);

    const matchCount = await this.matchRepo.count({
      where: { tournament_id: tournament.id },
    });
    if (matchCount > 0) {
      throw new BadRequestException(
        'Cannot delete team after fixtures have been generated. Reset fixtures first.',
      );
    }

    await this.teamRepo.remove(team);
    this.logger.log(`Deleted team "${team.team_name}"`);

    this.updatesService.emit({
      type: 'TEAM_DELETED',
      tournamentId: tournament.id,
      data: { id: team.id, name: team.team_name },
    });

    return {
      success: true,
      message: `Team "${team.team_name}" deleted successfully`,
    };
  }
}

