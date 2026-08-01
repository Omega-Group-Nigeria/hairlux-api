/** Shared user identity fields for admin GET responses. */
export const ADMIN_USER_IDENTITY_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  email: true,
  phone: true,
  dateOfBirth: true,
} as const;

export const ADMIN_BEAUTICIAN_USER_SELECT = {
  ...ADMIN_USER_IDENTITY_SELECT,
  status: true,
} as const;

export const ADMIN_BEAUTICIAN_USER_DETAIL_SELECT = {
  ...ADMIN_BEAUTICIAN_USER_SELECT,
  createdAt: true,
} as const;