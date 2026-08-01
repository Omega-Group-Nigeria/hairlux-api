import { baseTemplate } from './base.template';
import { ShopQuoteLineItem } from '../../shop/types/shop-order-item.interface';

export interface ShopOrderConfirmationData {
  orderId: string;
  orderCode: string;
  items: ShopQuoteLineItem[];
  deliveryAddress: string;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
}

export function shopOrderConfirmationTemplate(
  firstName: string,
  order: ShopOrderConfirmationData,
): string {
  const itemRows = order.items
    .map(
      (item) => `
      <tr>
        <td style="padding:12px 20px;border-bottom:1px solid #F2F2F2;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">${item.name}${item.quantity > 1 ? ` (x${item.quantity})` : ''}</p>
        </td>
        <td style="padding:12px 20px;border-bottom:1px solid #F2F2F2;text-align:right;">
          <p style="margin:0;font-size:14px;font-weight:600;color:#1A1A1A;">&#8358;${item.lineTotal.toLocaleString()}</p>
        </td>
      </tr>`,
    )
    .join('');

  const content = `
    <p style="margin:0 0 4px;font-size:36px;text-align:center;">🛍️</p>
    <h1 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#1A1A1A;text-align:center;">Order confirmed!</h1>
    <p style="margin:0 0 24px;font-size:15px;color:#555555;line-height:1.6;text-align:center;">
      Hi <strong>${firstName}</strong>, your shop order has been placed and paid from your wallet.
    </p>

    <div style="background:#F9F9F9;border-radius:12px;padding:16px 20px;margin-bottom:24px;">
      <p style="margin:0 0 4px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">Order Code</p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#1A1A1A;letter-spacing:1px;">${order.orderCode}</p>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;">
      <thead>
        <tr>
          <th style="padding:8px 20px;text-align:left;font-size:12px;color:#888888;font-weight:600;">Item</th>
          <th style="padding:8px 20px;text-align:right;font-size:12px;color:#888888;font-weight:600;">Amount</th>
        </tr>
      </thead>
      <tbody>${itemRows}</tbody>
    </table>

    <div style="border-top:1px solid #F2F2F2;padding-top:12px;margin-bottom:24px;">
      <p style="margin:0 0 6px;font-size:14px;color:#555555;display:flex;justify-content:space-between;">
        <span>Subtotal</span><span>&#8358;${order.subtotal.toLocaleString()}</span>
      </p>
      <p style="margin:0 0 6px;font-size:14px;color:#555555;display:flex;justify-content:space-between;">
        <span>Delivery</span><span>&#8358;${order.deliveryFee.toLocaleString()}</span>
      </p>
      <p style="margin:0;font-size:16px;font-weight:700;color:#1A1A1A;display:flex;justify-content:space-between;">
        <span>Total</span><span>&#8358;${order.totalAmount.toLocaleString()}</span>
      </p>
    </div>

    <div style="background:#F9F9F9;border-radius:12px;padding:16px 20px;">
      <p style="margin:0 0 4px;font-size:12px;color:#888888;text-transform:uppercase;letter-spacing:0.5px;">Delivery address</p>
      <p style="margin:0;font-size:14px;color:#1A1A1A;line-height:1.5;">${order.deliveryAddress}</p>
    </div>
  `;

  return baseTemplate({
    title: 'Order Confirmed — HairLux Shop',
    content,
    previewText: `Your HairLux shop order ${order.orderCode} is confirmed.`,
  });
}