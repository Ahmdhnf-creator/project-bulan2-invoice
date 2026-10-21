import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../app/generated/prisma/client";

const adapter = new PrismaPg({ connectionString: process.env.DIRECT_URL });
const prisma = new PrismaClient({ adapter });

const DEV_EMAIL = "dev@billmate.test";

async function main() {
  // User — unique key: email
  const user = await prisma.user.upsert({
    where: { email: DEV_EMAIL },
    update: { fullName: "Dev User" },
    create: {
      email: DEV_EMAIL,
      fullName: "Dev User",
      passwordHash: await Bun.password.hash("billmate-dev-password"),
    },
  });

  // BusinessProfile — unique key: userId
  const businessProfile = await prisma.businessProfile.upsert({
    where: { userId: user.id },
    update: { businessName: "Billmate Demo Studio" },
    create: {
      userId: user.id,
      businessName: "Billmate Demo Studio",
      address: "Jl. Contoh No. 1, Jakarta 10110",
      phone: "+62 21 0000 0000",
      email: "studio@billmate-demo.test",
      taxId: "000000000000000",
    },
  });

  // Customer — fixed dev id for deterministic idempotency
  const customer = await prisma.customer.upsert({
    where: { id: BigInt(1) },
    update: { name: "Demo Customer Co." },
    create: {
      id: BigInt(1),
      userId: user.id,
      name: "Demo Customer Co.",
      phone: "+62 812 0000 0000",
      email: "contact@demo-customer.test",
      address: "Jl. Contoh No. 2, Jakarta 10110",
    },
  });

  // Project
  const project = await prisma.project.upsert({
    where: { id: BigInt(1) },
    update: { name: "Demo Office Garden" },
    create: {
      id: BigInt(1),
      userId: user.id,
      customerId: customer.id,
      name: "Demo Office Garden",
      projectValue: "250000000.00",
      startDate: new Date("2026-10-01T00:00:00.000Z"),
      endDate: new Date("2026-11-15T00:00:00.000Z"),
      status: "IN_PROGRESS",
      notes: "Development seed data — fake project",
    },
  });

  // Invoice — subtotal 150,000,000 + 11% tax (16,500,000) = 166,500,000
  const invoice = await prisma.invoice.upsert({
    where: { id: BigInt(1) },
    update: { invoiceNumber: "INV-2026-0001" },
    create: {
      id: BigInt(1),
      userId: user.id,
      projectId: project.id,
      invoiceNumber: "INV-2026-0001",
      issueDate: new Date("2026-10-05T00:00:00.000Z"),
      dueDate: new Date("2026-11-04T00:00:00.000Z"),
      status: "PARTIALLY_PAID",
      taxRate: "11.00",
      subtotal: "150000000.00",
      taxAmount: "16500000.00",
      total: "166500000.00",
      notes: "Development seed data — fake invoice",
    },
  });

  // InvoiceItems — 80,000,000 + 70,000,000 = 150,000,000 subtotal
  const item1 = await prisma.invoiceItem.upsert({
    where: { id: BigInt(1) },
    update: { description: "Landscape design package" },
    create: {
      id: BigInt(1),
      invoiceId: invoice.id,
      description: "Landscape design package",
      quantity: "1.00",
      unitPrice: "80000000.00",
      amount: "80000000.00",
      sortOrder: 1,
    },
  });

  const item2 = await prisma.invoiceItem.upsert({
    where: { id: BigInt(2) },
    update: { description: "Plant supply and installation" },
    create: {
      id: BigInt(2),
      invoiceId: invoice.id,
      description: "Plant supply and installation",
      quantity: "1.00",
      unitPrice: "70000000.00",
      amount: "70000000.00",
      sortOrder: 2,
    },
  });

  // Payment — 66,000,000 (40%) keeps the invoice PARTIALLY_PAID
  const payment = await prisma.payment.upsert({
    where: { id: BigInt(1) },
    update: { method: "Bank transfer" },
    create: {
      id: BigInt(1),
      invoiceId: invoice.id,
      amount: "66000000.00",
      paymentDate: new Date("2026-10-06T00:00:00.000Z"),
      method: "Bank transfer",
      notes: "Development seed data — fake 40% down payment",
    },
  });

  // Expense
  const expense = await prisma.expense.upsert({
    where: { id: BigInt(1) },
    update: { description: "Nursery plant delivery" },
    create: {
      id: BigInt(1),
      userId: user.id,
      projectId: project.id,
      description: "Nursery plant delivery",
      amount: "18500000.00",
      date: new Date("2026-10-03T00:00:00.000Z"),
      category: "Materials",
      notes: "Development seed data — fake expense",
    },
  });

  // The fixed-id upserts above do not advance identity sequences.
  // Sync them so later autoincrement inserts (e.g. customers created
  // in the app) do not collide with existing rows.
  const seededTables = [
    "customer",
    "project",
    "invoice",
    "invoice_item",
    "payment",
    "expense",
  ];
  for (const table of seededTables) {
    await prisma.$executeRawUnsafe(
      `SELECT setval(pg_get_serial_sequence('${table}', 'id'), COALESCE((SELECT MAX(id) FROM ${table}), 1), true)`,
    );
  }

  const counts = {
    user: await prisma.user.count(),
    businessProfile: await prisma.businessProfile.count(),
    customer: await prisma.customer.count(),
    project: await prisma.project.count(),
    invoice: await prisma.invoice.count(),
    invoiceItem: await prisma.invoiceItem.count(),
    payment: await prisma.payment.count(),
    expense: await prisma.expense.count(),
  };

  console.log("Seed completed. Records in database:");
  console.log(JSON.stringify(counts, null, 2));
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
