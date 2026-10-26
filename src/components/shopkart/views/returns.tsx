"use client";

// Returns — list of the user's return/exchange requests with an explainer.

import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { RotateCcw, PackageX, ChevronRight, Package, ClipboardList, Truck, SearchCheck, IndianRupee } from "lucide-react";
import { api } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import { formatINR } from "@/lib/money";
import type { ReturnRequestView } from "@/lib/types";
import { EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";

const HOW_IT_WORKS = [
  { icon: ClipboardList, title: "Request it", desc: `Pick an item from a delivered order and tell us why — within the return window.` },
  { icon: Truck, title: "Pickup at home", desc: "Once approved, a courier collects the item from your address." },
  { icon: SearchCheck, title: "Quality check", desc: "The seller inspects the item after pickup and approves the refund." },
  { icon: IndianRupee, title: "Refund", desc: "Money goes back to your original payment method (bank transfer for COD)." },
];

export default function ReturnsView(_props: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  const { user, loading: sessionLoading } = useSession();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["returns"],
    queryFn: () => api.get<{ items: ReturnRequestView[] }>("/api/returns"),
    enabled: !!user,
  });

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-3 px-4 py-6 sm:px-6">
        {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<RotateCcw size={28} />}
          title="Please sign in"
          description="Sign in to view your return and exchange requests."
          action={<Button size="lg" onClick={() => navigate("login")}>Sign in</Button>}
        />
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 sm:px-6">
      <h1 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">My Returns</h1>

      {isError ? (
        <EmptyState icon={<PackageX size={26} />} title="Couldn't load returns" action={<Button onClick={() => void refetch()}>Retry</Button>} />
      ) : isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<RotateCcw size={28} />}
          title="No return requests"
          description="If something isn't right with a delivered order, raise a return from the order details page."
          action={<Button size="lg" onClick={() => navigate("orders")}>View my orders</Button>}
        />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <button
              key={r.id}
              onClick={() => navigate("return-detail", { id: r.id })}
              className="block w-full rounded-xl border bg-card p-4 text-left transition-shadow hover:shadow-sm"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-mono text-sm font-bold">{r.rmaNumber}</p>
                  <p className="text-xs text-muted-foreground">
                    Order {r.orderNumber} · {format(new Date(r.createdAt), "dd MMM yyyy")}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className="text-[10px]">{r.type}</Badge>
                  <StatusBadge status={r.status} />
                  <ChevronRight size={15} className="text-muted-foreground" />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {r.items.slice(0, 3).map((it) => (
                    <div key={it.id} className="h-11 w-11 shrink-0 overflow-hidden rounded-lg border bg-white p-1 dark:bg-neutral-950">
                      {it.image ? <img src={it.image} alt="" className="h-full w-full object-contain" /> : <Package size={13} className="mx-auto text-muted-foreground" />}
                    </div>
                  ))}
                  <span className="text-xs text-muted-foreground">{r.items.length} item{r.items.length === 1 ? "" : "s"}</span>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold">{formatINR(r.refundAmount)}</p>
                  <p className="text-[11px] text-muted-foreground">{r.refundMode === "BANK_TRANSFER" ? "Bank transfer" : "Original payment"}</p>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* How returns work */}
      <section className="mt-8 rounded-2xl border bg-card p-5">
        <h2 className="mb-4 text-base font-bold">How returns work</h2>
        <div className="grid gap-4 sm:grid-cols-4">
          {HOW_IT_WORKS.map((s, i) => (
            <div key={s.title} className="relative flex flex-col gap-2">
              <span className="absolute -left-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">{i + 1}</span>
              <span className="w-fit rounded-lg bg-primary/10 p-2 text-primary"><s.icon size={18} /></span>
              <p className="text-sm font-semibold">{s.title}</p>
              <p className="text-xs leading-relaxed text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
