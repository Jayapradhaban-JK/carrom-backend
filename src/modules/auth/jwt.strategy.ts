import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Admin } from '../../entities/admin.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET', 'carrom_arena_jwt_secret_office_tournament_2026_super_secure'),
    });
  }

  async validate(payload: { sub: string; username: string }) {
    const admin = await this.adminRepository.findOne({
      where: { id: payload.sub },
    });
    if (!admin) {
      throw new UnauthorizedException('Admin account not found or deactivated');
    }
    return { id: admin.id, username: admin.username, role: admin.role };
  }
}

