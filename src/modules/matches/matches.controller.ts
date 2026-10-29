import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { MatchesService } from './matches.service';
import { MatchStatus } from '../../entities/match.entity';
import { UpdateScoreDto } from './dto/update-score.dto';
import { CompleteMatchDto } from './dto/complete-match.dto';
import { ScheduleMatchDto } from './dto/schedule-match.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class MatchesController {
  constructor(private readonly matchesService: MatchesService) {}

  @Get('matches')
  async findAll(
    @Query('board') board?: string,
    @Query('status') status?: MatchStatus,
    @Query('round') round?: string,
  ) {
    return this.matchesService.findAll({
      board: board ? parseInt(board, 10) : undefined,
      status,
      round: round ? parseInt(round, 10) : undefined,
    });
  }

  @Get('matches/:id')
  async findOne(@Param('id') id: string) {
    return this.matchesService.findOne(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/matches/:id/start')
  @HttpCode(HttpStatus.OK)
  async startMatch(@Param('id') id: string) {
    return this.matchesService.startMatch(id);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/matches/:id/score')
  async updateScore(@Param('id') id: string, @Body() dto: UpdateScoreDto) {
    return this.matchesService.updateScore(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/matches/:id/complete')
  @HttpCode(HttpStatus.OK)
  async completeMatch(@Param('id') id: string, @Body() dto: CompleteMatchDto) {
    return this.matchesService.completeMatch(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch('admin/matches/:id/schedule')
  async scheduleMatch(
    @Param('id') id: string,
    @Body() dto: ScheduleMatchDto,
  ) {
    return this.matchesService.scheduleMatch(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/matches/:id/pause')
  @HttpCode(HttpStatus.OK)
  async pauseMatch(@Param('id') id: string) {
    return this.matchesService.pauseMatch(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/matches/:id/cancel')
  @HttpCode(HttpStatus.OK)
  async cancelMatch(@Param('id') id: string) {
    return this.matchesService.cancelMatch(id);
  }
}

