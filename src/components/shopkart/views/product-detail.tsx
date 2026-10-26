"use client";

// Product detail — gallery, variant picker, seller offers, delivery check,
// highlights/specs, reviews and related products.

import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  Heart, Check, MapPin, ShieldCheck, RotateCcw, BadgeIndianRupee, Truck,
  PackageX, Loader2, ChevronRight, Home, Star, Store,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav, pushRecentProduct } from "@/lib/store";
import { useSession } from "@/lib/session";
import { formatINR } from "@/lib/money";
import type {
  ProductDetail, ProductVariantView, SellerOfferView, ProductReview, ProductListResponse, WishlistItemView, ServiceabilityResponse,
} from "@/lib/types";
import { RatingStars, RatingPill, Price, EmptyState, ProductCard, SandboxNotice } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

// ── Review dialog ────────────────────────────────────────────────────────────

function WriteReviewDialog({
  productId,
  open,
  onOpenChange,
}: {
  productId: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const [rating, setRating] = useState(5);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (rating < 1) {
      setError("Please pick a star rating");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await api.post("/api/reviews", { productId, rating, title: title.trim() || undefined, body: body.trim() || undefined });
      toast.success("Review submitted — thanks!");
      qc.invalidateQueries({ queryKey: ["reviews"] });
      onOpenChange(false);
      setRating(5);
      setTitle("");
      setBody("");
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Could not submit review";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Write a review</DialogTitle>
          <DialogDescription>Share your experience to help other shoppers.</DialogDescription>
        </DialogHeader>
        {error && (
          <div role="alert" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            {error}
          </div>
        )}
        <div className="space-y-4">
          <div>
            <Label className="mb-1.5 block">Your rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-label={`Rate ${n} star${n > 1 ? "s" : ""}`}
                  onClick={() => setRating(n)}
                  className="rounded p-1.5 hover:bg-muted"
                >
                  <Star size={22} className={n <= rating ? "fill-amber-400 text-amber-400" : "text-neutral-300"} />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-title">Title (optional)</Label>
            <Input id="review-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Great value for money" maxLength={120} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="review-body">Your review (optional)</Label>
            <Textarea id="review-body" value={body} onChange={(e) => setBody(e.target.value)} rows={4} placeholder="What did you like or dislike?" maxLength={2000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={15} className="animate-spin" />} Submit review
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function ProductDetailView(_props: { params?: Record<string, string>; mode?: string }) {
  const { params = {} } = _props;
  const slug = params.slug ?? "";
  const navigate = useNav((s) => s.navigate);
  const { user } = useSession();
  const qc = useQueryClient();

  const { data: product, isLoading, isError, refetch } = useQuery({
    queryKey: ["product", slug],
    queryFn: () => api.get<ProductDetail>(`/api/products/${encodeURIComponent(slug)}`),
    enabled: !!slug,
  });

  // Recently-viewed tracking.
  useEffect(() => {
    if (product) pushRecentProduct(product.id);
  }, [product]);

  const [variantId, setVariantId] = useState<string | null>(null);
  const [offerId, setOfferId] = useState<string | null>(null);
  const [imgIndex, setImgIndex] = useState(0);
  const [pincode, setPincode] = useState("");
  const [checkedPincode, setCheckedPincode] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [buying, setBuying] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [reviewPage, setReviewPage] = useState(1);

  // Reset per-product selections when navigating to a different product
  // (state adjustment during render — the React-endorsed reset pattern).
  const [lastSlug, setLastSlug] = useState(slug);
  if (lastSlug !== slug) {
    setLastSlug(slug);
    setVariantId(null);
    setOfferId(null);
    setImgIndex(0);
    setCheckedPincode(null);
    setReviewPage(1);
  }

  const variant: ProductVariantView | undefined = useMemo(
    () => product?.variants.find((v) => v.id === variantId) ?? product?.variants.find((v) => v.inStock) ?? product?.variants[0],
    [product, variantId]
  );

  const offer: SellerOfferView | undefined = useMemo(
    () => product?.offers.find((o) => o.id === offerId),
    [product, offerId]
  );

  const activePrice = offer?.price ?? variant?.price ?? 0;
  const activeMrp = offer ? variant?.mrp ?? 0 : variant?.mrp ?? 0;

  // Variant grouping by the first attribute key (e.g. Color / Size).
  const attrKey = product?.variants[0] ? (Object.keys(product.variants[0].attributes)[0] ?? null) : null;
  const variantOptions = useMemo(() => {
    if (!product || !attrKey) return [];
    const map = new Map<string, ProductVariantView>();
    for (const v of product.variants) {
      const value = v.attributes[attrKey];
      if (value && !map.has(value)) map.set(value, v);
      else if (value && map.get(value) && !map.get(value)!.inStock && v.inStock) map.set(value, v);
    }
    return [...map.entries()].map(([value, v]) => ({ value, variant: v }));
  }, [product, attrKey]);

  const selectVariantValue = (value: string) => {
    const v = product?.variants.find((x) => x.attributes[attrKey ?? ""] === value && x.inStock)
      ?? product?.variants.find((x) => x.attributes[attrKey ?? ""] === value);
    if (v) setVariantId(v.id);
  };

  // Delivery serviceability
  const { data: serviceability, isFetching: checkingService } = useQuery({
    queryKey: ["serviceability", checkedPincode],
    queryFn: () => api.get<ServiceabilityResponse>(`/api/pincode/serviceability?pincode=${checkedPincode}`),
    enabled: !!checkedPincode,
    staleTime: 60_000,
  });

  // Wishlist state
  const { data: wishlist } = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api.get<{ items: WishlistItemView[] }>("/api/wishlist"),
    enabled: !!user && !!product,
  });
  const wishlisted = !!product && !!(wishlist?.items ?? []).some((i) => i.productId === product.id);

  const toggleWishlist = async () => {
    if (!user) {
      toast.error("Please sign in to save items");
      navigate("login");
      return;
    }
    if (!product) return;
    try {
      if (wishlisted) {
        await api.del(`/api/wishlist/items/${product.id}`);
        toast.success("Removed from wishlist");
      } else {
        await api.post("/api/wishlist/items", { productId: product.id });
        toast.success("Saved to wishlist");
      }
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) navigate("login");
      else toast.error("Could not update wishlist");
    }
  };

  const addToCart = async (): Promise<boolean> => {
    if (!user) {
      toast.error("Please sign in to add items to your cart");
      navigate("login");
      return false;
    }
    if (!product || !variant) return false;
    try {
      await api.post("/api/cart/items", {
        productId: product.id,
        variantId: variant.id,
        ...(offerId ? { sellerOfferId: offerId } : {}),
      });
      qc.invalidateQueries({ queryKey: ["cart"] });
      return true;
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Could not add to cart";
      toast.error(message);
      if (err instanceof ApiClientError && err.status === 401) navigate("login");
      return false;
    }
  };

  const onAddToCart = async () => {
    setAdding(true);
    const ok = await addToCart();
    if (ok) toast.success("Added to cart");
    setAdding(false);
  };

  const onBuyNow = async () => {
    setBuying(true);
    const ok = await addToCart();
    setBuying(false);
    if (ok) navigate("checkout");
  };

  // Reviews
  const { data: reviewsData, isLoading: reviewsLoading } = useQuery({
    queryKey: ["reviews", product?.id, reviewPage],
    queryFn: () => api.get<{ items: ProductReview[]; total: number; page: number; totalPages: number }>(
      `/api/reviews?productId=${product!.id}&page=${reviewPage}&pageSize=5`
    ),
    enabled: !!product,
  });

  const starBreakdown = useMemo(() => {
    const counts = [0, 0, 0, 0, 0]; // index 0 → 5★
    for (const r of reviewsData?.items ?? []) counts[5 - Math.min(5, Math.max(1, Math.round(r.rating)))] += 1;
    const total = counts.reduce((a, b) => a + b, 0);
    return counts.map((c, i) => ({ star: 5 - i, count: c, pct: total ? Math.round((c / total) * 100) : 0 }));
  }, [reviewsData]);

  // Related products
  const { data: related } = useQuery({
    queryKey: ["products", { related: product?.category.slug }],
    queryFn: () => api.get<ProductListResponse>(`/api/products?category=${product!.category.slug}&pageSize=6`),
    enabled: !!product,
  });
  const relatedItems = (related?.items ?? []).filter((p) => p.id !== product?.id).slice(0, 5);

  // ── Loading / error / not-found ──
  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <SkeletonBar />
        <div className="grid gap-8 lg:grid-cols-2">
          <SkeletonBar square />
          <div className="space-y-4">
            <SkeletonBar w="w-1/3" />
            <SkeletonBar w="w-3/4" />
            <SkeletonBar w="w-1/2" />
            <SkeletonBar h="h-24" />
          </div>
        </div>
      </div>
    );
  }

  if (isError || !product) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<PackageX size={28} />}
          title={isError ? "Couldn't load this product" : "Product not found"}
          description="It may have been removed by the seller or is unavailable."
          action={
            <div className="flex gap-2">
              {isError && <Button onClick={() => void refetch()}>Try again</Button>}
              <Button variant="outline" onClick={() => navigate("home")}>Back to home</Button>
            </div>
          }
        />
      </div>
    );
  }

  const images = product.images.length > 0 ? product.images : [];
  const stockLabel = variant?.inStock
    ? `In stock · ${variant.availableQty} available`
    : "Out of stock";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-4 flex flex-wrap items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => navigate("home")}>
          <Home size={12} /> Home
        </button>
        <ChevronRight size={12} />
        <button className="hover:text-foreground" onClick={() => navigate("category", { slug: product.category.slug })}>
          {product.category.name}
        </button>
        <ChevronRight size={12} />
        <span className="max-w-[16rem] truncate font-medium text-foreground sm:max-w-xs">{product.name}</span>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Gallery */}
        <div>
          <div className="sticky top-28 space-y-3">
            <div className="relative flex aspect-square items-center justify-center overflow-hidden rounded-2xl border bg-white p-6 dark:bg-neutral-950">
              {images.length > 0 ? (
                <img src={images[imgIndex] ?? images[0]} alt={product.name} className="h-full w-full object-contain" />
              ) : (
                <PackageX size={64} className="text-muted-foreground" />
              )}
              {product.codAvailable && (
                <span className="absolute left-3 top-3 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white">
                  COD available
                </span>
              )}
              <button
                onClick={() => void toggleWishlist()}
                aria-label={wishlisted ? "Remove from wishlist" : "Add to wishlist"}
                className="absolute right-3 top-3 rounded-full border bg-white/95 p-2.5 shadow-sm transition-transform hover:scale-110 dark:bg-neutral-900"
              >
                <Heart size={18} className={wishlisted ? "fill-rose-500 text-rose-500" : "text-neutral-500"} />
              </button>
            </div>
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 sk-scrollbar">
                {images.map((img, i) => (
                  <button
                    key={img + i}
                    onClick={() => setImgIndex(i)}
                    aria-label={`View image ${i + 1}`}
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 bg-white p-1 dark:bg-neutral-950 ${i === imgIndex ? "border-primary" : "border-transparent"}`}
                  >
                    <img src={img} alt="" className="h-full w-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Buy box */}
        <div className="space-y-5">
          <div>
            {product.brand && (
              <button
                className="text-sm font-semibold text-primary hover:underline"
                onClick={() => navigate("search", { q: product.brand! })}
              >
                {product.brand}
              </button>
            )}
            <h1 className="mt-0.5 text-xl font-bold leading-snug sm:text-2xl">{product.name}</h1>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <RatingPill rating={product.rating} count={product.ratingCount} />
              {product.soldCount > 0 && (
                <span className="text-xs text-muted-foreground">{product.soldCount.toLocaleString("en-IN")} sold</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border bg-card p-4">
            <Price paise={activePrice} mrp={activeMrp} size="lg" />
            {variant && <p className="mt-1 text-xs text-muted-foreground">Variant: {variant.name}</p>}
            <p className={`mt-2 text-sm font-semibold ${variant?.inStock ? "text-emerald-600" : "text-rose-600"}`}>
              {stockLabel}
            </p>

            {/* Variant selector */}
            {attrKey && variantOptions.length > 1 && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {attrKey}
                </p>
                <div className="flex flex-wrap gap-2">
                  {variantOptions.map((variantOption) => (
                    <button
                      key={variantOption.value}
                      onClick={() => selectVariantValue(variantOption.value)}
                      disabled={!variantOption.variant.inStock}
                      className={`min-h-11 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                        variant?.attributes[attrKey] === variantOption.value
                          ? "border-primary bg-primary/10 text-primary"
                          : "hover:border-foreground/30"
                      }`}
                    >
                      {variantOption.value}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Seller offers */}
            {product.offers.length > 0 && (
              <div className="mt-5">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Seller offers ({product.offers.length})
                </p>
                <RadioGroup
                  value={offerId ?? "__default"}
                  onValueChange={(v) => setOfferId(v === "__default" ? null : v)}
                  className="space-y-2"
                >
                  {product.offers.map((o) => (
                    <label
                      key={o.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm transition-colors ${
                        (offerId ?? "__default") === o.id ? "border-primary bg-primary/5" : "hover:border-foreground/20"
                      }`}
                    >
                      <RadioGroupItem value={o.id} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">Sold by {o.sellerName}</span>
                        <span className="text-xs text-muted-foreground">
                          Delivery in {o.deliveryDays} day{o.deliveryDays === 1 ? "" : "s"}
                          {o.isPrimary ? " · primary listing" : ""}
                        </span>
                      </span>
                      <span className="shrink-0 font-bold">{formatINR(o.price)}</span>
                    </label>
                  ))}
                </RadioGroup>
              </div>
            )}

            {/* CTAs */}
            <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Button size="lg" variant="outline" className="gap-2" onClick={() => void onAddToCart()} disabled={adding || !variant?.inStock}>
                {adding ? <Loader2 size={16} className="animate-spin" /> : null} Add to cart
              </Button>
              <Button size="lg" className="gap-2" onClick={() => void onBuyNow()} disabled={buying || !variant?.inStock}>
                {buying ? <Loader2 size={16} className="animate-spin" /> : null} Buy now
              </Button>
            </div>

            {/* Delivery check */}
            <div className="mt-5 rounded-lg bg-muted/50 p-3.5">
              <p className="mb-2 flex items-center gap-1.5 text-sm font-medium">
                <MapPin size={14} className="text-primary" /> Check delivery
              </p>
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (/^\d{6}$/.test(pincode)) setCheckedPincode(pincode);
                  else toast.error("Enter a valid 6-digit pincode");
                }}
              >
                <Input
                  inputMode="numeric"
                  placeholder="Enter pincode e.g. 560001"
                  value={pincode}
                  onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="h-10"
                  aria-label="Delivery pincode"
                />
                <Button type="submit" variant="secondary" disabled={checkingService || pincode.length !== 6}>
                  Check
                </Button>
              </form>
              {serviceability && (
                <div className="mt-2 text-sm">
                  {serviceability.serviceable ? (
                    <p className="text-emerald-700 dark:text-emerald-400">
                      <Truck size={13} className="mr-1 inline" />
                      Delivery by <strong>{format(addDays(new Date(), serviceability.estimatedDays), "EEE, dd MMM")}</strong>
                      {serviceability.city && <> · {serviceability.city}, {serviceability.state}</>}
                      <span className="block text-xs text-muted-foreground">Free delivery on orders above ₹500 · COD {serviceability.codAvailable ? "available" : "not available"}</span>
                    </p>
                  ) : (
                    <p className="text-rose-600">Not serviceable at this pincode yet.</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Seller card */}
          <div className="flex items-center gap-3 rounded-xl border bg-card p-4">
            <span className="rounded-lg bg-primary/10 p-2.5 text-primary">
              <Store size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-muted-foreground">Sold by</p>
              <p className="truncate text-sm font-semibold">{product.seller.name}</p>
            </div>
            {product.seller.rating != null && (
              <div className="text-right">
                <p className="flex items-center justify-end gap-1 text-sm font-bold">
                  {product.seller.rating.toFixed(1)}
                  <Star size={12} className="fill-brand-yellow text-brand-yellow" aria-hidden />
                </p>
                <p className="text-[11px] text-muted-foreground">seller rating</p>
              </div>
            )}
          </div>

          {/* Assurances */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <InfoTile icon={<RotateCcw size={16} />} title={`${product.returnDays}-day returns`} desc="Easy pickup & refund" />
            <InfoTile icon={<ShieldCheck size={16} />} title={product.warrantyMonths > 0 ? `${product.warrantyMonths} mo warranty` : "No warranty"} desc={product.warrantyMonths > 0 ? "Manufacturer coverage" : "As-is sale"} />
            <InfoTile icon={<BadgeIndianRupee size={16} />} title={product.codAvailable ? "COD available" : "Prepaid only"} desc="Pay your way" />
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-8">
          {product.highlights.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">Highlights</h2>
              <ul className="space-y-2">
                {product.highlights.map((h, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm">
                    <Check size={15} className="mt-0.5 shrink-0 text-emerald-600" />
                    {h}
                  </li>
                ))}
              </ul>
            </section>
          )}

          {Object.keys(product.specifications).length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-bold">Specifications</h2>
              <div className="overflow-hidden rounded-xl border">
                <table className="w-full text-sm">
                  <tbody>
                    {Object.entries(product.specifications).map(([k, v], i) => (
                      <tr key={k} className={i % 2 === 0 ? "bg-muted/40" : ""}>
                        <td className="w-2/5 px-3.5 py-2.5 font-medium text-muted-foreground">{k}</td>
                        <td className="px-3.5 py-2.5">{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4">
          <section>
            <h2 className="mb-3 text-lg font-bold">Description</h2>
            <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">{product.description}</p>
          </section>
          <SandboxNotice>Logistics & payments are simulated for this MVP demo.</SandboxNotice>
        </div>
      </div>

      {/* Reviews */}
      <section className="mt-12">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold">Ratings & reviews</h2>
          {user ? (
            <Button variant="outline" onClick={() => setReviewDialogOpen(true)}>Write a review</Button>
          ) : (
            <Button variant="outline" onClick={() => navigate("login")}>Sign in to review</Button>
          )}
        </div>

        <div className="grid gap-6 rounded-2xl border bg-card p-5 md:grid-cols-[200px_1fr]">
          <div className="flex flex-col items-center justify-center rounded-xl bg-muted/40 p-4 text-center">
            <p className="text-4xl font-extrabold">{product.rating > 0 ? product.rating.toFixed(1) : "–"}</p>
            <RatingStars rating={product.rating} className="mt-1" />
            <p className="mt-1 text-xs text-muted-foreground">{product.ratingCount.toLocaleString("en-IN")} ratings</p>
          </div>
          <div className="flex flex-col justify-center gap-1.5">
            {starBreakdown.map((b) => (
              <div key={b.star} className="flex items-center gap-2 text-xs">
                <span className="flex w-8 shrink-0 items-center gap-0.5 text-muted-foreground">
                  {b.star}
                  <Star size={11} className="fill-brand-yellow text-brand-yellow" aria-hidden />
                </span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div className="h-full rounded-full bg-amber-400" style={{ width: `${b.pct}%` }} />
                </div>
                <span className="w-8 shrink-0 text-right text-muted-foreground">{b.count}</span>
              </div>
            ))}
            <p className="mt-1 text-[11px] text-muted-foreground">Breakdown from the most recent reviews shown below.</p>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          {reviewsLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-20 animate-pulse rounded-xl bg-muted/50" />
              ))}
            </div>
          ) : !reviewsData || reviewsData.items.length === 0 ? (
            <EmptyState
              title="No reviews yet"
              description="Be the first to review this product after your delivery."
            />
          ) : (
            <>
              {reviewsData.items.map((r) => (
                <div key={r.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center gap-2">
                    <RatingStars rating={r.rating} />
                    <span className="text-sm font-semibold">{r.title ?? ""}</span>
                    {r.verifiedPurchase && (
                      <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">
                        Verified purchase
                      </span>
                    )}
                  </div>
                  {r.body && <p className="mt-1.5 text-sm text-muted-foreground">{r.body}</p>}
                  <p className="mt-2 text-xs text-muted-foreground">
                    {r.userName} · {format(new Date(r.createdAt), "dd MMM yyyy")}
                  </p>
                </div>
              ))}
              {(reviewsData.totalPages ?? 1) > 1 && (
                <div className="flex items-center justify-center gap-3 pt-1">
                  <Button variant="outline" size="sm" disabled={reviewPage <= 1} onClick={() => setReviewPage((p) => Math.max(1, p - 1))}>
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">Page {reviewsData.page} of {reviewsData.totalPages}</span>
                  <Button variant="outline" size="sm" disabled={reviewPage >= reviewsData.totalPages} onClick={() => setReviewPage((p) => p + 1)}>
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </section>

      {/* Related */}
      {relatedItems.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 text-lg font-bold">Similar products</h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {relatedItems.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </section>
      )}

      <WriteReviewDialog productId={product.id} open={reviewDialogOpen} onOpenChange={setReviewDialogOpen} />
    </div>
  );
}

function InfoTile({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-2.5 rounded-xl border bg-card p-3">
      <span className="mt-0.5 text-primary">{icon}</span>
      <div>
        <p className="text-xs font-semibold leading-tight sm:text-sm">{title}</p>
        <p className="text-[11px] text-muted-foreground">{desc}</p>
      </div>
    </div>
  );
}

function SkeletonBar({ w, h, square }: { w?: string; h?: string; square?: boolean }) {
  return <div className={`animate-pulse rounded-lg bg-muted/60 ${square ? "aspect-square w-full" : ""} ${h ?? "h-5"} ${w ?? "w-full"}`} />;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
