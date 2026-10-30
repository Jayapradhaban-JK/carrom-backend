import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { BulkCreateUsersDto } from './dto/bulk-create-users.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller()
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('users')
  async findAll(@Query('search') search?: string) {
    return this.usersService.findAll(search);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/users')
  @HttpCode(HttpStatus.CREATED)
  async create(@Body() dto: CreateUserDto) {
    return this.usersService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('admin/users/bulk')
  @HttpCode(HttpStatus.CREATED)
  async bulkCreate(@Body() dto: BulkCreateUsersDto) {
    return this.usersService.bulkCreate(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete('admin/users/:id')
  async remove(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}

