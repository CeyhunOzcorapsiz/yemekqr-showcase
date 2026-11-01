import { prisma } from "./db";
import { comparePassword } from "./auth";
export async function assertProductionDatabaseSafe() {
  if (
    await prisma.restaurant.findUnique({
      where: { id: "00000000-0000-4000-8000-000000000001" },
    })
  )
    throw new Error(
      "Demo restoranı içeren veritabanı production ortamında açılamaz. Ayrı bir gerçek veritabanı kullanın.",
    );
  const demoUsers = await prisma.user.findMany({
    where: {
      email: { in: ["admin@demo.com", "kasiyer@demo.com"] },
      active: true,
    },
  });
  for (const user of demoUsers)
    if (await comparePassword("demo1234", user.passwordHash))
      throw new Error(
        "Bilinen demo hesabı etkin. Production için demo hesabını kapatın veya ayrı veritabanı kullanın.",
      );
}
