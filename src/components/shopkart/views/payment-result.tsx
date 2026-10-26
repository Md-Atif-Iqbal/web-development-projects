"use client";

// Payment result — success (paid / COD confirm), failed, and cancelled states.

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { CheckCircle2, XCircle, AlertTriangle, Package, Home, RotateCcw, Ban, Loader2, Banknote } from "lucide-react";
import { addDays, format } from "date-fns";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { formatINR } from "@/lib/money";
import type { OrderView } from "@/lib/types";
import { EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

const CANCELLABLE = new Set(["PENDING_PAYMENT", "CONFIRMED", "PROCESSING"]);

export default function PaymentResultView(_props: { params?: Record<string, string>; mode?: string }) {
  const { params = {} } = _props;
  const orderId = params.orderId ?? "";
  const status = params.status ?? "";
  const confirm = params.confirm ?? "";
  const navigate = useNav((s) => s.navigate);
  const [cancelling, setCancelling] = useState(false);

  const { data: order, isLoading, isError, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => api.get<OrderView>(`/api/orders/${orderId}`),
    enabled: !!orderId,
  });

  // Latest retryable payment (PENDING or FAILED) for the retry link.
  const retryPayment = useMemo(() => {
    if (!order) return null;
    const candidates = order.payments.filter((p) => p.status === "PENDING" || p.status === "FAILED");
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  }, [order]);

  const cancelOrder = async () => {
    if (!order) return;
    setCancelling(true);
    try {
      await api.post(`/api/orders/${order.id}/cancel`, { reason: "Payment failed" });
      toast.success("Order cancelled");
      navigate("orders");
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not cancel order");
    } finally {
      setCancelling(false);
    }
  };

  if (!orderId) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState icon={<AlertTriangle size={26} />} title="Missing order reference" action={<Button onClick={() => navigate("orders")}>My orders</Button>} />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-md space-y-3">
          <Skeleton className="mx-auto h-16 w-16 rounded-full" />
          <Skeleton className="h-7 w-2/3 mx-auto" />
          <Skeleton className="h-4 w-1/2 mx-auto" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      </div>
    );
  }

  if (isError || !order) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<AlertTriangle size={26} />}
          title="Couldn't load this order"
          action={<Button onClick={() => void refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  const isFailed = status === "failed";
  const isCancelled = status === "cancelled";
  const isCodConfirm = confirm === "1" || (order.paymentMethod === "COD" && order.status === "CONFIRMED");
  const isPaid = order.paymentStatus === "PAID";
  const expectedDelivery = format(addDays(new Date(order.placedAt), 5), "EEEE, dd MMM");

  // ── FAILED ──
  if (isFailed) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center animate-in zoom-in-50 duration-300">
          <XCircle size={56} className="mx-auto text-rose-600" />
          <h1 className="mt-3 text-2xl font-bold">Payment failed</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Order {order.orderNumber} · {formatINR(order.grandTotal)} — your items are reserved for a short while, so you can retry.
          </p>

          <div className="mt-6 space-y-2.5">
            {retryPayment ? (
              <Button size="lg" className="h-12 w-full gap-2" onClick={() => navigate("sandbox-payment", { paymentId: retryPayment.id, orderId: order.id })}>
                <RotateCcw size={16} /> Retry payment ({formatINR(order.grandTotal)})
              </Button>
            ) : order.status === "PENDING_PAYMENT" ? (
              <Button size="lg" className="h-12 w-full gap-2" onClick={() => navigate("order-detail", { id: order.id })}>
                <Package size={16} /> Review order & retry
              </Button>
            ) : (
              <Button size="lg" className="h-12 w-full gap-2" onClick={() => navigate("order-detail", { id: order.id })}>
                <Package size={16} /> View order
              </Button>
            )}
            {CANCELLABLE.has(order.status) && (
              <Button variant="ghost" className="w-full text-rose-600 hover:text-rose-700" onClick={() => void cancelOrder()} disabled={cancelling}>
                {cancelling && <Loader2 size={15} className="animate-spin" />} Cancel order
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => navigate("home")}>
              <Home size={15} /> Continue shopping
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── CANCELLED AT GATEWAY ──
  if (isCancelled) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center animate-in zoom-in-50 duration-300">
          <AlertTriangle size={56} className="mx-auto text-amber-500" />
          <h1 className="mt-3 text-2xl font-bold">Payment cancelled</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            You closed the gateway before completing payment for {order.orderNumber}. No money was charged.
          </p>
          <div className="mt-6 space-y-2.5">
            {retryPayment && (
              <Button size="lg" className="h-12 w-full gap-2" onClick={() => navigate("sandbox-payment", { paymentId: retryPayment.id, orderId: order.id })}>
                <RotateCcw size={16} /> Try paying again
              </Button>
            )}
            <Button variant="outline" className="w-full" onClick={() => navigate("order-detail", { id: order.id })}>
              <Package size={15} /> View order
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate("home")}>
              <Home size={15} /> Continue shopping
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── SUCCESS (PAID) ──
  if (isPaid) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center animate-in zoom-in-50 duration-300">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
            <CheckCircle2 size={52} className="text-emerald-600" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Order confirmed!</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Thank you — payment of <strong className="text-foreground">{formatINR(order.grandTotal)}</strong> received.
          </p>

          <dl className="mt-5 space-y-2 rounded-xl bg-muted/50 p-4 text-left text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Order number</dt>
              <dd className="font-mono font-semibold">{order.orderNumber}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Amount paid</dt>
              <dd className="font-semibold">{formatINR(order.grandTotal)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Payment</dt>
              <dd className="font-semibold">{order.paymentMethod} {order.payments[0]?.sandbox && <span className="text-[10px] font-normal text-amber-700 dark:text-amber-400">(sandbox)</span>}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Expected delivery</dt>
              <dd className="font-semibold text-emerald-700 dark:text-emerald-400">{expectedDelivery}</dd>
            </div>
          </dl>

          <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Button size="lg" onClick={() => navigate("order-detail", { id: order.id })}>
              <Package size={16} /> View order
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("home")}>
              <Home size={16} /> Continue shopping
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── COD CONFIRM ──
  if (isCodConfirm) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center animate-in zoom-in-50 duration-300">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
            <CheckCircle2 size={52} className="text-emerald-600" />
          </div>
          <h1 className="mt-4 text-2xl font-bold">Order placed!</h1>
          <span className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1.5 text-sm font-bold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
            <Banknote size={16} /> Pay {formatINR(order.grandTotal)} on delivery
          </span>
          <p className="mt-3 text-sm text-muted-foreground">
            Order {order.orderNumber} is confirmed. Keep {formatINR(order.grandTotal)} ready — expected delivery {expectedDelivery}.
          </p>
          <div className="mt-6 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <Button size="lg" onClick={() => navigate("order-detail", { id: order.id })}>
              <Package size={16} /> View order
            </Button>
            <Button size="lg" variant="outline" onClick={() => navigate("home")}>
              <Home size={16} /> Continue shopping
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Generic / pending fallback ──
  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
        <AlertTriangle size={48} className="mx-auto text-amber-500" />
        <h1 className="mt-3 text-xl font-bold">Order {order.orderNumber}</h1>
        <p className="mt-1 text-sm text-muted-foreground">Payment is {order.paymentStatus.toLowerCase()} for this order.</p>
        <div className="mt-3 flex items-center justify-center gap-2">
          <StatusBadge status={order.status} />
          <StatusBadge status={order.paymentStatus} />
        </div>
        <div className="mt-6 space-y-2.5">
          {retryPayment && (
            <Button size="lg" className="h-12 w-full gap-2" onClick={() => navigate("sandbox-payment", { paymentId: retryPayment.id, orderId: order.id })}>
              <RotateCcw size={16} /> Complete payment ({formatINR(order.grandTotal)})
            </Button>
          )}
          <Button variant="outline" className="w-full" onClick={() => navigate("order-detail", { id: order.id })}>
            <Package size={15} /> View order details
          </Button>
          <Button variant="ghost" className="w-full" onClick={() => navigate("home")}>
            <Home size={15} /> Continue shopping
          </Button>
        </div>
      </div>
    </div>
  );
}
