"use client";

// ShopEase shared UI kit — product cards, prices, ratings, badges, states.

import { Star, StarHalf, ShoppingCart, Heart, PackageX, SearchX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { formatINR, discountPercent } from "@/lib/money";
import type { ProductCard as ProductCardType } from "@/lib/types";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, ApiClientError } from "@/lib/client/api";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useState } from "react";

export function RatingStars({ rating, size = 14, className = "" }: { rating: number; size?: number; className?: string }) {
  const full = Math.floor(rating);
  const half = rating - full >= 0.5;
  return (
    <span className={`inline-flex items-center gap-0.5 ${className}`} aria-label={`Rated ${rating} out of 5`}>
      {Array.from({ length: 5 }).map((_, i) => {
        if (i < full) return <Star key={i} size={size} className="fill-brand-yellow text-brand-yellow" />;
        if (i === full && half) return <StarHalf key={i} size={size} className="fill-brand-yellow text-brand-yellow" />;
        return <Star key={i} size={size} className="text-muted-foreground/40" />;
      })}
    </span>
  );
}

export function RatingPill({ rating, count }: { rating: number; count?: number }) {
  if (!count) return <span className="text-xs text-muted-foreground">No ratings yet</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-flex items-center gap-0.5 rounded bg-success px-1.5 py-0.5 text-xs font-semibold text-success-foreground">
        {rating.toFixed(1)} <Star size={10} className="fill-white text-white" />
      </span>
      <span className="text-xs text-muted-foreground">({count.toLocaleString("en-IN")})</span>
    </span>
  );
}

export function Price({ paise, mrp, size = "md" }: { paise: number; mrp?: number; size?: "sm" | "md" | "lg" }) {
  const pct = mrp ? discountPercent(mrp, paise) : 0;
  const sizes = { sm: "text-sm", md: "text-base", lg: "text-2xl" }[size];
  return (
    <span className="flex flex-wrap items-baseline gap-1.5">
      <span className={`${sizes} font-bold`}>{formatINR(paise)}</span>
      {!!mrp && mrp > paise && (
        <>
          <span className="text-xs text-muted-foreground line-through">{formatINR(mrp)}</span>
          {pct > 0 && <span className="text-xs font-semibold text-emerald-600">{pct}% off</span>}
        </>
      )}
    </span>
  );
}

export function ProductCard({ product }: { product: ProductCardType }) {
  const navigate = useNav((s) => s.navigate);
  const { user } = useSession();
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);

  const addToCart = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.error("Please sign in to add items to your cart");
      navigate("login");
      return;
    }
    setAdding(true);
    try {
      // Default variant selection is resolved server-side when variantId is omitted
      await api.post("/api/cart/items", { productId: product.id });
      toast.success("Added to cart");
      qc.invalidateQueries({ queryKey: ["cart"] });
    } catch (err) {
      const msg = err instanceof ApiClientError ? err.message : "Could not add to cart";
      toast.error(msg);
      if (err instanceof ApiClientError && err.status === 401) navigate("login");
    } finally {
      setAdding(false);
    }
  };

  const addToWishlist = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      toast.error("Please sign in to save items");
      navigate("login");
      return;
    }
    try {
      await api.post("/api/wishlist/items", { productId: product.id });
      setWishlisted(true);
      toast.success("Saved to wishlist");
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) navigate("login");
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate("product", { slug: product.slug })}
      onKeyDown={(e) => e.key === "Enter" && navigate("product", { slug: product.slug })}
      className="group relative flex h-full cursor-pointer flex-col overflow-hidden rounded-xl border bg-card transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="relative aspect-square overflow-hidden bg-neutral-50 p-3">
        {product.image ? (
           
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="h-full w-full rounded-lg object-contain transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <PackageX size={40} />
          </div>
        )}
        {product.discountPercent > 0 && (
          <span className="absolute left-2 top-2 rounded-md bg-brand-yellow px-1.5 py-0.5 text-[11px] font-bold text-brand-yellow-foreground shadow-sm">
            {product.discountPercent}% off
          </span>
        )}
        <button
          onClick={addToWishlist}
          aria-label={wishlisted ? "Saved to wishlist" : "Add to wishlist"}
          aria-pressed={wishlisted}
          className="absolute right-2 top-2 rounded-full bg-white/95 p-2 shadow-sm ring-1 ring-black/5 transition-all duration-200 hover:scale-110 hover:bg-white focus-visible:outline-2 focus-visible:outline-ring dark:bg-card/95"
        >
          <Heart
            size={15}
            className={`transition-colors duration-200 ${wishlisted ? "scale-110 fill-rose-500 text-rose-500" : "text-muted-foreground"}`}
          />
        </button>
        {!product.inStock && (
          <span className="absolute inset-x-0 bottom-0 bg-brand-navy/90 py-1 text-center text-xs font-medium text-brand-navy-foreground">
            Out of stock
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{product.brand ?? product.categoryName}</p>
        <h3 className="line-clamp-2-fix text-sm font-medium leading-snug">{product.name}</h3>
        <div className="mt-auto space-y-1.5 pt-1">
          <Price paise={product.price} mrp={product.mrp} />
          <div className="flex items-center justify-between">
            <RatingPill rating={product.rating} count={product.ratingCount} />
          </div>
          <Button size="sm" className="mt-1 w-full gap-1.5" onClick={addToCart} disabled={adding || !product.inStock}>
            {adding ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
            {product.inStock ? "Add to Cart" : "Notify me"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <div className="rounded-full bg-muted p-4 text-muted-foreground">{icon ?? <SearchX size={28} />}</div>
      <div>
        <h3 className="font-semibold">{title}</h3>
        {description && <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-2 rounded-xl border p-3">
          <Skeleton className="aspect-square w-full rounded-lg" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  );
}

const STATUS_COLORS: Record<string, string> = {
  PENDING_PAYMENT: "bg-amber-100 text-amber-800",
  CONFIRMED: "bg-sky-100 text-sky-800",
  PROCESSING: "bg-sky-100 text-sky-800",
  PACKED: "bg-indigo-100 text-indigo-800",
  SHIPPED: "bg-violet-100 text-violet-800",
  OUT_FOR_DELIVERY: "bg-purple-100 text-purple-800",
  DELIVERED: "bg-emerald-100 text-emerald-800",
  CANCELLED: "bg-rose-100 text-rose-800",
  DELIVERY_FAILED: "bg-rose-100 text-rose-800",
  PENDING: "bg-amber-100 text-amber-800",
  PAID: "bg-emerald-100 text-emerald-800",
  FAILED: "bg-rose-100 text-rose-800",
  REFUNDED: "bg-teal-100 text-teal-800",
  PARTIALLY_REFUNDED: "bg-teal-100 text-teal-800",
  ACTIVE: "bg-emerald-100 text-emerald-800",
  APPROVED: "bg-emerald-100 text-emerald-800",
  REJECTED: "bg-rose-100 text-rose-800",
  SUSPENDED: "bg-rose-100 text-rose-800",
  DRAFT: "bg-neutral-100 text-neutral-700",
  ARCHIVED: "bg-neutral-100 text-neutral-700",
  REQUESTED: "bg-amber-100 text-amber-800",
  UNDER_REVIEW: "bg-sky-100 text-sky-800",
  PICKUP_SCHEDULED: "bg-violet-100 text-violet-800",
  PICKED_UP: "bg-violet-100 text-violet-800",
  INSPECTION_PENDING: "bg-indigo-100 text-indigo-800",
  REFUND_INITIATED: "bg-teal-100 text-teal-800",
  REFUND_COMPLETED: "bg-emerald-100 text-emerald-800",
  CLOSED: "bg-neutral-100 text-neutral-700",
  OPEN: "bg-amber-100 text-amber-800",
  IN_PROGRESS: "bg-sky-100 text-sky-800",
  RESOLVED: "bg-emerald-100 text-emerald-800",
  EXCHANGE_SHIPPED: "bg-violet-100 text-violet-800",
  RETURN_REQUESTED: "bg-amber-100 text-amber-800",
  RETURNED: "bg-teal-100 text-teal-800",
  EXCHANGED: "bg-violet-100 text-violet-800",
  LABEL_CREATED: "bg-neutral-100 text-neutral-700",
  PICKED_UP_SHIPMENT: "bg-violet-100 text-violet-800",
  IN_TRANSIT: "bg-violet-100 text-violet-800",
};

export function StatusBadge({ status, className = "" }: { status: string; className?: string }) {
  const color = STATUS_COLORS[status] ?? "bg-neutral-100 text-neutral-700";
  return (
    <Badge variant="outline" className={`border-transparent font-medium ${color} ${className}`}>
      {status.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
    </Badge>
  );
}

export function SectionHeader({ title, subtitle, action }: { title: string; subtitle?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-lg font-bold tracking-tight sm:text-xl">{title}</h2>
        {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function QuantityStepper({
  qty,
  max,
  onChange,
  disabled,
}: {
  qty: number;
  max: number;
  onChange: (qty: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex items-center rounded-lg border">
      <button
        aria-label="Decrease quantity"
        className="px-3 py-1.5 text-lg leading-none text-muted-foreground hover:text-foreground disabled:opacity-40"
        disabled={disabled || qty <= 1}
        onClick={() => onChange(qty - 1)}
      >
        −
      </button>
      <span className="min-w-8 text-center text-sm font-semibold">{qty}</span>
      <button
        aria-label="Increase quantity"
        className="px-3 py-1.5 text-lg leading-none text-muted-foreground hover:text-foreground disabled:opacity-40"
        disabled={disabled || qty >= max}
        onClick={() => onChange(qty + 1)}
      >
        +
      </button>
    </div>
  );
}

// ShopEase brand mark — orange badge, white shopping bag, warm-yellow smile.
// Single source of truth for the logo glyph across the entire UI (header,
// dashboards, auth screens, splash). Pure vector so it stays crisp at any size.
export function BrandMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="15" fill="#FF6B35" />
      <path
        d="M26.5 27v-4.4a5.5 5.5 0 0 1 11 0V27"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="3.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 26h24q3 0 3.6 3l1.8 15q.6 5-4.4 5H19q-5 0-4.4-5l1.8-15q.6-3 3.6-3Z"
        fill="#FFFFFF"
      />
      <path
        d="M27.5 35.5a4.5 4.5 0 0 0 9 0"
        fill="none"
        stroke="#FFC857"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function BrandLogo({
  onClick,
  size = "md",
  variant = "default",
}: {
  onClick?: () => void;
  size?: "sm" | "md" | "lg";
  variant?: "default" | "onDark";
}) {
  const box = size === "sm" ? "h-7 w-7" : size === "lg" ? "h-11 w-11" : "h-9 w-9";
  const text = size === "sm" ? "text-base" : size === "lg" ? "text-2xl" : "text-xl";
  const wordmark = variant === "onDark" ? "text-white" : "text-foreground";
  const ease = variant === "onDark" ? "text-brand-yellow" : "text-primary";
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 rounded-lg transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
      aria-label="ShopEase home"
    >
      <BrandMark className={`${box} shrink-0 drop-shadow-sm`} />
      <span className={`${text} font-extrabold tracking-tight ${wordmark}`}>
        Shop<span className={ease}>Ease</span>
      </span>
    </button>
  );
}

export function SandboxNotice({ children }: { children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
      <strong>SANDBOX MODE</strong> — {children ?? "This environment uses simulated payment & logistics providers. No real money moves."}
    </div>
  );
}
