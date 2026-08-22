export const PERMISSIONS = {
  // ── Bookings ────────────────────────────────────────────────────────────────
  BOOKINGS_READ: 'bookings:read', // View all bookings
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

  // ── Branches ────────────────────────────────────────────────────────────────
  BRANCHES_READ: 'branches:read', // View branches and branch service config
  BRANCHES_MANAGE: 'branches:manage', // CRUD branches; manage availability & walk-in prices

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
  STAFF_MANAGE_DOCUMENTS: 'staff:manage_documents', // Create/version company documents (contracts, NDA, handbook, etc.)

  // ── Suppliers & Vendors (Contacts) ───────────────────────────────────────────
  SUPPLIERS_READ: 'suppliers:read', // View suppliers/vendors and what they supply
  SUPPLIERS_CREATE: 'suppliers:create', // Add a new supplier/vendor
  SUPPLIERS_UPDATE: 'suppliers:update', // Edit supplier/vendor details
  SUPPLIERS_DELETE: 'suppliers:delete', // Delete a supplier/vendor (blocked while items are linked)
  SUPPLIERS_VIEW_BANKING: 'suppliers:view_banking', // View vendor bank name/account number/verified account name -- separate from general suppliers:read per the spec's access-restriction requirement

  // ── Inventory Products (Procurement Integration) ─────────────────────────────
  INVENTORY_PRODUCTS_READ: 'inventory_products:read',
  INVENTORY_PRODUCTS_CREATE: 'inventory_products:create',
  INVENTORY_PRODUCTS_UPDATE: 'inventory_products:update',
  INVENTORY_PRODUCTS_DELETE: 'inventory_products:delete',

  // ── Approval Chains (Procurement Integration) ─────────────────────────────
  APPROVAL_CHAINS_READ: 'approval_chains:read',
  APPROVAL_CHAINS_MANAGE: 'approval_chains:manage',

  // ── Purchase Requests (Procurement Integration) ───────────────────────────
  PURCHASE_REQUESTS_READ: 'purchase_requests:read',
  PURCHASE_REQUESTS_CREATE: 'purchase_requests:create',
  PURCHASE_REQUESTS_UPDATE: 'purchase_requests:update',
  PURCHASE_REQUESTS_APPROVE: 'purchase_requests:approve',

  // ── Purchases (Procurement Integration) ───────────────────────────────────
  PURCHASES_READ: 'purchases:read',
  PURCHASES_RECORD_PAYMENT: 'purchases:record_payment',
  PURCHASES_RECEIVE_GOODS: 'purchases:receive_goods',

  // ── Financial Transactions (Procurement Integration) ──────────────────────
  FINANCIAL_TRANSACTIONS_READ: 'financial_transactions:read',

  // ── Payroll (salary/financial data) ──────────────────────────────────────────
  PAYROLL_READ: 'payroll:read', // View payroll dashboard, periods, payslips, withdrawal history
  PAYROLL_MANAGE: 'payroll:manage', // Set compensation, run payroll, approve periods, toggle Payday, add adjustments, approve bank changes

  // ── Branch Finance (daily summary & cash reconciliation) ─────────────────────
  BRANCH_FINANCE_READ: 'branch_finance:read', // View the daily financial summary for a branch (bookings, sales, inventory movement)
  BRANCH_FINANCE_RECONCILE: 'branch_finance:reconcile', // Submit a branch's end-of-day cash count

  // ── Settings ─────────────────────────────────────────────────────────────────
  SETTINGS_READ: 'settings:read', // View system settings
  SETTINGS_MANAGE: 'settings:manage', // Update system settings

  // ── Beauticians ───────────────────────────────────────────────────────────────
  BEAUTICIANS_READ: 'beauticians:read', // View beautician list & profiles
  BEAUTICIANS_MANAGE: 'beauticians:manage', // Suspend, override commission, force status
  BEAUTICIANS_REVIEW: 'beauticians:review', // KYC & profile review approve/reject
  BEAUTICIANS_ASSIGN_SERVICES: 'beauticians:assign_services', // Assign eligible services
  BEAUTICIANS_PROCESS_PAYOUTS: 'beauticians:process_payouts', // Process payout requests

  // ── Shop ─────────────────────────────────────────────────────────────────────
  SHOP_READ: 'shop:read', // View products, delivery regions & orders
  SHOP_MANAGE_PRODUCTS: 'shop:manage_products', // CRUD products
  SHOP_MANAGE_CATEGORIES: 'shop:manage_categories', // CRUD product categories
  SHOP_MANAGE_DELIVERY: 'shop:manage_delivery', // CRUD delivery regions
  SHOP_UPDATE_STATUS: 'shop:update_status', // Update shop order status / cancel

  // ── Roles ────────────────────────────────────────────────────────────────────
  ROLES_READ: 'roles:read', // View admin roles & permissions
  ROLES_CREATE: 'roles:create', // Create new roles
  ROLES_UPDATE: 'roles:update', // Edit role permissions
  ROLES_DELETE: 'roles:delete', // Delete roles
  ROLES_ASSIGN: 'roles:assign', // Assign roles to admin users

  // ── Applications ──────────────────────────────────────────────────────────────
  APPLICATION_READ: 'application:read',
  APPLICATION_MANAGE_STATUS: 'application:manage_status',
  APPLICATION_CONVERT: 'application:convert',

  // ── Staff Portal (module visibility — read by staff-portal, not admin endpoints) ──
  STAFF_PORTAL_INVENTORY: 'staff-portal:inventory', // See the Inventory module
  STAFF_PORTAL_BOOKINGS: 'staff-portal:bookings', // See the Bookings module
  STAFF_PORTAL_SALES: 'staff-portal:sales', // See the Sell Products module
  STAFF_PORTAL_APPROVALS: 'staff-portal:approvals', // See My Approvals (in addition to branch managers, who always see it)

  // ── LMS (staff training library) ────────────────────────────────────────────
  LMS_READ: 'lms:read', // View courses in the admin management UI
  LMS_MANAGE: 'lms:manage', // Create, edit, delete courses and their role assignments

  // ── Lifecycle Campaigns ──────────────────────────────────────────────────────
  LIFECYCLE_CAMPAIGNS_READ: 'lifecycle_campaigns:read', // View templates & transition history
  LIFECYCLE_CAMPAIGNS_MANAGE: 'lifecycle_campaigns:manage', // Create/edit/delete templates
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_VALUES = Object.values(PERMISSIONS) as Permission[];

/** Grouped structure — used by GET /admin/roles/permissions for checkbox UI */
export const PERMISSION_GROUPS = [
  {
    group: 'Bookings',
    permissions: [
      { key: PERMISSIONS.BOOKINGS_READ, label: 'View bookings' },
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
    group: 'Branches',
    permissions: [
      { key: PERMISSIONS.BRANCHES_READ, label: 'View branches & service config' },
      {
        key: PERMISSIONS.BRANCHES_MANAGE,
        label: 'Manage branches, availability & walk-in prices',
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
    group: 'Applications',
    permissions: [
      { key: PERMISSIONS.APPLICATION_READ, label: 'View job applications' },
      {
        key: PERMISSIONS.APPLICATION_MANAGE_STATUS,
        label: 'Move applications through the review pipeline (shortlist, reject, interview, etc.)',
      },
      {
        key: PERMISSIONS.APPLICATION_CONVERT,
        label: 'Convert an accepted application into a staff record',
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
      {
        key: PERMISSIONS.STAFF_MANAGE_DOCUMENTS,
        label: 'Create and version company documents (contracts, NDA, handbook, etc.)',
      },
    ],
  },
  {
    group: 'LMS (Staff Training)',
    permissions: [
      { key: PERMISSIONS.LMS_READ, label: 'View courses' },
      { key: PERMISSIONS.LMS_MANAGE, label: 'Create, edit, and delete courses and their role assignments' },
    ],
  },
  {
    group: 'Suppliers & Vendors',
    permissions: [
      { key: PERMISSIONS.SUPPLIERS_READ, label: 'View suppliers/vendors and what they supply' },
      { key: PERMISSIONS.SUPPLIERS_CREATE, label: 'Add a new supplier or vendor' },
      { key: PERMISSIONS.SUPPLIERS_UPDATE, label: 'Edit supplier/vendor details' },
      {
        key: PERMISSIONS.SUPPLIERS_DELETE,
        label: 'Delete a supplier/vendor (blocked while inventory items are still linked)',
      },
      { key: PERMISSIONS.SUPPLIERS_VIEW_BANKING, label: "View a vendor's bank account details" },
    ],
  },
  {
    group: 'Inventory Products (Procurement Integration)',
    permissions: [
      { key: PERMISSIONS.INVENTORY_PRODUCTS_READ, label: 'View products in the master catalogue' },
      { key: PERMISSIONS.INVENTORY_PRODUCTS_CREATE, label: 'Add a new product to the master catalogue' },
      { key: PERMISSIONS.INVENTORY_PRODUCTS_UPDATE, label: 'Edit product details, pricing, and supplying vendors' },
      {
        key: PERMISSIONS.INVENTORY_PRODUCTS_DELETE,
        label: 'Delete a product (blocked while branch inventory items are still linked)',
      },
    ],
  },
  {
    group: 'Approval Chains (Procurement Integration)',
    permissions: [
      { key: PERMISSIONS.APPROVAL_CHAINS_READ, label: 'View configured approval chains' },
      { key: PERMISSIONS.APPROVAL_CHAINS_MANAGE, label: 'Configure which roles approve each request type, and in what order' },
    ],
  },
  {
    group: 'Purchase Requests (Procurement Integration)',
    permissions: [
      { key: PERMISSIONS.PURCHASE_REQUESTS_READ, label: 'View purchase requests' },
      { key: PERMISSIONS.PURCHASE_REQUESTS_CREATE, label: 'Create and submit purchase requests' },
      { key: PERMISSIONS.PURCHASE_REQUESTS_UPDATE, label: 'Edit a purchase request while still in Draft' },
      { key: PERMISSIONS.PURCHASE_REQUESTS_APPROVE, label: 'Approve or reject purchase requests awaiting your action' },
    ],
  },
  {
    group: 'Purchases (Procurement Integration)',
    permissions: [
      { key: PERMISSIONS.PURCHASES_READ, label: 'View purchases, payments, and receiving history' },
      { key: PERMISSIONS.PURCHASES_RECORD_PAYMENT, label: 'Record a payment made to a vendor' },
      { key: PERMISSIONS.PURCHASES_RECEIVE_GOODS, label: 'Confirm goods received against a purchase' },
    ],
  },
  {
    group: 'Financial Transactions (Procurement Integration)',
    permissions: [
      { key: PERMISSIONS.FINANCIAL_TRANSACTIONS_READ, label: 'View the financial transaction ledger and dashboard' },
    ],
  },
  {
    group: 'Payroll',
    permissions: [
      { key: PERMISSIONS.PAYROLL_READ, label: 'View the payroll dashboard, periods, payslips, and withdrawal history' },
      {
        key: PERMISSIONS.PAYROLL_MANAGE,
        label: 'Set staff compensation, run and approve payroll, toggle Payday, add bonuses/deductions, approve bank account changes',
      },
    ],
  },
  {
    group: 'Branch Finance',
    permissions: [
      { key: PERMISSIONS.BRANCH_FINANCE_READ, label: "View a branch's daily financial summary — booking revenue, product sales, inventory received/transferred" },
      { key: PERMISSIONS.BRANCH_FINANCE_RECONCILE, label: "Submit a branch's end-of-day cash count" },
    ],
  },
  {
    group: 'Shop',
    permissions: [
      { key: PERMISSIONS.SHOP_READ, label: 'View shop catalog, regions & orders' },
      { key: PERMISSIONS.SHOP_MANAGE_PRODUCTS, label: 'Manage shop products' },
      {
        key: PERMISSIONS.SHOP_MANAGE_CATEGORIES,
        label: 'Manage shop product categories',
      },
      {
        key: PERMISSIONS.SHOP_MANAGE_DELIVERY,
        label: 'Manage delivery regions & fees',
      },
      {
        key: PERMISSIONS.SHOP_UPDATE_STATUS,
        label: 'Update shop order status & cancel',
      },
    ],
  },
  {
    group: 'Settings',
    permissions: [
      { key: PERMISSIONS.SETTINGS_READ, label: 'View system settings' },
      { key: PERMISSIONS.SETTINGS_MANAGE, label: 'Update system settings' },
    ],
  },
  {
    group: 'Beauticians',
    permissions: [
      { key: PERMISSIONS.BEAUTICIANS_READ, label: 'View beauticians & profiles' },
      { key: PERMISSIONS.BEAUTICIANS_MANAGE, label: 'Manage beautician accounts' },
      {
        key: PERMISSIONS.BEAUTICIANS_REVIEW,
        label: 'Review KYC & professional profiles',
      },
      {
        key: PERMISSIONS.BEAUTICIANS_ASSIGN_SERVICES,
        label: 'Assign eligible services to beauticians',
      },
      {
        key: PERMISSIONS.BEAUTICIANS_PROCESS_PAYOUTS,
        label: 'Process beautician payout requests',
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

  {
    group: 'Staff Portal',
    permissions: [
      {
        key: PERMISSIONS.STAFF_PORTAL_INVENTORY,
        label: 'See the Inventory module on the staff dashboard',
      },
      {
        key: PERMISSIONS.STAFF_PORTAL_BOOKINGS,
        label: 'See the Bookings module on the staff dashboard',
      },
      {
        key: PERMISSIONS.STAFF_PORTAL_SALES,
        label: 'See the Sell Products module on the staff dashboard',
      },
      {
        key: PERMISSIONS.STAFF_PORTAL_APPROVALS,
        label: 'See My Approvals on the staff dashboard (branch managers always see this regardless)',
      },
    ],
  },
];
