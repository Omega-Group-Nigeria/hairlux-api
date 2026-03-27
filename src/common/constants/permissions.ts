export const PERMISSIONS = {
  // ── Bookings ────────────────────────────────────────────────────────────────
  BOOKINGS_READ: 'bookings:read', // View all bookings
  BOOKINGS_CREATE: 'bookings:create', // Create manual bookings (walk-in / phone)
  BOOKINGS_UPDATE_STATUS: 'bookings:update_status', // Confirm / complete / cancel
  BOOKINGS_VERIFY_RESERVATION: 'bookings:verify_reservation', // Look up & mark codes used
  BOOKINGS_MANAGE_SCHEDULE: 'bookings:manage_schedule', // Manage business hours & exceptions

  // ── Users ───────────────────────────────────────────────────────────────────
  USERS_READ: 'users:read', // View customer list & profiles
  USERS_CREATE: 'users:create', // Create customer accounts
  USERS_UPDATE: 'users:update', // Edit customer details
  USERS_SUSPEND: 'users:suspend', // Suspend / reactivate customers
  USERS_DELETE: 'users:delete', // Delete customer accounts
  USERS_VIEW_WALLET: 'users:view_wallet', // View wallet balance & transactions

  // ── Services ────────────────────────────────────────────────────────────────
  SERVICES_CREATE: 'services:create', // Add new services
  SERVICES_UPDATE: 'services:update', // Edit existing services (name, price, image…)
  SERVICES_TOGGLE_STATUS: 'services:toggle_status', // Activate / deactivate a service
  SERVICES_DELETE: 'services:delete', // Remove services
  SERVICES_MANAGE_CATEGORIES: 'services:manage_categories', // CRUD categories

  // ── Discounts ────────────────────────────────────────────────────────────────
  DISCOUNTS_READ: 'discounts:read', // View discount codes
  DISCOUNTS_CREATE: 'discounts:create', // Create general codes
  DISCOUNTS_UPDATE: 'discounts:update', // Edit codes
  DISCOUNTS_DELETE: 'discounts:delete', // Delete codes
  DISCOUNTS_MANAGE_INFLUENCER: 'discounts:manage_influencer', // Influencer-specific codes
  DISCOUNTS_MANAGE_SETTINGS: 'discounts:manage_settings', // Reward settings

  // ── Referrals ────────────────────────────────────────────────────────────────
  REFERRALS_READ: 'referrals:read', // View referral list & stats
  REFERRALS_MANAGE_SETTINGS: 'referrals:manage_settings', // Configure reward settings

  // ── Analytics ────────────────────────────────────────────────────────────────
  ANALYTICS_READ: 'analytics:read', // View dashboard & charts

  // ── Jobs ─────────────────────────────────────────────────────────────────────
  JOBS_READ: 'jobs:read', // View all postings incl. drafts
  JOBS_CREATE: 'jobs:create', // Create postings
  JOBS_UPDATE: 'jobs:update', // Edit postings
  JOBS_DELETE: 'jobs:delete', // Delete postings
  JOBS_TOGGLE: 'jobs:toggle', // Publish / unpublish

  // ── Influencers ───────────────────────────────────────────────────────────────
  INFLUENCERS_READ: 'influencers:read', // View influencer list & stats
  INFLUENCERS_CREATE: 'influencers:create', // Add influencers
  INFLUENCERS_UPDATE: 'influencers:update', // Edit influencer details
  INFLUENCERS_DELETE: 'influencers:delete', // Remove influencers

  // ── Staff ───────────────────────────────────────────────────────────────────
  STAFF_READ: 'staff:read', // View staff records
  STAFF_CREATE: 'staff:create', // Create staff records
  STAFF_UPDATE: 'staff:update', // Edit staff profile and history
  STAFF_ARCHIVE: 'staff:archive', // Archive / restore staff
  STAFF_MANAGE_STATUS: 'staff:manage_status', // Update employment status
  STAFF_MANAGE_LOCATIONS: 'staff:manage_locations', // Manage staff locations

  // ── Settings ─────────────────────────────────────────────────────────────────
  SETTINGS_READ: 'settings:read', // View system settings
  SETTINGS_MANAGE: 'settings:manage', // Update system settings

  // ── Roles ────────────────────────────────────────────────────────────────────
  ROLES_READ: 'roles:read', // View admin roles & permissions
  ROLES_CREATE: 'roles:create', // Create new roles
  ROLES_UPDATE: 'roles:update', // Edit role permissions
  ROLES_DELETE: 'roles:delete', // Delete roles
  ROLES_ASSIGN: 'roles:assign', // Assign roles to admin users
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_VALUES = Object.values(PERMISSIONS) as Permission[];

/** Grouped structure — used by GET /admin/roles/permissions for checkbox UI */
export const PERMISSION_GROUPS = [
  {
    group: 'Bookings',
    permissions: [
      { key: PERMISSIONS.BOOKINGS_READ, label: 'View bookings' },
      { key: PERMISSIONS.BOOKINGS_CREATE, label: 'Create manual bookings' },
      {
        key: PERMISSIONS.BOOKINGS_UPDATE_STATUS,
        label: 'Update booking status',
      },
      {
        key: PERMISSIONS.BOOKINGS_VERIFY_RESERVATION,
        label: 'Verify reservation codes',
      },
      {
        key: PERMISSIONS.BOOKINGS_MANAGE_SCHEDULE,
        label: 'Manage business hours & exceptions',
      },
    ],
  },
  {
    group: 'Users',
    permissions: [
      { key: PERMISSIONS.USERS_READ, label: 'View customers' },
      { key: PERMISSIONS.USERS_CREATE, label: 'Create customer accounts' },
      { key: PERMISSIONS.USERS_UPDATE, label: 'Edit customer details' },
      {
        key: PERMISSIONS.USERS_SUSPEND,
        label: 'Suspend / reactivate customers',
      },
      { key: PERMISSIONS.USERS_DELETE, label: 'Delete customer accounts' },
      {
        key: PERMISSIONS.USERS_VIEW_WALLET,
        label: 'View customer wallet & transactions',
      },
    ],
  },
  {
    group: 'Services',
    permissions: [
      { key: PERMISSIONS.SERVICES_CREATE, label: 'Add services' },
      { key: PERMISSIONS.SERVICES_UPDATE, label: 'Edit services' },
      {
        key: PERMISSIONS.SERVICES_TOGGLE_STATUS,
        label: 'Activate / deactivate services',
      },
      { key: PERMISSIONS.SERVICES_DELETE, label: 'Delete services' },
      {
        key: PERMISSIONS.SERVICES_MANAGE_CATEGORIES,
        label: 'Manage service categories',
      },
    ],
  },
  {
    group: 'Discounts',
    permissions: [
      { key: PERMISSIONS.DISCOUNTS_READ, label: 'View discount codes' },
      { key: PERMISSIONS.DISCOUNTS_CREATE, label: 'Create discount codes' },
      { key: PERMISSIONS.DISCOUNTS_UPDATE, label: 'Edit discount codes' },
      { key: PERMISSIONS.DISCOUNTS_DELETE, label: 'Delete discount codes' },
      {
        key: PERMISSIONS.DISCOUNTS_MANAGE_INFLUENCER,
        label: 'Manage influencer codes',
      },
      {
        key: PERMISSIONS.DISCOUNTS_MANAGE_SETTINGS,
        label: 'Configure discount reward settings',
      },
    ],
  },
  {
    group: 'Referrals',
    permissions: [
      { key: PERMISSIONS.REFERRALS_READ, label: 'View referrals & stats' },
      {
        key: PERMISSIONS.REFERRALS_MANAGE_SETTINGS,
        label: 'Configure referral settings',
      },
    ],
  },
  {
    group: 'Analytics',
    permissions: [
      { key: PERMISSIONS.ANALYTICS_READ, label: 'View dashboard & analytics' },
    ],
  },
  {
    group: 'Jobs',
    permissions: [
      {
        key: PERMISSIONS.JOBS_READ,
        label: 'View all job postings (incl. drafts)',
      },
      { key: PERMISSIONS.JOBS_CREATE, label: 'Create job postings' },
      { key: PERMISSIONS.JOBS_UPDATE, label: 'Edit job postings' },
      { key: PERMISSIONS.JOBS_DELETE, label: 'Delete job postings' },
      {
        key: PERMISSIONS.JOBS_TOGGLE,
        label: 'Publish / unpublish job postings',
      },
    ],
  },
  {
    group: 'Influencers',
    permissions: [
      { key: PERMISSIONS.INFLUENCERS_READ, label: 'View influencers & stats' },
      { key: PERMISSIONS.INFLUENCERS_CREATE, label: 'Add influencers' },
      { key: PERMISSIONS.INFLUENCERS_UPDATE, label: 'Edit influencer details' },
      { key: PERMISSIONS.INFLUENCERS_DELETE, label: 'Remove influencers' },
    ],
  },
  {
    group: 'Staff',
    permissions: [
      { key: PERMISSIONS.STAFF_READ, label: 'View staff records' },
      { key: PERMISSIONS.STAFF_CREATE, label: 'Create staff records' },
      {
        key: PERMISSIONS.STAFF_UPDATE,
        label: 'Edit staff profile and employment history',
      },
      { key: PERMISSIONS.STAFF_ARCHIVE, label: 'Archive and restore staff' },
      {
        key: PERMISSIONS.STAFF_MANAGE_STATUS,
        label: 'Update employment status',
      },
      {
        key: PERMISSIONS.STAFF_MANAGE_LOCATIONS,
        label: 'Manage staff locations',
      },
    ],
  },
  {
    group: 'Roles & Permissions',
    permissions: [
      {
        key: PERMISSIONS.ROLES_READ,
        label: 'View admin roles & their permissions',
      },
      { key: PERMISSIONS.ROLES_CREATE, label: 'Create new admin roles' },
      { key: PERMISSIONS.ROLES_UPDATE, label: 'Edit role permissions' },
      { key: PERMISSIONS.ROLES_DELETE, label: 'Delete admin roles' },
      { key: PERMISSIONS.ROLES_ASSIGN, label: 'Assign roles to admin users' },
    ],
  },
];
