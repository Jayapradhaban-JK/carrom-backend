import { IsInt, Min, IsOptional } from 'class-validator';

export class UpdateScoreDto {
  @IsInt()
  @Min(0)
  score_a: number;

  @IsInt()
  @Min(0)
  score_b: number;

  @IsOptional()
  notes?: string;
}

