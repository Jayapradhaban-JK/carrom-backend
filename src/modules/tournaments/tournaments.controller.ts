import {
  Controller,
  Get,
  Patch,
  Body,
  UseGuards,
} from '@nestjs/common';
import { TournamentsService } from './tournaments.service';
import { UpdateRegistrationDto } from './dto/update-registration.dto';
import { UpdateTournamentDto } from './dto/update-tournament.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class TournamentsController {
  constructor(private readonly tournamentsService: TournamentsService) {}

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      service: 'Carrom Arena Backend API',
      timestamp: new Date().toISOString(),
    };
  }

  @Get('tournaments/active')
  async getActiveDashboard() {
    return this.tournamentsService.getActiveDashboardSummary();
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/registration')
  async updateRegistration(@Body() dto: UpdateRegistrationDto) {
    return this.tournamentsService.updateRegistration(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/tournament')
  async updateTournament(@Body() dto: UpdateTournamentDto) {
    return this.tournamentsService.updateTournament(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/settings')
  async updateSettings(@Body() settings: Record<string, any>) {
    return this.tournamentsService.updateSettings(settings);
  }
}

