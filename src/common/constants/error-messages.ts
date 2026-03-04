export const ErrorMessages = {
  // Auth errors
  INVALID_CREDENTIALS: 'Invalid email or password',
  USER_ALREADY_EXISTS: 'User with this email already exists',
  USER_NOT_FOUND: 'User not found',
  INVALID_TOKEN: 'Invalid or expired token',
  UNAUTHORIZED: 'Unauthorized access',
  FORBIDDEN: 'Forbidden resource',
  ACCOUNT_INACTIVE: 'Your account is inactive. Please contact support.',

  // Password errors
  WEAK_PASSWORD: 'Password must be at least 8 characters long',
  PASSWORD_MISMATCH: 'Passwords do not match',
  INVALID_RESET_TOKEN: 'Invalid or expired reset token',

  // Validation errors
  INVALID_EMAIL: 'Invalid email format',
  REQUIRED_FIELD: 'This field is required',
  INVALID_UUID: 'Invalid ID format',

  // Address errors
  ADDRESS_NOT_FOUND: 'Address not found',
  GOOGLE_MAPS_ERROR: 'Failed to verify address with Google Maps',

  // Booking errors
  BOOKING_NOT_FOUND: 'Booking not found',
  BOOKING_CONFLICT: 'Time slot is already booked',
  INSUFFICIENT_BALANCE: 'Insufficient wallet balance',
  INVALID_BOOKING_STATUS: 'Invalid booking status transition',
  PAST_DATE_BOOKING: 'Cannot book for past dates',

  // Wallet errors
  WALLET_NOT_FOUND: 'Wallet not found',
  INVALID_AMOUNT: 'Invalid amount',
  TRANSACTION_FAILED: 'Transaction failed',

  // Service errors
  SERVICE_NOT_FOUND: 'Service not found',
  SERVICE_INACTIVE: 'Service is currently inactive',

  // Review errors
  REVIEW_NOT_FOUND: 'Review not found',
  ALREADY_REVIEWED: 'You have already reviewed this booking',
  CANNOT_REVIEW: 'You can only review completed bookings',

  // General errors
  INTERNAL_SERVER_ERROR: 'An internal server error occurred',
  NOT_FOUND: 'Resource not found',
  BAD_REQUEST: 'Bad request',
};
