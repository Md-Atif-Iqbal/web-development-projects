import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const roots = await db.category.findMany({
    where: { parentId: null },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, slug: true, icon: true, imageUrl: true, sortOrder: true, isActive: true,
      _count: { select: { products: true } } },
  });
  console.log(JSON.stringify(roots, null, 1));
  await db.$disconnect();
}
main();
