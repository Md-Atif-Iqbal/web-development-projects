"use client";

// Orders — paginated order history with status filter tabs.

import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { Package, PackageX, ChevronRight } from "lucide-react";
import { api, qs } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import { formatINR } from "@/lib/money";
import type { OrderView } from "@/lib/types";
import { EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const IN_PROGRESS = new Set(["PENDING_PAYMENT", "CONFIRMED", "PROCESSING", "PACKED", "SHIPPED", "OUT_FOR_DELIVERY", "DELIVERY_FAILED"]);

const TABS = [
  { value: "all", label: "All" },
  { value: "progress", label: "In progress" },
  { value: "DELIVERED", label: "Delivered" },
  { value: "CANCELLED", label: "Cancelled" },
] as const;

type Tab = (typeof TABS)[number]["value"];

export default function OrdersView(_props: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  const { user, loading: sessionLoading } = useSession();
  const [tab, setTab] = useState<Tab>("all");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;

  const serverStatus = tab === "DELIVERED" || tab === "CANCELLED" ? tab : undefined;

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["orders", { tab, page }],
    queryFn: () => api.get<{ items: OrderView[]; total: number; page: number; pageSize: number; totalPages: number }>(
      `/api/orders${qs({ page, pageSize: PAGE_SIZE, status: serverStatus })}`
    ),
    enabled: !!user,
    placeholderData: keepPreviousData,
  });

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-3 px-4 py-6 sm:px-6">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<Package size={28} />}
          title="Please sign in"
          description="Sign in to see your orders and their live status."
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
          title="Couldn't load your orders"
          action={<Button onClick={() => void refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  const allItems = data?.items ?? [];
  const items = tab === "progress" ? allItems.filter((o) => IN_PROGRESS.has(o.status)) : allItems;
  const total = data?.total ?? 0;
  const totalPages = data?.totalPages ?? 1;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <h1 className="mb-4 text-xl font-bold tracking-tight sm:text-2xl">My Orders</h1>

      {/* Status tabs */}
      <div className="mb-5 flex gap-1.5 overflow-x-auto pb-1 sk-scrollbar" role="tablist" aria-label="Filter orders by status">
        {TABS.map((t) => (
          <button
            key={t.value}
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => {
              setTab(t.value);
              setPage(1);
            }}
            className={`min-h-10 whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.value ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32 w-full rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Package size={28} />}
          title={tab === "all" ? "No orders yet" : `No ${TABS.find((t) => t.value === tab)?.label.toLowerCase()} orders`}
          description="When you place an order it will show up here with live tracking."
          action={<Button size="lg" onClick={() => navigate("home")}>Start shopping</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((order) => {
            const thumbs = order.items.slice(0, 4);
            const extra = order.items.length - thumbs.length;
            return (
              <div key={order.id} className="rounded-xl border bg-card p-4 transition-shadow hover:shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-bold">{order.orderNumber}</p>
                    <p className="text-xs text-muted-foreground">Placed on {format(new Date(order.placedAt), "dd MMM yyyy")}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={order.status} />
                    <StatusBadge status={order.paymentStatus} />
                    <span className="text-[11px] text-muted-foreground">{order.paymentMethod === "COD" ? "COD" : order.paymentMethod}</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {thumbs.map((it) => (
                      <div key={it.id} className="h-12 w-12 shrink-0 overflow-hidden rounded-lg border bg-white p-1 dark:bg-neutral-950">
                        {it.image ? <img src={it.image} alt="" className="h-full w-full object-contain" /> : <Package size={14} className="mx-auto text-muted-foreground" />}
                      </div>
                    ))}
                    {extra > 0 && <span className="text-xs font-medium text-muted-foreground">+{extra} more</span>}
                  </div>
                  <div className="text-right">
                    <p className="text-base font-extrabold">{formatINR(order.grandTotal)}</p>
                    <p className="text-[11px] text-muted-foreground">{order.items.length} item{order.items.length === 1 ? "" : "s"}</p>
                  </div>
                </div>

                <div className="mt-3 flex justify-end border-t pt-3">
                  <Button variant="outline" size="sm" className="gap-1" onClick={() => navigate("order-detail", { id: order.id })}>
                    View details <ChevronRight size={14} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {!isLoading && items.length > 0 && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-3">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">Page {page} of {totalPages}</span>
          <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage((p) => Math.min(totalPages, p + 1))}>
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
