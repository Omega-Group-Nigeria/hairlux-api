# Booking Payment API (Monnify) - Frontend Integration

## Overview
This flow allows users to pay for a booking online when wallet balance is insufficient.

Core behavior:
- Payment is initialized first.
- Backend computes wallet contribution and external shortfall.
- Booking is created only after payment verification.
- Wallet is not topped up in this flow.
- Transaction intent is classified as BOOKING_PAYMENT.
- Flow is idempotent using bookingPaymentReference and idempotencyKey.

Base path:
- /bookings/payments

Auth:
- All endpoints require Bearer JWT.

Provider currently supported:
- monnify

---

## 1) Initialize Booking Payment
POST /bookings/payments/initialize

Purpose:
- Create booking payment intent and return checkout URL.
- Charge only the shortfall: booking total minus current wallet balance.

Request JSON:
{
  "bookingPayload": {
    "services": [
      { "serviceId": "b39c0e6e-f0d4-4bd6-921a-6f529a564422", "notes": "Prefer morning slot" },
      { "serviceId": "5a95d11f-f57e-4460-bad8-1023ac593af1" }
    ],
    "date": "2026-04-24",
    "time": "11:00",
    "bookingType": "HOME_SERVICE",
    "addressId": "9c18eef4-347a-4f37-a1d2-94d8e22453d9",
    "guestName": "Amara Okafor",
    "guestPhone": "+2348012345678",
    "guestEmail": "amara.okafor@example.com",
    "discountCode": "JANE20"
  },
  "amount": 12500,
  "provider": "monnify",
  "idempotencyKey": "bookpay-8f19405c-84de-4863-aaf1-9913e4b52a35"
}

Success response JSON:
{
  "success": true,
  "message": "Booking payment initialized successfully",
  "data": {
    "paymentUrl": "https://checkout.monnify.com/xxx",
    "checkoutUrl": "https://checkout.monnify.com/xxx",
    "bookingPaymentReference": "BOOKPAY-MONF-9A63F3D37358D2E6D2A6DAD9",
    "gatewayReference": "MNFY|14|20260418204651|000112",
    "expiresAt": "2026-04-18T21:16:10.028Z",
    "walletContribution": 3000,
    "amountToPay": 12500,
    "totalAmount": 15500
  }
}

Notes:
- amount must match backend-calculated shortfall (difference to pay online).
- Use a new idempotencyKey for a new attempt.
- Reusing same idempotencyKey returns the existing intent for that user.

---

## 2) Verify Booking Payment
POST /bookings/payments/verify

Purpose:
- Verify payment at gateway.
- Create booking if paid and not already created.
- Send booking email after persistence.

Request JSON:
{
  "bookingPaymentReference": "BOOKPAY-MONF-9A63F3D37358D2E6D2A6DAD9",
  "provider": "monnify"
}

Success response JSON:
{
  "success": true,
  "message": "Booking payment verified successfully",
  "data": {
    "message": "Booking payment verified and booking created",
    "reservationCode": "HLX-A3K9",
    "booking": {
      "id": "123e4567-e89b-12d3-a456-426614174010",
      "userId": "2a1e4257-db36-4f1a-a59d-66691755c28c",
      "bookingType": "HOME_SERVICE",
      "bookingDate": "2026-04-24T11:00:00.000Z",
      "bookingTime": "11:00",
      "status": "CONFIRMED",
      "paymentMethod": "MONNIFY",
      "reservationCode": "HLX-A3K9",
      "totalAmount": 15500,
      "guestName": "Amara Okafor",
      "guestPhone": "+2348012345678",
      "guestEmail": "amara.okafor@example.com"
    }
  }
}

Idempotency behavior:
- Safe to call multiple times.
- If already processed, returns existing booking and reservationCode.

---

## 3) Get Booking Payment Status (Polling / Recovery)
GET /bookings/payments/:bookingPaymentReference

Purpose:
- Recover status if callback tab closes.
- Track payment + linked booking state.

Success response JSON:
{
  "success": true,
  "message": "Booking payment status retrieved successfully",
  "data": {
    "bookingPaymentReference": "BOOKPAY-MONF-9A63F3D37358D2E6D2A6DAD9",
    "provider": "monnify",
    "status": "COMPLETED",
    "amount": 12500,
    "gatewayReference": "MNFY|14|20260418204651|000112",
    "paymentReference": "BOOKPAY-MONF-9A63F3D37358D2E6D2A6DAD9",
    "expiresAt": "2026-04-18T21:16:10.028Z",
    "booking": {
      "id": "123e4567-e89b-12d3-a456-426614174010",
      "reservationCode": "HLX-A3K9",
      "status": "CONFIRMED",
      "totalAmount": 15500,
      "bookingDate": "2026-04-24T11:00:00.000Z",
      "bookingTime": "11:00"
    }
  }
}

Possible transaction status values:
- PENDING
- COMPLETED
- FAILED

---

## Frontend Flow Recommendation
1. Build booking payload and final amount.
2. Calculate expected shortfall in UI and pass it as amount.
3. Call initialize endpoint.
4. Redirect user to checkoutUrl.
5. After callback, call verify endpoint.
6. If callback interrupted, poll status endpoint using bookingPaymentReference.
7. Show reservationCode after verification.

Webhook behavior:
- If Monnify webhook arrives before frontend callback, backend processes BOOKING_PAYMENT and creates booking automatically.
- Frontend verify call remains safe and idempotent (it will return existing booking if already created).

---

## Notes and Rules
- This flow does not credit wallet.
- Booking is created only after verified payment.
- BOOKING_PAYMENT transaction type is used for classification.
- Booking payment method is stored as MONNIFY for verified online-paid bookings.
- Existing create booking endpoint still supports only WALLET or CASH.
