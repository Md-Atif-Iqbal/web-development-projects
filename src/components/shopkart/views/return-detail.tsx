"use client";

// Return detail — status timeline, items, refund info for one RMA request.

import { useQuery } from "@tanstack/react-query";
import { RotateCcw, CheckCircle2, Circle, XCircle, ArrowLeft, Package } from "lucide-react";
import { api } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import type { ReturnRequestView } from "@/lib/types";
import { formatINR } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { EmptyState, StatusBadge } from "@/components/shopkart/shared";

const TIMELINE = [
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PICKUP_SCHEDULED",
  "PICKED_UP",
  "INSPECTION_PENDING",
  "REFUND_INITIATED",
  "REFUND_COMPLETED",
] as const;

const REASON_LABELS: Record<string, string> = {
  DAMAGED_OR_DEFECTIVE: "Damaged or defective",
  WRONG_ITEM_DELIVERED: "Wrong item delivered",
  SIZE_OR_FIT_ISSUE: "Size or fit issue",
  NOT_AS_DESCRIBED: "Item not as described",
  CHANGED_MIND: "Changed my mind",
  QUALITY_ISSUE: "Quality issue",
  OTHER: "Other",
};

export default function ReturnDetailView({ params }: { params?: Record<string, string> }) {
  const navigate = useNav((s) => s.navigate);
  const back = useNav((s) => s.back);
  const { user, loading: sessionLoading } = useSession();
  const id = params?.id ?? "";

  const { data: ret, isLoading, isError } = useQuery({
    queryKey: ["return", id],
    queryFn: () => api.get<ReturnRequestView>(`/api/returns/${id}`),
    enabled: !!user && !!id,
  });

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<RotateCcw size={28} />}
          title="Please sign in"
          description="Sign in to view your return requests."
          action={<Button onClick={() => navigate("login")}>Sign in</Button>}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-6">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (isError || !ret) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<XCircle size={28} />}
          title="Return request not found"
          description="It may have been removed or you may not have access to it."
          action={<Button onClick={() => navigate("returns")}>All returns</Button>}
        />
      </div>
    );
  }

  const rejectedOrClosed = ["REJECTED", "CLOSED"].includes(ret.status);
  const currentIdx = TIMELINE.indexOf(ret.status as (typeof TIMELINE)[number]);
  const exchangeFlow = ret.type === "EXCHANGE";

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <button onClick={back} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Back
      </button>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold tracking-tight">{ret.rmaNumber}</h1>
          <p className="text-sm text-muted-foreground">
            {exchangeFlow ? "Exchange" : "Return"} for order #{ret.orderNumber} · raised {new Date(ret.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
          </p>
        </div>
        <StatusBadge status={ret.status} />
      </div>

      {/* Status timeline */}
      <Card className="mb-4 py-0">
        <CardHeader className="py-4">
          <CardTitle className="text-base">Progress</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          {rejectedOrClosed ? (
            <div className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${ret.status === "REJECTED" ? "border-rose-200 bg-rose-50 text-rose-800" : "border-neutral-200 bg-muted text-muted-foreground"}`}>
              {ret.status === "REJECTED" ? <XCircle size={18} className="mt-0.5 shrink-0" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0" />}
              <div>
                <p className="font-semibold">{ret.status === "REJECTED" ? "Request rejected" : "Request closed"}</p>
                {ret.decisionNote && <p className="mt-0.5 text-xs">{ret.decisionNote}</p>}
              </div>
            </div>
          ) : (
            <ol className="relative ml-3 space-y-4 border-l pl-6">
              {TIMELINE.map((step, i) => {
                const done = i <= currentIdx;
                const isLast = i === TIMELINE.length - 1;
                return (
                  <li key={step} className="relative">
                    <span className={`absolute -left-[31px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full ${done ? "bg-emerald-600 text-white" : "border border-neutral-300 bg-white text-neutral-300"}`}>
                      {done ? <CheckCircle2 size={14} /> : <Circle size={10} />}
                    </span>
                    <p className={`text-sm ${done ? "font-semibold" : "text-muted-foreground"}`}>
                      {step.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    {done && i === currentIdx && (
                      <p className="text-xs text-muted-foreground">Current stage</p>
                    )}
                    {!done && i === currentIdx + 1 && !isLast && (
                      <p className="text-xs text-muted-foreground">Up next</p>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
        </CardContent>
      </Card>

      {/* Items */}
      <Card className="mb-4 py-0">
        <CardHeader className="py-4">
          <CardTitle className="text-base">Items ({ret.items.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 pb-5">
          {ret.items.map((item) => (
            <div key={item.id} className="flex items-center gap-3">
              <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg border bg-neutral-50">
                {item.image ? (
                   
                  <img src={item.image} alt={item.productName} className="h-full w-full object-contain p-1" />
                ) : (
                  <div className="flex h-full items-center justify-center text-muted-foreground"><Package size={18} /></div>
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{item.productName}</p>
                <p className="text-xs text-muted-foreground">Qty {item.qty} · {REASON_LABELS[item.reason] ?? item.reason}</p>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Reason + description */}
      <Card className="mb-4 py-0">
        <CardHeader className="py-4">
          <CardTitle className="text-base">Request details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 pb-5 text-sm">
          <div className="grid grid-cols-[130px_1fr] gap-y-2">
            <span className="text-muted-foreground">Reason</span>
            <span>{REASON_LABELS[ret.reason] ?? ret.reason}</span>
            <span className="text-muted-foreground">Type</span>
            <span>{exchangeFlow ? "Exchange" : "Return & refund"}</span>
            {ret.description && (
              <>
                <span className="text-muted-foreground">Description</span>
                <span>{ret.description}</span>
              </>
            )}
            <span className="text-muted-foreground">Refund mode</span>
            <span>{ret.refundMode === "BANK_TRANSFER" ? "Bank transfer (COD order)" : "Original payment method"}</span>
          </div>
        </CardContent>
      </Card>

      {/* Refund */}
      <Card className="py-0">
        <CardHeader className="py-4">
          <CardTitle className="text-base">Refund</CardTitle>
        </CardHeader>
        <CardContent className="pb-5">
          {ret.refund ? (
            <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <div>
                <p className="text-sm font-semibold text-emerald-800">{formatINR(ret.refund.amount)}</p>
                <p className="text-xs text-emerald-700">
                  {ret.refund.mode === "BANK_TRANSFER" ? "Bank transfer" : "To original payment method"} · Refund {ret.refund.status.toLowerCase()}
                </p>
              </div>
              <StatusBadge status={ret.refund.status === "COMPLETED" ? "REFUND_COMPLETED" : "REFUND_INITIATED"} />
            </div>
          ) : ret.status === "REJECTED" ? (
            <p className="text-sm text-muted-foreground">No refund — request was rejected.</p>
          ) : (
            <div className="flex items-center justify-between rounded-lg border bg-muted/40 p-3">
              <div>
                <p className="text-sm font-semibold">{formatINR(ret.refundAmount)} <span className="text-xs font-normal text-muted-foreground">expected</span></p>
                <p className="text-xs text-muted-foreground">Refund is initiated after quality inspection.</p>
              </div>
              <Badge variant="outline" className="text-muted-foreground">Pending</Badge>
            </div>
          )}
          {ret.decisionNote && !rejectedOrClosed && (
            <p className="mt-2 rounded-lg border bg-muted/40 p-2.5 text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Note from our team: </span>{ret.decisionNote}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
