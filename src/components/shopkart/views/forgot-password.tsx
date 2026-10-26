"use client";

// Forgot-password view — request a password reset link.
// Matches the auth view's design language (orange brand accents, card form).

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ArrowLeft, MailCheck, ShieldCheck, FlaskConical } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { BrandLogo } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const forgotSchema = z.object({
  email: z
    .string()
    .min(1, "Email is required")
    .max(120, "Email is too long")
    .pipe(
      // Separate step so empty input reports "required", not a format error.
      z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, "Enter a valid email address")
    ),
});

type ForgotValues = z.infer<typeof forgotSchema>;

type ForgotResponse = {
  ok: boolean;
  message: string;
  sandbox?: { note: string; resetPath: string };
};

export default function ForgotPasswordView(_props: { params?: Record<string, string> }) {
  const navigate = useNav((s) => s.navigate);
  const [sent, setSent] = useState(false);
  const [sandbox, setSandbox] = useState<ForgotResponse["sandbox"] | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: "" },
  });

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      const res = await api.post<ForgotResponse>("/api/auth/forgot-password", values);
      // Neutral message regardless of whether the account exists — never
      // reveal registration status.
      setSent(true);
      if (res.sandbox) setSandbox(res.sandbox);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 429) {
        setFormError(err.message);
      } else if (err instanceof ApiClientError) {
        setFormError(err.message);
      } else {
        setFormError("Something went wrong. Please try again.");
      }
    }
  });

  const openSandboxLink = () => {
    if (!sandbox) return;
    const token = new URLSearchParams(sandbox.resetPath.split("?")[1] ?? "").get("reset") ?? "";
    navigate("reset-password", { token });
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col px-4 py-8 sm:px-6">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 w-fit gap-1.5 text-muted-foreground"
        onClick={() => navigate("login")}
      >
        <ArrowLeft size={16} /> Back to login
      </Button>

      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border bg-card p-6 shadow-sm sm:p-8">
          {/* Logo */}
          <div className="mb-6 flex justify-center">
            <BrandLogo onClick={() => navigate("home")} />
          </div>

          {!sent ? (
            <>
              <div className="text-center">
                <h1 className="text-2xl font-bold tracking-tight">Forgot Your Password?</h1>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  Don&apos;t worry! Enter your registered email address and we&apos;ll help you reset your password.
                </p>
              </div>

              {formError && (
                <div
                  role="alert"
                  className="mt-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300"
                >
                  {formError}
                </div>
              )}

              <form onSubmit={onSubmit} className="mt-5 space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="forgot-email">Email address</Label>
                  <Input
                    id="forgot-email"
                    type="email"
                    placeholder="you@example.com"
                    autoComplete="email"
                    autoFocus
                    {...form.register("email")}
                  />
                  {form.formState.errors.email && (
                    <p className="text-xs text-rose-600">{form.formState.errors.email.message}</p>
                  )}
                </div>

                <Button type="submit" size="lg" className="w-full" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting && <Loader2 size={16} className="animate-spin" />}
                  Send Reset Link
                </Button>
              </form>
            </>
          ) : (
            <div className="text-center" role="status">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-primary">
                <MailCheck size={26} />
              </span>
              <h1 className="mt-4 text-xl font-bold tracking-tight">Check your email</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                If an account exists with this email address, you will receive password reset instructions.
              </p>
              <p className="mt-3 text-xs text-muted-foreground">
                The link expires in 30 minutes and can be used only once.
              </p>

              {sandbox && (
                <div className="mt-5 rounded-xl border border-dashed border-amber-400 bg-amber-50/70 p-3.5 text-left dark:border-amber-700 dark:bg-amber-950/40">
                  <p className="flex items-start gap-1.5 text-xs font-semibold text-amber-900 dark:text-amber-300">
                    <FlaskConical size={14} className="mt-0.5 shrink-0" />
                    {sandbox.note}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    className="mt-2.5 w-full"
                    onClick={openSandboxLink}
                  >
                    Open reset link (sandbox)
                  </Button>
                </div>
              )}
            </div>
          )}

          <p className="mt-6 flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground">
            <ShieldCheck size={13} className="text-primary" />
            For your security, reset links are single-use and expire automatically.
          </p>

          <p className="mt-4 text-center text-sm text-muted-foreground">
            Remembered it?{" "}
            <button
              className="font-semibold text-primary hover:underline"
              onClick={() => navigate("login")}
            >
              Back to Login
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}
