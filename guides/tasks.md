# HairLux Beauty & Wellness - API Development Brief

## Project Overview
Build a complete RESTful API for the HairLux booking and management platform. This API powers a beauty and wellness website where clients can browse services, book appointments with address verification, manage wallet payments via Paystack, and leave reviews. Administrators have comprehensive control over bookings, services, staff, users, and business analytics.

## Primary Objectives
1. **Admin Control**: Provide full management capabilities for bookings, services, staff schedules, user accounts, and business operations
2. **Payment Integration**: Integrate Paystack for wallet deposits with webhook verification
3. **Security**: Implement JWT authentication, data encryption, and secure payment processing
4. **Scalability**: Design clean, maintainable code structure ready for production deployment

## Success Criteria
Upon completion, the API must:
- ✅ Pass all endpoint tests with proper authentication and authorization
- ✅ Successfully process Paystack deposits and wallet debits
- ✅ Verify addresses using Google Maps Geocoding API
- ✅ Send automated email notifications for booking events
- ✅ Handle concurrent bookings without conflicts
- ✅ Include proper error handling and validation on all routes
- ✅ Be documented with API endpoint specifications
- ✅ Be deployment-ready with environment configuration for staging and production

---

## MVP Endpoints Checklist

# HairLux API MVP Task List

## 1. Authentication & User Management - COMPLETED
- [ ] POST /api/auth/register - User registration with email/password
- [ ] POST /api/auth/login - User login returning JWT token
- [ ] POST /api/auth/refresh-token - Refresh expired tokens
- [ ] POST /api/auth/forgot-password - Initiate password reset
- [ ] POST /api/auth/reset-password - Complete password reset with token
- [ ] GET /api/user/profile - Get authenticated user profile
- [ ] PUT /api/user/profile - Update user profile details
- [ ] PUT /api/user/password - Change user password
- [ ] GET /api/user/addresses - Get user's saved addresses
- [ ] POST /api/user/addresses - Add new service address
- [ ] PUT /api/user/addresses/:id - Update existing address
- [ ] DELETE /api/user/addresses/:id - Delete saved address

## 2. Services Management - COMPLETED
- [ ] GET /api/services - List all active services with categories
- [ ] GET /api/services/:id - Get single service details (name, price, duration, description)
- [ ] GET /api/services/categories - Get all service categories

## 3. Booking System
- [ ] GET /api/bookings/availability - Check available time slots (params: serviceId, date, staffId)
- [ ] POST /api/bookings - Create new booking (service, date, time, address, payment method)
- [ ] GET /api/bookings/user - Get user's bookings with filters (status, date range)
- [ ] GET /api/bookings/:id - Get single booking details
- [ ] PUT /api/bookings/:id - Reschedule booking (date/time)
- [ ] PUT /api/bookings/:id/status - Update booking status (cancel only for users)
- [ ] GET /api/staff - List available staff members
- [ ] GET /api/staff/:id/availability - Get staff availability for date range

## 4. Wallet System
- [ ] GET /api/wallet/balance - Get current wallet balance
- [ ] GET /api/wallet/transactions - Get transaction history with pagination
- [ ] POST /api/wallet/deposit/initialize - Initialize Paystack deposit transaction
- [ ] POST /api/wallet/deposit/verify - Verify Paystack payment callback
- [ ] POST /api/wallet/debit - Debit wallet for booking payment (internal use)
- [ ] POST /api/wallet/paystack-webhook - Handle Paystack payment callbacks

## 5. Address Verification (to come back later)
- [ ] GET /api/address/verify - Verify address with Google Maps API (geocoding)

## 6. Reviews & Testimonials (to come back later)
- [ ] GET /api/reviews - Get approved reviews with pagination
- [ ] GET /api/reviews/service/:serviceId - Get reviews for specific service
- [ ] POST /api/reviews - Submit new review (authenticated, post-booking)

## 8. Admin Booking Management
- [x] GET /api/admin/bookings - Get all bookings with filters (date, status, user, service, staff)
- [x] GET /api/admin/bookings/:id - Get detailed booking info
- [x] POST /api/admin/bookings - Create manual booking for walk-ins
- [x] PUT /api/admin/bookings/:id/status - Update status (confirm, complete, cancel)
- [ ] ~~PUT /api/admin/bookings/:id/assign-staff~~ - N/A (Staff functionality removed)
- [x] GET /api/admin/bookings/calendar - Get calendar view (params: month, year)
- [x] GET /api/admin/bookings/stats - Get booking statistics for date range

## 9. Admin Service Management
- [x] GET /api/admin/services - Get all services including inactive
- [x] POST /api/admin/services - Create new service
- [x] PUT /api/admin/services/:id - Update service details
- [x] PUT /api/admin/services/:id/status - Toggle active/inactive status
- [x] DELETE /api/admin/services/:id - Delete service

## 10. Admin User Management
- [x] GET /api/admin/users - List all users with search/filters
- [x] GET /api/admin/users/:id - Get user details (profile, wallet, booking history)
- [x] PUT /api/admin/users/:id/status - Activate/deactivate user account

<!-- - [ ] POST /api/admin/users/:id/wallet/credit - Manual wallet credit (refunds/promos) -->

## 11. Admin Staff Management (to come back later)
- [ ] GET /api/admin/staff - List all staff members
- [ ] GET /api/admin/staff/:id - Get staff details with stats
- [ ] POST /api/admin/staff - Add new staff member
- [ ] PUT /api/admin/staff/:id - Update staff details
- [ ] PUT /api/admin/staff/:id/availability - Set staff schedule/availability
- [ ] PUT /api/admin/staff/:id/status - Activate/deactivate staff

## 12. Admin Review Management (to come back later)
- [ ] GET /api/admin/reviews - Get all reviews (pending and approved)
- [ ] PUT /api/admin/reviews/:id/status - Approve/reject review
- [ ] DELETE /api/admin/reviews/:id - Delete inappropriate review

## 13. Admin Analytics Dashboard
- [x] GET /api/admin/analytics/dashboard - Overview (today's bookings, revenue, pending reviews)
- [x] GET /api/admin/analytics/revenue - Revenue by date range
- [x] GET /api/admin/analytics/bookings - Booking trends and popular services

## 14. Admin Settings
- [ ] GET /api/admin/settings/business - Get business settings (hours, contact, policies)
- [ ] PUT /api/admin/settings/business - Update business settings
- [ ] GET /api/admin/settings/booking-config - Get booking rules (slot duration, advance limit)
- [ ] PUT /api/admin/settings/booking-config - Update booking configuration

## 15. Email Notifications (Automated)
- [ ] Send booking confirmation email on new booking
- [ ] Send booking status change notifications
- [ ] Send password reset email


## 17. Security & Validation
- [ ] Implement JWT authentication middleware
- [ ] Add request validation for all endpoints
- [ ] Implement SSL certificate
- [ ] Add rate limiting for auth endpoints
- [ ] Encrypt sensitive wallet/payment data