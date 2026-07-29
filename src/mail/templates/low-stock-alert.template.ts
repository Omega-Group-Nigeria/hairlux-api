import { baseTemplate } from './base.template';
import { LowStockAlertStage } from '@prisma/client';

export interface LowStockAlertData {
    itemName: string;
    stage: LowStockAlertStage;
    currentQuantity: number;
    threshold: number;
}

export function lowStockAlertTemplate(
    firstName: string,
    data: LowStockAlertData,
): string {
    const title = 'Low Stock Alert — HairLux';
    const stageLabel = data.stage.charAt(0) + data.stage.slice(1).toLowerCase();

    const body = `
    <p>Hi ${firstName},</p>
    <p>This is a <strong>${stageLabel}-level</strong> low stock alert.</p>
    <p><strong>${data.itemName}</strong> is at ${data.currentQuantity} units — at or below its threshold of ${data.threshold}.</p>
    <p>Please review and restock, or mark the alert resolved once addressed.</p>
  `;

    return baseTemplate({
        title,
        previewText: `Low stock: ${data.itemName}`,
        content: body,
    });
}