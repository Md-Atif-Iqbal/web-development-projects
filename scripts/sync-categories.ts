// One-off data sync: brings the LIVE database's root categories in line with
// prisma/seed.ts — adds the 4 missing roots, renames "Books & More" →
// "Books & Stationery", sets imageUrl + sortOrder for all 10, and adds the
// new subcategories. Idempotent (upserts), does NOT touch products.
// Run: bun scripts/sync-categories.ts

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const catData = [
  { name: "Electronics", slug: "electronics", icon: "Smartphone", image: "/categories/electronics.png", children: ["Mobiles", "Laptops", "Audio", "Cameras"] },
  { name: "Fashion", slug: "fashion", icon: "Shirt", image: "/categories/fashion.png", children: ["Men's Clothing", "Women's Ethnic", "Footwear"] },
  { name: "Beauty & Personal Care", slug: "beauty", icon: "Sparkles", image: "/categories/beauty.png", children: ["Skincare", "Makeup", "Fragrances"] },
  { name: "Home & Kitchen", slug: "home-kitchen", icon: "Home", image: "/categories/home-kitchen.png", children: ["Kitchen Appliances", "Furniture", "Home Decor"] },
  { name: "Bags & Luggage", slug: "bags-luggage", icon: "Backpack", image: "/categories/bags-luggage.png", children: ["Backpacks", "Suitcases", "Handbags"] },
  { name: "Books & Stationery", slug: "books", icon: "BookOpen", image: "/categories/books-stationery.png", children: ["Fiction Books", "Notebooks & Pens"] },
  { name: "Grocery & Essentials", slug: "grocery", icon: "ShoppingBasket", image: "/categories/grocery.png", children: ["Fruits & Vegetables", "Packaged Food"] },
  { name: "Sports & Fitness", slug: "sports", icon: "Dumbbell", image: "/categories/sports-fitness.png", children: ["Fitness Equipment", "Sports Gear"] },
  { name: "Toys & Baby Products", slug: "toys-baby", icon: "Baby", image: "/categories/toys-baby.png", children: ["Toys", "Baby Care"] },
  { name: "Automotive Accessories", slug: "automotive", icon: "Car", image: "/categories/automotive.png", children: ["Car Accessories", "Bike Accessories"] },
] as const;

function childSlug(parent: string, child: string): string {
  return parent + "-" + child.toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
}

async function main() {
  for (let i = 0; i < catData.length; i++) {
    const c = catData[i]!;
    const parent = await db.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon, imageUrl: c.image, sortOrder: i },
      create: { name: c.name, slug: c.slug, icon: c.icon, imageUrl: c.image, sortOrder: i },
    });
    console.log(`✓ root ${c.name} (${c.slug}) → ${c.image} [sort ${i}]`);

    for (let j = 0; j < c.children.length; j++) {
      const slug = childSlug(c.slug, c.children[j]!);
      const existing = await db.category.findUnique({ where: { slug } });
      if (existing) continue; // don't re-parent or rename existing children
      await db.category.upsert({
        where: { slug },
        update: {},
        create: { name: c.children[j]!, slug, parentId: parent.id, sortOrder: j },
      });
      console.log(`  + child ${c.children[j]} (${slug})`);
    }
  }

  const total = await db.category.count({ where: { parentId: null } });
  console.log(`Done — ${total} root categories now in DB.`);
  await db.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
