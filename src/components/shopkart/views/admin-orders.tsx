"use client";

// Admin Console — Orders: platform-wide order table with a detail sheet
// (address, items + sellers, status timeline, payments) and sandbox shipment
// advancing. Full-screen dashboard shell.

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  History,
  Loader2,
  LogOut,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo, EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, ApiClientError, qs } from "@/lib/client/api";
import { formatINR } from "@/lib/money";
import type { OrderView } from "@/lib/types";

// ── Layout (replicated per-file by design) ────────────────────────────────

const ADMIN_TABS: { key: ViewName; label: string }[] = [
  { key: "admin", label: "Dashboard" },
  { key: "admin-sellers", label: "Sellers" },
  { key: "admin-products", label: "Products" },
  { key: "admin-orders", label: "Orders" },
  { key: "admin-payments", label: "Payments" },
  { key: "admin-returns", label: "Returns" },
  { key: "admin-catalog", label: "Catalog" },
  { key: "admin-users", label: "Users" },
  { key: "admin-support", label: "Support" },
  { key: "admin-audit", label: "Audit" },
];

function AdminShell({ active, children }: { active: ViewName; children: React.ReactNode }) {
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
            <span className="truncate text-sm font-semibold text-muted-foreground">Admin Console · Orders</span>
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
            {ADMIN_TABS.map((t) => (
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

function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);
  if (loading) {
    return (
      <AdminShell active="admin-orders">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AdminShell>
    );
  }
  if (!user || user.role !== "ADMIN") {
    return (
      <AdminShell active="admin-orders">
        <div className="py-16">
          <EmptyState
            icon={<ShieldCheck size={28} />}
            title={!user ? "Admin sign-in required" : "Access denied"}
            description={
              !user
                ? "Please sign in with an administrator account."
                : "Your account does not have administrator privileges."
            }
            action={
              !user ? (
                <Button className="mt-2" onClick={() => navigate("login")}>
                  Sign in
                </Button>
              ) : (
                <Button variant="outline" className="mt-2" onClick={goHome}>
                  Back to home
                </Button>
              )
            }
          />
        </div>
      </AdminShell>
    );
  }
  return <>{children}</>;
}

// ── Types & helpers ───────────────────────────────────────────────────────

type AdminOrderRow = {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  itemsTotal: number;
  grandTotal: number;
  placedAt: string;
  deliveredAt: string | null;
  user: { name: string; email: string };
  itemCount: number;
};

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const STATUS_TABS = [
  "",
  "CONFIRMED",
  "PROCESSING",
  "SHIPPED",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
  "PENDING_PAYMENT",
];

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

// ── Order detail sheet ────────────────────────────────────────────────────

function OrderSheet({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [advancing, setAdvancing] = useState<string | null>(null);

  const { data: order, isLoading } = useQuery({
    queryKey: ["admin-order", orderId],
    queryFn: () => api.get<OrderView>(`/api/orders/${orderId}`),
  });

  const advance = useMutation({
    mutationFn: (trackingNumber: string) =>
      api.post<{ tracking: { status: string } }>(`/api/admin/shipments/${trackingNumber}/advance`, {}),
    onMutate: (tn) => setAdvancing(tn),
    onSuccess: (res) => {
      toast.success(`Shipment advanced — ${res.tracking.status.replaceAll("_", " ").toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["admin-order", orderId] });
      qc.invalidateQueries({ queryKey: ["admin-orders"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not advance shipment");
    },
    onSettled: () => setAdvancing(null),
  });

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg sk-scrollbar">
        <SheetHeader>
          <SheetTitle className="flex flex-wrap items-center gap-2">
            #{order?.orderNumber ?? orderId} {order && <StatusBadge status={order.status} />}
          </SheetTitle>
          <SheetDescription>
            {order ? `Placed ${fmtDate(order.placedAt)} · ${order.paymentMethod} · ${formatINR(order.grandTotal)}` : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        {isLoading || !order ? (
          <div className="space-y-3 px-4 pb-8">
            <Skeleton className="h-24 rounded-lg" />
            <Skeleton className="h-40 rounded-lg" />
            <Skeleton className="h-32 rounded-lg" />
          </div>
        ) : (
          <div className="space-y-5 px-4 pb-8">
            {/* Address */}
            <div className="rounded-lg border p-3 text-sm">
              <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Delivery address</p>
              <p className="font-medium">{order.address.fullName}</p>
              <p className="text-muted-foreground">{order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}</p>
              <p className="text-muted-foreground">
                {order.address.city}, {order.address.state} — {order.address.pincode}
              </p>
              <p className="text-muted-foreground">Phone: {order.address.phone}</p>
            </div>

            {/* Items */}
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Items ({order.items.length})
              </p>
              <div className="space-y-2">
                {order.items.map((it) => (
                  <div key={it.id} className="rounded-lg border p-3 text-sm">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{it.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {it.sellerName} · {it.variantName ?? it.sku} · qty {it.qty}
                        </p>
                      </div>
                      <p className="shrink-0 font-semibold">{formatINR(it.lineTotal)}</p>
                    </div>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={it.status} />
                      {it.trackingNumber && (
                        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">{it.trackingNumber}</span>
                      )}
                      {it.trackingNumber && it.fulfillmentStatus !== "DELIVERED" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-auto h-7"
                          disabled={advance.isPending}
                          onClick={() => advance.mutate(it.trackingNumber as string)}
                        >
                          {advancing === it.trackingNumber ? <Loader2 size={12} className="animate-spin" /> : <Truck size={12} />}
                          Advance shipment
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-2 space-y-1 text-right text-sm text-muted-foreground">
                <p>
                  Items {formatINR(order.itemsTotal)} · Shipping {formatINR(order.shippingTotal)}
                  {order.couponDiscount > 0 ? ` · Coupon −${formatINR(order.couponDiscount)}` : ""}
                </p>
                <p className="font-semibold text-foreground">Grand total {formatINR(order.grandTotal)}</p>
              </div>
            </div>

            <Separator />

            {/* Timeline */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <History size={12} /> Status history
              </p>
              <ol className="space-y-2">
                {order.statusHistory.map((h, i) => (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                    <StatusBadge status={h.status} />
                    <span className="text-muted-foreground">{fmtDate(h.at)}</span>
                    {h.note && <span className="text-xs text-muted-foreground">({h.note})</span>}
                  </li>
                ))}
              </ol>
            </div>

            {/* Payments */}
            <div>
              <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <CircleDollarSign size={12} /> Payments
              </p>
              {order.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No payment records.</p>
              ) : (
                <div className="space-y-2">
                  {order.payments.map((p) => (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
                      <div>
                        <p className="font-medium">
                          {formatINR(p.amount)} · {p.method}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {p.provider} {p.sandbox ? "(sandbox)" : ""} · {fmtDate(p.createdAt)}
                          {p.providerRef ? ` · ref ${p.providerRef}` : ""}
                        </p>
                        {p.failureReason && <p className="text-xs text-rose-600">Failed: {p.failureReason}</p>}
                      </div>
                      <StatusBadge status={p.status} />
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ── List ──────────────────────────────────────────────────────────────────

function OrdersList() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const q = useDebounced(search);

  // Reset to page 1 whenever filters change (render-time state adjustment).
  const pageResetKey = `${status}|${q}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-orders", page, status, q],
    queryFn: () => api.get<{ items: AdminOrderRow[]; total: number; page: number; totalPages: number }>(
      `/api/admin/orders${qs({ page, status: status || undefined, q: q || undefined })}`
    ),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Orders</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} order${data.total === 1 ? "" : "s"}` : "Loading…"} — inspect details and advance
          sandbox shipments.
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-background p-1 sk-scrollbar">
          {STATUS_TABS.map((key) => (
            <button
              key={key || "all"}
              onClick={() => setStatus(key)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                status === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {key ? key.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "All"}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search order number…"
            className="pl-8"
            aria-label="Search orders"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<ShoppingBag size={28} />} title="No orders found" description="Try a different status or search term." />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className={`overflow-x-auto ${isFetching ? "opacity-70" : ""}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Items</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="hidden md:table-cell">Payment</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Placed</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((o) => (
                    <TableRow key={o.id} className="cursor-pointer" onClick={() => setSelected(o.id)}>
                      <TableCell className="font-medium">#{o.orderNumber}</TableCell>
                      <TableCell>
                        <p className="text-sm font-medium">{o.user.name}</p>
                        <p className="max-w-44 truncate text-xs text-muted-foreground">{o.user.email}</p>
                      </TableCell>
                      <TableCell className="hidden text-right sm:table-cell">{o.itemCount}</TableCell>
                      <TableCell className="text-right font-semibold">{formatINR(o.grandTotal)}</TableCell>
                      <TableCell className="hidden md:table-cell">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-xs font-medium">{o.paymentMethod}</span>
                          <StatusBadge status={o.paymentStatus} />
                        </div>
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={o.status} />
                      </TableCell>
                      <TableCell className="hidden text-right text-sm text-muted-foreground lg:table-cell">{fmtDate(o.placedAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      {selected && <OrderSheet orderId={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

export default function AdminOrdersView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <AdminGate>
      <AdminShell active="admin-orders">
        <OrdersList />
      </AdminShell>
    </AdminGate>
  );
}
