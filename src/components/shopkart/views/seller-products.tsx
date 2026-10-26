"use client";

// Seller Hub — Products: searchable/filterable list of the seller's own listings.
// Full-screen dashboard with local shell (duplicated per-file by design).

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, ImageOff, Loader2, LogOut, Package, Plus, Search, Store } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo, EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api } from "@/lib/client/api";
import { formatINR } from "@/lib/money";
import { qs } from "@/lib/client/api";
import type { SellerProduct } from "@/lib/types";

// ── Layout (same pattern as seller-dashboard) ─────────────────────────────

const SELLER_TABS: { key: ViewName; label: string }[] = [
  { key: "seller", label: "Overview" },
  { key: "seller-products", label: "Products" },
  { key: "seller-orders", label: "Orders" },
  { key: "seller-returns", label: "Returns" },
  { key: "seller-finance", label: "Finance" },
];

function SellerShell({ active, children }: { active: ViewName; children: React.ReactNode }) {
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);
  const { user, refresh } = useSession();
  const [signingOut, setSigningOut] = useState(false);

  const signOut = async () => {
    setSigningOut(true);
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    await refresh();
    goHome();
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo onClick={goHome} />
            <span className="hidden h-6 w-px bg-border sm:block" />
            <span className="truncate text-sm font-semibold text-muted-foreground">Seller Hub · Products</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:block">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={goHome}>
              <Store size={14} className="sm:hidden" />
              <span className="hidden sm:inline">View store</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
              {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
        <nav className="border-t bg-background">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sk-scrollbar">
            {SELLER_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => navigate(t.key)}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  active === t.key
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

function SellerGate({ active, children }: { active: ViewName; children: React.ReactNode }) {
  const { user, loading } = useSession();
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);

  if (loading) {
    return (
      <SellerShell active={active}>
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </SellerShell>
    );
  }
  if (!user || user.role === "ADMIN" || user.role !== "SELLER" || user.sellerStatus !== "APPROVED") {
    return (
      <SellerShell active={active}>
        <div className="py-16">
          <EmptyState
            icon={<Package size={28} />}
            title={!user ? "Seller access required" : user.role === "ADMIN" ? "Access denied" : "Seller account required"}
            description={
              !user
                ? "Sign in with your seller account to manage your listings."
                : user.role === "ADMIN"
                  ? "This area is for marketplace sellers."
                  : `Your seller status is ${user.sellerStatus ?? "not registered"}. Open the onboarding page for details.`
            }
            action={
              !user ? (
                <Button className="mt-2" onClick={() => navigate("login")}>
                  Sign in
                </Button>
              ) : user.role === "ADMIN" ? (
                <Button variant="outline" className="mt-2" onClick={goHome}>
                  Back to home
                </Button>
              ) : (
                <Button className="mt-2" onClick={() => navigate("seller-onboarding")}>
                  Seller onboarding
                </Button>
              )
            }
          />
        </div>
      </SellerShell>
    );
  }
  return <>{children}</>;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "ACTIVE", label: "Active" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ARCHIVED", label: "Archived" },
];

type ProductsPage = { items: SellerProduct[]; total: number; page: number; totalPages: number };

// ── List ──────────────────────────────────────────────────────────────────

function ProductsList() {
  const navigate = useNav((s) => s.navigate);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const q = useDebounced(search);

  // Reset to page 1 whenever filters change (render-time state adjustment).
  const pageResetKey = `${status}|${q}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["seller-products", page, status, q],
    queryFn: () => api.get<ProductsPage>(`/api/seller/products${qs({ page, status: status || undefined, q: q || undefined })}`),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">My products</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} listing${data.total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <Button onClick={() => navigate("seller-product-form", {})}>
          <Plus size={16} /> Add product
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-background p-1 sk-scrollbar">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setStatus(t.key)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                status === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="pl-8"
            aria-label="Search products"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package size={28} />}
          title={search || status ? "No products match" : "No products yet"}
          description={
            search || status
              ? "Try a different search term or status filter."
              : "List your first product — it goes live as soon as our team approves it."
          }
          action={
            !search && !status ? (
              <Button className="mt-2" onClick={() => navigate("seller-product-form", {})}>
                <Plus size={16} /> Add your first product
              </Button>
            ) : undefined
          }
        />
      ) : (
        <>
          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {items.map((p) => (
              <Card
                key={p.id}
                className="cursor-pointer py-0 transition-shadow hover:shadow-md"
                onClick={() => navigate("seller-product-form", { id: p.id })}
              >
                <CardContent className="flex gap-3 p-3">
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                    {p.images[0] ? (
                       
                      <img src={p.images[0]} alt={p.name} className="h-full w-full object-contain" loading="lazy" />
                    ) : (
                      <ImageOff size={18} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-sm font-medium">{p.name}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.categoryName}</p>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={p.status} />
                      <Badge variant="secondary">{p.variants.length} variant{p.variants.length === 1 ? "" : "s"}</Badge>
                    </div>
                    {p.status === "REJECTED" && p.moderationNote && (
                      <p className="mt-1 text-xs text-rose-600">Note: {p.moderationNote}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Desktop table */}
          <Card className="hidden py-0 md:block">
            <CardContent className="p-0">
              <div className={`overflow-x-auto ${isFetching ? "opacity-70" : ""}`}>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="min-w-64">Product</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Variants</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((p) => {
                      const prices = p.variants.map((v) => v.price);
                      const min = prices.length ? Math.min(...prices) : 0;
                      const max = prices.length ? Math.max(...prices) : 0;
                      const stock = p.variants.reduce((s, v) => s + v.onHand, 0);
                      return (
                        <TableRow
                          key={p.id}
                          className="cursor-pointer"
                          onClick={() => navigate("seller-product-form", { id: p.id })}
                        >
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                                {p.images[0] ? (
                                   
                                  <img src={p.images[0]} alt={p.name} className="h-full w-full object-contain" loading="lazy" />
                                ) : (
                                  <ImageOff size={16} className="text-muted-foreground" />
                                )}
                              </div>
                              <div className="min-w-0">
                                <p className="max-w-72 truncate font-medium">{p.name}</p>
                                {p.status === "REJECTED" && p.moderationNote && (
                                  <p className="max-w-72 truncate text-xs text-rose-600" title={p.moderationNote}>
                                    Rejected: {p.moderationNote}
                                  </p>
                                )}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground">{p.categoryName}</TableCell>
                          <TableCell>
                            <StatusBadge status={p.status} />
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {min === max ? formatINR(min) : `${formatINR(min)} – ${formatINR(max)}`}
                          </TableCell>
                          <TableCell className={`text-right font-medium ${stock === 0 ? "text-rose-600" : ""}`}>{stock}</TableCell>
                          <TableCell className="text-right">{p.variants.length}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Pagination */}
          {data && data.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">
                Page {data.page} of {data.totalPages}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
                  <ChevronLeft size={14} /> Prev
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.totalPages || isFetching}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function SellerProductsView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <SellerGate active="seller-products">
      <ProductsList />
    </SellerGate>
  );
}
