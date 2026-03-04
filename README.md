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

API docs available at `http://localhost:{PORT}/api/docs`

## Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL=

# JWT
JWT_SECRET=
JWT_EXPIRATION=
JWT_REFRESH_SECRET=
JWT_REFRESH_EXPIRATION=

# App
PORT=
NODE_ENV=
FRONTEND_URL=
ALLOWED_ORIGINS=

# Email (SMTP)
SMTP_HOST=
SMTP_PORT=
SMTP_USER=
SMTP_PASS=
EMAIL_FROM=

# Google Maps
GOOGLE_MAPS_API_KEY=

# Paystack
PAYSTACK_SECRET_KEY=
PAYSTACK_PUBLIC_KEY=

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379

# Wallet Limits
WALLET_MAX_DEPOSITS_PER_MINUTE=
WALLET_MAX_DAILY_DEPOSIT_AMOUNT=

# Cloudinary
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
```