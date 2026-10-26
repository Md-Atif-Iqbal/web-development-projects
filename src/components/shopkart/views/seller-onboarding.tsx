"use client";

// Become a Seller — benefits hero + 2-step application form.
// Full-screen view (renders its own chrome, no site header).

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeIndianRupee,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Loader2,
  PackageCheck,
  ShieldCheck,
  Store,
  TrendingUp,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BrandLogo, StatusBadge } from "@/components/shopkart/shared";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, ApiClientError } from "@/lib/client/api";
import type { Me } from "@/lib/types";

// ── Layout ────────────────────────────────────────────────────────────────

function OnboardingBar() {
  const goHome = useNav((s) => s.goHome);
  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <div className="flex items-center gap-3">
          <BrandLogo onClick={goHome} />
          <span className="hidden h-6 w-px bg-border sm:block" />
          <span className="hidden text-sm font-semibold text-muted-foreground sm:block">Sell on ShopEase</span>
        </div>
        <Button variant="outline" size="sm" onClick={goHome}>
          View store
        </Button>
      </div>
    </header>
  );
}

function OnboardingSkeleton() {
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-4 py-10">
      <Skeleton className="h-10 w-80" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

// ── Content ───────────────────────────────────────────────────────────────

const BENEFITS = [
  {
    icon: TrendingUp,
    title: "Reach crores of shoppers",
    body: "List once and sell across India — ShopEase brings discovery, search and recommendations to your catalogue.",
  },
  {
    icon: BadgeIndianRupee,
    title: "Fast, transparent payouts",
    body: "Earnings settle after delivery. Track commissions and payouts in real time from your seller finance dashboard.",
  },
  {
    icon: PackageCheck,
    title: "Shipping made simple",
    body: "Create shipments in one click with our logistics partner. Tracking updates are pushed to customers automatically.",
  },
  {
    icon: ShieldCheck,
    title: "Protected by policy",
    body: "7-day replacement windows, GST-ready invoices and a dedicated support team keep disputes fair and fast.",
  },
];

function BenefitsHero() {
  return (
    <section className="space-y-6">
      <div className="max-w-2xl space-y-3">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">
          Grow your business with ShopEase
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          Join India&apos;s fastest-growing multi-vendor marketplace. Onboarding takes about five minutes —
          register your business, add banking details, and our team reviews your application within 24 hours.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {BENEFITS.map((b) => (
          <Card key={b.title} className="h-full">
            <CardContent className="flex h-full flex-col gap-2 p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <b.icon size={20} />
              </div>
              <h3 className="text-sm font-semibold">{b.title}</h3>
              <p className="text-xs leading-relaxed text-muted-foreground">{b.body}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ── Status screens for existing sellers ───────────────────────────────────

function SellerStatusScreen({ user }: { user: Me }) {
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);
  const status = user.sellerStatus ?? "PENDING";

  if (status === "APPROVED") {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="rounded-full bg-emerald-100 p-4 text-emerald-700 dark:bg-emerald-950">
            <CheckCircle2 size={32} />
          </div>
          <div>
            <h2 className="text-lg font-bold">You&apos;re a verified ShopEase seller</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Welcome back! Your seller account is active and ready to take orders.
            </p>
          </div>
          <StatusBadge status={status} />
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={() => navigate("seller")}>Go to seller dashboard</Button>
            <Button variant="outline" onClick={goHome}>
              Back to home
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (status === "REJECTED") {
    return (
      <div className="space-y-4">
        <Alert className="border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <XCircle className="h-4 w-4" />
          <AlertDescription>
            Your previous seller application was <strong>rejected</strong> during verification. Review your
            business and banking details below and submit a fresh application.
          </AlertDescription>
        </Alert>
        <ApplyForm />
      </div>
    );
  }

  if (status === "SUSPENDED") {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="rounded-full bg-rose-100 p-4 text-rose-700 dark:bg-rose-950">
            <XCircle size={32} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Seller account suspended</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your seller account has been suspended by ShopEase. Please contact seller support for details.
            </p>
          </div>
          <StatusBadge status={status} />
          <Button variant="outline" onClick={goHome}>
            Back to home
          </Button>
        </CardContent>
      </Card>
    );
  }

  // PENDING
  return (
    <Card className="mx-auto max-w-lg">
      <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
        <div className="rounded-full bg-amber-100 p-4 text-amber-700 dark:bg-amber-950">
          <Clock size={32} />
        </div>
        <div>
          <h2 className="text-lg font-bold">Your application is under review</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Thanks for applying! Our team is verifying your business and banking details. This usually takes
            less than 24 hours — we&apos;ll notify you as soon as your store is live.
          </p>
        </div>
        <StatusBadge status={status} />
        <Button variant="outline" onClick={goHome}>
          Back to home
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Application form ──────────────────────────────────────────────────────

const GSTIN_RE = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const IFSC_RE = /^[A-Z]{4}0[A-Z0-9]{6}$/;
const PHONE_RE = /^(\+91[- ]?)?[6-9][0-9]{9}$/;

const formSchema = z.object({
  businessName: z.string().min(3, "Business name must be at least 3 characters").max(120),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => v === "" || (v.length === 15 && GSTIN_RE.test(v)), "Enter a valid 15-character GSTIN (or leave blank)"),
  supportEmail: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Enter a valid support email"),
  supportPhone: z
    .string()
    .trim()
    .refine((v) => v === "" || PHONE_RE.test(v), "Enter a valid Indian phone number"),
  pickupLine1: z.string().min(5, "Pickup address is too short").max(200),
  pickupCity: z.string().min(2, "City is required").max(80),
  pickupState: z.string().min(2, "State is required").max(80),
  pickupPincode: z.string().regex(/^[1-9][0-9]{5}$/, "Enter a valid 6-digit pincode"),
  accountType: z.enum(["INDIVIDUAL", "BUSINESS"]),
  bankAccountName: z.string().min(2, "Account holder name is required").max(120),
  bankAccountNumber: z.string().regex(/^[0-9]{6,20}$/, "Account number must be 6-20 digits"),
  bankIfsc: z
    .string()
    .trim()
    .toUpperCase()
    .refine((v) => IFSC_RE.test(v), "Enter a valid IFSC code (e.g. HDFC0001234)"),
});

type FormValues = z.infer<typeof formSchema>;

const STEP1_FIELDS: (keyof FormValues)[] = [
  "businessName",
  "gstin",
  "supportEmail",
  "supportPhone",
  "pickupLine1",
  "pickupCity",
  "pickupState",
  "pickupPincode",
];
const STEP2_FIELDS: (keyof FormValues)[] = ["accountType", "bankAccountName", "bankAccountNumber", "bankIfsc"];

const STEP_LABELS = ["Business details", "Banking & payouts"];

function ApplyForm() {
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);
  const { refresh } = useSession();
  const [step, setStep] = useState(0);
  const [done, setDone] = useState<{ status: string } | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      businessName: "",
      gstin: "",
      supportEmail: "",
      supportPhone: "",
      pickupLine1: "",
      pickupCity: "",
      pickupState: "",
      pickupPincode: "",
      accountType: "INDIVIDUAL",
      bankAccountName: "",
      bankAccountNumber: "",
      bankIfsc: "",
    },
    mode: "onTouched",
  });
  const accountType = useWatch({ control: form.control, name: "accountType" });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      return api.post<{ seller: { id: string; businessName: string; status: string } }>("/api/seller/register", {
        businessName: values.businessName.trim(),
        gstin: values.gstin.trim() || undefined,
        supportEmail: values.supportEmail.trim() || undefined,
        supportPhone: values.supportPhone.trim() || undefined,
        pickupLine1: values.pickupLine1.trim(),
        pickupCity: values.pickupCity.trim(),
        pickupState: values.pickupState.trim(),
        pickupPincode: values.pickupPincode.trim(),
        accountType: values.accountType,
        bankAccountName: values.bankAccountName.trim(),
        bankAccountNumber: values.bankAccountNumber.trim(),
        bankIfsc: values.bankIfsc.trim(),
      });
    },
    onSuccess: async (res) => {
      toast.success("Application submitted", { description: "Your seller account is now under review." });
      setDone({ status: res.seller?.status ?? "PENDING" });
      await refresh();
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not submit application");
    },
  });

  const next = async () => {
    const valid = await form.trigger(STEP1_FIELDS);
    if (valid) setStep(1);
  };

  const submit = form.handleSubmit((values) => mutation.mutate(values));

  if (done) {
    return (
      <Card className="mx-auto max-w-lg">
        <CardContent className="flex flex-col items-center gap-4 p-10 text-center">
          <div className="rounded-full bg-amber-100 p-4 text-amber-700 dark:bg-amber-950">
            <Clock size={32} />
          </div>
          <div>
            <h2 className="text-lg font-bold">Application submitted — under review</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Your seller account status is <StatusBadge status={done.status} className="align-middle" />. Our
              team verifies business and banking details within 24 hours and you&apos;ll get a notification the
              moment your store goes live.
            </p>
          </div>
          <Button onClick={goHome}>Back to home</Button>
        </CardContent>
      </Card>
    );
  }

  const err = form.formState.errors;

  return (
    <Card>
      <CardContent className="p-5 sm:p-6">
        {/* Step indicator */}
        <div className="mb-6 flex items-center gap-2">
          {STEP_LABELS.map((label, i) => (
            <div key={label} className="flex flex-1 items-center gap-2">
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  i <= step ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </span>
              <span className={`hidden text-sm sm:block ${i === step ? "font-semibold" : "text-muted-foreground"}`}>
                {label}
              </span>
              {i === 0 && <span className="h-px flex-1 bg-border" />}
            </div>
          ))}
        </div>

        <form onSubmit={submit} noValidate>
          {step === 0 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="businessName">Business name *</Label>
                <Input id="businessName" placeholder="e.g. Sri Lakshmi Electronics" {...form.register("businessName")} />
                {err.businessName && <p className="text-xs text-rose-600">{err.businessName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gstin">GSTIN (optional)</Label>
                <Input id="gstin" placeholder="15-character GSTIN" maxLength={15} className="uppercase" {...form.register("gstin")} />
                {err.gstin && <p className="text-xs text-rose-600">{err.gstin.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supportEmail">Support email (optional)</Label>
                <Input id="supportEmail" type="email" placeholder="support@yourbusiness.in" {...form.register("supportEmail")} />
                {err.supportEmail && <p className="text-xs text-rose-600">{err.supportEmail.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="supportPhone">Support phone (optional)</Label>
                <Input id="supportPhone" placeholder="98XXXXXXXX" {...form.register("supportPhone")} />
                {err.supportPhone && <p className="text-xs text-rose-600">{err.supportPhone.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pickupPincode">Pickup pincode *</Label>
                <Input id="pickupPincode" inputMode="numeric" maxLength={6} placeholder="560001" {...form.register("pickupPincode")} />
                {err.pickupPincode && <p className="text-xs text-rose-600">{err.pickupPincode.message}</p>}
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="pickupLine1">Pickup address (street / locality) *</Label>
                <Textarea id="pickupLine1" rows={2} placeholder="Warehouse or shop address where couriers collect parcels" {...form.register("pickupLine1")} />
                {err.pickupLine1 && <p className="text-xs text-rose-600">{err.pickupLine1.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pickupCity">City *</Label>
                <Input id="pickupCity" placeholder="Bengaluru" {...form.register("pickupCity")} />
                {err.pickupCity && <p className="text-xs text-rose-600">{err.pickupCity.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pickupState">State *</Label>
                <Input id="pickupState" placeholder="Karnataka" {...form.register("pickupState")} />
                {err.pickupState && <p className="text-xs text-rose-600">{err.pickupState.message}</p>}
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Account type *</Label>
                <Select value={accountType} onValueChange={(v) => form.setValue("accountType", v as FormValues["accountType"])}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="INDIVIDUAL">Individual / Sole proprietor</SelectItem>
                    <SelectItem value="BUSINESS">Business / Company</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="hidden sm:block" />
              <div className="space-y-1.5">
                <Label htmlFor="bankAccountName">Bank account holder name *</Label>
                <Input id="bankAccountName" placeholder="As printed on your bank records" {...form.register("bankAccountName")} />
                {err.bankAccountName && <p className="text-xs text-rose-600">{err.bankAccountName.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankAccountNumber">Bank account number *</Label>
                <Input id="bankAccountNumber" inputMode="numeric" placeholder="6-20 digits" {...form.register("bankAccountNumber")} />
                {err.bankAccountNumber && <p className="text-xs text-rose-600">{err.bankAccountNumber.message}</p>}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="bankIfsc">IFSC code *</Label>
                <Input id="bankIfsc" placeholder="HDFC0001234" maxLength={11} className="uppercase" {...form.register("bankIfsc")} />
                {err.bankIfsc && <p className="text-xs text-rose-600">{err.bankIfsc.message}</p>}
              </div>
              <p className="text-xs text-muted-foreground sm:col-span-2">
                Your account number is masked and stored securely — only the last 4 digits are ever visible to
                ShopEase staff. Payouts are credited to this account after each delivery.
              </p>
            </div>
          )}

          <div className="mt-6 flex items-center justify-between gap-3">
            <Button
              type="button"
              variant="outline"
              onClick={() => (step === 0 ? navigate("seller-onboarding") : setStep(0))}
              disabled={mutation.isPending}
            >
              <ChevronLeft size={16} /> {step === 0 ? "Cancel" : "Back"}
            </Button>
            {step === 0 ? (
              <Button type="button" onClick={next}>
                Continue <ChevronRight size={16} />
              </Button>
            ) : (
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
                Submit application
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

export default function SellerOnboardingView(_props: { params?: Record<string, string>; mode?: string }) {
  const { user, loading } = useSession();
  const navigate = useNav((s) => s.navigate);

  return (
    <div className="min-h-screen bg-muted/30">
      <OnboardingBar />
      <main className="mx-auto max-w-5xl space-y-8 px-4 py-8">
        {loading ? (
          <OnboardingSkeleton />
        ) : (
          <>
            <BenefitsHero />
            {!user ? (
              <Card className="mx-auto max-w-md">
                <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
                  <div className="rounded-full bg-primary/10 p-4 text-primary">
                    <Store size={28} />
                  </div>
                  <div>
                    <h2 className="font-bold">Sign in to start selling</h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create a ShopEase account or sign in with your existing one to apply as a seller.
                    </p>
                  </div>
                  <Button onClick={() => navigate("login")}>Sign in to continue</Button>
                </CardContent>
              </Card>
            ) : user.role === "SELLER" ? (
              <SellerStatusScreen user={user} />
            ) : (
              <ApplyForm />
            )}
          </>
        )}
      </main>
    </div>
  );
}
