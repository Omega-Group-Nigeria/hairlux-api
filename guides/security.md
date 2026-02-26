# HairLux API Systems Architecture Spec Sheet

## Security Requirements
Implement defense-in-depth. Use NestJS built-ins where possible.

- **Authentication & Authorization**:
  - JWT-based authentication using @nestjs/jwt + Passport.js for securing protected endpoints
  - Refresh tokens are securely stored in Redis with proper expiration
  - Role-based access control via custom guards (e.g. RolesGuard) to restrict routes (admin-only endpoints like reporting/analytics)
  - Passwords are hashed using argon2id with strong parameters (64 MiB memory, 4 iterations, parallelism 1)

- **Input Validation & Sanitization**:
  - Use ValidationPipe (class-validator + class-transformer) for DTOs to prevent invalid data.
  - SQL Injection: Prevented via TypeORM parameterized queries (no raw SQL).
  - XSS: Sanitize outputs with DOMPurify if rendering HTML (though API-focused).

- **Rate Limiting & Abuse Prevention**:
  - @nestjs/throttler: Global rate limits (e.g., 100 req/s per IP).

- **Network & Access Controls**:
  - CORS: Configure @nestjs/common CorsOptions (allow only frontend origins).
  - CSRF: Use csurf middleware for any form-based endpoints; for API, rely on JWT non-cookie storage and same-site cookies if used.
  - Helmet: @nestjs/helmet for security headers (e.g., X-Content-Type-Options, Strict-Transport-Security, Content-Security-Policy).
  - HTTPS: Enforce SSL (via Nginx reverse proxy or NestJS config).

- **Data Protection**:
  - Encryption: Sensitive data (e.g., addresses, payment details) encrypted at rest (PostgreSQL pgcrypto). In-transit via HTTPS.
  - Fraud Prevention: For wallet deposits, use transaction IDs + webhooks to verify payments. Implement velocity checks (e.g., limit deposits per hour/user) and anomaly detection (e.g., flag unusual patterns via logging).
  - Auditing: Log all actions (e.g., bookings, deposits) with user_id/timestamp via interceptors. Retain logs for 6 months for compliance.
  - Compliance: Align with NDPR (Nigeria Data Protection Regulation) for PII handling; include data deletion endpoints and consent tracking.

- **Other Protections**:
  - Secrets: Use .env + ConfigService; never commit keys. Rotate JWT secrets quarterly.
  - Vulnerability Scanning: Dependabot for deps, Snyk for code scans. Follow OWASP API Security Top 10 (e.g., broken auth, excessive data exposure).
  - API Key Security: For external integrations (e.g., Google Maps, Paystack), use scoped keys and store in encrypted env vars.
  - Secure Dependencies: Regularly audit and update packages; pin versions in package.json.

## Performance Optimizations
Target <200ms response times, scalability to 1k+ concurrent users (Nigeria-focused, single-region deployment).

- **Caching**:
  - Redis: Cache frequent reads (e.g., service listings, availability slots: TTL 5min). Use @nestjs/cache-manager.
  - Query Caching: TypeORM query caching for reports/bookings.
  - Avoid Over-Caching: Invalidate on writes (e.g., post-booking, evict availability cache). And ensure there are proper cache invalidation technieques implemented for data that needs to be latest no matter what.

- **Database Optimizations**:
  - Indexing: On frequent queries (e.g., user_id in bookings, time_slots in availability).
  - Pagination: Use offset/limit for lists (e.g., transaction history).
  - Read Replicas: For high-read ops (e.g., availability checks) in prod.

- **API Efficiency**:
  - Async: Use RxJS for non-blocking ops (e.g., email sends).
  - Compression: Enable gzip via NestJS middleware.
  - WebSockets: For real-time (e.g., availability updates) via @nestjs/websockets.