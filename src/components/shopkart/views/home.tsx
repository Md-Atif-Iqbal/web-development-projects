"use client";

// Homepage — hero banner carousel, category tiles, deals, best sellers,
// new arrivals, coupons, trust badges and recently-viewed strip.

import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Truck, RotateCcw, ShieldCheck, BadgeIndianRupee, ChevronLeft, ChevronRight,
  Copy, TicketPercent, Smartphone, Shirt, Home, Sparkles, BookOpen, Backpack,
  ShoppingBasket, Dumbbell, Baby, Car, Tag, PackageX,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { useNav, getRecentProducts, type ViewName } from "@/lib/store";
import { Skeleton } from "@/components/ui/skeleton";
import type { BannerView, Category, ProductCard as ProductCardType, ProductListResponse } from "@/lib/types";
import {
  ProductCard, EmptyState, ProductGridSkeleton, SectionHeader,
} from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";

// Fallback icons used only when a category has no image or the image fails
// to load — never as a substitute for the real tile imagery.
const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string }>> = {
  Smartphone, Shirt, Home, Sparkles, BookOpen, Backpack,
  ShoppingBasket, Dumbbell, Baby, Car,
};

// Meaningful, per-category alt text (also used as the accessible label).
const CATEGORY_ALT: Record<string, string> = {
  electronics: "Electronics — smartphones, laptops, headphones and gadgets",
  fashion: "Fashion — men's and women's clothing, shoes and accessories",
  beauty: "Beauty & Personal Care — skincare, cosmetics, perfumes and personal-care products",
  "home-kitchen": "Home & Kitchen — furniture, kitchen appliances and home decor",
  "bags-luggage": "Bags & Luggage — backpacks, handbags, suitcases and travel bags",
  books: "Books & Stationery — books, notebooks, pens and educational supplies",
  grocery: "Grocery & Essentials — fruits, packaged food and household essentials",
  sports: "Sports & Fitness — sports equipment, gym accessories and fitness products",
  "toys-baby": "Toys & Baby Products — toys, baby-care products and children's accessories",
  automotive: "Automotive Accessories — bike accessories, car accessories and vehicle essentials",
};

const COUPONS = [
  { code: "WELCOME10", title: "10% off your first order", desc: "Above ₹999 · up to ₹200 off" },
  { code: "FESTIVE500", title: "Flat ₹500 off", desc: "On orders above ₹4,999" },
  { code: "BIGSAVE", title: "5% off big orders", desc: "Above ₹9,999 · up to ₹1,000 off" },
];

const TRUST = [
  { icon: Truck, title: "Free Delivery", desc: "Above ₹500" },
  { icon: RotateCcw, title: "Easy Returns", desc: "7-day policy" },
  { icon: ShieldCheck, title: "Secure Payments", desc: "UPI · Cards · COD" },
  { icon: BadgeIndianRupee, title: "Best Prices", desc: "Verified sellers" },
];

function bannerTarget(b: BannerView): { name: ViewName; params: Record<string, string> } {
  const v = b.linkValue ?? "";
  if (b.linkType === "category") return { name: "category", params: { slug: v } };
  if (b.linkType === "product") return { name: "product", params: { slug: v } };
  return { name: "search", params: { q: v } };
}

/**
 * Image tile for one category. Falls back to an icon tile when the category
 * has no imageUrl or the image fails to load (onError), so the grid never
 * shows a broken image.
 */
function CategoryCard({ cat }: { cat: Category }) {
  const navigate = useNav((s) => s.navigate);
  const [imgFailed, setImgFailed] = useState(false);
  const Icon = CATEGORY_ICONS[cat.icon ?? ""] ?? Tag;
  const alt = CATEGORY_ALT[cat.slug] ?? `Shop ${cat.name} online`;
  const showImage = Boolean(cat.imageUrl) && !imgFailed;

  return (
    <button
      onClick={() => navigate("category", { slug: cat.slug })}
      className="group flex flex-col overflow-hidden rounded-2xl border bg-card text-left shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      aria-label={`Shop ${cat.name}`}
    >
      <span className="relative block aspect-[4/3] w-full overflow-hidden bg-muted">
        {showImage ? (
          <img
            src={cat.imageUrl ?? ""}
            alt={alt}
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
            className="h-full w-full object-cover transition-transform duration-300 ease-out group-hover:scale-[1.06]"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-orange-50 to-amber-50 text-primary dark:from-orange-950/40 dark:to-amber-950/30">
            <Icon size={36} className="transition-transform duration-300 group-hover:scale-110" />
          </span>
        )}
      </span>
      <span className="flex flex-col items-center gap-1.5 px-2 py-2.5 sm:py-3">
        <span className="line-clamp-1 text-center text-[11px] font-semibold leading-tight transition-colors duration-300 group-hover:text-primary sm:text-xs xl:text-sm">
          {cat.name}
        </span>
        <span aria-hidden className="h-0.5 w-5 rounded-full bg-primary/60 transition-all duration-300 group-hover:w-9 group-hover:bg-primary" />
      </span>
    </button>
  );
}

function HeroCarousel({ banners }: { banners: BannerView[] }) {
  const navigate = useNav((s) => s.navigate);
  const [index, setIndex] = useState(0);
  const count = banners.length;

  useEffect(() => {
    if (count <= 1) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), 5000);
    return () => clearInterval(t);
  }, [count]);

  if (count === 0) {
    // Default brand hero — shown only when no banners are configured.
    return (
      <div className="relative flex min-h-44 items-center overflow-hidden rounded-2xl bg-brand-navy sm:min-h-56">
        <img
          src="/banners/banner-electronics.png"
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-40"
        />
        <div className="relative z-10 max-w-xl p-6 sm:p-10">
          <h2 className="text-xl font-extrabold leading-tight text-white sm:text-3xl">
            Everything You Love, All in One Place.
          </h2>
          <p className="mt-2 text-xs text-white/85 sm:text-sm">
            Discover amazing products, exciting offers, and effortless shopping with ShopEase.
          </p>
          <button
            onClick={() => navigate("search", { q: "" })}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow transition-transform duration-200 hover:scale-[1.03]"
          >
            Start Shopping <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border bg-card">
      <div
        className="flex transition-transform duration-500 ease-out"
        style={{ transform: `translateX(-${index * 100}%)` }}
      >
        {banners.map((b) => {
          const target = bannerTarget(b);
          return (
            <button
              key={b.id}
              className="group relative block aspect-[21/8] min-h-40 w-full shrink-0 grow-0 basis-full text-left sm:aspect-[21/7]"
              onClick={() => navigate(target.name, target.params)}
              aria-label={b.title}
            >
              <img src={b.imageUrl} alt={b.title} className="absolute inset-0 h-full w-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-brand-navy/85 via-brand-navy/40 to-transparent" />
              <div className="absolute inset-y-0 left-0 flex max-w-lg flex-col justify-center gap-1.5 p-5 sm:p-8">
                <h2 className="text-lg font-extrabold leading-tight text-white drop-shadow sm:text-3xl">{b.title}</h2>
                {b.subtitle && <p className="line-clamp-2 text-xs text-white/90 sm:text-sm">{b.subtitle}</p>}
              {b.ctaText && (
                  <span className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-lg transition-transform duration-200 group-hover:scale-[1.04] sm:text-sm">
                    {b.ctaText}
                    <ChevronRight size={14} />
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {count > 1 && (
        <>
          <button
            aria-label="Previous banner"
            onClick={() => setIndex((i) => (i - 1 + count) % count)}
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/85 p-1.5 shadow hover:bg-white sm:block"
          >
            <ChevronLeft size={18} />
          </button>
          <button
            aria-label="Next banner"
            onClick={() => setIndex((i) => (i + 1) % count)}
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-white/85 p-1.5 shadow hover:bg-white sm:block"
          >
            <ChevronRight size={18} />
          </button>
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                aria-label={`Go to banner ${i + 1}`}
                onClick={() => setIndex(i)}
                className={`h-1.5 rounded-full transition-all ${i === index ? "w-6 bg-white" : "w-1.5 bg-white/60"}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default function HomeView(_props: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  // The whole app renders client-only (spa-root uses ssr:false), so a lazy
  // initializer can safely read localStorage — it never runs on a server.
  const [recentIds] = useState<string[]>(() => getRecentProducts());

  const { data: banners, isLoading: bannersLoading } = useQuery({
    queryKey: ["banners"],
    queryFn: () => api.get<{ items: BannerView[] }>("/api/banners"),
    staleTime: 5 * 60_000,
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<{ items: Category[] }>("/api/categories"),
    staleTime: 5 * 60_000,
  });

  const { data: deals, isLoading: dealsLoading } = useQuery({
    queryKey: ["products", { featured: "1", pageSize: 6, sort: "price_asc" }],
    queryFn: () => api.get<ProductListResponse>("/api/products?featured=1&pageSize=6&sort=price_asc"),
  });

  const { data: best, isLoading: bestLoading } = useQuery({
    queryKey: ["products", { sort: "popular", pageSize: 10 }],
    queryFn: () => api.get<ProductListResponse>("/api/products?sort=popular&pageSize=10"),
  });

  const { data: arrivals, isLoading: arrivalsLoading } = useQuery({
    queryKey: ["products", { sort: "newest", pageSize: 5 }],
    queryFn: () => api.get<ProductListResponse>("/api/products?sort=newest&pageSize=5"),
  });

  // Recently viewed: fetch a wide page, filter client-side by stored ids.
  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ["products", { recent: recentIds.join(",") }],
    queryFn: () => api.get<ProductListResponse>("/api/products?pageSize=50"),
    enabled: recentIds.length > 0,
    staleTime: 30_000,
  });
  const recentItems = useMemo(() => {
    if (!recentData) return [];
    const byId = new Map(recentData.items.map((p) => [p.id, p]));
    return recentIds.map((id) => byId.get(id)).filter((p): p is ProductCardType => !!p);
  }, [recentData, recentIds]);

  const copyCoupon = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(`Code ${code} copied — apply it in your cart`);
    } catch {
      toast.info(`Use code ${code} at checkout`);
    }
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Hero */}
      {bannersLoading ? (
        <Skeleton className="aspect-[21/8] min-h-40 w-full rounded-2xl sm:aspect-[21/7]" />
      ) : (
        <HeroCarousel banners={banners?.items ?? []} />
      )}

      {/* Shop by Category — image tiles */}
      <section className="mt-8" aria-label="Shop by category">
        <SectionHeader
          title="Shop by Category"
          subtitle="Explore products for every part of your life."
        />
        {!categories ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {Array.from({ length: 10 }).map((_, i) => (
              <div key={i} className="overflow-hidden rounded-2xl border bg-card shadow-sm">
                <Skeleton className="aspect-[4/3] w-full rounded-none" />
                <div className="flex flex-col items-center gap-1.5 px-2 py-2.5 sm:py-3">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-0.5 w-5" />
                </div>
              </div>
            ))}
          </div>
        ) : categories.items.length === 0 ? (
          <EmptyState icon={<Tag size={24} />} title="No categories yet" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
            {categories.items.map((cat) => (
              <CategoryCard key={cat.id} cat={cat} />
            ))}
          </div>
        )}
      </section>

      {/* Coupon strip */}
      <section className="mt-8" aria-label="Available coupons">
        <div className="grid gap-3 sm:grid-cols-3">
          {COUPONS.map((c) => (
            <button
              key={c.code}
              onClick={() => void copyCoupon(c.code)}
              className="flex items-center gap-3 rounded-xl border border-primary/30 bg-accent p-3.5 text-left transition-all duration-200 hover:border-primary hover:shadow-sm"
            >
              <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
                <TicketPercent size={20} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-bold">{c.title}</span>
                <span className="block truncate text-xs text-muted-foreground">{c.desc}</span>
                <span className="mt-1 inline-block rounded border border-dashed border-primary/60 px-1.5 py-0.5 font-mono text-[11px] font-bold text-primary">
                  {c.code}
                </span>
              </span>
              <Copy size={15} className="shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      </section>

      {/* Deals of the Day */}
      <section className="mt-10" aria-label="Deals of the day">
        <SectionHeader
          title="Today's Deals"
          subtitle="Lowest prices across the marketplace"
          action={
            <Button variant="outline" size="sm" onClick={() => navigate("search", { q: "", deals: "1" })}>
              View all
            </Button>
          }
        />
        {dealsLoading ? (
          <div className="flex gap-3 overflow-hidden">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-64 w-44 shrink-0 rounded-xl sm:w-48" />
            ))}
          </div>
        ) : !deals || deals.items.length === 0 ? (
          <EmptyState icon={<PackageX size={24} />} title="No deals today" description="Check back soon for fresh offers." />
        ) : (
          <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sk-scrollbar sm:mx-0 sm:px-0">
          {deals.items.map((p) => (
              <div key={p.id} className="w-44 shrink-0 sm:w-48">
                <ProductCard product={p} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Recently viewed */}
      {recentIds.length > 0 && (
        <section className="mt-10" aria-label="Recently viewed">
          <SectionHeader title="Recently viewed" />
          {recentLoading ? (
            <div className="flex gap-3 overflow-hidden">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-44 shrink-0 rounded-xl sm:w-48" />
              ))}
            </div>
          ) : recentItems.length > 0 ? (
            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 sk-scrollbar sm:mx-0 sm:px-0">
              {recentItems.map((p) => (
                <div key={p.id} className="w-44 shrink-0 sm:w-48">
                  <ProductCard product={p} />
                </div>
              ))}
            </div>
          ) : null}
        </section>
      )}

      {/* Best Sellers */}
      <section className="mt-10" aria-label="Best sellers">
        <SectionHeader
          title="Best Sellers"
          subtitle="What everyone is buying"
          action={
            <Button variant="outline" size="sm" onClick={() => navigate("search", { q: "", sort: "popular" })}>
              View all
            </Button>
          }
        />
        {bestLoading ? (
          <ProductGridSkeleton count={10} />
        ) : !best || best.items.length === 0 ? (
          <EmptyState icon={<PackageX size={24} />} title="Nothing here yet" description="Products will appear once sellers list them." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {best.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* New Arrivals */}
      <section className="mt-10" aria-label="New arrivals">
        <SectionHeader
          title="New Arrivals"
          subtitle="Fresh from our sellers"
          action={
            <Button variant="outline" size="sm" onClick={() => navigate("search", { q: "", sort: "newest" })}>
              View all
            </Button>
          }
        />
        {arrivalsLoading ? (
          <ProductGridSkeleton count={5} />
        ) : !arrivals || arrivals.items.length === 0 ? (
          <EmptyState icon={<PackageX size={24} />} title="No new arrivals yet" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {arrivals.items.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        )}
      </section>

      {/* Trust badges */}
      <section className="mt-12 mb-4" aria-label="Why shop with ShopEase">
        <div className="grid grid-cols-2 gap-4 rounded-2xl bg-brand-navy p-5 text-white sm:grid-cols-4 sm:p-7">
          {TRUST.map((t) => (
            <div key={t.title} className="flex items-center gap-3">
              <span className="shrink-0 rounded-full bg-white/10 p-2.5 text-brand-yellow">
                <t.icon size={20} />
              </span>
              <div>
                <p className="text-sm font-semibold">{t.title}</p>
                <p className="text-xs text-white/70">{t.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
