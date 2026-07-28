import { Injectable, NotFoundException, BadRequestException, } from '@nestjs/common';
import { JobType, Prisma, JobPostingStatus, ApplicationStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { CreateJobDto } from './dto/create-job.dto';
import { UpdateJobDto } from './dto/update-job.dto';
import { CloseJobPostingDto } from './dto/close-job-posting.dto';
import { QueryJobsDto } from './dto/query-jobs.dto';

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
      status: JobPostingStatus.PUBLISHED,
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
        status: JobPostingStatus.PUBLISHED,
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
        branchId: dto.branchId,
        department: dto.department,
        description: dto.description,
        responsibilities: dto.responsibilities,
        status: dto.isActive ? JobPostingStatus.PUBLISHED : JobPostingStatus.DRAFT,
        closingDate: dto.closingDate ? new Date(dto.closingDate) : null,
        salaryMin: dto.salaryMin,
        salaryMax: dto.salaryMax,
        salaryNote: dto.salaryNote,
      },
    });

    await this.redis.delByPattern('jobs:*');
    return job;
  }

  async findAllAdmin(queryDto: QueryJobsDto) {
    const { type, branchId, page = 1, limit = 10 } = queryDto;
    const skip = (page - 1) * limit;

    const where: Prisma.JobPostingWhereInput = {};
    if (type) where.type = type as JobType;
    if (branchId) where.branchId = branchId;

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
        ...(dto.branchId !== undefined && { branchId: dto.branchId }),
        ...(dto.department !== undefined && { department: dto.department }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.responsibilities !== undefined && {
          responsibilities: dto.responsibilities,
        }),
        ...(dto.isActive !== undefined && {
          status: dto.isActive ? JobPostingStatus.PUBLISHED : JobPostingStatus.DRAFT,
        }),
        ...(dto.closingDate !== undefined && {
          closingDate: dto.closingDate ? new Date(dto.closingDate) : null,
        }),
        ...(dto.salaryMin !== undefined && { salaryMin: dto.salaryMin }),
        ...(dto.salaryMax !== undefined && { salaryMax: dto.salaryMax }),
        ...(dto.salaryNote !== undefined && { salaryNote: dto.salaryNote }),
      },
    });

    await this.redis.delByPattern('jobs:*');
    return job;
  }

  async toggle(id: string) {
    const job = await this.findOneAdmin(id);

    if (job.status === JobPostingStatus.CLOSED || job.status === JobPostingStatus.ARCHIVED) {
      throw new BadRequestException(
        `Cannot toggle — job posting is ${job.status}. Reopen explicitly if you need to revive it.`,
      );
    }

    const nextStatus =
      job.status === JobPostingStatus.PUBLISHED
        ? JobPostingStatus.DRAFT
        : JobPostingStatus.PUBLISHED;

    const updated = await this.prisma.jobPosting.update({
      where: { id },
      data: { status: nextStatus },
    });

    await this.redis.delByPattern('jobs:*');
    return updated;
  }

  async remove(id: string) {
    await this.findOneAdmin(id);
    await this.prisma.jobPosting.delete({ where: { id } });
    await this.redis.delByPattern('jobs:*');
  }

  async close(id: string, dto: CloseJobPostingDto) {
    const job = await this.findOneAdmin(id);

    if (job.status === JobPostingStatus.CLOSED || job.status === JobPostingStatus.ARCHIVED) {
      throw new BadRequestException(`Job posting is already ${job.status}`);
    }

    const activeCandidates = await this.prisma.application.count({
      where: {
        jobId: id,
        status: { notIn: [ApplicationStatus.EMPLOYED, ApplicationStatus.NOT_SELECTED] },
      },
    });

    if (activeCandidates > 0 && !dto.override) {
      throw new BadRequestException(
        `Cannot close — ${activeCandidates} candidate(s) still active on this listing. Pass override: true with a reason to force-close.`,
      );
    }

    const updated = await this.prisma.jobPosting.update({
      where: { id },
      data: {
        status: JobPostingStatus.CLOSED,
        closedReason: dto.override ? dto.reason : null,
      },
    });

    await this.redis.delByPattern('jobs:*'); // don't forget this — the existing module invalidates cache on every mutation
    return updated;
  }
}
