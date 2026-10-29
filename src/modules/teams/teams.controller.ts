import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { TeamsService } from './teams.service';
import { RegisterTeamDto } from './dto/register-team.dto';
import { UpdateTeamDto } from './dto/update-team.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class TeamsController {
  constructor(private readonly teamsService: TeamsService) {}

  @Get('teams')
  async findAll(
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'registration' | 'name',
  ) {
    return this.teamsService.findAll(search, sortBy);
  }

  @Get('teams/:id')
  async findOne(@Param('id') id: string) {
    return this.teamsService.findOne(id);
  }

  @Post('teams')
  @HttpCode(HttpStatus.CREATED)
  async register(@Body() dto: RegisterTeamDto) {
    return this.teamsService.register(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/teams/:id')
  async update(@Param('id') id: string, @Body() dto: UpdateTeamDto) {
    return this.teamsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('admin/teams/:id')
  async remove(@Param('id') id: string) {
    return this.teamsService.remove(id);
  }
}

