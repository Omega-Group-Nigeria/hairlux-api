import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { UserRole } from '@prisma/client';
import type { Server, Socket } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import Redis from 'ioredis';
import { BookingParticipantService } from '../home-service-booking/services/booking-participant.service';
import { WsAuthService } from './ws-auth.service';
import { RealtimePublisherService } from './realtime-publisher.service';
import { JoinRoomsDto } from './dto/join-rooms.dto';
import {
  REALTIME_EVENTS,
  REALTIME_NAMESPACE,
} from './realtime.constants';

type AuthedSocket = Socket & {
  data: {
    user?: {
      id: string;
      role: UserRole;
    };
  };
};

@WebSocketGateway({
  namespace: REALTIME_NAMESPACE,
  cors: {
    origin: (_origin, callback) => callback(null, true),
    credentials: true,
  },
})
export class RealtimeGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly wsAuthService: WsAuthService,
    private readonly publisher: RealtimePublisherService,
    private readonly participantService: BookingParticipantService,
    private readonly configService: ConfigService,
  ) {}

  async afterInit(server: Server) {
    this.publisher.setServer(server);
    await this.configureRedisAdapter(server);
    this.logger.log(`Realtime gateway ready at ${REALTIME_NAMESPACE}`);
  }

  async handleConnection(client: AuthedSocket) {
    try {
      const token = this.extractToken(client);
      const user = await this.wsAuthService.authenticate(token);
      client.data.user = { id: user.id, role: user.role };
      client.emit(REALTIME_EVENTS.CONNECTED, {
        userId: user.id,
        role: user.role,
      });
    } catch (error) {
      this.logger.warn(
        `WS auth failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      client.emit('error', { message: 'Unauthorized' });
      client.disconnect(true);
    }
  }

  handleDisconnect(client: AuthedSocket) {
    this.logger.debug(`WS disconnected: ${client.id}`);
  }

  @SubscribeMessage('join')
  async handleJoin(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: JoinRoomsDto,
  ) {
    const user = client.data.user;
    if (!user) {
      return { success: false, message: 'Unauthorized' };
    }

    const joined: string[] = [];
    for (const room of body.rooms) {
      const allowed = await this.canJoinRoom(user, room);
      if (!allowed) continue;
      await client.join(room);
      joined.push(room);
    }

    client.emit(REALTIME_EVENTS.JOINED, { rooms: joined });
    return { success: true, rooms: joined };
  }

  private extractToken(client: Socket): string | undefined {
    const authToken = client.handshake.auth?.token;
    if (typeof authToken === 'string' && authToken.trim()) {
      return authToken.trim();
    }

    const header = client.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length).trim();
    }

    const queryToken = client.handshake.query?.token;
    if (typeof queryToken === 'string' && queryToken.trim()) {
      return queryToken.trim();
    }

    return undefined;
  }

  private async canJoinRoom(
    user: { id: string; role: UserRole },
    room: string,
  ): Promise<boolean> {
    if (room.startsWith('booking:')) {
      const bookingId = room.slice('booking:'.length);
      try {
        const booking =
          await this.participantService.getBookingForParticipant(bookingId);
        this.participantService.assertLiveTrackingAccess(
          booking,
          user.id,
          user.role,
        );
        return true;
      } catch {
        return false;
      }
    }

    if (room.startsWith('beautician:') && room.endsWith(':offers')) {
      const beauticianUserId = room.split(':')[1];
      return user.role === UserRole.BEAUTICIAN && user.id === beauticianUserId;
    }

    return false;
  }

  private async configureRedisAdapter(server: Server) {
    const redisUrl = this.configService.get<string>('REDIS_URL');
    if (!redisUrl) {
      this.logger.warn(
        'REDIS_URL not set — WebSocket adapter running in single-instance mode',
      );
      return;
    }

    try {
      const pubClient = new Redis(redisUrl, {
        maxRetriesPerRequest: null,
        enableOfflineQueue: false,
      });
      const subClient = pubClient.duplicate();
      server.adapter(createAdapter(pubClient, subClient));
      this.logger.log('WebSocket Redis adapter enabled');
    } catch (error) {
      this.logger.warn(
        `Failed to configure WebSocket Redis adapter: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}