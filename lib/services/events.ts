import { EventEmitter } from 'events';

export type RealtimeEvent =
  | { type: 'match'; matchId: string }
  | { type: 'message'; senderId: string; messageId: number }
  | { type: 'read'; readerId: string }
  | { type: 'unmatch'; actorId: string };

class RealtimeBus extends EventEmitter {
  emitToUser(userId: string, event: RealtimeEvent): void {
    this.emit(`user:${userId}`, event);
  }

  subscribeUser(userId: string, listener: (event: RealtimeEvent) => void): () => void {
    const channel = `user:${userId}`;
    this.on(channel, listener);
    return () => {
      this.off(channel, listener);
    };
  }
}

export const realtimeBus = new RealtimeBus();
realtimeBus.setMaxListeners(200);
