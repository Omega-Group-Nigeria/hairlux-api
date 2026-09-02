export const PERMISSIONS = {
  // ── Bookings ────────────────────────────────────────────────────────────────
  BOOKINGS_READ: 'bookings:read', // View all bookings
  BOOKINGS_CREATE: 'bookings:create', // Create a walk-in/manual booking as admin
  // Dev Feedback Round 4, item #33: EDIT (change services/products/stylist,
  // customer classification settings) is a genuinely different action from
  // UPDATE_STATUS (confirm/complete/cancel/no-show) -- an admin who can move
  // a booking through its lifecycle shouldn't automatically be able to
  // change what's actually in it, and vice versa.
  BOOKINGS_UPDATE: 'bookings:update', // Edit an existing booking's services, products, stylist, or customer classification settings
  BOOKINGS_UPDATE_STATUS: 'bookings:update_status', // Confirm / start / complete / cancel / no-show
  // Item #43: delete is always its own explicit permission, never bundled with edit.
  BOOKINGS_DELETE: 'bookings:delete', // Delete a booking record
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
  // Procurement/Inventory/Finance Integration, Phase 6: configuring which
  // products a service consumes is distinct from editing the service's
  // own name/price/image (SERVICES_UPDATE) -- it's inventory-consumption
  // config, matching the same separate-permission pattern already used
  // for categories above.
  SERVICES_MANAGE_RECIPE: 'services:manage_recipe', // Configure a service's product consumption ("recipe")

  // ── Branches ────────────────────────────────────────────────────────────────
  BRANCHES_READ: 'branches:read', // View branches and branch service config
  // Dev Feedback Round 4, item #43: split from the previous single
  // BRANCHES_MANAGE, which bundled create/edit/delete/manager-assignment/
  // service-config together. Delete is always its own explicit
  // permission -- never bundled with create/edit, per the same rule.
  BRANCHES_CREATE: 'branches:create', // Create a new branch
  BRANCHES_UPDATE: 'branches:update', // Edit branch details
  BRANCHES_MANAGE_MANAGER: 'branches:manage_manager', // Assign or remove a branch's manager
  BRANCHES_DELETE: 'branches:delete', // Delete a branch
  BRANCHES_MANAGE_SERVICES: 'branches:manage_services', // Manage which services a branch offers, and their walk-in pricing

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
  // Procurement/Inventory/Finance Integration, Phase 5: creating a manual
  // credit/debit against a vendor's balance is a financially-sensitive
  // write action, deliberately separate from suppliers:create/update
  // (editing the vendor's own record) since it directly affects money owed.
  SUPPLIERS_MANAGE_LEDGER: 'suppliers:manage_ledger', // Create a manual credit/debit adjustment against a vendor's ledger

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
  PURCHASE_REQUESTS_DELETE: 'purchase_requests:delete',
  PURCHASE_REQUESTS_APPROVE: 'purchase_requests:approve',

  // ── Purchases (Procurement Integration) ───────────────────────────────────
  PURCHASES_READ: 'purchases:read',
  PURCHASES_RECORD_PAYMENT: 'purchases:record_payment',
  PURCHASES_RECEIVE_GOODS: 'purchases:receive_goods',

  // ── Financial Transactions (Procurement Integration) ──────────────────────
  FINANCIAL_TRANSACTIONS_READ: 'financial_transactions:read',
  // Procurement/Inventory/Finance Integration, Phase 8: revenue/COGS/
  // margin data is more sensitive than the cash-flow ledger above --
  // kept as its own permission rather than folded into
  // financial_transactions:read.
  REPORTS_READ_PROFITABILITY: 'reports:read_profitability',
  // Homepage "Trusted by Thousands" stats -- who can view the live counts
  // and set marketing overrides on top of them.
  SITE_STATS_MANAGE: 'site_stats:manage',

  // System-wide Audit Trail viewer -- separately permissioned since it
  // surfaces before/after values across every module (including
  // sensitive ones like compensation and role changes), not scoped to
  // Admin/SUPER_ADMIN alone so a compliance/HR lead can be granted it
  // without full admin rights.
  AUDIT_TRAIL_READ: 'audit_trail:read',

  // ── Main Admin Dashboard metrics (Dev Feedback Round 4, item #32) ─────────
  // Grouped by logical metric category, not one permission per literal
  // card -- e.g. Today's Bookings + Pending Bookings + the Booking Trends
  // chart + Recent Bookings table are all gated together, since they're
  // all the same underlying data (bookings) presented a few different ways.
  DASHBOARD_VIEW_BOOKINGS_METRICS: 'dashboard:view_bookings_metrics', // Today's Bookings, Pending Bookings, Booking Trends chart, Recent Bookings table
  DASHBOARD_VIEW_REVENUE_METRICS: 'dashboard:view_revenue_metrics', // Today's Revenue, Revenue Trend chart
  DASHBOARD_VIEW_USER_METRICS: 'dashboard:view_user_metrics', // Total Users
  DASHBOARD_VIEW_HR_METRICS: 'dashboard:view_hr_metrics', // HR Snapshot

  // ── Payroll (salary/financial data) ──────────────────────────────────────────
  PAYROLL_READ: 'payroll:read', // View payroll dashboard, periods, payslips, withdrawal history
  // Dev Feedback Round 4, item #37: split from the previous single
  // PAYROLL_MANAGE, which bundled every payroll action -- compensation,
  // period lifecycle, adjustments, bank-change approval, and global
  // settings -- into one permission. Payroll is explicitly flagged as
  // critical-priority financial data, so "every action separately
  // controlled" applies with full force here.
  PAYROLL_MANAGE_COMPENSATION: 'payroll:manage_compensation', // Set a staff member's base salary/allowances/commission
  PAYROLL_APPROVE_BANK_CHANGE: 'payroll:approve_bank_change', // Approve or reject a staff member's bank account change request
  PAYROLL_CREATE_PERIOD: 'payroll:create_period', // Create a new payroll period
  PAYROLL_GENERATE: 'payroll:generate', // Run payroll generation for a DRAFT period
  PAYROLL_APPROVE_PERIOD: 'payroll:approve_period', // Formally approve an AWAITING_RELEASE period
  PAYROLL_MANAGE_ADJUSTMENTS: 'payroll:manage_adjustments', // Add or remove a bonus/deduction adjustment
  PAYROLL_MANAGE_SETTINGS: 'payroll:manage_settings', // Toggle Payday active/inactive, set the pension rate
  // Dev Feedback Round 9: a stuck-in-PROCESSING withdrawal (the Paystack
  // transfer webhook never arrived, or predates the webhook fix that
  // closes that gap) needs an explicit, separately-permissioned admin
  // action to resync -- distinct from PAYROLL_READ, since this actually
  // queries Paystack and can transition a withdrawal to COMPLETED/FAILED.
  PAYROLL_RESYNC_WITHDRAWAL: 'payroll:resync_withdrawal', // Manually resync a stuck withdrawal's status against Paystack
  // Payroll Engine v2, Phase 4: managing Commission Plan records
  // (financially-sensitive -- a plan's rate directly affects pay) is
  // deliberately separate from assigning one to a staff member --
  // someone who can pick which plan an employee is on shouldn't
  // automatically be able to change what that plan actually pays.
  // Delete kept separate from create/update per item #43's rule.
  PAYROLL_READ_COMMISSION_PLANS: 'payroll:read_commission_plans', // View Commission Plan records
  PAYROLL_CREATE_COMMISSION_PLAN: 'payroll:create_commission_plan', // Create a Commission Plan
  PAYROLL_UPDATE_COMMISSION_PLAN: 'payroll:update_commission_plan', // Edit a Commission Plan
  PAYROLL_DELETE_COMMISSION_PLAN: 'payroll:delete_commission_plan', // Delete a Commission Plan
  PAYROLL_ASSIGN_COMMISSION_PLAN: 'payroll:assign_commission_plan', // Assign a compensation type and/or Commission Plan to a staff member
  // Dev Feedback Round 4, item #22: deliberately separate from the rest --
  // sending an already-generated period back for correction is meant to
  // be a higher, more restricted bar than ordinary payroll management
  // ("Super Admin or any authorized access"), not something every
  // payroll manager can do by default.
  PAYROLL_CORRECT: 'payroll:correct', // Send an AWAITING_RELEASE payroll period back to DRAFT for correction before final approval

  // ── Payments (customer wallets & transactions) — Dev Feedback Round 4, item #34 ──
  // Read-only reporting controller (no create/edit/delete/approve actions exist
  // here at all), so a single permission is the right granularity -- adding
  // more would just be permissions with nothing distinct for them to gate.
  PAYMENTS_READ: 'payments:read', // View wallet stats and the cross-customer transaction ledger

  // ── Branch Finance (daily summary & cash reconciliation) ─────────────────────
  BRANCH_FINANCE_READ: 'branch_finance:read', // View the daily financial summary for a branch (bookings, sales, inventory movement)
  BRANCH_FINANCE_RECONCILE: 'branch_finance:reconcile', // Submit a branch's end-of-day cash count
  BRANCH_FINANCE_MANAGE_SETTINGS: 'branch_finance:manage_settings', // Dev Feedback Round 6, item #17 -- configure the daily submission deadline that applies across every branch

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
  // Dev Feedback Round 4, item #43: split from the previous single
  // LMS_MANAGE, which bundled create/edit/delete together.
  LMS_CREATE: 'lms:create', // Create a course and its role assignments
  LMS_UPDATE: 'lms:update', // Edit a course or its role assignments
  LMS_DELETE: 'lms:delete', // Delete a course

  // ── Lifecycle Campaigns ──────────────────────────────────────────────────────
  LIFECYCLE_CAMPAIGNS_READ: 'lifecycle_campaigns:read', // View templates, sequences & transition history
  // Dev Feedback Round 4, item #36: split from the previous single
  // LIFECYCLE_CAMPAIGNS_MANAGE, which bundled create/edit/delete for both
  // templates and sequences into one permission. Delete is always its own
  // explicit permission, per item #43 -- never bundled with create/edit.
  LIFECYCLE_CAMPAIGNS_CREATE: 'lifecycle_campaigns:create', // Create a template or sequence
  LIFECYCLE_CAMPAIGNS_UPDATE: 'lifecycle_campaigns:update', // Edit a template or sequence
  LIFECYCLE_CAMPAIGNS_DELETE: 'lifecycle_campaigns:delete', // Delete a template or sequence
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSION_VALUES = Object.values(PERMISSIONS) as Permission[];

/** Grouped structure — used by GET /admin/roles/permissions for checkbox UI */
export const PERMISSION_GROUPS = [
  {
    group: 'Bookings',
    permissions: [
      { key: PERMISSIONS.BOOKINGS_READ, label: 'View bookings' },
      { key: PERMISSIONS.BOOKINGS_CREATE, label: 'Create a walk-in/manual booking' },
      {
        key: PERMISSIONS.BOOKINGS_UPDATE,
        label: "Edit a booking's services, products, stylist, or customer classification settings",
      },
      {
        key: PERMISSIONS.BOOKINGS_UPDATE_STATUS,
        label: 'Confirm, start, complete, cancel, or no-show a booking',
      },
      { key: PERMISSIONS.BOOKINGS_DELETE, label: 'Delete a booking' },
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
      { key: PERMISSIONS.SERVICES_MANAGE_RECIPE, label: "Configure a service's product consumption" },
    ],
  },
  {
    group: 'Branches',
    permissions: [
      { key: PERMISSIONS.BRANCHES_READ, label: 'View branches & service config' },
      { key: PERMISSIONS.BRANCHES_CREATE, label: 'Create a new branch' },
      { key: PERMISSIONS.BRANCHES_UPDATE, label: 'Edit branch details' },
      { key: PERMISSIONS.BRANCHES_MANAGE_MANAGER, label: "Assign or remove a branch's manager" },
      { key: PERMISSIONS.BRANCHES_DELETE, label: 'Delete a branch' },
      { key: PERMISSIONS.BRANCHES_MANAGE_SERVICES, label: 'Manage which services a branch offers, and their walk-in pricing' },
    ],
  },
  {
    group: 'Lifecycle Campaigns',
    permissions: [
      { key: PERMISSIONS.LIFECYCLE_CAMPAIGNS_READ, label: 'View lifecycle campaign templates, sequences, and transition history' },
      { key: PERMISSIONS.LIFECYCLE_CAMPAIGNS_CREATE, label: 'Create a campaign template or sequence' },
      { key: PERMISSIONS.LIFECYCLE_CAMPAIGNS_UPDATE, label: 'Edit a campaign template or sequence' },
      { key: PERMISSIONS.LIFECYCLE_CAMPAIGNS_DELETE, label: 'Delete a campaign template or sequence' },
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
      { key: PERMISSIONS.LMS_CREATE, label: 'Create a course and its role assignments' },
      { key: PERMISSIONS.LMS_UPDATE, label: 'Edit a course or its role assignments' },
      { key: PERMISSIONS.LMS_DELETE, label: 'Delete a course' },
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
      { key: PERMISSIONS.SUPPLIERS_MANAGE_LEDGER, label: "Create a manual credit/debit adjustment against a vendor's ledger" },
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
      { key: PERMISSIONS.PURCHASE_REQUESTS_DELETE, label: 'Delete a Draft, Rejected, or Cancelled purchase request' },
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
      { key: PERMISSIONS.REPORTS_READ_PROFITABILITY, label: 'View revenue, COGS, and gross profit reporting' },
      { key: PERMISSIONS.SITE_STATS_MANAGE, label: 'View and configure the homepage "Trusted by Thousands" stats' },
      { key: PERMISSIONS.AUDIT_TRAIL_READ, label: 'View the system-wide audit trail (who changed what, and when)' },
    ],
  },
  {
    group: 'Main Dashboard Metrics',
    permissions: [
      { key: PERMISSIONS.DASHBOARD_VIEW_BOOKINGS_METRICS, label: "Today's Bookings, Pending Bookings, Booking Trends chart, and Recent Bookings table" },
      { key: PERMISSIONS.DASHBOARD_VIEW_REVENUE_METRICS, label: "Today's Revenue and the Revenue Trend chart" },
      { key: PERMISSIONS.DASHBOARD_VIEW_USER_METRICS, label: 'Total Users' },
      { key: PERMISSIONS.DASHBOARD_VIEW_HR_METRICS, label: 'HR Snapshot' },
    ],
  },
  {
    group: 'Payroll',
    permissions: [
      { key: PERMISSIONS.PAYROLL_READ, label: 'View the payroll dashboard, periods, payslips, and withdrawal history' },
      { key: PERMISSIONS.PAYROLL_MANAGE_COMPENSATION, label: "Set a staff member's base salary, allowances, or commission" },
      { key: PERMISSIONS.PAYROLL_APPROVE_BANK_CHANGE, label: "Approve or reject a staff member's bank account change request" },
      { key: PERMISSIONS.PAYROLL_CREATE_PERIOD, label: 'Create a new payroll period' },
      { key: PERMISSIONS.PAYROLL_GENERATE, label: 'Run payroll generation for a Draft period' },
      { key: PERMISSIONS.PAYROLL_APPROVE_PERIOD, label: 'Formally approve an Awaiting Release period' },
      { key: PERMISSIONS.PAYROLL_MANAGE_ADJUSTMENTS, label: 'Add or remove a bonus/deduction adjustment' },
      { key: PERMISSIONS.PAYROLL_MANAGE_SETTINGS, label: 'Toggle Payday active/inactive, set the pension rate' },
      { key: PERMISSIONS.PAYROLL_RESYNC_WITHDRAWAL, label: "Manually resync a stuck withdrawal's status against Paystack" },
      { key: PERMISSIONS.PAYROLL_READ_COMMISSION_PLANS, label: 'View Commission Plan records' },
      { key: PERMISSIONS.PAYROLL_CREATE_COMMISSION_PLAN, label: 'Create a Commission Plan' },
      { key: PERMISSIONS.PAYROLL_UPDATE_COMMISSION_PLAN, label: 'Edit a Commission Plan' },
      { key: PERMISSIONS.PAYROLL_DELETE_COMMISSION_PLAN, label: 'Delete a Commission Plan' },
      { key: PERMISSIONS.PAYROLL_ASSIGN_COMMISSION_PLAN, label: "Assign a compensation type and/or Commission Plan to a staff member" },
      {
        key: PERMISSIONS.PAYROLL_CORRECT,
        label: 'Send an already-generated payroll period back for correction before final approval',
      },
    ],
  },
  {
    group: 'Payments',
    permissions: [
      { key: PERMISSIONS.PAYMENTS_READ, label: "View wallet statistics and the cross-customer transaction ledger" },
    ],
  },
  {
    group: 'Branch Finance',
    permissions: [
      { key: PERMISSIONS.BRANCH_FINANCE_READ, label: "View a branch's daily financial summary — booking revenue, product sales, inventory received/transferred" },
      { key: PERMISSIONS.BRANCH_FINANCE_RECONCILE, label: "Submit a branch's end-of-day cash count" },
      { key: PERMISSIONS.BRANCH_FINANCE_MANAGE_SETTINGS, label: "Configure the daily submission deadline that applies across every branch" },
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