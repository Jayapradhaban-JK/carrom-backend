import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateRegistrationDto {
  @IsOptional()
  @IsBoolean()
  registration_open?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(6)
  team_size?: number;
}

