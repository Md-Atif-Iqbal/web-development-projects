// ShopEase seed — demo catalog, sellers, users, coupons, banners, demo orders.
// Run: npm run db:seed   (uses tsx; equivalent to: npx tsx prisma/seed.ts)
// All amounts are INTEGER PAISE.

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  console.log("🌱 Seeding ShopEase…");

  // ── Roles & permissions ──
  for (const [name, description] of [
    ["CUSTOMER", "Browse, purchase, manage own orders"],
    ["SELLER", "Manage own listings, orders, inventory"],
    ["ADMIN", "Marketplace moderation and operations"],
  ] as const) {
    await db.role.upsert({ where: { name }, update: {}, create: { name, description } });
  }
  for (const [key, description] of [
    ["orders:read:own", "Read own orders"],
    ["orders:read:seller", "Read own fulfillments"],
    ["orders:read:all", "Read all orders (admin)"],
    ["products:manage:own", "Manage own listings"],
    ["products:moderate", "Moderate listings (admin)"],
    ["sellers:moderate", "Verify/suspend sellers (admin)"],
    ["refunds:manage", "Initiate/complete refunds (admin)"],
    ["catalog:manage", "Manage categories/brands/coupons (admin)"],
  ] as const) {
    await db.permission.upsert({ where: { key }, update: {}, create: { key, description } });
  }

  const pwAdmin = await bcrypt.hash("Admin@123", 10);
  const pwCustomer = await bcrypt.hash("Customer@123", 10);
  const pwSeller = await bcrypt.hash("Seller@123", 10);

  // ── Users ──
  const admin = await db.user.upsert({
    where: { email: "admin@shopkart.in" },
    update: {},
    create: { name: "ShopEase Admin", email: "admin@shopkart.in", phone: "9000000001", passwordHash: pwAdmin, role: "ADMIN" },
  });
  const riya = await db.user.upsert({
    where: { email: "riya@example.com" },
    update: {},
    create: { name: "Riya Sharma", email: "riya@example.com", phone: "9812345670", passwordHash: pwCustomer, role: "CUSTOMER" },
  });
  await db.user.upsert({
    where: { email: "arjun@example.com" },
    update: {},
    create: { name: "Arjun Patel", email: "arjun@example.com", phone: "9812345671", passwordHash: pwCustomer, role: "CUSTOMER" },
  });
  const sellerUser = await db.user.upsert({
    where: { email: "seller@shopkart.in" },
    update: {},
    create: { name: "TechNova Owner", email: "seller@shopkart.in", phone: "9812345672", passwordHash: pwSeller, role: "SELLER" },
  });
  const newbieUser = await db.user.upsert({
    where: { email: "newbieseller@shopkart.in" },
    update: {},
    create: { name: "FreshFashions Owner", email: "newbieseller@shopkart.in", phone: "9812345673", passwordHash: pwSeller, role: "SELLER" },
  });
  const styleHubUser = await db.user.upsert({
    where: { email: "stylehub@shopkart.in" },
    update: {},
    create: { name: "StyleHub Owner", email: "stylehub@shopkart.in", phone: "9812345674", passwordHash: pwSeller, role: "SELLER" },
  });

  for (const u of [riya, admin]) {
    await db.customerProfile.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id } });
    await db.cart.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id } });
    await db.wishlist.upsert({ where: { userId: u.id }, update: {}, create: { userId: u.id } });
  }

  // ── Addresses for demo customers ──
  const addr = await db.address.findFirst({ where: { userId: riya.id } });
  if (!addr) {
    await db.address.create({
      data: {
        userId: riya.id, fullName: "Riya Sharma", phone: "9812345670",
        line1: "402, Sunrise Residency", line2: "Koramangala 5th Block", landmark: "Near Forum Mall",
        city: "Bengaluru", state: "Karnataka", pincode: "560095", type: "HOME", isDefault: true,
      },
    });
  }

  // ── Sellers ──
  const technova = await db.seller.upsert({
    where: { userId: sellerUser.id },
    update: { status: "APPROVED" },
    create: {
      userId: sellerUser.id, businessName: "TechNova Retail", gstin: "29ABCDE1234F1Z5",
      supportEmail: "support@technova.in", supportPhone: "8012345670",
      pickupLine1: "12, Industrial Layout", pickupCity: "Bengaluru", pickupState: "Karnataka", pickupPincode: "560048",
      status: "APPROVED", commissionBps: 800,
    },
  });
  const stylehub = await db.seller.upsert({
    where: { userId: styleHubUser.id },
    update: { status: "APPROVED" },
    create: {
      userId: styleHubUser.id, businessName: "StyleHub Fashions", gstin: "27FGHIJ5678K2Z1",
      supportEmail: "care@stylehub.in",
      pickupLine1: "88, Textile Market", pickupCity: "Surat", pickupState: "Gujarat", pickupPincode: "395002",
      status: "APPROVED", commissionBps: 1200,
    },
  });
  const newbie = await db.seller.upsert({
    where: { userId: newbieUser.id },
    update: {},
    create: {
      userId: newbieUser.id, businessName: "FreshFashions", gstin: "07KLMNO9012P3Z9",
      pickupLine1: "5, Karol Bagh", pickupCity: "New Delhi", pickupState: "Delhi", pickupPincode: "110005",
      status: "PENDING", commissionBps: 1200,
    },
  });
  for (const s of [technova, stylehub, newbie]) {
    await db.sellerVerification.upsert({
      where: { sellerId: s.id },
      update: {},
      create: {
        sellerId: s.id, accountType: "BUSINESS",
        bankAccountName: s.businessName, bankAccountNumber: "XXXXXXXX1234", bankIfsc: "HDFC0001234",
        documents: JSON.stringify([{ type: "GST_CERTIFICATE", number: s.gstin ?? "" }]),
        status: s.status === "APPROVED" ? "APPROVED" : "PENDING",
        reviewedAt: s.status === "APPROVED" ? new Date() : null,
      },
    });
  }

  // ── Categories (tile images live in public/categories/) ──
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

  const cats: Record<string, { id: string }> = {};
  for (const c of catData) {
    const parent = await db.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, icon: c.icon, imageUrl: c.image, sortOrder: catData.indexOf(c) },
      create: { name: c.name, slug: c.slug, icon: c.icon, imageUrl: c.image, sortOrder: catData.indexOf(c) },
    });
    cats[c.slug] = parent;
    cats[c.name] = parent;
    for (let i = 0; i < c.children.length; i++) {
      const childSlug = c.slug + "-" + c.children[i].toLowerCase().replace(/[^a-z]+/g, "-").replace(/^-|-$/g, "");
      const child = await db.category.upsert({
        where: { slug: childSlug },
        update: {},
        create: { name: c.children[i], slug: childSlug, parentId: parent.id, sortOrder: i },
      });
      cats[c.children[i]] = child;
    }
  }

  // ── Brands ──
  const brandNames = ["NovaTech", "Aurum", "SoundCore", "UrbanStep", "Bella Vita", "HomeChef", "PureGlow", "PagePress", "TrailPak", "OptiLens", "AiroFit"];
  const brands: Record<string, { id: string }> = {};
  for (const b of brandNames) {
    const slug = b.toLowerCase();
    brands[b] = await db.brand.upsert({
      where: { slug },
      update: {},
      create: { name: b, slug },
    });
  }

  // ── Products ──
  type P = {
    name: string; slug: string; brand: string; cat: string; seller: typeof technova;
    description: string; highlights: string[]; specs: Record<string, string>;
    warranty: number; returnDays?: number; featured?: boolean; sold?: number;
    variants: { name: string; attrs: Record<string, string>; mrp: number; price: number; onHand: number }[];
  };

  const products: P[] = [
    {
      name: "NovaTech Pulse 5G Smartphone (Cosmic Black, 8GB RAM, 128GB)", slug: "novatech-pulse-5g-black-8-128", brand: "NovaTech", cat: "Mobiles", seller: technova,
      description: "The Pulse 5G brings flagship features to everyone: a 6.67\" 120Hz AMOLED display, 50MP OIS main camera, 5000mAh battery with 67W fast charging, and 13 5G bands for blazing connectivity across India.",
      highlights: ["6.67\" 120Hz AMOLED display", "50MP AI triple camera with OIS", "5000mAh battery, 67W turbo charge", "13 5G bands, dual SIM", "IP54 splash resistant"],
      specs: { Display: "6.67 inch FHD+ AMOLED, 120Hz", Processor: "Octa-core 2.8GHz", RAM: "8 GB", Storage: "128 GB UFS 3.1", Camera: "50MP + 8MP + 2MP | 16MP front", Battery: "5000 mAh", "SIM Type": "Dual SIM, 5G" },
      warranty: 12, featured: true, sold: 320,
      variants: [
        { name: "8GB / 128GB · Cosmic Black", attrs: { RAM: "8GB", Storage: "128GB", Color: "Cosmic Black" }, mrp: 2499900, price: 1849900, onHand: 42 },
        { name: "8GB / 128GB · Aurora Silver", attrs: { RAM: "8GB", Storage: "128GB", Color: "Aurora Silver" }, mrp: 2499900, price: 1849900, onHand: 25 },
        { name: "12GB / 256GB · Cosmic Black", attrs: { RAM: "12GB", Storage: "256GB", Color: "Cosmic Black" }, mrp: 2999900, price: 2299900, onHand: 15 },
      ],
    },
    {
      name: "Aurum SlimBook 14 Laptop (Intel i5 13th Gen, 16GB/512GB SSD)", slug: "aurum-slimbook-14-i5", brand: "Aurum", cat: "Laptops", seller: technova,
      description: "A featherlight 1.29kg aluminium laptop with a 14\" 2.2K display, 13th Gen Intel Core i5, 16GB RAM and 512GB NVMe SSD — perfect for work, study and everything between.",
      highlights: ["14\" 2.2K IPS display, 100% sRGB", "Intel Core i5 13th Gen", "16GB LPDDR5 RAM, 512GB SSD", "1.29kg magnesium-aluminium body", "Backlit keyboard, fingerprint reader"],
      specs: { Display: "14 inch 2.2K IPS", Processor: "Intel Core i5-1340P", RAM: "16 GB LPDDR5", Storage: "512 GB NVMe SSD", Battery: "56Wh, up to 12 hrs", Weight: "1.29 kg", OS: "Windows 11 Home" },
      warranty: 24, featured: true, sold: 95,
      variants: [{ name: "Standard", attrs: { Color: "Graphite Grey" }, mrp: 8999900, price: 6499900, onHand: 18 }],
    },
    {
      name: "SoundCore Buds Air Pro Wireless Earbuds with ANC", slug: "soundcore-buds-air-pro", brand: "SoundCore", cat: "Audio", seller: technova,
      description: "True wireless earbuds with hybrid active noise cancellation, 32-hour total playtime, low-latency game mode and IPX5 sweat resistance.",
      highlights: ["Hybrid ANC up to 35dB", "32 hrs total playtime with case", "Bluetooth 5.3, dual device pairing", "IPX5 water resistant", "Type-C fast charge"],
      specs: { Driver: "11mm dynamic", ANC: "Hybrid, up to 35dB", Playtime: "8h buds / 32h with case", Bluetooth: "5.3", WaterResistance: "IPX5" },
      warranty: 12, sold: 510,
      variants: [
        { name: "White", attrs: { Color: "White" }, mrp: 499900, price: 249900, onHand: 60 },
        { name: "Midnight Black", attrs: { Color: "Black" }, mrp: 499900, price: 249900, onHand: 80 },
      ],
    },
    {
      name: "SoundCore Studio One Over-Ear Headphones", slug: "soundcore-studio-one", brand: "SoundCore", cat: "Audio", seller: technova,
      description: "Studio-quality 40mm drivers, adaptive noise cancelling, 60-hour battery and memory-foam earcups for all-day comfort.",
      highlights: ["Adaptive ANC", "60-hour playtime", "40mm titanium drivers", "Multipoint connection", "Foldable travel design"],
      specs: { Driver: "40mm titanium", Battery: "60 hours", ANC: "Adaptive hybrid", Weight: "250 g" },
      warranty: 12, featured: true, sold: 210,
      variants: [{ name: "Black", attrs: { Color: "Black" }, mrp: 799900, price: 499900, onHand: 34 }],
    },
    {
      name: "AiroFit Pulse Smartwatch with AMOLED & SpO2", slug: "airofit-pulse-smartwatch", brand: "AiroFit", cat: "Electronics", seller: technova,
      description: "1.85\" AMOLED smartwatch with Bluetooth calling, SpO2, heart-rate and sleep tracking, 100+ sports modes and 14-day battery.",
      highlights: ["1.85\" AMOLED always-on display", "Bluetooth calling with mic & speaker", "SpO2, HR, sleep & stress tracking", "100+ sports modes, 5ATM", "14-day typical battery"],
      specs: { Display: "1.85 inch AMOLED", Battery: "410 mAh, 14 days", WaterResistance: "5 ATM", Sensors: "HR, SpO2, accelerometer" },
      warranty: 12, sold: 430,
      variants: [
        { name: "Jet Black", attrs: { Color: "Black" }, mrp: 599900, price: 349900, onHand: 50 },
        { name: "Rose Gold", attrs: { Color: "Rose Gold" }, mrp: 599900, price: 349900, onHand: 28 },
      ],
    },
    {
      name: "OptiLens ViewMaster 4K Action Camera", slug: "optilens-viewmaster-4k", brand: "OptiLens", cat: "Cameras", seller: technova,
      description: "4K60 action camera with 6-axis EIS, waterproof to 10m without a case, dual touchscreens and a 155° wide lens.",
      highlights: ["4K60 / 1080p240 video", "6-axis gyro EIS", "Waterproof 10m (no case)", "Front + rear touchscreens", "Wi-Fi 6 quick transfer"],
      specs: { Video: "4K@60fps", Sensor: "1/2.3\" CMOS", Waterproof: "10 m", Battery: "1720 mAh x2" },
      warranty: 12, sold: 75,
      variants: [{ name: "Standard Kit", attrs: { Kit: "Camera + battery x2 + case" }, mrp: 3499900, price: 2499900, onHand: 12 }],
    },
    {
      name: "UrbanStep FlexRun Running Shoes", slug: "urbanstep-flexrun", brand: "UrbanStep", cat: "Footwear", seller: stylehub,
      description: "Lightweight knit running shoes with responsive EVA midsole cushioning, breathable mesh and grippy rubber outsole.",
      highlights: ["Breathable engineered knit upper", "Responsive EVA midsole", "Anti-slip rubber outsole", "Only 240g per shoe"],
      specs: { Upper: "Engineered knit", Midsole: "EVA foam", Closure: "Lace-up", Care: "Hand wash" },
      warranty: 0, returnDays: 14, sold: 620,
      variants: [
        { name: "UK 7 · Navy", attrs: { Size: "UK 7", Color: "Navy" }, mrp: 399900, price: 179900, onHand: 20 },
        { name: "UK 8 · Navy", attrs: { Size: "UK 8", Color: "Navy" }, mrp: 399900, price: 179900, onHand: 24 },
        { name: "UK 9 · Navy", attrs: { Size: "UK 9", Color: "Navy" }, mrp: 399900, price: 179900, onHand: 18 },
        { name: "UK 8 · Grey", attrs: { Size: "UK 8", Color: "Grey" }, mrp: 399900, price: 199900, onHand: 10 },
      ],
    },
    {
      name: "Bella Vita Essential Cotton Round-Neck T-Shirt", slug: "bella-vita-essential-tshirt", brand: "Bella Vita", cat: "Men's Clothing", seller: stylehub,
      description: "Supersoft 100% combed cotton t-shirt, pre-shrunk with bio-washed finish. A wardrobe essential that keeps its shape wash after wash.",
      highlights: ["100% combed cotton, 180 GSM", "Bio-washed, pre-shrunk", "Tagless neck label", "Machine washable"],
      specs: { Fabric: "100% Cotton", GSM: "180", Fit: "Regular", Neck: "Round neck" },
      warranty: 0, sold: 890,
      variants: [
        { name: "M · Teal", attrs: { Size: "M", Color: "Teal" }, mrp: 99900, price: 49900, onHand: 45 },
        { name: "L · Teal", attrs: { Size: "L", Color: "Teal" }, mrp: 99900, price: 49900, onHand: 40 },
        { name: "XL · Teal", attrs: { Size: "XL", Color: "Teal" }, mrp: 99900, price: 49900, onHand: 30 },
        { name: "L · Black", attrs: { Size: "L", Color: "Black" }, mrp: 99900, price: 54900, onHand: 25 },
      ],
    },
    {
      name: "Bella Vita Aria Printed Anarkali Kurta", slug: "bella-vita-aria-kurta", brand: "Bella Vita", cat: "Women's Ethnic", seller: stylehub,
      description: "Flowy Anarkali kurta in soft rayon with all-over block print, three-quarter sleeves and side pockets. Pair with juttis for effortless ethnic style.",
      highlights: ["Soft rayon fabric", "All-over block print", "Side pockets", "Machine wash gentle"],
      specs: { Fabric: "Rayon", Length: "Calf length", Sleeves: "Three-quarter", Occasion: "Casual & festive" },
      warranty: 0, returnDays: 14, sold: 340,
      variants: [
        { name: "S · Indigo", attrs: { Size: "S", Color: "Indigo" }, mrp: 219900, price: 109900, onHand: 15 },
        { name: "M · Indigo", attrs: { Size: "M", Color: "Indigo" }, mrp: 219900, price: 109900, onHand: 18 },
        { name: "L · Indigo", attrs: { Size: "L", Color: "Indigo" }, mrp: 219900, price: 109900, onHand: 12 },
      ],
    },
    {
      name: "Bella Vita Kanjivaram Silk Saree with Zari Border", slug: "bella-vita-kanjivaram-saree", brand: "Bella Vita", cat: "Women's Ethnic", seller: stylehub,
      description: "Art silk saree in rich maroon with contrasting golden zari border and pallu. Comes with unstitched blouse piece.",
      highlights: ["Art silk with zari woven border", "Includes 0.8m blouse piece", "Dry clean recommended", "Saree length: 5.5m"],
      specs: { Fabric: "Art Silk", Length: "5.5 m + 0.8 m blouse", WashCare: "Dry clean", Border: "Zari woven" },
      warranty: 0, returnDays: 14, sold: 150,
      variants: [{ name: "Maroon", attrs: { Color: "Maroon" }, mrp: 449900, price: 224900, onHand: 14 }],
    },
    {
      name: "NovaTech Vision 55\" 4K Smart LED TV", slug: "novatech-vision-55-4k-tv", brand: "NovaTech", cat: "Electronics", seller: technova,
      description: "55-inch 4K HDR10+ smart TV with Dolby Vision, 30W Dolby Atmos speakers, dual-band Wi-Fi and voice remote.",
      highlights: ["4K UHD HDR10+ / Dolby Vision", "30W Dolby Atmos audio", "Smart OS with 5000+ apps", "3 x HDMI 2.1, 2 x USB", "1-year onsite warranty"],
      specs: { Screen: "55 inch (139 cm)", Resolution: "3840x2160", RefreshRate: "60 Hz", Audio: "30W Dolby Atmos", Ports: "3 HDMI, 2 USB" },
      warranty: 12, featured: true, sold: 65,
      variants: [{ name: "55 inch", attrs: { Size: "55 inch" }, mrp: 6999900, price: 4499900, onHand: 8 }],
    },
    {
      name: "HomeChef Turbo 750W Mixer Grinder (3 Jars)", slug: "homechef-turbo-mixer-750w", brand: "HomeChef", cat: "Kitchen Appliances", seller: technova,
      description: "Powerful 750W copper motor mixer grinder with 3 stainless steel jars, overload protection and anti-skid feet.",
      highlights: ["750W pure copper motor", "3 stainless steel jars", "3-speed + pulse control", "2-year motor warranty", "ISI certified"],
      specs: { Power: "750 W", Jars: "1.5L, 1.0L, 0.4L SS", Speeds: "3 + Pulse", Warranty: "2 years motor" },
      warranty: 24, sold: 280,
      variants: [{ name: "Standard", attrs: { Color: "White-Grey" }, mrp: 449900, price: 279900, onHand: 36 }],
    },
    {
      name: "HomeChef InstaGlass 1.8L Electric Glass Kettle", slug: "homechef-instaglass-kettle", brand: "HomeChef", cat: "Kitchen Appliances", seller: technova,
      description: "Borosilicate glass kettle with 2200W rapid boil, blue LED illumination, auto shut-off and boil-dry protection.",
      highlights: ["1.8L borosilicate glass", "2200W rapid boil", "Auto shut-off & boil-dry guard", "360° swivel base"],
      specs: { Capacity: "1.8 L", Power: "2200 W", Body: "Borosilicate glass", Warranty: "1 year" },
      warranty: 12, sold: 190,
      variants: [{ name: "Standard", attrs: { Capacity: "1.8L" }, mrp: 229900, price: 139900, onHand: 28 }],
    },
    {
      name: "HomeChef ErgoMesh High-Back Office Chair", slug: "homechef-ergomesh-chair", brand: "HomeChef", cat: "Furniture", seller: technova,
      description: "Breathable mesh high-back chair with adjustable lumbar support, 3D armrests, 135° recline and class-4 gas lift.",
      highlights: ["Adjustable lumbar support", "3D flip-up armrests", "135° synchro-tilt recline", "Class-4 gas lift, 120kg rated", "Nylon base with PU casters"],
      specs: { BackType: "Mesh high back", Armrest: "3D adjustable", Recline: "Up to 135°", WeightRating: "120 kg" },
      warranty: 12, sold: 120,
      variants: [{ name: "Black", attrs: { Color: "Black" }, mrp: 1899900, price: 1199900, onHand: 10 }],
    },
    {
      name: "PureGlow Radiance Vitamin-C Face Serum 30ml", slug: "pureglow-vitc-serum-30", brand: "PureGlow", cat: "Skincare", seller: stylehub,
      description: "10% stabilized vitamin C with hyaluronic acid and ceramides. Brightens, fades dark spots and boosts hydration. Dermatologically tested.",
      highlights: ["10% stable Vitamin C (SAP)", "Hyaluronic acid + ceramides", "Fragrance-free, non-comedogenic", "Dermatologically tested", "Cruelty free"],
      specs: { Volume: "30 ml", KeyIngredients: "Vitamin C 10%, HA, Ceramide NP", SkinType: "All", ShelfLife: "24 months" },
      warranty: 0, returnDays: 7, sold: 740,
      variants: [{ name: "30 ml", attrs: { Volume: "30 ml" }, mrp: 89900, price: 54900, onHand: 55 }],
    },
    {
      name: "PagePress 'The Silent Mountain' Hardcover (Award Winner)", slug: "pagepress-silent-mountain", brand: "PagePress", cat: "Fiction Books", seller: stylehub,
      description: "The bestselling literary novel that swept the Bookers of the year — a multigenerational saga set across the Himalayas. Hardcover collector's edition.",
      highlights: ["Hardcover, 464 pages", "International award winner", "Includes reader's guide", "Gift-worthy edition"],
      specs: { Format: "Hardcover", Pages: "464", Language: "English", Publisher: "PagePress" },
      warranty: 0, returnDays: 7, sold: 410,
      variants: [{ name: "Hardcover", attrs: { Format: "Hardcover" }, mrp: 79900, price: 47900, onHand: 40 }],
    },
    {
      name: "TrailPak Voyager 30L Water-Resistant Laptop Backpack", slug: "trailpak-voyager-30l", brand: "TrailPak", cat: "Backpacks", seller: stylehub,
      description: "30L commuter backpack with padded 16\" laptop sleeve, USB charging port, rain cover and anti-theft back pocket.",
      highlights: ["Fits up to 16\" laptop", "Water-resistant polyester", "External USB charging port", "Included rain cover", "Anti-theft hidden pocket"],
      specs: { Capacity: "30 L", Material: "Polyester 900D", LaptopFit: "Up to 16 inch", Warranty: "1 year manufacturing" },
      warranty: 12, sold: 520,
      variants: [
        { name: "Graphite Grey", attrs: { Color: "Grey" }, mrp: 299900, price: 149900, onHand: 22 },
        { name: "Olive", attrs: { Color: "Olive" }, mrp: 299900, price: 149900, onHand: 16 },
      ],
    },
  ];

  const productIds: Record<string, { id: string; variantId: string; price: number }> = {};
  for (const p of products) {
    const existing = await db.product.findUnique({ where: { slug: p.slug } });
    if (existing) {
      const v = await db.productVariant.findFirst({ where: { productId: existing.id } });
      productIds[p.slug] = { id: existing.id, variantId: v!.id, price: v!.price };
      continue;
    }
    const slugCat = cats[p.cat] ?? cats[p.slug.split("-")[0]];
    const created = await db.product.create({
      data: {
        sellerId: p.seller.id,
        categoryId: slugCat.id,
        brandId: brands[p.brand]?.id ?? null,
        name: p.name,
        slug: p.slug,
        description: p.description,
        highlights: JSON.stringify(p.highlights),
        specifications: JSON.stringify(p.specs),
        warrantyMonths: p.warranty,
        returnDays: p.returnDays ?? 7,
        status: "ACTIVE",
        isFeatured: p.featured ?? false,
        soldCount: p.sold ?? 0,
        keywords: [p.brand, p.cat, p.name.split(" ").slice(0, 4).join(" ")].join(" ").toLowerCase(),
        images: {
          create: [{ url: imageForSlug(p.slug), sortOrder: 0 }],
        },
      },
    });
    let firstVariantId = "";
    let vi = 0;
    for (const v of p.variants) {
      const sku = p.slug.slice(0, 10).toUpperCase().replace(/-/g, "") + "-" + (vi + 1) + "-" + v.name.replace(/[^A-Z0-9]+/gi, "").slice(0, 8).toUpperCase() + "-" + Math.random().toString(36).slice(2, 5).toUpperCase();
      vi++;
      const variant = await db.productVariant.create({
        data: {
          productId: created.id, sku, name: v.name,
          attributes: JSON.stringify(v.attrs),
          mrp: v.mrp, price: v.price, isActive: true,
          inventory: { create: { onHand: v.onHand, reserved: 0 } },
        },
      });
      if (!firstVariantId) firstVariantId = variant.id;
    }
    await db.sellerOffer.create({
      data: { productId: created.id, sellerId: p.seller.id, price: p.variants[0].price, mrp: p.variants[0].mrp, isPrimary: true, deliveryDays: 3 },
    });
    productIds[p.slug] = { id: created.id, variantId: firstVariantId, price: p.variants[0].price };
  }
  console.log(`  ✓ ${Object.keys(productIds).length} products`);

  // Second seller offers (multi-vendor) on a couple of items
  const phoneOffer = productIds["novatech-pulse-5g-black-8-128"];
  await db.sellerOffer.upsert({
    where: { productId_sellerId: { productId: phoneOffer.id, sellerId: stylehub.id } },
    update: {},
    create: { productId: phoneOffer.id, sellerId: stylehub.id, price: phoneOffer.price + 5000, mrp: 2499900, deliveryDays: 5 },
  }).catch(() => undefined);

  // ── Coupons ──
  const coupons = [
    { code: "WELCOME10", description: "10% off on your first order above ₹999 (max ₹200 off)", type: "PERCENT", value: 10, minOrderValue: 99900, maxDiscount: 20000 },
    { code: "FESTIVE500", description: "Flat ₹500 off on orders above ₹4,999", type: "FLAT", value: 50000, minOrderValue: 499900 },
    { code: "BIGSAVE", description: "5% off on orders above ₹9,999 (max ₹1,000 off)", type: "PERCENT", value: 5, minOrderValue: 999900, maxDiscount: 100000 },
  ];
  for (const c of coupons) {
    await db.coupon.upsert({
      where: { code: c.code },
      update: {},
      create: {
        ...c, perUserLimit: 1, usageLimit: 1000, usedCount: 0,
        validFrom: new Date(Date.now() - 7 * 86400000), validTo: daysFromNow(90), isActive: true,
      },
    });
  }

  // ── Banners ──
  const banners = [
    { title: "Big Festive Carnival", subtitle: "Up to 70% off across categories · Extra 10% with WELCOME10", imageUrl: "/banners/banner-festive.png", ctaText: "Shop the sale", linkType: "search", linkValue: "", sortOrder: 0 },
    { title: "Gadget Mania Days", subtitle: "Flagship phones, laptops, audio — lowest prices of the season", imageUrl: "/banners/banner-electronics.png", ctaText: "Explore electronics", linkType: "category", linkValue: "electronics", sortOrder: 1 },
    { title: "Fashion Fiesta", subtitle: "Fresh fits for the festive season from top sellers", imageUrl: "/banners/banner-fashion.png", ctaText: "Shop fashion", linkType: "category", linkValue: "fashion", sortOrder: 2 },
  ];
  for (const b of banners) {
    const found = await db.banner.findFirst({ where: { title: b.title } });
    if (!found) await db.banner.create({ data: b });
  }

  // ── Demo orders for Riya (1 delivered with review-able item, 1 shipped) ──
  const existingOrders = await db.order.count({ where: { userId: riya.id } });
  if (existingOrders === 0) {
    const tshirt = productIds["bella-vita-essential-tshirt"];
    const serum = productIds["pureglow-vitc-serum-30"];
    const phone = productIds["novatech-pulse-5g-black-8-128"];

    const addressSnapshot = {
      fullName: "Riya Sharma", phone: "9812345670", line1: "402, Sunrise Residency", line2: "Koramangala 5th Block",
      landmark: "Near Forum Mall", city: "Bengaluru", state: "Karnataka", pincode: "560095", type: "HOME",
    };

    // Delivered order (t-shirt + serum) — eligible for review & return
    const delivered = await db.order.create({
      data: {
        orderNumber: "SK-20250112-A1B2", userId: riya.id, status: "DELIVERED", paymentMethod: "UPI", paymentStatus: "PAID",
        itemsTotal: tshirt.price + serum.price, discountTotal: 0, shippingTotal: 0, grandTotal: tshirt.price + serum.price,
        addressSnapshot: JSON.stringify(addressSnapshot),
        statusHistory: JSON.stringify([
          { status: "PENDING_PAYMENT", at: new Date(Date.now() - 12 * 86400000).toISOString() },
          { status: "CONFIRMED", at: new Date(Date.now() - 12 * 86400000).toISOString(), note: "Payment verified" },
          { status: "DELIVERED", at: new Date(Date.now() - 8 * 86400000).toISOString(), note: "All shipments delivered" },
        ]),
        placedAt: new Date(Date.now() - 12 * 86400000), confirmedAt: new Date(Date.now() - 12 * 86400000),
        deliveredAt: new Date(Date.now() - 8 * 86400000),
        idempotencyKey: "seed-order-1",
      },
    });
    await db.payment.create({
      data: { orderId: delivered.id, provider: "SANDBOX", method: "UPI", amount: delivered.grandTotal, status: "PAID", providerRef: "sbx_pay_seed0001delivered", sandbox: true },
    });
    const dItems = [
      { pid: tshirt.id, vid: tshirt.variantId, seller: stylehub, name: "Bella Vita Essential Cotton Round-Neck T-Shirt", sku: "BELLAVITAESTE-M", price: tshirt.price, mrp: 99900, image: "/products/tshirt.png", vname: "M · Teal" },
      { pid: serum.id, vid: serum.variantId, seller: stylehub, name: "PureGlow Radiance Vitamin-C Face Serum 30ml", sku: "PUREGLOWVITC-30M", price: serum.price, mrp: 89900, image: "/products/skincare.png", vname: "30 ml" },
    ];
    const dFul = await db.fulfillment.create({
      data: {
        orderId: delivered.id, sellerId: stylehub.id, status: "DELIVERED",
        itemsTotal: delivered.itemsTotal, shippingFee: 0,
        commissionAmount: Math.floor((delivered.itemsTotal * 1200) / 10000),
        sellerEarning: delivered.itemsTotal - Math.floor((delivered.itemsTotal * 1200) / 10000),
        history: JSON.stringify([{ status: "DELIVERED", at: new Date(Date.now() - 8 * 86400000).toISOString() }]),
      },
    });
    for (const it of dItems) {
      await db.orderItem.create({
        data: {
          orderId: delivered.id, fulfillmentId: dFul.id, productId: it.pid, variantId: it.vid,
          sellerId: it.seller.id, name: it.name, sku: it.sku, imageUrl: it.image, variantName: it.vname,
          unitPrice: it.price, listPrice: it.mrp, qty: 1, lineTotal: it.price, commissionBps: 1200,
          status: "ACTIVE", returnDays: 14, deliveredAt: new Date(Date.now() - 8 * 86400000),
        },
      });
    }
    await db.shipment.create({
      data: {
        fulfillmentId: dFul.id, provider: "MOCK_LOGISTICS", trackingNumber: "MLSEED00001", status: "DELIVERED",
        events: JSON.stringify([
          { status: "LABEL_CREATED", at: new Date(Date.now() - 11 * 86400000).toISOString(), note: "Shipping label created" },
          { status: "DELIVERED", at: new Date(Date.now() - 8 * 86400000).toISOString(), note: "Delivered" },
        ]),
        estimatedDelivery: new Date(Date.now() - 8 * 86400000), deliveredAt: new Date(Date.now() - 8 * 86400000),
      },
    });

    // Shipped order (phone via prepaid) — cancellable? no (shipped) → shows tracking
    const shipped = await db.order.create({
      data: {
        orderNumber: "SK-20250116-C3D4", userId: riya.id, status: "SHIPPED", paymentMethod: "CARD", paymentStatus: "PAID",
        itemsTotal: phone.price, discountTotal: 0, shippingTotal: 0, grandTotal: phone.price,
        addressSnapshot: JSON.stringify(addressSnapshot),
        statusHistory: JSON.stringify([
          { status: "PENDING_PAYMENT", at: new Date(Date.now() - 3 * 86400000).toISOString() },
          { status: "CONFIRMED", at: new Date(Date.now() - 3 * 86400000).toISOString(), note: "Payment verified" },
          { status: "SHIPPED", at: new Date(Date.now() - 1 * 86400000).toISOString(), note: "Logistics: Package picked up by courier" },
        ]),
        placedAt: new Date(Date.now() - 3 * 86400000), confirmedAt: new Date(Date.now() - 3 * 86400000),
        idempotencyKey: "seed-order-2",
      },
    });
    await db.payment.create({
      data: { orderId: shipped.id, provider: "SANDBOX", method: "CARD", amount: shipped.grandTotal, status: "PAID", providerRef: "sbx_pay_seed0002shipped", sandbox: true },
    });
    const sFul = await db.fulfillment.create({
      data: {
        orderId: shipped.id, sellerId: technova.id, status: "SHIPPED",
        itemsTotal: phone.price, shippingFee: 0,
        commissionAmount: Math.floor((phone.price * 800) / 10000),
        sellerEarning: phone.price - Math.floor((phone.price * 800) / 10000),
        history: JSON.stringify([{ status: "SHIPPED", at: new Date(Date.now() - 86400000).toISOString() }]),
      },
    });
    await db.orderItem.create({
      data: {
        orderId: shipped.id, fulfillmentId: sFul.id, productId: phone.id, variantId: phone.variantId,
        sellerId: technova.id, name: "NovaTech Pulse 5G Smartphone (Cosmic Black, 8GB RAM, 128GB)",
        sku: "NOVATECHPUL-8GB128", imageUrl: "/products/phone.png", variantName: "8GB / 128GB · Cosmic Black",
        unitPrice: phone.price, listPrice: 2499900, qty: 1, lineTotal: phone.price, commissionBps: 800,
        status: "ACTIVE", returnDays: 7,
      },
    });
    await db.shipment.create({
      data: {
        fulfillmentId: sFul.id, provider: "MOCK_LOGISTICS", trackingNumber: "MLSEED00002", status: "IN_TRANSIT",
        events: JSON.stringify([
          { status: "LABEL_CREATED", at: new Date(Date.now() - 2 * 86400000).toISOString(), note: "Shipping label created" },
          { status: "PICKED_UP", at: new Date(Date.now() - 1 * 86400000).toISOString(), note: "Package picked up by courier" },
          { status: "IN_TRANSIT", at: new Date(Date.now() - 86400000 / 2).toISOString(), note: "In transit to destination hub" },
        ]),
        estimatedDelivery: daysFromNow(2),
      },
    });

    // One review by Riya on the t-shirt
    await db.review.create({
      data: {
        productId: tshirt.id, userId: riya.id, rating: 4, title: "Great fit, soft cotton",
        body: "Fabric quality is lovely for the price. Fits true to size. Would buy more colors.", verifiedPurchase: true,
      },
    });
    await db.product.update({
      where: { id: tshirt.id },
      data: { ratingSum: 4, ratingCount: 1 },
    });

    // Notifications
    await db.notification.createMany({
      data: [
        { userId: riya.id, type: "ORDER", title: "Order SK-20250116-C3D4 shipped", body: "Your NovaTech Pulse 5G is on the way. Expected in 2 days." },
        { userId: riya.id, type: "ORDER", title: "Order SK-20250112-A1B2 delivered", body: "Rate your products and earn review credits." },
        { userId: sellerUser.id, type: "ORDER", title: "New order to process", body: "Order SK-20250116-C3D4 needs your action." },
      ],
    });
  }

  // ── Support ticket (demo) ──
  const ticketExists = await db.supportTicket.findFirst({ where: { userId: riya.id } });
  if (!ticketExists) {
    await db.supportTicket.create({
      data: {
        ticketNumber: "TKT-20250110-001", userId: riya.id, subject: "Invoice request for my last order",
        category: "ORDER", status: "OPEN",
        messages: { create: [{ authorRole: "CUSTOMER", authorName: "Riya Sharma", body: "Hi, could you share a GST invoice for order SK-20250112-A1B2? Thanks!" }] },
      },
    });
  }

  console.log("🌱 Seed complete.");
  console.log("   admin@shopkart.in / Admin@123");
  console.log("   riya@example.com / Customer@123");
  console.log("   seller@shopkart.in / Seller@123 (approved)");
  console.log("   newbieseller@shopkart.in / Seller@123 (pending)");
}

function imageForSlug(slug: string): string {
  const map: [RegExp, string][] = [
    [/pulse-5g|smartphone|mobile/, "phone.png"],
    [/slimbook|laptop/, "laptop.png"],
    [/buds|earbud/, "earbuds.png"],
    [/studio-one|headphone/, "headphones.png"],
    [/smartwatch/, "smartwatch.png"],
    [/flexrun|shoes|footwear/, "shoes.png"],
    [/tshirt/, "tshirt.png"],
    [/kurta|kurta/, "kurti.png"],
    [/saree/, "saree.png"],
    [/tv|vision/, "tv.png"],
    [/mixer/, "mixer.png"],
    [/kettle/, "kettle.png"],
    [/chair|furniture/, "chair.png"],
    [/serum|glow|skincare/, "skincare.png"],
    [/book|mountain|pagepress/, "books.png"],
    [/backpack|trailpak/, "backpack.png"],
    [/camera|optilens/, "camera.png"],
    [/bottle/, "bottle.png"],
  ];
  for (const [re, file] of map) if (re.test(slug)) return `/products/${file}`;
  return "/products/phone.png";
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
