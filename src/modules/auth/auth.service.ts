import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Admin } from '../../entities/admin.entity';
import { AdminLoginDto } from './dto/admin-login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(Admin)
    private readonly adminRepository: Repository<Admin>,
    private readonly jwtService: JwtService,
  ) {}

  async validateAdmin(username: string, pass: string): Promise<Admin | null> {
    const admin = await this.adminRepository.findOne({ where: { username } });
    if (!admin) return null;
    const isMatch = await bcrypt.compare(pass, admin.password_hash);
    if (!isMatch) return null;
    return admin;
  }

  async login(loginDto: AdminLoginDto) {
    const admin = await this.validateAdmin(loginDto.username, loginDto.password);
    if (!admin) {
      throw new UnauthorizedException('Invalid administrative credentials');
    }

    const payload = { sub: admin.id, username: admin.username, role: admin.role };
    const token = this.jwtService.sign(payload);

    this.logger.log(`Admin "${admin.username}" authenticated successfully`);
    return {
      access_token: token,
      user: {
        id: admin.id,
        username: admin.username,
        role: admin.role,
      },
    };
  }

  async hashPassword(password: string): Promise<string> {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
  }
}

