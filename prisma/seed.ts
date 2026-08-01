import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function seedSuperAdmin() {
  const email = 'superadmin@gmail.com';
  const password = 'SuperAdmin123$';

  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    console.log(`⚠️  Super admin already exists: ${email}`);
    return;
  }

  const hashedPassword = await argon2.hash(password, {
    type: argon2.argon2id,
  });

  const superAdmin = await prisma.user.create({
    data: {
      email,
      password: hashedPassword,
      firstName: 'Super',
      lastName: 'Admin',
      role: UserRole.SUPER_ADMIN,
      emailVerified: true,
    },
  });

  console.log(`✅ Super admin created successfully:`);
  console.log(`   ID    : ${superAdmin.id}`);
  console.log(`   Email : ${superAdmin.email}`);
  console.log(`   Role  : ${superAdmin.role}`);
}

async function seedHomeServiceSettings() {
  const existing = await prisma.homeServiceSettings.findFirst();

  if (existing) {
    console.log(`⚠️  Home service settings already exist (id: ${existing.id})`);
    return;
  }

  const settings = await prisma.homeServiceSettings.create({
    data: {
      commissionRate: 0.7,
      kycAutoApprove: true,
      arrivalVerificationExpiryMinutes: 15,
      serviceCompletionBufferMinutes: 60,
      payoutMode: 'MANUAL',
      dailyPayoutLimit: null,
      arrivalGeoFenceMeters: 250,
      noShowPenaltyEnabled: true,
      noShowSuspendThreshold: 3,
      noShowWindowDays: 30,
    },
  });

  console.log(`✅ Home service settings seeded (id: ${settings.id})`);
}

async function seedDispatchConfig() {
  const defaults = [
    { key: 'tier_1_radius_km', value: '5', valueType: 'int' },
    { key: 'tier_2_radius_km', value: '12', valueType: 'int' },
    { key: 'tier_3_radius_km', value: '25', valueType: 'int' },
    { key: 'offer_ttl_seconds_tier_1', value: '45', valueType: 'int' },
    { key: 'offer_ttl_seconds_tier_2', value: '60', valueType: 'int' },
    { key: 'offer_ttl_seconds_tier_3', value: '75', valueType: 'int' },
    { key: 'inter_tier_delay_seconds', value: '15', valueType: 'int' },
    { key: 'location_staleness_minutes', value: '5', valueType: 'int' },
    { key: 'location_rematch_min_distance_m', value: '500', valueType: 'int' },
    { key: 'score_weight_distance', value: '1', valueType: 'float' },
    { key: 'score_weight_rating', value: '0.3', valueType: 'float' },
    { key: 'score_weight_acceptance_rate', value: '0.2', valueType: 'float' },
    { key: 'score_weight_idle_minutes', value: '0.1', valueType: 'float' },
  ];

  for (const item of defaults) {
    await prisma.dispatchConfig.upsert({
      where: {
        region_key: { region: 'default', key: item.key },
      },
      create: {
        region: 'default',
        key: item.key,
        value: item.value,
        valueType: item.valueType,
      },
      update: {},
    });
  }

  console.log('✅ Dispatch config defaults seeded');
}

async function main() {
  await seedSuperAdmin();
  await seedHomeServiceSettings();
  await seedDispatchConfig();
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });