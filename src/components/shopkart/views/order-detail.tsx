"use client";

// Order detail — status timeline, payment & address cards, items with tracking,
// returns dialog, cancellation and printable invoice.

import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format, formatDistanceToNow, differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import {
  Package, ChevronDown, ChevronUp, Truck, MapPin, CreditCard, FileDown, Printer,
  Loader2, AlertTriangle, Ban, RotateCcw, CheckCheck,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { formatINR } from "@/lib/money";
import type { OrderView, OrderItemView, TrackingView, ReturnRequestView } from "@/lib/types";
import { EmptyState, StatusBadge, SandboxNotice } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const CANCELLABLE = new Set(["PENDING_PAYMENT", "CONFIRMED", "PROCESSING"]);

const RETURN_REASON_LABELS: Record<string, string> = {
  DAMAGED_OR_DEFECTIVE: "Damaged or defective",
  WRONG_ITEM_DELIVERED: "Wrong item delivered",
  SIZE_OR_FIT_ISSUE: "Size or fit issue",
  NOT_AS_DESCRIBED: "Item not as described",
  CHANGED_MIND: "Changed my mind",
  QUALITY_ISSUE: "Quality issue",
  OTHER: "Other",
};

// ── Status timeline ──────────────────────────────────────────────────────────

function StatusTimeline({ history }: { history: OrderView["statusHistory"] }) {
  if (history.length === 0) return null;
  return (
    <ol className="space-y-0">
      {history.map((h, i) => {
        const isLast = i === history.length - 1;
        const color = isLast ? "bg-primary" : "bg-emerald-500";
        return (
          <li key={i} className="relative flex gap-3 pb-5 last:pb-0">
            {i < history.length - 1 && <span className="absolute left-[7px] top-4 h-full w-0.5 bg-border" aria-hidden />}
            <span className={`relative z-10 mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${color}`}>
              {isLast && <CheckCheck size={10} className="text-white" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{h.status.replaceAll("_", " ")}</p>
              <p className="text-xs text-muted-foreground">
                {formatDistanceToNow(new Date(h.at), { addSuffix: true })}
                {h.note ? ` · ${h.note}` : ""}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ── Tracking panel ───────────────────────────────────────────────────────────

function TrackingPanel({ trackingNumber }: { trackingNumber: string }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["tracking", trackingNumber],
    queryFn: () => api.get<TrackingView>(`/api/tracking/${trackingNumber}`),
    staleTime: 30_000,
  });

  if (isLoading) return <div className="mt-2 h-24 animate-pulse rounded-lg bg-muted/50" />;
  if (isError || !data) return <p className="mt-2 text-xs text-rose-600">Could not load tracking details.</p>;

  return (
    <div className="mt-2 rounded-lg bg-muted/40 p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{data.status.replaceAll("_", " ").toLowerCase()}</Badge>
        <span className="font-mono text-muted-foreground">{data.trackingNumber}</span>
        {data.estimatedDelivery && <span className="text-muted-foreground">ETA {format(new Date(data.estimatedDelivery), "dd MMM")}</span>}
      </div>
      <ol className="space-y-0">
        {[...data.events].reverse().map((e, i) => (
          <li key={i} className="relative flex gap-2.5 pb-3 last:pb-0">
            {i < data.events.length - 1 && <span className="absolute left-[5px] top-3.5 h-full w-0.5 bg-border" aria-hidden />}
            <span className={`relative z-10 mt-1 h-3 w-3 shrink-0 rounded-full ${i === 0 ? "bg-primary" : "bg-emerald-500"}`} />
            <div>
              <p className="text-xs font-semibold">{e.status.replaceAll("_", " ")}</p>
              <p className="text-[11px] text-muted-foreground">
                {format(new Date(e.at), "dd MMM, hh:mm a")}{e.note ? ` · ${e.note}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ol>
      <p className="mt-1 border-t pt-2 text-[11px] text-muted-foreground">Sandbox logistics provider — events simulated for this MVP.</p>
    </div>
  );
}

// ── Return / exchange dialog ─────────────────────────────────────────────────

function ReturnDialog({
  orderId,
  item,
  maxQty,
  open,
  onOpenChange,
}: {
  orderId: string;
  item: OrderItemView;
  maxQty: number;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNav((s) => s.navigate);
  const [type, setType] = useState("RETURN");
  const [reason, setReason] = useState<string>(RETURN_REASON_LABELS.DAMAGED_OR_DEFECTIVE ? "DAMAGED_OR_DEFECTIVE" : "OTHER");
  const [qty, setQty] = useState(1);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const res = await api.post<ReturnRequestView>("/api/returns", {
        orderId,
        items: [{ orderItemId: item.id, qty, reason }],
        type,
        ...(description.trim() ? { description: description.trim() } : {}),
      });
      toast.success(`Return request ${res.rmaNumber} created`);
      onOpenChange(false);
      navigate("return-detail", { id: res.id });
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not create return request");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Return / Exchange</DialogTitle>
          <DialogDescription className="line-clamp-1">{item.name}</DialogDescription>
        </DialogHeader>
        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</p>}
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Type</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="RETURN">Return — refund</SelectItem>
                <SelectItem value="EXCHANGE">Exchange — replacement</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(RETURN_REASON_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ret-qty">Quantity (max {maxQty})</Label>
            <Input
              id="ret-qty"
              type="number"
              inputMode="numeric"
              min={1}
              max={maxQty}
              value={qty}
              onChange={(e) => setQty(Math.max(1, Math.min(maxQty, Number(e.target.value) || 1)))}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ret-desc">Additional details (optional)</Label>
            <Textarea id="ret-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Tell us what went wrong" maxLength={1000} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => void submit()} disabled={submitting}>
            {submitting && <Loader2 size={15} className="animate-spin" />} Submit request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Invoice dialog ───────────────────────────────────────────────────────────

type InvoiceData = {
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  placedAt: string;
  billedTo: { fullName: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string };
  sellerSections: { sellerName: string; items: { name: string; sku: string; variantName: string | null; qty: number; unitPrice: number; lineTotal: number }[]; itemsTotal: number; shippingFee: number; sectionTotal: number }[];
  itemsTotal: number;
  couponDiscount: number;
  shippingTotal: number;
  grandTotal: number;
};

function InvoiceDialog({ orderId, open, onOpenChange }: { orderId: string; open: boolean; onOpenChange: (v: boolean) => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["invoice", orderId],
    queryFn: () => api.get<InvoiceData>(`/api/orders/${orderId}/invoice-data`),
    enabled: open && !!orderId,
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl sk-scrollbar">
        <DialogHeader>
          <DialogTitle>Invoice — {data?.orderNumber ?? "…"}</DialogTitle>
          <DialogDescription>Print or save this receipt for your records.</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="h-64 animate-pulse rounded-lg bg-muted/50" />
        ) : isError || !data ? (
          <p className="text-sm text-rose-600">Could not load invoice data.</p>
        ) : (
          <div className="rounded-lg border p-4 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b pb-3">
              <div>
                <p className="text-base font-extrabold">ShopEase Marketplace</p>
                <p className="text-xs text-muted-foreground">Bengaluru, India · Help Center: Support</p>
                <p className="mt-1 text-xs text-muted-foreground">Sandbox invoice — not a tax document</p>
              </div>
              <div className="text-right text-xs text-muted-foreground">
                <p className="font-mono text-sm font-bold text-foreground">{data.orderNumber}</p>
                <p>Placed {format(new Date(data.placedAt), "dd MMM yyyy")}</p>
                <p>Payment: {data.paymentMethod} · {data.paymentStatus}</p>
              </div>
            </div>

            <div className="border-b py-3">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Billed to</p>
              <p className="mt-1 font-semibold">{data.billedTo.fullName}</p>
              <p className="text-xs text-muted-foreground">
                {data.billedTo.line1}{data.billedTo.line2 ? `, ${data.billedTo.line2}` : ""}
                {data.billedTo.landmark ? `, near ${data.billedTo.landmark}` : ""}, {data.billedTo.city}, {data.billedTo.state} — {data.billedTo.pincode} · {data.billedTo.phone}
              </p>
            </div>

            {data.sellerSections.map((sec) => (
              <div key={sec.sellerName} className="border-b py-3">
                <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Sold by {sec.sellerName}</p>
                <table className="mt-2 w-full text-xs">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th className="py-1.5">Item</th>
                      <th className="py-1.5 text-center">Qty</th>
                      <th className="py-1.5 text-right">Price</th>
                      <th className="py-1.5 text-right">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sec.items.map((it, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1.5 pr-2">
                          {it.name}
                          {it.variantName && <span className="block text-muted-foreground">{it.variantName}</span>}
                        </td>
                        <td className="py-1.5 text-center">{it.qty}</td>
                        <td className="py-1.5 text-right">{formatINR(it.unitPrice)}</td>
                        <td className="py-1.5 text-right font-medium">{formatINR(it.lineTotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-1.5 text-right text-xs text-muted-foreground">
                  Items {formatINR(sec.itemsTotal)} + Shipping {formatINR(sec.shippingFee)} = <strong className="text-foreground">{formatINR(sec.sectionTotal)}</strong>
                </p>
              </div>
            ))}

            <dl className="space-y-1.5 pt-3 text-xs">
              <div className="flex justify-between"><dt>Items total</dt><dd>{formatINR(data.itemsTotal)}</dd></div>
              {data.couponDiscount > 0 && <div className="flex justify-between text-emerald-600"><dt>Coupon discount</dt><dd>− {formatINR(data.couponDiscount)}</dd></div>}
              <div className="flex justify-between"><dt>Shipping</dt><dd>{data.shippingTotal === 0 ? "FREE" : formatINR(data.shippingTotal)}</dd></div>
              <div className="flex justify-between border-t pt-1.5 text-sm font-bold"><dt>Grand total</dt><dd>{formatINR(data.grandTotal)}</dd></div>
            </dl>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button className="gap-1.5" onClick={() => window.print()} disabled={isError || !data}>
            <Printer size={15} /> Print invoice
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main view ────────────────────────────────────────────────────────────────

export default function OrderDetailView(_props: { params?: Record<string, string>; mode?: string }) {
  const { params = {} } = _props;
  const id = params.id ?? "";
  const navigate = useNav((s) => s.navigate);
  const qc = useQueryClient();

  const [trackOpen, setTrackOpen] = useState<string | null>(null);
  const [returnItem, setReturnItem] = useState<OrderItemView | null>(null);
  const [invoiceOpen, setInvoiceOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const { data: order, isLoading, isError, refetch } = useQuery({
    queryKey: ["order", id],
    queryFn: () => api.get<OrderView>(`/api/orders/${id}`),
    enabled: !!id,
  });

  const returnWindowOpen = (item: OrderItemView): boolean => {
    if (!order || order.status !== "DELIVERED" || item.status !== "ACTIVE" || item.returnDays <= 0) return false;
    if (!order.deliveredAt) return false;
    const days = differenceInCalendarDays(new Date(), new Date(order.deliveredAt));
    return days >= 0 && days <= item.returnDays;
  };

  const cancelOrder = async () => {
    if (!order) return;
    setCancelling(true);
    try {
      await api.post(`/api/orders/${order.id}/cancel`, { reason: cancelReason.trim() || "No longer needed" });
      toast.success("Order cancelled");
      setCancelOpen(false);
      setCancelReason("");
      qc.invalidateQueries({ queryKey: ["order", id] });
      qc.invalidateQueries({ queryKey: ["orders"] });
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not cancel this order");
    } finally {
      setCancelling(false);
    }
  };

  const totals = useMemo(() => {
    if (!order) return null;
    return [
      { label: "Items total", value: formatINR(order.itemsTotal) },
      ...(order.couponDiscount > 0
        ? [{ label: `Coupon ${order.couponCode ?? ""}`.trim(), value: `− ${formatINR(order.couponDiscount)}`, green: true }]
        : []),
      { label: "Shipping", value: order.shippingTotal === 0 ? "FREE" : formatINR(order.shippingTotal), green: order.shippingTotal === 0 },
      { label: "Grand total", value: formatINR(order.grandTotal), bold: true },
    ];
  }, [order]);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl space-y-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-xl" />)}</div>
          <Skeleton className="h-72 rounded-xl" />
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
          description="It may not exist or may belong to another account."
          action={<Button onClick={() => void refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  const canCancel = CANCELLABLE.has(order.status);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Header */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-mono text-lg font-bold sm:text-xl">{order.orderNumber}</h1>
            <StatusBadge status={order.status} />
            <StatusBadge status={order.paymentStatus} />
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Placed on {format(new Date(order.placedAt), "dd MMM yyyy, hh:mm a")} · {order.items.length} item{order.items.length === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setInvoiceOpen(true)}>
            <FileDown size={14} /> Invoice
          </Button>
          {canCancel && (
            <Button variant="outline" size="sm" className="gap-1.5 text-rose-600 hover:text-rose-700" onClick={() => setCancelOpen(true)}>
              <Ban size={14} /> Cancel order
            </Button>
          )}
        </div>
      </div>

      {order.status === "CANCELLED" && order.cancelReason && (
        <div role="alert" className="mb-5 rounded-xl border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          <strong>Order cancelled.</strong> Reason: {order.cancelReason}
          {order.cancelledAt && <span className="block text-xs opacity-80">on {format(new Date(order.cancelledAt), "dd MMM yyyy, hh:mm a")}</span>}
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {/* Timeline */}
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">Order status</h2>
            <StatusTimeline history={order.statusHistory} />
          </section>

          {/* Items */}
          <section className="overflow-hidden rounded-xl border bg-card">
            <h2 className="border-b bg-muted/40 px-4 py-2.5 text-sm font-bold uppercase tracking-wide text-muted-foreground">Items</h2>
            <div className="divide-y">
              {order.items.map((item) => (
                <div key={item.id} className="p-4">
                  <div className="flex gap-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border bg-white p-1 dark:bg-neutral-950">
                      {item.image ? <img src={item.image} alt="" className="h-full w-full object-contain" /> : <Package size={18} className="mx-auto text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{item.name}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.variantName ? `${item.variantName} · ` : ""}Qty {item.qty} · Sold by {item.sellerName}
                      </p>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{formatINR(item.lineTotal)}</span>
                        {item.fulfillmentStatus && <StatusBadge status={item.fulfillmentStatus} className="scale-90" />}
                        {item.status !== "ACTIVE" && <StatusBadge status={item.status} className="scale-90" />}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {item.trackingNumber && (
                      <Button
                        variant="outline"
                        size="sm"
                        className="gap-1.5"
                        onClick={() => setTrackOpen(trackOpen === item.trackingNumber ? null : item.trackingNumber)}
                      >
                        <Truck size={14} /> {trackOpen === item.trackingNumber ? "Hide tracking" : "Track"}
                        {trackOpen === item.trackingNumber ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                      </Button>
                    )}
                    {returnWindowOpen(item) && (
                      <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setReturnItem(item)}>
                        <RotateCcw size={14} /> Return / Exchange
                      </Button>
                    )}
                  </div>

                  {item.trackingNumber && trackOpen === item.trackingNumber && (
                    <TrackingPanel trackingNumber={item.trackingNumber} />
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* Side cards */}
        <aside className="space-y-4 self-start lg:sticky lg:top-28">
          {/* Payment */}
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <CreditCard size={14} /> Payment
            </h2>
            {order.payments.length > 0 ? (
              <div className="space-y-2.5">
                {order.payments.map((p) => (
                  <div key={p.id} className="rounded-lg bg-muted/40 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold">{p.method === "COD" ? "Cash on Delivery" : p.method}</span>
                      <StatusBadge status={p.status} />
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Amount</span>
                      <span className="font-bold text-foreground">{formatINR(p.amount)}</span>
                    </div>
                    <div className="mt-0.5 flex items-center justify-between text-xs text-muted-foreground">
                      <span>Provider</span>
                      <span className="font-mono">
                        {p.sandbox ? <Badge variant="outline" className="border-amber-300 bg-amber-50 text-[10px] text-amber-800 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-300">SANDBOX</Badge> : p.provider}
                      </span>
                    </div>
                    {p.failureReason && <p className="mt-1 text-xs text-rose-600">Failed: {p.failureReason}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No payment recorded.</p>
            )}
          </section>

          {/* Address */}
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              <MapPin size={14} /> Delivery address
            </h2>
            <p className="text-sm font-semibold">{order.address.fullName}</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              {order.address.line1}{order.address.line2 ? `, ${order.address.line2}` : ""}
              {order.address.landmark ? `, near ${order.address.landmark}` : ""}, {order.address.city}, {order.address.state} — {order.address.pincode}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">Phone: {order.address.phone}</p>
          </section>

          {/* Totals */}
          <section className="rounded-xl border bg-card p-4">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">Price details</h2>
            <dl className="space-y-2 text-sm">
              {totals?.map((t) => (
                <div key={t.label} className={`flex justify-between ${t.bold ? "border-t pt-2.5 text-base font-bold" : ""}`}>
                  <dt className={t.bold ? "" : "text-muted-foreground"}>{t.label}</dt>
                  <dd className={t.green && !t.bold ? "font-medium text-emerald-600" : t.bold ? "" : "font-medium"}>{t.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        </aside>
      </div>

      <div className="mt-6">
        <SandboxNotice />
      </div>

      {returnItem && order && (
        <ReturnDialog
          orderId={order.id}
          item={returnItem}
          maxQty={returnItem.qty}
          open={!!returnItem}
          onOpenChange={(v) => !v && setReturnItem(null)}
        />
      )}

      <InvoiceDialog orderId={order.id} open={invoiceOpen} onOpenChange={setInvoiceOpen} />

      {/* Cancel dialog */}
      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel order {order.orderNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will release the reserved stock. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Input
            placeholder="Reason for cancellation (optional)"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            maxLength={300}
            aria-label="Cancellation reason"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              disabled={cancelling}
              onClick={(e) => {
                e.preventDefault();
                void cancelOrder();
              }}
            >
              {cancelling && <Loader2 size={15} className="animate-spin" />} Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Copy order number helper */}
      <p className="mt-4 text-center text-xs text-muted-foreground">
        Need help with this order?{" "}
        <button className="font-medium text-primary hover:underline" onClick={() => navigate("support")}>
          Contact support
        </button>
      </p>
    </div>
  );
}
