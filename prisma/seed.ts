import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

async function main() {
  const user = await prisma.user.upsert({
    where: { email: "demo@example.com" },
    update: {},
    create: { email: "demo@example.com" },
  });

  const portfolio = await prisma.portfolio.create({
    data: {
      userId: user.id,
      name: "Demo Portfolio",
      baseCcy: "USD",
      positions: {
        create: [{ symbol: "AAPL", quantity: 10.0, avgCost: 150.0 }],
      },
    },
    include: { positions: true },
  });

  console.log("Seeded:", { user, portfolio });
}

main().finally(() => prisma.$disconnect());
