import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const [, , emailArg, passwordArg] = process.argv;
if (!emailArg || !passwordArg) {
  console.error("Pakai: bun run db:reset-password <email> <password-baru>");
  process.exit(1);
}
if (passwordArg.length < 8) {
  console.error("Password minimal 8 karakter.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL tidak diset (isi .env atau export dulu).");
  process.exit(2);
}

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const email = emailArg.trim().toLowerCase();
const user = await prisma.user.findUnique({ where: { email } });
if (!user) {
  console.error(`User tidak ditemukan: ${email}`);
  process.exit(1);
}

const passwordHash = await Bun.password.hash(passwordArg);
await prisma.user.update({
  where: { id: user.id },
  data: { passwordHash, failedAttempts: 0, lockedUntil: null, updatedAt: new Date() },
});
console.log(`Password di-reset & lockout dibuka untuk ${email}.`);
await prisma.$disconnect();
