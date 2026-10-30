import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class RegisterTeamDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(60)
  team_name: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(60)
  captain_name: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contact_number?: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  player_names: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  player_user_ids?: string[];

  @IsOptional()
  @IsString()
  logo_url?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  tagline?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  substitutes?: string[];
}
