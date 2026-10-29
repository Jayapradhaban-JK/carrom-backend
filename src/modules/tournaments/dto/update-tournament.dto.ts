import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Min,
  Max,
  IsDateString,
  IsBoolean,
} from 'class-validator';
import {
  TournamentFormat,
  TournamentStatus,
  ScoringRule,
} from '../../../entities/tournament.entity';

export class UpdateTournamentDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(TournamentFormat)
  format?: TournamentFormat;

  @IsOptional()
  @IsEnum(TournamentStatus)
  status?: TournamentStatus;

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
  @IsDateString()
  start_time?: string;

  @IsOptional()
  @IsBoolean()
  third_place_playoff?: boolean;

  @IsOptional()
  @IsEnum(ScoringRule)
  scoring_rule?: ScoringRule;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  target_score?: number;

  @IsOptional()
  @IsString()
  banner_url?: string;
}
