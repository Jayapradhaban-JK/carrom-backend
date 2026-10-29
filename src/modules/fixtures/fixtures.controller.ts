import { Controller, Post, Delete, Body, UseGuards } from '@nestjs/common';
import { FixturesService } from './fixtures.service';
import { GenerateFixturesDto } from './dto/generate-fixtures.dto';
import { ResetFixturesDto } from './dto/reset-fixtures.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('admin/fixtures')
export class FixturesController {
  constructor(private readonly fixturesService: FixturesService) {}

  @UseGuards(JwtAuthGuard)
  @Post('generate')
  async generate(@Body() dto: GenerateFixturesDto) {
    return this.fixturesService.generate(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('reset')
  async reset(@Body() dto: ResetFixturesDto) {
    return this.fixturesService.reset(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete()
  async deleteFixtures() {
    return this.fixturesService.reset({ reopen_registration: true });
  }
}

