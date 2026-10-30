import { Injectable, MessageEvent } from '@nestjs/common';
import { Subject, Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface TournamentUpdatePayload {
  type:
    | 'TEAM_REGISTERED'
    | 'TEAM_UPDATED'
    | 'TEAM_DELETED'
    | 'FIXTURES_GENERATED'
    | 'FIXTURES_RESET'
    | 'MATCH_UPDATED'
    | 'SCORE_UPDATED'
    | 'TOURNAMENT_UPDATED'
    | 'REGISTRATION_STATUS'
    | 'USER_ADDED'
    | 'USERS_BULK_ADDED'
    | 'USER_DELETED';
  tournamentId?: string;
  timestamp: string;
  data?: any;
}

@Injectable()
export class UpdatesService {
  private updateSubject = new Subject<TournamentUpdatePayload>();
  private recentUpdates: TournamentUpdatePayload[] = [];

  emit(payload: Omit<TournamentUpdatePayload, 'timestamp'>) {
    const fullPayload: TournamentUpdatePayload = {
      ...payload,
      timestamp: new Date().toISOString(),
    };
    this.recentUpdates.push(fullPayload);
    if (this.recentUpdates.length > 50) {
      this.recentUpdates.shift();
    }
    this.updateSubject.next(fullPayload);
  }

  getStream(): Observable<MessageEvent> {
    return this.updateSubject.asObservable().pipe(
      map((payload) => ({
        data: payload,
      } as MessageEvent)),
    );
  }

  getRecent(since?: string): TournamentUpdatePayload[] {
    if (!since) return this.recentUpdates.slice(-10);
    const sinceTime = new Date(since).getTime();
    return this.recentUpdates.filter(
      (u) => new Date(u.timestamp).getTime() > sinceTime,
    );
  }
}

