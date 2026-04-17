# HairLux API

A RESTful API for the HairLux beauty and wellness booking platform. Handles service browsing, appointment booking, wallet payments via Paystack, address verification via Google Maps, email notifications, and admin management.

## Tech Stack

NestJS · PostgreSQL (Prisma) · Redis (BullMQ) · Paystack · Nodemailer · Cloudinary · Swagger

## Getting Started

```bash
# Install dependencies
npm install

# Run database migrations
npx prisma migrate deploy

# Start development server
npm run start:dev

# Start production server
npm run start:prod
```
