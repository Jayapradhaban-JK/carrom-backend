import { Module, Global } from '@nestjs/common';
import { UpdatesService } from './updates.service';
import { UpdatesController } from './updates.controller';

@Global()
@Module({
  controllers: [UpdatesController],
  providers: [UpdatesService],
  exports: [UpdatesService],
})
export class UpdatesModule {}

