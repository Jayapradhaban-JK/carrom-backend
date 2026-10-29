import { Controller, Get, Sse, MessageEvent, Query } from '@nestjs/common';
import { Observable } from 'rxjs';
import { UpdatesService } from './updates.service';

@Controller('updates')
export class UpdatesController {
  constructor(private readonly updatesService: UpdatesService) {}

  @Sse()
  stream(): Observable<MessageEvent> {
    return this.updatesService.getStream();
  }

  @Get('poll')
  poll(@Query('since') since?: string) {
    return {
      serverTime: new Date().toISOString(),
      updates: this.updatesService.getRecent(since),
    };
  }
}

