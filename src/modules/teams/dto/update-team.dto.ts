import {
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class UpdateTeamDto {
  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  team_name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  captain_name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  contact_number?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty({ each: true })
  player_names?: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  substitutes?: string[];
}

