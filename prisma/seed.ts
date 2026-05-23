import bcrypt from "bcryptjs";
import { PrismaClient, Role } from "../src/generated/prisma";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const password = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      name: "Admin",
      passwordHash,
      role: Role.ADMIN,
    },
  });

  console.log(`Seeded admin user: ${user.email}`);
  console.log(`Password: ${password}`);
  console.log("Change this in production by setting SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars before running, or edit the user directly.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
