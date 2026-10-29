import {
  IsEnum,
  IsInt,
  IsOptional,
  IsDateString,
  IsBoolean,
  Min,
  Max,
} from 'class-validator';
import { TournamentFormat } from '../../../entities/tournament.entity';

export class GenerateFixturesDto {
  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @IsOptional()
  @IsDateString()
  start_time?: string;

  @IsOptional()
  @IsInt()
  @Min(5)
  @Max(120)
  match_duration_minutes?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(60)
  interval_minutes?: number;

  @IsOptional()
  @IsBoolean()
  third_place_playoff?: boolean;

  @IsOptional()
  @IsBoolean()
  force?: boolean; // Required if replacing existing fixtures
}
