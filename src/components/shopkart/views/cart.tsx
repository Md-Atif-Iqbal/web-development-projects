"use client";

// Cart — line items grouped per seller, quantity & removal, save-for-later,
// coupon apply/remove, price details and checkout entry.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Trash2, BookmarkPlus, Tag, ShoppingCart, AlertTriangle, Loader2, ShieldCheck,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import { formatINR } from "@/lib/money";
import type { CartPricingView, CartItemView } from "@/lib/types";
import { EmptyState, Price, QuantityStepper, SectionHeader, ProductGridSkeleton } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export default function CartView(_props: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  const { user, loading: sessionLoading } = useSession();
  const qc = useQueryClient();
  const [couponInput, setCouponInput] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);

  const { data: cart, isLoading, isError, refetch } = useQuery({
    queryKey: ["cart"],
    queryFn: () => api.get<CartPricingView>("/api/cart"),
    enabled: !!user,
  });

  const invalidateCart = () => qc.invalidateQueries({ queryKey: ["cart"] });

  const changeQty = useMutation({
    mutationFn: ({ cartItemId, qty }: { cartItemId: string; qty: number }) =>
      qty <= 0 ? api.del<CartPricingView>(`/api/cart/items/${cartItemId}`) : api.patch<CartPricingView>(`/api/cart/items/${cartItemId}`, { qty }),
    onSuccess: invalidateCart,
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update quantity");
      invalidateCart();
    },
  });

  const removeItem = useMutation({
    mutationFn: (cartItemId: string) => api.del<CartPricingView>(`/api/cart/items/${cartItemId}`),
    onSuccess: () => {
      toast.success("Removed from cart");
      invalidateCart();
    },
    onError: (err) => toast.error(err instanceof ApiClientError ? err.message : "Could not remove item"),
  });

  const saveForLater = useMutation({
    mutationFn: async (item: CartItemView) => {
      await api.del(`/api/cart/items/${item.cartItemId}`);
      await api.post("/api/wishlist/items", { productId: item.productId });
    },
    onSuccess: () => {
      toast.success("Saved for later — moved to wishlist");
      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    },
    onError: (err) => toast.error(err instanceof ApiClientError ? err.message : "Could not save for later"),
  });

  const applyCoupon = async (code: string) => {
    setApplyingCoupon(true);
    try {
      const res = await api.post<CartPricingView>("/api/cart/coupon", { code: code.trim() });
      toast.success(res.couponMessage ?? `Coupon ${res.couponCode} applied`);
      setCouponInput("");
      invalidateCart();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Coupon could not be applied");
    } finally {
      setApplyingCoupon(false);
    }
  };

  const removeCoupon = async () => {
    setApplyingCoupon(true);
    try {
      await api.post("/api/cart/coupon", { code: "" });
      toast.success("Coupon removed");
      invalidateCart();
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not remove coupon");
    } finally {
      setApplyingCoupon(false);
    }
  };

  // ── Auth gate ──
  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-28 w-full rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<ShoppingCart size={28} />}
          title="Sign in to see your cart"
          description="Your saved items are waiting for you once you sign in."
          action={<Button size="lg" onClick={() => navigate("login")}>Sign in</Button>}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<AlertTriangle size={28} />}
          title="Couldn't load your cart"
          description="Please try again in a moment."
          action={<Button onClick={() => void refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  if (isLoading || !cart) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <ProductGridSkeleton count={2} />
      </div>
    );
  }

  if (cart.items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<ShoppingCart size={28} />}
          title="Your cart is empty"
          description="Explore deals and best sellers to fill it up."
          action={<Button size="lg" onClick={() => navigate("home")}>Shop now</Button>}
        />
      </div>
    );
  }

  const totalQty = cart.items.reduce((s, i) => s + i.qty, 0);
  const hasIssues = cart.issues.length > 0;
  const shippingFree = cart.shippingTotal === 0;

  // Group items per seller for vendor-wise subtotals.
  const groups = cart.fulfillmentGroups.map((g) => ({
    ...g,
    items: cart.items.filter((i) => g.cartItemIds.includes(i.cartItemId)),
  }));

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:pb-6">
      <SectionHeader title={`My Cart (${totalQty} item${totalQty === 1 ? "" : "s"})`} />

      {hasIssues && (
        <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Some items need attention</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {cart.issues.map((iss, i) => (
                <li key={i}>{iss.message}</li>
              ))}
            </ul>
            <p className="mt-1 text-xs">Please fix these items before placing your order.</p>
          </div>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        {/* Items */}
        <div className="space-y-5">
          {groups.map((group) => (
            <div key={group.sellerId} className="overflow-hidden rounded-xl border bg-card">
              <div className="flex items-center justify-between border-b bg-muted/40 px-4 py-2.5">
                <p className="text-sm font-semibold">{group.sellerName}</p>
                <p className="text-xs text-muted-foreground">
                  Subtotal {formatINR(group.itemsTotal)} · Shipping {group.shippingFee === 0 ? <span className="font-semibold text-emerald-600">FREE</span> : formatINR(group.shippingFee)}
                </p>
              </div>
              <div className="divide-y">
                {group.items.map((item) => (
                  <div key={item.cartItemId} className="flex gap-3 p-4">
                    <button
                      className="h-20 w-20 shrink-0 overflow-hidden rounded-lg border bg-white p-1.5 dark:bg-neutral-950"
                      onClick={() => navigate("product", { slug: item.productSlug })}
                      aria-label={`View ${item.productName}`}
                    >
                      {item.image ? (
                        <img src={item.image} alt={item.productName} className="h-full w-full object-contain" />
                      ) : (
                        <ShoppingCart size={22} className="mx-auto text-muted-foreground" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <button
                        className="line-clamp-2 text-left text-sm font-medium hover:text-primary"
                        onClick={() => navigate("product", { slug: item.productSlug })}
                      >
                        {item.productName}
                      </button>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.variantName} · Sold by {item.sellerName}
                      </p>
                      {!item.inStock && <p className="mt-0.5 text-xs font-semibold text-rose-600">Out of stock</p>}
                      <div className="mt-2"><Price paise={item.unitPrice} mrp={item.listPrice} /></div>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <QuantityStepper
                          qty={item.qty}
                          max={item.maxQty}
                          disabled={!item.inStock || changeQty.isPending}
                          onChange={(qty) => changeQty.mutate({ cartItemId: item.cartItemId, qty })}
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground"
                          onClick={() => removeItem.mutate(item.cartItemId)}
                        >
                          <Trash2 size={14} /> Remove
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1 text-muted-foreground"
                          onClick={() => saveForLater.mutate(item)}
                        >
                          <BookmarkPlus size={14} /> Save for later
                        </Button>
                      </div>
                    </div>
                    <p className="hidden shrink-0 text-sm font-bold sm:block">{formatINR(item.lineTotal)}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Coupon box */}
          <div className="rounded-xl border bg-card p-4">
            <p className="mb-2.5 flex items-center gap-1.5 text-sm font-semibold">
              <Tag size={15} className="text-primary" /> Apply coupon
            </p>
            {cart.couponCode ? (
              <div className="flex items-center justify-between rounded-lg border border-emerald-300 bg-emerald-50 px-3.5 py-2.5 dark:border-emerald-800 dark:bg-emerald-950/40">
                <div>
                  <p className="font-mono text-sm font-bold text-emerald-700 dark:text-emerald-400">{cart.couponCode}</p>
                  {cart.couponMessage && <p className="text-xs text-emerald-700/80 dark:text-emerald-400/80">{cart.couponMessage}</p>}
                </div>
                <Button variant="ghost" size="sm" className="text-rose-600" onClick={() => void removeCoupon()} disabled={applyingCoupon}>
                  Remove
                </Button>
              </div>
            ) : (
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (couponInput.trim()) void applyCoupon(couponInput);
                }}
              >
                <Input
                  placeholder="Enter coupon code e.g. WELCOME10"
                  value={couponInput}
                  onChange={(e) => setCouponInput(e.target.value.toUpperCase())}
                  className="h-11 font-mono uppercase"
                  aria-label="Coupon code"
                />
                <Button type="submit" variant="secondary" disabled={applyingCoupon || !couponInput.trim()}>
                  {applyingCoupon ? <Loader2 size={15} className="animate-spin" /> : "Apply"}
                </Button>
              </form>
            )}
            {cart.couponDiscount > 0 && (
              <p className="mt-2 text-xs font-semibold text-emerald-600">− {formatINR(cart.couponDiscount)} coupon discount applied</p>
            )}
          </div>
        </div>

        {/* Price details */}
        <aside className="hidden space-y-3 self-start lg:sticky lg:top-28 lg:block">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="border-b pb-2.5 text-sm font-bold uppercase tracking-wide text-muted-foreground">Price details</h2>
            <dl className="space-y-2.5 py-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Price ({totalQty} item{totalQty === 1 ? "" : "s"})</dt>
                <dd className="font-medium">{formatINR(cart.itemsTotal)}</dd>
              </div>
              {cart.couponDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Coupon discount</dt>
                  <dd className="font-medium text-emerald-600">− {formatINR(cart.couponDiscount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery charges</dt>
                <dd className={`font-medium ${shippingFree ? "text-emerald-600" : ""}`}>
                  {shippingFree ? "FREE" : formatINR(cart.shippingTotal)}
                </dd>
              </div>
              {!shippingFree && <p className="text-xs text-muted-foreground">Free delivery on orders above ₹500</p>}
              <div className="flex justify-between border-t pt-3 text-base font-bold">
                <dt>Total amount</dt>
                <dd>{formatINR(cart.grandTotal)}</dd>
              </div>
            </dl>
            {cart.savingsTotal > 0 && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-sm font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                You will save {formatINR(cart.savingsTotal)} on this order
              </p>
            )}
            <Button
              size="lg"
              className="mt-3 w-full"
              disabled={hasIssues}
              onClick={() => navigate("checkout")}
            >
              {hasIssues ? "Fix items to continue" : "Place order"}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck size={12} className="text-emerald-600" /> Safe and secure payments · Easy returns
            </p>
          </div>
        </aside>
      </div>

      {/* Mobile sticky bar */}
      <div className="fixed inset-x-0 bottom-14 z-30 border-t bg-background/95 p-3 backdrop-blur sm:bottom-auto lg:hidden">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3">
          <div>
            <p className="text-lg font-extrabold">{formatINR(cart.grandTotal)}</p>
            {cart.savingsTotal > 0 && <p className="text-[11px] font-medium text-emerald-600">Saving {formatINR(cart.savingsTotal)}</p>}
          </div>
          <Button size="lg" className="min-w-40 flex-1" disabled={hasIssues} onClick={() => navigate("checkout")}>
            {hasIssues ? "Fix items to continue" : "Place order"}
          </Button>
        </div>
      </div>
    </div>
  );
}
