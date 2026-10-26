"use client";

// Seller Hub — Orders: fulfillment pipeline (PROCESSING → PACKED → SHIPPED),
// cancel before dispatch, tracking chips. Full-screen dashboard shell.

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  LogOut,
  MapPin,
  Package,
  PackageCheck,
  SearchCheck,
  ShoppingBag,
  Store,
  Truck,
  XCircle,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { BrandLogo, EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, ApiClientError, qs } from "@/lib/client/api";
import { formatINR } from "@/lib/money";
import { canTransition, FULFILLMENT_STATUS_FLOW } from "@/lib/constants";
import type { AddressView, OrderItemView } from "@/lib/types";

// ── Layout (same per-file pattern) ────────────────────────────────────────

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
            <span className="truncate text-sm font-semibold text-muted-foreground">Seller Hub · Orders</span>
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

function SellerGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);
  if (loading) {
    return (
      <SellerShell active="seller-orders">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      </SellerShell>
    );
  }
  if (!user || user.role !== "SELLER" || user.sellerStatus !== "APPROVED") {
    return (
      <SellerShell active="seller-orders">
        <div className="py-16">
          <EmptyState
            icon={<ShoppingBag size={28} />}
            title={!user ? "Seller access required" : user.role === "ADMIN" ? "Access denied" : "Seller account required"}
            description={
              !user
                ? "Sign in with your seller account to manage orders."
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

// ── Types ─────────────────────────────────────────────────────────────────

type SellerFulfillment = {
  fulfillment: {
    id: string;
    status: string;
    itemsTotal: number;
    shippingFee: number;
    commissionAmount: number;
    sellerEarning: number;
    createdAt: string;
    updatedAt: string;
    trackingNumber: string | null;
  };
  order: { id: string; orderNumber: string; status: string; placedAt: string; paymentMethod: string; paymentStatus: string };
  address: Partial<AddressView>;
  items: OrderItemView[];
};

type OrdersPage = { items: SellerFulfillment[]; total: number; page: number; totalPages: number };

const STATUS_TABS = ["", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERED", "CANCELLED"];

const NEXT_STEP: Record<string, { next: string; label: string; icon: React.ComponentType<{ size?: number }> }> = {
  CONFIRMED: { next: "PROCESSING", label: "Start processing", icon: SearchCheck },
  PROCESSING: { next: "PACKED", label: "Mark packed", icon: PackageCheck },
  PACKED: { next: "SHIPPED", label: "Ship package", icon: Truck },
};

const CANCELLABLE = ["CONFIRMED", "PROCESSING", "PACKED"];

// ── Order card ────────────────────────────────────────────────────────────

function OrderCard({ row }: { row: SellerFulfillment }) {
  const qc = useQueryClient();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const f = row.fulfillment;
  const order = row.order;
  const step = NEXT_STEP[f.status];
  const canAct = step ? canTransition(FULFILLMENT_STATUS_FLOW, f.status, step.next) : false;
  const canCancel = CANCELLABLE.includes(f.status);

  const mutation = useMutation({
    mutationFn: (status: string) => api.patch<{ fulfillment: { trackingNumber: string | null } | null }>(`/api/seller/orders/${f.id}`, { status }),
    onSuccess: (res, status) => {
      const tn = res.fulfillment?.trackingNumber ?? null;
      if (status === "SHIPPED") {
        toast.success("Package shipped", {
          description: tn ? `Shipment tracking: ${tn}` : "Shipment created",
        });
      } else {
        toast.success(`Marked ${status.toLowerCase().replaceAll("_", " ")}`);
      }
      qc.invalidateQueries({ queryKey: ["seller-orders"] });
      qc.invalidateQueries({ queryKey: ["seller-dashboard"] });
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update fulfillment");
    },
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        {/* Header row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">#{order.orderNumber}</p>
            <p className="text-xs text-muted-foreground">
              Placed {new Date(order.placedAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant="secondary">{order.paymentMethod}</Badge>
            <StatusBadge status={order.paymentStatus} />
            <StatusBadge status={f.status} />
          </div>
        </div>

        <Separator />

        {/* Items + address */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-muted-foreground">Items</p>
            {row.items.map((it) => (
              <p key={it.id} className="text-sm">
                {it.name}
                {it.variantName ? ` — ${it.variantName}` : ""} <span className="text-muted-foreground">× {it.qty}</span>
              </p>
            ))}
          </div>
          <div className="space-y-1">
            <p className="flex items-center gap-1 text-xs font-semibold text-muted-foreground">
              <MapPin size={12} /> Deliver to
            </p>
            <p className="text-sm">
              {row.address.city || "—"}
              {row.address.state ? `, ${row.address.state}` : ""} <span className="text-muted-foreground">{row.address.pincode}</span>
            </p>
          </div>
        </div>

        {/* Tracking */}
        {f.trackingNumber && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
            <Truck size={14} className="text-primary" />
            <span className="text-muted-foreground">Shipment tracking:</span>
            <span className="font-mono text-xs font-semibold">{f.trackingNumber}</span>
          </div>
        )}

        {/* Money + actions */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <span className="text-muted-foreground">
              Items <span className="font-semibold text-foreground">{formatINR(f.itemsTotal)}</span>
            </span>
            <span className="text-muted-foreground">
              Commission <span className="font-semibold text-rose-600">−{formatINR(f.commissionAmount)}</span>
            </span>
            <span className="text-muted-foreground">
              Earning <span className="font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(f.sellerEarning)}</span>
            </span>
          </div>
          <div className="flex gap-2">
            {canCancel && (
              <Button variant="outline" size="sm" onClick={() => setConfirmCancel(true)} disabled={mutation.isPending}>
                <XCircle size={14} /> Cancel
              </Button>
            )}
            {step && canAct && (
              <Button size="sm" onClick={() => mutation.mutate(step.next)} disabled={mutation.isPending}>
                {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <step.icon size={14} />}
                {step.label}
              </Button>
            )}
          </div>
        </div>
      </CardContent>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this fulfillment?</AlertDialogTitle>
            <AlertDialogDescription>
              Order #{order.orderNumber} will be cancelled and the stock returned to your inventory. This can only
              be done before the package is shipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => mutation.mutate("CANCELLED")}
            >
              Cancel fulfillment
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}

// ── List ──────────────────────────────────────────────────────────────────

function OrdersList() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  // Reset to page 1 whenever filters change (render-time state adjustment).
  const pageResetKey = `${status}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["seller-orders", page, status],
    queryFn: () => api.get<OrdersPage>(`/api/seller/orders${qs({ page, status: status || undefined })}`),
    placeholderData: undefined,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Orders to fulfill</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} fulfillment${data.total === 1 ? "" : "s"}` : "Loading…"} — process, pack and ship
          your packages.
        </p>
      </div>

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

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package size={28} />}
          title={status ? `No ${status.toLowerCase().replaceAll("_", " ")} fulfillments` : "No orders yet"}
          description={
            status
              ? "Try a different status filter."
              : "Once customers order your products, fulfillments will appear here for processing."
          }
        />
      ) : (
        <div className={`space-y-3 ${isFetching ? "opacity-80" : ""}`}>
          {items.map((row) => (
            <OrderCard key={row.fulfillment.id} row={row} />
          ))}
        </div>
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
    </div>
  );
}

export default function SellerOrdersView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <SellerGate>
      <SellerShell active="seller-orders">
        <OrdersList />
      </SellerShell>
    </SellerGate>
  );
}
