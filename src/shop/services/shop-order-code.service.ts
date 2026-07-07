import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class ShopOrderCodeService {
  // Avoids visually ambiguous chars (0, O, 1, I)
  private readonly CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  constructor(private readonly prisma: PrismaService) {}

  private generateSuffix(length = 5): string {
    let suffix = '';
    for (let i = 0; i < length; i++) {
      suffix +=
        this.CODE_CHARS[Math.floor(Math.random() * this.CODE_CHARS.length)];
    }
    return suffix;
  }

  async generateOrderCode(): Promise<string> {
    for (let attempt = 0; attempt < 10; attempt++) {
      const orderCode = `HLORDER-${this.generateSuffix(5)}`;
      const existing = await this.prisma.shopOrder.findUnique({
        where: { orderCode },
        select: { id: true },
      });
      if (!existing) {
        return orderCode;
      }
    }

    throw new Error('Could not generate a unique shop order code');
  }
}