import { IsArray, IsNotEmpty } from 'class-validator';

export class BulkCreateUsersDto {
  @IsArray()
  @IsNotEmpty()
  names: string[];
}

