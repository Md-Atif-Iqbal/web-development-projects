"use client";

// Auth view — login & register. Split layout: orange brand panel + form card.

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, Truck, RotateCcw, ShieldCheck, BadgeIndianRupee, KeyRound, Eye, EyeOff, ShoppingBag } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useSession } from "@/lib/session";
import { useNav } from "@/lib/store";
import { BrandLogo } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const emailField = z
  .string()
  .min(1, "Email is required")
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address");

/** Password input with show/hide toggle (shared by login & register). */
function AuthPasswordInput({
  id,
  autoComplete,
  placeholder,
  registerRef,
}: {
  id: string;
  autoComplete: string;
  placeholder?: string;
  registerRef: Record<string, unknown>;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className="pr-10"
        {...registerRef}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
      >
        {visible ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Password is required"),
});

const registerSchema = z
  .object({
    name: z.string().min(2, "Enter your full name"),
    email: emailField,
    phone: z
      .string()
      .regex(/^[6-9]\d{9}$/, "Enter a valid 10-digit mobile number")
      .optional()
      .or(z.literal("")),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .regex(/[a-zA-Z]/, "Password must include a letter")
      .regex(/\d/, "Password must include a digit"),
    confirm: z.string().min(1, "Confirm your password"),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords do not match" });

type LoginValues = z.infer<typeof loginSchema>;
type RegisterValues = z.infer<typeof registerSchema>;

const DEMO_ACCOUNTS = [
  { role: "Admin", email: "admin@shopkart.in", password: "Admin@123" },
  { role: "Customer", email: "riya@example.com", password: "Customer@123" },
  { role: "Seller", email: "seller@shopkart.in", password: "Seller@123" },
];

const VALUE_PROPS = [
  { icon: Truck, title: "Free delivery", desc: "On orders above ₹500, pan-India" },
  { icon: RotateCcw, title: "Easy returns", desc: "Hassle-free pickups & quick refunds" },
  { icon: BadgeIndianRupee, title: "Best prices", desc: "Multiple sellers compete for you" },
  { icon: ShieldCheck, title: "Secure payments", desc: "UPI, cards, netbanking & COD" },
];

export default function AuthView(_props: { params?: Record<string, string>; mode?: string }) {
  const { mode } = _props;
  const isLogin = mode !== "register";
  const navigate = useNav((s) => s.navigate);
  const { user, loading, refresh } = useSession();
  const [formError, setFormError] = useState<string | null>(null);

  // Already signed in → straight to the store.
  useEffect(() => {
    if (!loading && user) navigate("home");
  }, [loading, user, navigate]);

  const loginForm = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const registerForm = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: "", email: "", phone: "", password: "", confirm: "" },
  });

  const submitAuth = async (payload: Record<string, string>) => {
    setFormError(null);
    try {
      await api.post<{ user: unknown }>(isLogin ? "/api/auth/login" : "/api/auth/register", payload);
      toast.success(isLogin ? "Signed in successfully" : "Welcome to ShopEase! Account created");
      await refresh();
      navigate("home");
    } catch (err) {
      const message = err instanceof ApiClientError ? err.message : "Something went wrong. Please try again.";
      setFormError(message);
    }
  };

  const onLogin = loginForm.handleSubmit((values) => submitAuth(values));
  const onRegister = registerForm.handleSubmit(({ confirm: _confirm, ...values }) => {
    const payload: Record<string, string> = { ...values };
    if (!payload.phone) delete payload.phone;
    void submitAuth(payload);
  });

  const fillDemo = (email: string, password: string) => {
    loginForm.setValue("email", email, { shouldValidate: true });
    loginForm.setValue("password", password, { shouldValidate: true });
    setFormError(null);
  };

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 gap-1.5 text-muted-foreground"
        onClick={() => navigate("home")}
      >
        <ArrowLeft size={16} /> Back to store
      </Button>

      <div className="grid min-h-[560px] overflow-hidden rounded-2xl border bg-card shadow-sm lg:grid-cols-2">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between bg-gradient-to-br from-orange-500 via-orange-600 to-amber-600 p-10 text-white lg:flex">
          <div>
            <button onClick={() => navigate("home")} className="flex items-center gap-2 transition-transform duration-200 hover:scale-[1.03]" aria-label="ShopEase home">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/95 text-orange-600 shadow-sm">
                <ShoppingBag size={20} strokeWidth={2.4} />
              </span>
              <span className="text-2xl font-extrabold tracking-tight text-white">
                Shop<span className="text-amber-200">Ease</span>
              </span>
            </button>
            <h1 className="mt-10 max-w-sm text-3xl font-extrabold leading-tight">
              India&apos;s friendly multi-vendor marketplace
            </h1>
            <p className="mt-3 max-w-sm text-sm text-orange-100">
              Millions of products from verified sellers — electronics, fashion, home and more.
            </p>
          </div>
          <div className="space-y-4">
            {VALUE_PROPS.map((p) => (
              <div key={p.title} className="flex items-start gap-3">
                <span className="rounded-lg bg-white/15 p-2 backdrop-blur-sm">
                  <p.icon size={18} />
                </span>
                <div>
                  <p className="text-sm font-semibold">{p.title}</p>
                  <p className="text-xs text-orange-100">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-orange-200">Sandbox demo environment — no real payments.</p>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center p-6 sm:p-10">
          <div className="w-full max-w-sm">
            <div className="mb-6 lg:hidden">
              <BrandLogo onClick={() => navigate("home")} />
            </div>

            <h2 className="text-2xl font-bold tracking-tight">{isLogin ? "Sign in" : "Create your account"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isLogin ? "to access your orders, cart & wishlist" : "and start shopping from verified sellers"}
            </p>

            {formError && (
              <div role="alert" className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
                {formError}
              </div>
            )}

            {isLogin ? (
              <form onSubmit={onLogin} className="mt-5 space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="login-email">Email</Label>
                  <Input id="login-email" type="email" placeholder="you@example.com" autoComplete="email" {...loginForm.register("email")} />
                  {loginForm.formState.errors.email && (
                    <p className="text-xs text-rose-600">{loginForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="login-password">Password</Label>
                    <button
                      type="button"
                      className="text-xs font-medium text-primary hover:underline"
                      onClick={() => navigate("forgot-password")}
                    >
                      Forgot password?
                    </button>
                  </div>
                  <AuthPasswordInput id="login-password" autoComplete="current-password" placeholder="••••••••" registerRef={loginForm.register("password")} />
                  {loginForm.formState.errors.password && (
                    <p className="text-xs text-rose-600">{loginForm.formState.errors.password.message}</p>
                  )}
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={loginForm.formState.isSubmitting}>
                  {loginForm.formState.isSubmitting && <Loader2 size={16} className="animate-spin" />} Sign in
                </Button>
              </form>
            ) : (
              <form onSubmit={onRegister} className="mt-5 space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-name">Full name</Label>
                  <Input id="reg-name" placeholder="Riya Sharma" autoComplete="name" {...registerForm.register("name")} />
                  {registerForm.formState.errors.name && (
                    <p className="text-xs text-rose-600">{registerForm.formState.errors.name.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-email">Email</Label>
                  <Input id="reg-email" type="email" placeholder="you@example.com" autoComplete="email" {...registerForm.register("email")} />
                  {registerForm.formState.errors.email && (
                    <p className="text-xs text-rose-600">{registerForm.formState.errors.email.message}</p>
                  )}
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="reg-phone">
                    Mobile number <span className="font-normal text-muted-foreground">(optional)</span>
                  </Label>
                  <Input id="reg-phone" inputMode="numeric" placeholder="9876543210" autoComplete="tel" {...registerForm.register("phone")} />
                  {registerForm.formState.errors.phone && (
                    <p className="text-xs text-rose-600">{registerForm.formState.errors.phone.message}</p>
                  )}
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-password">Password</Label>
                    <AuthPasswordInput id="reg-password" autoComplete="new-password" placeholder="Min 8 chars" registerRef={registerForm.register("password")} />
                    {registerForm.formState.errors.password && (
                      <p className="text-xs text-rose-600">{registerForm.formState.errors.password.message}</p>
                    )}
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="reg-confirm">Confirm password</Label>
                    <AuthPasswordInput id="reg-confirm" autoComplete="new-password" placeholder="Repeat password" registerRef={registerForm.register("confirm")} />
                    {registerForm.formState.errors.confirm && (
                      <p className="text-xs text-rose-600">{registerForm.formState.errors.confirm.message}</p>
                    )}
                  </div>
                </div>
                <Button type="submit" size="lg" className="w-full" disabled={registerForm.formState.isSubmitting}>
                  {registerForm.formState.isSubmitting && <Loader2 size={16} className="animate-spin" />} Create account
                </Button>
              </form>
            )}

            {isLogin && (
              <div className="mt-6 rounded-xl border border-dashed border-amber-300 bg-amber-50/70 p-3.5 dark:border-amber-800 dark:bg-amber-950/40">
                <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-300">
                  <KeyRound size={13} /> Demo credentials — click to fill
                </p>
                <div className="space-y-1.5">
                  {DEMO_ACCOUNTS.map((d) => (
                    <button
                      key={d.email}
                      type="button"
                      onClick={() => fillDemo(d.email, d.password)}
                      className="flex w-full items-center justify-between rounded-lg bg-white/80 px-3 py-2 text-left text-xs transition-colors hover:bg-white dark:bg-white/5 dark:hover:bg-white/10"
                    >
                      <span className="font-semibold">{d.role}</span>
                      <span className="font-mono text-muted-foreground">{d.email}</span>
                      <span className="font-mono text-muted-foreground">{d.password}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <p className="mt-6 text-center text-sm text-muted-foreground">
              {isLogin ? (
                <>
                  New to ShopEase?{" "}
                  <button className="font-semibold text-primary hover:underline" onClick={() => { setFormError(null); navigate("register"); }}>
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{" "}
                  <button className="font-semibold text-primary hover:underline" onClick={() => { setFormError(null); navigate("login"); }}>
                    Sign in
                  </button>
                </>
              )}
            </p>

            <p className="mt-4 text-center text-[11px] leading-relaxed text-muted-foreground">
              By continuing you agree to ShopEase&apos;s <button className="underline" onClick={() => navigate("policies", { doc: "terms" })}>Terms of Use</button> and{" "}
              <button className="underline" onClick={() => navigate("policies", { doc: "privacy" })}>Privacy Policy</button>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
