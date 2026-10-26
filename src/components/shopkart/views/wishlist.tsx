"use client";

// Wishlist — saved products with move-to-cart (resolves the first in-stock
// variant) and remove actions.

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Heart, Trash2, ShoppingCart, Loader2, PackageX } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import type { WishlistItemView, ProductDetail } from "@/lib/types";
import { EmptyState, Price, RatingStars, ProductGridSkeleton } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";

export default function WishlistView(_props: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  const { user, loading: sessionLoading } = useSession();
  const qc = useQueryClient();
  const [movingId, setMovingId] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api.get<{ items: WishlistItemView[] }>("/api/wishlist"),
    enabled: !!user,
  });

  const remove = useMutation({
    mutationFn: (productId: string) => api.del<{ items: WishlistItemView[] }>(`/api/wishlist/items/${productId}`),
    onSuccess: () => {
      toast.success("Removed from wishlist");
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    },
    onError: (err) => toast.error(err instanceof ApiClientError ? err.message : "Could not remove item"),
  });

  const moveToCart = async (item: WishlistItemView) => {
    if (!user) {
      navigate("login");
      return;
    }
    setMovingId(item.productId);
    try {
      // Resolve the first in-stock variant (cart API requires a variantId).
      const detail = await api.get<ProductDetail>(`/api/products/${item.slug}`);
      const variant = detail.variants.find((v) => v.inStock) ?? detail.variants[0];
      if (!variant) {
        toast.error("This product has no purchasable variants right now");
        return;
      }
      if (!variant.inStock) {
        toast.error("This item is currently out of stock");
        return;
      }
      await api.post("/api/cart/items", { productId: item.productId, variantId: variant.id });
      await api.del(`/api/wishlist/items/${item.productId}`);
      toast.success("Moved to cart");
      qc.invalidateQueries({ queryKey: ["cart"] });
      qc.invalidateQueries({ queryKey: ["wishlist"] });
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Could not move item to cart";
      toast.error(message);
      if (err instanceof ApiClientError && err.status === 401) navigate("login");
    } finally {
      setMovingId(null);
    }
  };

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <ProductGridSkeleton count={4} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<Heart size={28} />}
          title="Please sign in"
          description="Sign in to see the items you've saved for later."
          action={<Button size="lg" onClick={() => navigate("login")}>Sign in</Button>}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<PackageX size={26} />}
          title="Couldn't load your wishlist"
          action={<Button onClick={() => void refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">My Wishlist {items.length > 0 && <span className="text-base font-normal text-muted-foreground">({items.length})</span>}</h1>

      {isLoading ? (
        <ProductGridSkeleton count={4} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Heart size={28} />}
          title="Your wishlist is empty"
          description="Tap the heart on any product to save it here for later."
          action={<Button size="lg" onClick={() => navigate("home")}>Start shopping</Button>}
        />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {items.map((item) => (
            <div key={item.id} className="flex gap-3 rounded-xl border bg-card p-3.5">
              <button
                className="h-24 w-24 shrink-0 overflow-hidden rounded-lg border bg-white p-1.5 dark:bg-neutral-950"
                onClick={() => navigate("product", { slug: item.slug })}
                aria-label={`View ${item.productName}`}
              >
                {item.image ? (
                  <img src={item.image} alt={item.productName} className="h-full w-full object-contain" />
                ) : (
                  <PackageX size={22} className="mx-auto text-muted-foreground" />
                )}
              </button>
              <div className="flex min-w-0 flex-1 flex-col">
                <button
                  className="line-clamp-2 text-left text-sm font-medium hover:text-primary"
                  onClick={() => navigate("product", { slug: item.slug })}
                >
                  {item.productName}
                </button>
                <div className="mt-1"><Price paise={item.price} mrp={item.mrp} /></div>
                {item.rating > 0 && <div className="mt-0.5"><RatingStars rating={item.rating} /></div>}
                {!item.inStock && <p className="mt-0.5 text-xs font-semibold text-rose-600">Out of stock</p>}
                <div className="mt-auto flex flex-wrap gap-2 pt-2">
                  <Button
                    size="sm"
                    className="min-h-9 gap-1.5"
                    disabled={movingId === item.productId || !item.inStock}
                    onClick={() => void moveToCart(item)}
                  >
                    {movingId === item.productId ? <Loader2 size={14} className="animate-spin" /> : <ShoppingCart size={14} />}
                    {item.inStock ? "Move to cart" : "Out of stock"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="min-h-9 gap-1.5 text-muted-foreground"
                    onClick={() => remove.mutate(item.productId)}
                  >
                    <Trash2 size={14} /> Remove
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
