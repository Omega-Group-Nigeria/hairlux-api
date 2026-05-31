import { Injectable, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWaitlistEntryDto } from './dto/create-waitlist-entry.dto';

const ENTRY_SELECT = {
  id: true,
  fullName: true,
  email: true,
  createdAt: true,
} as const;

@Injectable()
export class WaitlistService {
  constructor(private readonly prisma: PrismaService) {}

  async join(dto: CreateWaitlistEntryDto) {
    const existing = await this.prisma.waitlistEntry.findUnique({
      where: { email: dto.email },
      select: { id: true },
    });

    if (existing) {
      throw new ConflictException('This email is already on the waitlist');
    }

    return this.prisma.waitlistEntry.create({
      data: {
        fullName: dto.fullName,
        email: dto.email,
      },
      select: ENTRY_SELECT,
    });
  }

  async findAll() {
    return this.prisma.waitlistEntry.findMany({
      orderBy: { createdAt: 'desc' },
      select: ENTRY_SELECT,
    });
  }
}
