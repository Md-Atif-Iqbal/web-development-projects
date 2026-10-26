"use client";

// Checkout — address selection (with inline add form), order summary and
// payment-method choice, ending in order placement (COD) or the sandbox
// payment gateway (prepaid).

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { toast } from "sonner";
import {
  MapPin, Plus, Smartphone, CreditCard, Landmark, Wallet, Banknote,
  ShoppingCart, Loader2, AlertTriangle, ShieldCheck, Check,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import { formatINR } from "@/lib/money";
import type { CheckoutValidateResponse, AddressView, OrderView, PaymentView } from "@/lib/types";
import { EmptyState, Price, SectionHeader } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";

// ── Address form (zod + react-hook-form) ────────────────────────────────────

export const addressSchema = z.object({
  fullName: z.string().min(2, "Enter the recipient's full name"),
  phone: z.string().regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number"),
  line1: z.string().min(5, "Enter house / flat and street"),
  line2: z.string().optional().or(z.literal("")),
  landmark: z.string().optional().or(z.literal("")),
  city: z.string().min(2, "Enter city"),
  state: z.string().min(2, "Enter state"),
  pincode: z.string().regex(/^\d{6}$/, "Enter a valid 6-digit pincode"),
  type: z.enum(["HOME", "WORK", "OTHER"]),
});

export type AddressFormValues = z.infer<typeof addressSchema>;

function AddressForm({
  onSaved,
  onCancel,
}: {
  onSaved: (a: AddressView) => void;
  onCancel?: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [addrType, setAddrType] = useState<AddressFormValues["type"]>("HOME");
  const form = useForm<AddressFormValues>({
    resolver: zodResolver(addressSchema),
    defaultValues: { fullName: "", phone: "", line1: "", line2: "", landmark: "", city: "", state: "", pincode: "", type: "HOME" },
  });

  const save = form.handleSubmit(async (values) => {
    setError(null);
    try {
      const payload: Record<string, string> = { ...values, type: addrType };
      if (!payload.line2) delete payload.line2;
      if (!payload.landmark) delete payload.landmark;
      const res = await api.post<{ item: AddressView }>("/api/addresses", payload);
      toast.success("Address saved");
      onSaved(res.item);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Could not save address");
    }
  });

  return (
    <form onSubmit={save} className="space-y-3 rounded-xl border border-dashed bg-muted/30 p-4" noValidate>
      {error && (
        <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:bg-rose-950 dark:text-rose-300">{error}</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="addr-name">Full name</Label>
          <Input id="addr-name" placeholder="Riya Sharma" {...form.register("fullName")} />
          {form.formState.errors.fullName && <p className="text-xs text-rose-600">{form.formState.errors.fullName.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="addr-phone">Mobile number</Label>
          <Input id="addr-phone" inputMode="numeric" placeholder="10-digit mobile" {...form.register("phone")} />
          {form.formState.errors.phone && <p className="text-xs text-rose-600">{form.formState.errors.phone.message}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="addr-line1">Flat / House no., Building, Street</Label>
        <Input id="addr-line1" placeholder="Flat 402, Lakeview Apartments, 5th Cross" {...form.register("line1")} />
        {form.formState.errors.line1 && <p className="text-xs text-rose-600">{form.formState.errors.line1.message}</p>}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="addr-line2">Area / Locality (optional)</Label>
          <Input id="addr-line2" placeholder="HSR Layout Sector 2" {...form.register("line2")} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="addr-landmark">Landmark (optional)</Label>
          <Input id="addr-landmark" placeholder="Near Metro Station" {...form.register("landmark")} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="space-y-1">
          <Label htmlFor="addr-city">City</Label>
          <Input id="addr-city" placeholder="Bengaluru" {...form.register("city")} />
          {form.formState.errors.city && <p className="text-xs text-rose-600">{form.formState.errors.city.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="addr-state">State</Label>
          <Input id="addr-state" placeholder="Karnataka" {...form.register("state")} />
          {form.formState.errors.state && <p className="text-xs text-rose-600">{form.formState.errors.state.message}</p>}
        </div>
        <div className="space-y-1">
          <Label htmlFor="addr-pincode">Pincode</Label>
          <Input id="addr-pincode" inputMode="numeric" placeholder="560102" {...form.register("pincode")} />
          {form.formState.errors.pincode && <p className="text-xs text-rose-600">{form.formState.errors.pincode.message}</p>}
        </div>
      </div>
      <div className="space-y-1">
        <Label>Address type</Label>
        <Select value={addrType} onValueChange={(v) => setAddrType(v as AddressFormValues["type"])}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="HOME">Home</SelectItem>
            <SelectItem value="WORK">Work</SelectItem>
            <SelectItem value="OTHER">Other</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex gap-2 pt-1">
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting && <Loader2 size={15} className="animate-spin" />} Save address
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        )}
      </div>
    </form>
  );
}

// ── Payment methods ──────────────────────────────────────────────────────────

const PAYMENT_METHODS = [
  { value: "UPI", label: "UPI", desc: "Pay via any UPI app", icon: Smartphone },
  { value: "CARD", label: "Credit / Debit Card", desc: "Visa, Mastercard, RuPay", icon: CreditCard },
  { value: "NETBANKING", label: "Netbanking", desc: "All major Indian banks", icon: Landmark },
  { value: "WALLET", label: "Wallet", desc: "Prepaid wallets", icon: Wallet },
] as const;

// ── Main view ────────────────────────────────────────────────────────────────

export default function CheckoutView(_props: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  const { user, loading: sessionLoading } = useSession();
  const qc = useQueryClient();
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("UPI");
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const checkoutTrackedRef = useRef(false);

  useEffect(() => {
    if (user && !checkoutTrackedRef.current) {
      checkoutTrackedRef.current = true;
      api.post("/api/analytics/event", { type: "CHECKOUT_START" }).catch(() => undefined);
    }
  }, [user]);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["checkout"],
    queryFn: () => api.post<CheckoutValidateResponse>("/api/checkout/validate", {}),
    enabled: !!user,
    retry: false,
  });

  // Default-select the default address when data arrives.
  useEffect(() => {
    if (data && data.addresses.length > 0 && !selectedAddressId) {
      setSelectedAddressId((data.addresses.find((a) => a.isDefault) ?? data.addresses[0]).id);
    }
  }, [data, selectedAddressId]);

  const placeOrder = async () => {
    if (!data) return;
    if (!selectedAddressId) {
      toast.error("Please select a delivery address");
      return;
    }
    setPlacing(true);
    try {
      const res = await api.post<{ order: OrderView; payment: PaymentView | null }>("/api/orders", {
        addressId: selectedAddressId,
        paymentMethod,
        idempotencyKey: crypto.randomUUID(),
        ...(data.pricing.couponCode ? { couponCode: data.pricing.couponCode } : {}),
      });
      qc.invalidateQueries({ queryKey: ["cart"] });
      if (paymentMethod === "COD") {
        toast.success(`Order ${res.order.orderNumber} placed — pay on delivery!`);
        navigate("order-confirm", { orderId: res.order.id });
      } else if (res.payment) {
        navigate("sandbox-payment", { paymentId: res.payment.id, orderId: res.order.id });
      } else {
        toast.error("Payment could not be started. Please retry from your orders.");
        navigate("orders");
      }
    } catch (err) {
      if (err instanceof ApiClientError) {
        if (err.status === 409 && err.code === "CART_ISSUES") {
          toast.error(err.message);
          navigate("cart");
          return;
        }
        if (err.status === 422 && err.code === "CART_EMPTY") {
          toast.error("Your cart is empty");
          navigate("home");
          return;
        }
        toast.error(err.message);
      } else {
        toast.error("Could not place order. Please try again.");
      }
    } finally {
      setPlacing(false);
    }
  };

  // ── Gates ──
  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<ShoppingCart size={28} />}
          title="Please sign in to check out"
          action={<Button size="lg" onClick={() => navigate("login")}>Sign in</Button>}
        />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<AlertTriangle size={26} />}
          title="Couldn't load checkout"
          description="Something went wrong while preparing your order."
          action={<Button onClick={() => void refetch()}>Retry</Button>}
        />
      </div>
    );
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}</div>
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    );
  }

  const pricing = data.pricing;
  if (pricing.items.length === 0) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<ShoppingCart size={28} />}
          title="Your cart is empty"
          description="Add some products before checking out."
          action={<Button size="lg" onClick={() => navigate("home")}>Shop now</Button>}
        />
      </div>
    );
  }

  const hasIssues = pricing.issues.length > 0;
  const selectedMethod = paymentMethod;
  const totalQty = pricing.items.reduce((s, i) => s + i.qty, 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <SectionHeader title="Checkout" subtitle={`Review your order — ${totalQty} item${totalQty === 1 ? "" : "s"}`} />

      {hasIssues && (
        <div role="alert" className="mb-5 flex items-start gap-2.5 rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-semibold">Your cart has issues — please fix them before placing the order</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              {pricing.issues.map((iss, i) => <li key={i}>{iss.message}</li>)}
            </ul>
          </div>
          <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => navigate("cart")}>Go to cart</Button>
        </div>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-5">
          {/* Step 1 — Address */}
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">1</span>
              <MapPin size={16} className="text-primary" /> Delivery address
            </h2>
            {data.addresses.length === 0 ? (
              <p className="mb-3 text-sm text-muted-foreground">No saved addresses yet — add one to continue.</p>
            ) : (
              <RadioGroup
                value={selectedAddressId ?? undefined}
                onValueChange={(v) => setSelectedAddressId(v)}
                className="space-y-2.5"
              >
                {data.addresses.map((a) => (
                  <label
                    key={a.id}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-sm transition-colors ${
                      selectedAddressId === a.id ? "border-primary bg-primary/5" : "hover:border-foreground/20"
                    }`}
                  >
                    <RadioGroupItem value={a.id} className="mt-0.5" />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold">{a.fullName}</span>
                        <Badge variant="outline" className="text-[10px]">{a.type}</Badge>
                        {a.isDefault && <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300">DEFAULT</span>}
                      </span>
                      <span className="mt-0.5 block text-muted-foreground">
                        {a.line1}{a.line2 ? `, ${a.line2}` : ""}{a.landmark ? `, near ${a.landmark}` : ""}, {a.city}, {a.state} — {a.pincode}
                      </span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">Phone: {a.phone}</span>
                    </span>
                  </label>
                ))}
              </RadioGroup>
            )}

            {showAddressForm ? (
              <div className="mt-3">
                <AddressForm
                  key={formKey}
                  onSaved={(a) => {
                    setShowAddressForm(false);
                    setFormKey((k) => k + 1);
                    qc.invalidateQueries({ queryKey: ["checkout"] });
                    qc.invalidateQueries({ queryKey: ["addresses"] });
                    setSelectedAddressId(a.id);
                  }}
                  onCancel={() => setShowAddressForm(false)}
                />
              </div>
            ) : (
              <Button variant="outline" className="mt-3 gap-1.5" onClick={() => setShowAddressForm(true)}>
                <Plus size={15} /> Add new address
              </Button>
            )}
          </section>

          {/* Step 2 — Order summary */}
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">2</span>
              Order summary
            </h2>
            <div className="space-y-4">
              {pricing.fulfillmentGroups.map((g) => (
                <div key={g.sellerId} className="rounded-lg border bg-muted/30 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                    Sold by {g.sellerName} · Shipping {g.shippingFee === 0 ? <span className="text-emerald-600">FREE</span> : formatINR(g.shippingFee)}
                  </p>
                  <div className="space-y-2">
                    {pricing.items
                      .filter((i) => i.sellerId === g.sellerId)
                      .map((item) => (
                        <div key={item.cartItemId} className="flex items-center gap-3">
                          <div className="h-12 w-12 shrink-0 overflow-hidden rounded border bg-white p-1 dark:bg-neutral-950">
                            {item.image && <img src={item.image} alt="" className="h-full w-full object-contain" />}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{item.productName}</p>
                            <p className="text-xs text-muted-foreground">{item.variantName} · Qty {item.qty}</p>
                          </div>
                          <p className="shrink-0 text-sm font-semibold">{formatINR(item.lineTotal)}</p>
                        </div>
                      ))}
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Step 3 — Payment */}
          <section className="rounded-xl border bg-card p-4 sm:p-5">
            <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">3</span>
              Payment method
            </h2>
            <RadioGroup value={selectedMethod} onValueChange={(v) => setPaymentMethod(v)} className="grid gap-2.5 sm:grid-cols-2">
              {PAYMENT_METHODS.map((m) => (
                <label
                  key={m.value}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-sm transition-colors ${
                    selectedMethod === m.value ? "border-primary bg-primary/5" : "hover:border-foreground/20"
                  }`}
                >
                  <RadioGroupItem value={m.value} />
                  <m.icon size={18} className="shrink-0 text-primary" />
                  <span className="min-w-0">
                    <span className="block font-semibold">{m.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{m.desc}</span>
                  </span>
                </label>
              ))}
              <label
                className={`flex items-center gap-3 rounded-xl border p-3.5 text-sm ${
                  data.codAllowed ? "cursor-pointer transition-colors" : "cursor-not-allowed opacity-55"
                } ${selectedMethod === "COD" ? "border-primary bg-primary/5" : data.codAllowed ? "hover:border-foreground/20" : ""}`}
                onClick={() => data.codAllowed && setPaymentMethod("COD")}
              >
                <RadioGroupItem value="COD" disabled={!data.codAllowed} checked={selectedMethod === "COD"} />
                <Banknote size={18} className="shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">
                    Cash on Delivery
                    {data.codFee > 0 && <span className="ml-1.5 text-xs font-normal text-amber-700 dark:text-amber-400">+{formatINR(data.codFee)} handling fee</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {data.codAllowed ? "Pay in cash when your order arrives" : "Not available for this order (value or items)"}
                  </span>
                </span>
              </label>
            </RadioGroup>
          </section>
        </div>

        {/* Summary sidebar */}
        <aside className="space-y-3 self-start lg:sticky lg:top-28">
          <div className="rounded-xl border bg-card p-4">
            <h2 className="border-b pb-2.5 text-sm font-bold uppercase tracking-wide text-muted-foreground">Price details</h2>
            <dl className="space-y-2.5 py-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Price ({totalQty} item{totalQty === 1 ? "" : "s"})</dt>
                <dd className="font-medium">{formatINR(pricing.itemsTotal)}</dd>
              </div>
              {pricing.savingsTotal > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Product savings</dt>
                  <dd className="font-medium text-emerald-600">− {formatINR(pricing.savingsTotal)}</dd>
                </div>
              )}
              {pricing.couponDiscount > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Coupon {pricing.couponCode}</dt>
                  <dd className="font-medium text-emerald-600">− {formatINR(pricing.couponDiscount)}</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className={`font-medium ${pricing.shippingTotal === 0 ? "text-emerald-600" : ""}`}>
                  {pricing.shippingTotal === 0 ? "FREE" : formatINR(pricing.shippingTotal)}
                </dd>
              </div>
              {paymentMethod === "COD" && data.codFee > 0 && (
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">COD handling fee</dt>
                  <dd className="font-medium">{formatINR(data.codFee)}</dd>
                </div>
              )}
              <div className="flex justify-between border-t pt-3 text-base font-bold">
                <dt>{paymentMethod === "COD" ? "Payable on delivery" : "Amount payable"}</dt>
                <dd>{formatINR(pricing.grandTotal + (paymentMethod === "COD" ? data.codFee : 0))}</dd>
              </div>
            </dl>
            {pricing.savingsTotal > 0 && (
              <p className="rounded-lg bg-emerald-50 px-3 py-2 text-center text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                You will save {formatINR(pricing.savingsTotal)} on this order
              </p>
            )}
            <Button
              size="lg"
              className="mt-3 w-full"
              disabled={hasIssues || !selectedAddressId || placing}
              onClick={() => void placeOrder()}
            >
              {placing && <Loader2 size={16} className="animate-spin" />}
              {hasIssues ? "Fix cart issues first" : paymentMethod === "COD" ? "Place order" : `Pay ${formatINR(pricing.grandTotal)}`}
            </Button>
            <p className="mt-3 flex items-center justify-center gap-1 text-[11px] text-muted-foreground">
              <ShieldCheck size={12} className="text-emerald-600" /> Payments are processed by the ShopEase sandbox gateway
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
