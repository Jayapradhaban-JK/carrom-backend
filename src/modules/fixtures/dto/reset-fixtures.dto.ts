import { IsBoolean, IsOptional } from 'class-validator';

export class ResetFixturesDto {
  @IsOptional()
  @IsBoolean()
  reopen_registration?: boolean;
}

