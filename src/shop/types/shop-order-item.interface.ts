export interface ShopOrderItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
}

export interface DeliveryAddressSnapshot {
  fullAddress: string;
  streetAddress: string | null;
  city: string | null;
  state: string | null;
  country: string;
  label: string | null;
}

export interface ShopQuoteLineItem extends ShopOrderItem {
  lineTotal: number;
}