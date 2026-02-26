import 'dotenv/config';
import { PrismaClient, UserRole } from '@prisma/client';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import * as argon2 from 'argon2';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
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

main()
  .catch((e) => {
    console.error('❌ Error seeding super admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
