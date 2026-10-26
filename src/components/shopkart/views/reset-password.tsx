"use client";

// Reset-password view — set a new password using the e-mailed token.
// Opened via deep link /?reset=<token> (parsed in app.tsx) or from the
// forgot-password sandbox shortcut. Handles missing/invalid/expired/used
// tokens with a clear error and a path back to requesting a new link.

import { useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import {
  Loader2, ArrowLeft, Eye, EyeOff, LockKeyhole, Check, X,
  CircleAlert, ListChecks,
} from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { BrandLogo } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// Policy mirrors the server's validation (min 8 chars, letter + digit).
const resetSchema = z
  .object({
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(72, "Password is too long")
      .regex(/[a-zA-Z]/, "Password must include a letter")
      .regex(/\d/, "Password must include a digit"),
    confirm: z.string().min(1, "Confirm your password"),
  })
  .refine((d) => d.password === d.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });

type ResetValues = z.infer<typeof resetSchema>;

function PasswordInput({
  id,
  label,
  autoComplete,
  registerRef,
  error,
  value,
}: {
  id: string;
  label: string;
  autoComplete: string;
  registerRef: Record<string, unknown>;
  error?: string;
  value: string;
}) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? "text" : "password"}
          placeholder="••••••••"
          autoComplete={autoComplete}
          className="pr-10"
          {...registerRef}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
        >
          {visible ? <EyeOff size={16} /> : <Eye size={16} />}
        </button>
      </div>
      {error && <p className="text-xs text-rose-600">{error}</p>}
      {/* Screen-reader-only mirror so the value is announced without display */}
      <span className="sr-only" aria-live="polite">{value ? `${label} filled (${value.length} characters)` : ""}</span>
    </div>
  );
}

export default function ResetPasswordView({ params }: { params?: Record<string, string> }) {
  const navigate = useNav((s) => s.navigate);
  const token = params?.token ?? "";
  const [done, setDone] = useState(false);
  const [invalid, setInvalid] = useState<false | string>(false);

  const form = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: "", confirm: "" },
  });
  const pwd = useWatch({ control: form.control, name: "password" }) ?? "";
  const confirm = useWatch({ control: form.control, name: "confirm" }) ?? "";

  const rules = [
    { label: "At least 8 characters", ok: pwd.length >= 8 },
    { label: "Contains a letter", ok: /[a-zA-Z]/.test(pwd) },
    { label: "Contains a digit", ok: /\d/.test(pwd) },
    { label: "Passwords match", ok: pwd.length > 0 && pwd === confirm },
  ];

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await api.post<{ ok: boolean; message: string }>("/api/auth/reset-password", {
        token,
        newPassword: values.password,
      });
      setDone(true);
      toast.success("Password reset successful — please sign in");
    } catch (err) {
      if (err instanceof ApiClientError && err.code === "TOKEN_INVALID") {
        setInvalid(err.message);
      } else if (err instanceof ApiClientError) {
        form.setError("confirm", { type: "manual", message: err.message });
      } else {
        form.setError("confirm", { type: "manual", message: "Something went wrong. Please try again." });
      }
    }
  });

  const requestNewLink = () => navigate("forgot-password");

  // ── Invalid / missing / consumed token ──
  if (!token || invalid) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col px-4 py-8 sm:px-6">
        <Button variant="ghost" size="sm" className="mb-4 w-fit gap-1.5 text-muted-foreground" onClick={() => navigate("login")}>
          <ArrowLeft size={16} /> Back to login
        </Button>
        <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
          <div className="mb-6 flex justify-center">
            <BrandLogo onClick={() => navigate("home")} />
          </div>
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-950 dark:text-rose-400">
            <CircleAlert size={26} />
          </span>
          <h1 className="mt-4 text-xl font-bold tracking-tight">
            {token ? "Reset link invalid" : "No reset token"}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {invalid ??
              "This password reset link is missing required information. Please request a fresh link to continue."}
          </p>
          <Button className="mt-5 w-full" onClick={requestNewLink}>
            Request a new reset link
          </Button>
          <p className="mt-4 text-center text-sm text-muted-foreground">
            <button className="font-semibold text-primary hover:underline" onClick={() => navigate("login")}>
              Back to Login
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Success ──
  if (done) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col px-4 py-8 sm:px-6">
        <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-6 text-center shadow-sm sm:p-8">
          <div className="mb-6 flex justify-center">
            <BrandLogo onClick={() => navigate("home")} />
          </div>
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400">
            <LockKeyhole size={26} />
          </span>
          <h1 className="mt-4 text-xl font-bold tracking-tight">Password reset successful</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Your password has been updated and all previous sessions have been signed out for safety.
            You can now sign in with your new password.
          </p>
          <Button className="mt-5 w-full" onClick={() => navigate("login")}>
            Go to Login
          </Button>
        </div>
      </div>
    );
  }

  // ── Form ──
  return (
    <div className="mx-auto flex max-w-7xl flex-col px-4 py-8 sm:px-6">
      <Button variant="ghost" size="sm" className="mb-4 w-fit gap-1.5 text-muted-foreground" onClick={() => navigate("login")}>
        <ArrowLeft size={16} /> Back to login
      </Button>
      <div className="mx-auto w-full max-w-md rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
        <div className="mb-6 flex justify-center">
          <BrandLogo onClick={() => navigate("home")} />
        </div>

        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">Set a New Password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Choose a strong password you haven&apos;t used before.
          </p>
        </div>

        <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
          <PasswordInput
            id="reset-password"
            label="New password"
            autoComplete="new-password"
            registerRef={form.register("password")}
            error={form.formState.errors.password?.message}
            value={pwd}
          />
          <PasswordInput
            id="reset-confirm"
            label="Confirm password"
            autoComplete="new-password"
            registerRef={form.register("confirm")}
            error={form.formState.errors.confirm?.message}
            value={confirm}
          />

          {/* Live password requirements */}
          <div className="rounded-xl border bg-muted/40 p-3" aria-label="Password requirements">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
              <ListChecks size={13} /> Password requirements
            </p>
            <ul className="space-y-1">
              {rules.map((r) => (
                <li key={r.label} className={`flex items-center gap-1.5 text-xs ${r.ok ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
                  {r.ok ? <Check size={13} /> : <X size={13} />}
                  {r.label}
                </li>
              ))}
            </ul>
          </div>

          <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting && <Loader2 size={16} className="animate-spin" />} Reset Password
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          <button className="font-semibold text-primary hover:underline" onClick={() => navigate("login")}>
            Back to Login
          </button>
        </p>
      </div>
    </div>
  );
}
