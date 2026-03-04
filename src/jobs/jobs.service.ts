import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { QueryJobsDto } from './dto/query-jobs.dto';
import { JobType, Prisma } from '@prisma/client';

const TTL = 300; // 5 minutes

@Injectable()
export class JobsService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  // ── Public ──────────────────────────────────────────────────────────────────

  async findAllPublic(queryDto: QueryJobsDto) {
    const cacheKey = `jobs:public:${JSON.stringify(queryDto)}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const { type, page = 1, limit = 10 } = queryDto;
    const skip = (page - 1) * limit;
    const now = new Date();

    const where: Prisma.JobPostingWhereInput = {
      isActive: true,
      OR: [{ closingDate: null }, { closingDate: { gte: now } }],
    };

    if (type) where.type = type as JobType;

    const [jobs, total] = await Promise.all([
      this.prisma.jobPosting.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.jobPosting.count({ where }),
    ]);

    const result = {
      data: jobs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };

    await this.redis.set(cacheKey, result, TTL);
    return result;
  }

  async findOnePublic(id: string) {
    const cacheKey = `jobs:public:one:${id}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return cached;

    const now = new Date();
    const job = await this.prisma.jobPosting.findFirst({
      where: {
        id,
        isActive: true,
        OR: [{ closingDate: null }, { closingDate: { gte: now } }],
      },
    });

    if (!job) throw new NotFoundException('Job posting not found');

    await this.redis.set(cacheKey, job, TTL);
    return job;
  }

  // ── Admin ────────────────────────────────────────────────────────────────────

  async create(dto: CreateJobDto) {
    const job = await this.prisma.jobPosting.create({
      data: {
        title: dto.title,
        type: dto.type,
        location: dto.location,
        description: dto.description,
        responsibilities: dto.responsibilities,
        isActive: dto.isActive ?? false,
        closingDate: dto.closingDate ? new Date(dto.closingDate) : null,
      },
    });

    await this.redis.delByPattern('jobs:*');
    return job;
  }

  async findAllAdmin(queryDto: QueryJobsDto) {
    const { type, page = 1, limit = 10 } = queryDto;
    const skip = (page - 1) * limit;

    const where: Prisma.JobPostingWhereInput = {};
    if (type) where.type = type as JobType;

    const [jobs, total] = await Promise.all([
      this.prisma.jobPosting.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.jobPosting.count({ where }),
    ]);

    return {
      data: jobs,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    };
  }

  async findOneAdmin(id: string) {
    const job = await this.prisma.jobPosting.findUnique({ where: { id } });
    if (!job) throw new NotFoundException('Job posting not found');
    return job;
  }

  async update(id: string, dto: UpdateJobDto) {
    await this.findOneAdmin(id);

    const job = await this.prisma.jobPosting.update({
      where: { id },
      data: {
        ...(dto.title !== undefined && { title: dto.title }),
        ...(dto.type !== undefined && { type: dto.type }),
        ...(dto.location !== undefined && { location: dto.location }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.responsibilities !== undefined && {
          responsibilities: dto.responsibilities,
        }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.closingDate !== undefined && {
          closingDate: dto.closingDate ? new Date(dto.closingDate) : null,
        }),
      },
    });

    await this.redis.delByPattern('jobs:*');
    return job;
  }

  async toggle(id: string) {
    const job = await this.findOneAdmin(id);

    const updated = await this.prisma.jobPosting.update({
      where: { id },
      data: { isActive: !job.isActive },
    });

    await this.redis.delByPattern('jobs:*');
    return updated;
  }

  async remove(id: string) {
    await this.findOneAdmin(id);
    await this.prisma.jobPosting.delete({ where: { id } });
    await this.redis.delByPattern('jobs:*');
  }
}
