"use client";

// Sandbox payment gateway — a clearly-labelled simulated payment page.
// Success/failure goes through the REAL signed-webhook pipeline server-side;
// this UI only picks the outcome.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Loader2, Lock, ShieldCheck, AlertTriangle, CheckCircle2, ArrowLeft, Smartphone, Landmark, Wallet, CreditCard,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { formatINR } from "@/lib/money";
import type { PaymentView } from "@/lib/types";
import { EmptyState, SandboxNotice } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const BANKS = ["State Bank of India", "HDFC Bank", "ICICI Bank", "Axis Bank", "Kotak Mahindra Bank", "Punjab National Bank"];
const WALLETS = ["ShopEase Wallet", "FastPay Wallet", "OnePay Wallet", "MiniBank Wallet"];

const METHOD_LABELS: Record<string, string> = {
  UPI: "UPI",
  CARD: "Credit / Debit Card",
  NETBANKING: "Netbanking",
  WALLET: "Wallet",
  COD: "Cash on Delivery",
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function SandboxPaymentView(_props: { params?: Record<string, string>; mode?: string }) {
  const { params = {} } = _props;
  const paymentId = params.paymentId ?? "";
  const orderId = params.orderId ?? "";
  const navigate = useNav((s) => s.navigate);

  const [processing, setProcessing] = useState(false);
  const [statusNote, setStatusNote] = useState<string | null>(null);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["payment-status", paymentId],
    queryFn: () => api.get<{ payment: PaymentView; order: { id: string; status: string; orderNumber: string; paymentStatus: string } }>(
      `/api/payments/${paymentId}/status`
    ),
    enabled: !!paymentId,
    refetchInterval: false,
  });

  const [vpa, setVpa] = useState("customer@upi");
  const [bank, setBank] = useState(BANKS[0]);
  const [wallet, setWallet] = useState(WALLETS[0]);

  useEffect(() => {
    if (data?.payment.status === "FAILED") {
      // Payment already failed on a previous attempt — no way to retry this row.
      setStatusNote("This payment attempt has failed.");
    }
  }, [data]);

  const pollUntilSettled = async (): Promise<"PAID" | "FAILED" | "UNKNOWN"> => {
    for (let i = 0; i < 5; i++) {
      await sleep(600);
      try {
        const s = await api.get<{ payment: PaymentView }>(`/api/payments/${paymentId}/status`);
        if (s.payment.status === "PAID") return "PAID";
        if (s.payment.status === "FAILED") return "FAILED";
      } catch {
        /* keep polling */
      }
    }
    return "UNKNOWN";
  };

  const pay = async (outcome: "success" | "failure") => {
    if (!data) return;
    if (outcome === "success" && data.payment.status !== "PENDING") {
      toast.error("This payment can no longer be processed");
      return;
    }
    setProcessing(true);
    setStatusNote(null);
    try {
      // A short fake "gateway round-trip" for realism.
      setStatusNote("Contacting sandbox gateway…");
      await sleep(1200);
      setStatusNote(outcome === "success" ? "Authorising payment…" : "Simulating failure…");
      const res = await api.post<{ payment: PaymentView; order: { id: string; status: string; orderNumber: string; paymentStatus: string } }>(
        `/api/payments/${paymentId}/sandbox-pay`,
        { outcome }
      );
      if (res.payment.status === "PAID") {
        toast.success("Payment successful!");
        navigate("order-confirm", { orderId: res.order.id || orderId });
        return;
      }
      if (res.payment.status === "FAILED") {
        toast.error(`Payment failed${res.payment.failureReason ? `: ${res.payment.failureReason}` : ""}`);
        navigate("payment-result", { orderId, status: "failed" });
        return;
      }
      // Still pending — poll briefly before giving up.
      const settled = await pollUntilSettled();
      if (settled === "PAID") {
        toast.success("Payment successful!");
        navigate("order-confirm", { orderId });
      } else if (settled === "FAILED") {
        toast.error("Payment failed");
        navigate("payment-result", { orderId, status: "failed" });
      } else {
        toast.error("Payment is taking longer than expected — check your orders in a moment.");
        navigate("orders");
      }
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 409) {
        toast.error(err.message);
        navigate("payment-result", { orderId, status: "failed" });
      } else {
        toast.error(err instanceof ApiClientError ? err.message : "Gateway error — please try again");
      }
    } finally {
      setProcessing(false);
      setStatusNote(null);
    }
  };

  const cancel = () => {
    navigate("payment-result", { orderId, status: "cancelled" });
  };

  if (!paymentId || (!isLoading && (isError || !data))) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<AlertTriangle size={26} />}
          title="Payment session not found"
          description="This payment link is invalid or expired."
          action={<Button onClick={() => navigate(orderId ? "payment-result" : "orders", orderId ? { orderId } : {})}>Go to my orders</Button>}
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center gap-3 px-4 py-24 sm:px-6">
        <Loader2 size={28} className="animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Preparing secure checkout…</p>
      </div>
    );
  }

  const { payment, order } = data;
  const method = payment.method;
  const alreadyPaid = payment.status === "PAID";

  if (alreadyPaid) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
          <CheckCircle2 size={48} className="mx-auto text-emerald-600" />
          <h1 className="mt-3 text-xl font-bold">Payment already completed</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Order {order.orderNumber} is paid ({formatINR(payment.amount)}). No further action needed.
          </p>
          <Button size="lg" className="mt-5 w-full" onClick={() => navigate("order-confirm", { orderId })}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  if (payment.status === "FAILED" || payment.status === "CANCELLED") {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="mx-auto max-w-md rounded-2xl border bg-card p-8 text-center">
          <AlertTriangle size={48} className="mx-auto text-rose-600" />
          <h1 className="mt-3 text-xl font-bold">This payment attempt {payment.status === "FAILED" ? "failed" : "was cancelled"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">You can review the order and retry from the payment result page.</p>
          <Button size="lg" className="mt-5 w-full" onClick={() => navigate("payment-result", { orderId, status: "failed" })}>
            Continue
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Button variant="ghost" size="sm" className="mb-3 gap-1.5 text-muted-foreground" onClick={cancel} disabled={processing}>
        <ArrowLeft size={15} /> Cancel and go back
      </Button>

      <SandboxNotice>No real money. Simulated gateway for the ShopEase MVP — pick any outcome to explore the flow.</SandboxNotice>

      <div className="mx-auto mt-5 max-w-md overflow-hidden rounded-2xl border bg-card shadow-sm">
        {/* Gateway header */}
        <div className="flex items-center justify-between bg-muted/60 px-5 py-3.5">
          <div>
            <p className="text-xs text-muted-foreground">Sandbox Payment Gateway</p>
            <p className="text-sm font-bold">Order {order.orderNumber}</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Amount</p>
            <p className="text-lg font-extrabold">{formatINR(payment.amount)}</p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          {/* Method */}
          <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-3.5 py-2.5 text-sm">
            <span className="font-semibold">{METHOD_LABELS[method] ?? method}</span>
            <span className="font-mono text-xs text-muted-foreground">{payment.sandbox ? "SANDBOX" : payment.provider}</span>
          </div>

          {statusNote && (
            <p className="flex items-center gap-2 rounded-lg bg-sky-50 px-3 py-2 text-xs text-sky-800 dark:bg-sky-950 dark:text-sky-300">
              <Loader2 size={13} className="animate-spin" /> {statusNote}
            </p>
          )}

          {/* Method-specific fake credentials */}
          {method === "UPI" && (
            <div className="space-y-1.5">
              <Label htmlFor="vpa">Your UPI ID (VPA)</Label>
              <div className="flex items-center gap-2">
                <Smartphone size={16} className="text-muted-foreground" />
                <Input id="vpa" value={vpa} onChange={(e) => setVpa(e.target.value)} placeholder="name@bank" className="h-11" />
              </div>
              <p className="text-[11px] text-muted-foreground">Any VPA works — this is simulated.</p>
            </div>
          )}

          {method === "CARD" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="cardnum">Card number</Label>
                <div className="flex items-center gap-2">
                  <CreditCard size={16} className="text-muted-foreground" />
                  <Input id="cardnum" value="4111 1111 1111 1111" disabled className="h-11 font-mono" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="expiry">Expiry</Label>
                  <Input id="expiry" value="12/28" disabled className="h-11 font-mono" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cvv">CVV</Label>
                  <Input id="cvv" value="123" type="password" disabled className="h-11 font-mono" />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">Sandbox test card — details are fixed.</p>
            </div>
          )}

          {method === "NETBANKING" && (
            <div className="space-y-1.5">
              <Label>Choose your bank</Label>
              <div className="flex items-center gap-2">
                <Landmark size={16} className="text-muted-foreground" />
                <Select value={bank} onValueChange={setBank}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {BANKS.map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {method === "WALLET" && (
            <div className="space-y-1.5">
              <Label>Choose your wallet</Label>
              <div className="flex items-center gap-2">
                <Wallet size={16} className="text-muted-foreground" />
                <Select value={wallet} onValueChange={setWallet}>
                  <SelectTrigger className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WALLETS.map((w) => <SelectItem key={w} value={w}>{w}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}

          {/* Actions */}
          <Button
            size="lg"
            className="h-12 w-full gap-2 text-base font-bold"
            onClick={() => void pay("success")}
            disabled={processing}
          >
            {processing ? <Loader2 size={17} className="animate-spin" /> : <Lock size={15} />}
            Pay {formatINR(payment.amount)} securely
          </Button>
          <Button
            variant="ghost"
            className="w-full text-amber-700 hover:text-amber-800 dark:text-amber-400"
            onClick={() => void pay("failure")}
            disabled={processing}
          >
            Simulate payment failure
          </Button>

          <p className="flex items-center justify-center gap-1.5 border-t pt-3 text-[11px] text-muted-foreground">
            <ShieldCheck size={12} className="text-emerald-600" /> 256-bit simulated encryption · Sandbox mode
          </p>
        </div>
      </div>
    </div>
  );
}
