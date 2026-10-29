import { IsOptional, IsUUID, IsInt, Min } from 'class-validator';

export class CompleteMatchDto {
  @IsOptional()
  @IsUUID()
  winner_team_id?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  score_a?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  score_b?: number;

  @IsOptional()
  notes?: string;
}

