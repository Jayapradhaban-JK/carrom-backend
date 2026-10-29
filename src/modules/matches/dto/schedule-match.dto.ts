import {
  IsInt,
  IsOptional,
  IsDateString,
  Min,
  Max,
} from 'class-validator';

export class ScheduleMatchDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2)
  board_number?: number;

  @IsOptional()
  @IsDateString()
  scheduled_start?: string;

  @IsOptional()
  @IsDateString()
  scheduled_end?: string;
}

