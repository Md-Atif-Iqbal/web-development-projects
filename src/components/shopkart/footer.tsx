"use client";

// ShopEase footer — premium navy surface:
//   A. Benefits bar (honest capability statements)
//   B. Newsletter ("Stay in the Loop!") wired to POST /api/newsletter/subscribe
//   C. Brand + Company / Customer Policies / Customer Support columns
//   D. Legal bar (dynamic year, privacy/terms/contact links)
// Secondary text uses #CBD5E1 (slate-300); hover accents use the brand orange.

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  AlertCircle,
  BadgeCheck,
  CheckCircle2,
  Loader2,
  RotateCcw,
  ShieldCheck,
  Truck,
} from "lucide-react";
import { useNav, type ViewName } from "@/lib/store";
import { BrandLogo } from "@/components/shopkart/shared";
import { api, ApiClientError } from "@/lib/client/api";

type FooterLink = { label: string; view: ViewName; params?: Record<string, string> };

// Every statement reflects an implemented capability: logistics adapter with
// delivery estimates, returns & refunds workflow, sandbox payment gateway
// (labelled as such in checkout), seller verification by admin approval.
const BENEFITS = [
  { icon: Truck, title: "Fast Delivery", desc: "Convenient delivery options" },
  { icon: RotateCcw, title: "Easy Returns", desc: "Simple eligible return process" },
  { icon: ShieldCheck, title: "Secure Payments", desc: "Secure payment processing" },
  { icon: BadgeCheck, title: "Verified Sellers", desc: "Shop from approved sellers" },
] as const;

const LINK_COLUMNS: { heading: string; links: FooterLink[] }[] = [
  {
    heading: "Company",
    links: [
      { label: "About ShopEase", view: "policies", params: { doc: "about" } },
      { label: "Contact Us", view: "support" },
      { label: "Careers", view: "policies", params: { doc: "careers" } },
      { label: "Sell on ShopEase", view: "seller-onboarding" },
    ],
  },
  {
    heading: "Customer Policies",
    links: [
      { label: "Privacy Policy", view: "policies", params: { doc: "privacy" } },
      { label: "Terms and Conditions", view: "policies", params: { doc: "terms" } },
      { label: "Shipping Policy", view: "policies", params: { doc: "shipping" } },
      { label: "Cancellation Policy", view: "policies", params: { doc: "cancellation" } },
      { label: "Return and Refund Policy", view: "policies", params: { doc: "returns" } },
    ],
  },
  {
    heading: "Customer Support",
    links: [
      { label: "Help Center", view: "support" },
      { label: "FAQs", view: "policies", params: { doc: "faqs" } },
      { label: "Track Your Order", view: "orders" },
      { label: "Account & Order Support", view: "support" },
      { label: "Seller Registration", view: "seller-onboarding" },
    ],
  },
];

const LEGAL_LINKS: FooterLink[] = [
  { label: "Privacy Policy", view: "policies", params: { doc: "privacy" } },
  { label: "Terms & Conditions", view: "policies", params: { doc: "terms" } },
  { label: "Contact Us", view: "support" },
];

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

function NewsletterBand() {
  const [email, setEmail] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (value: string) =>
      api.post<{ subscribed: boolean; alreadySubscribed: boolean }>(
        "/api/newsletter/subscribe",
        { email: value },
      ),
    onSuccess: () => {
      setEmail("");
      setValidationError(null);
    },
    onError: () => {
      // Error message is rendered from the mutation state below.
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      setValidationError("Email is required");
      return;
    }
    if (!EMAIL_RE.test(value)) {
      setValidationError("Enter a valid email address");
      return;
    }
    setValidationError(null);
    mutation.mutate(value);
  };

  const alreadySubscribed = mutation.isSuccess && mutation.data?.alreadySubscribed === true;

  return (
    <section aria-labelledby="newsletter-heading" className="border-b border-white/10">
      <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:py-6">
        <div className="flex flex-col gap-4 rounded-2xl border border-white/10 bg-white/[0.04] p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between lg:gap-8">
          <div className="max-w-md shrink-0">
            <h3 id="newsletter-heading" className="text-lg font-bold tracking-tight text-white sm:text-xl">
              Stay in the Loop!
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-slate-300">
              Get updates on new arrivals, special offers, and exciting products.
            </p>
          </div>

          <div className="w-full lg:max-w-md">
            <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2 sm:flex-row">
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="Enter your email address"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (validationError) setValidationError(null);
                }}
                aria-invalid={validationError ? true : undefined}
                aria-describedby="newsletter-status"
                className="h-10 w-full flex-1 rounded-lg border border-white/15 bg-white/[0.07] px-3.5 text-sm text-white placeholder:text-white/40 transition-colors focus:border-orange-300/70 focus:outline-none focus:ring-2 focus:ring-orange-300/40"
              />
              <button
                type="submit"
                disabled={mutation.isPending}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-semibold text-primary-foreground transition-all hover:bg-primary/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {mutation.isPending ? (
                  <>
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                    Subscribing…
                  </>
                ) : (
                  "Subscribe"
                )}
              </button>
            </form>

            <div id="newsletter-status" role="status" aria-live="polite" className="mt-2 min-h-4 text-xs">
              {validationError && (
                <p className="flex items-center gap-1.5 text-red-300">
                  <AlertCircle size={13} aria-hidden /> {validationError}
                </p>
              )}
              {!validationError && mutation.isError && (
                <p className="flex items-center gap-1.5 text-red-300">
                  <AlertCircle size={13} aria-hidden />
                  {mutation.error instanceof ApiClientError
                    ? mutation.error.message
                    : "Could not subscribe right now. Please try again."}
                </p>
              )}
              {!validationError && alreadySubscribed && (
                <p className="flex items-center gap-1.5 text-amber-200">
                  <CheckCircle2 size={13} aria-hidden /> You&apos;re already on the list — no changes needed.
                </p>
              )}
              {!validationError && mutation.isSuccess && !alreadySubscribed && (
                <p className="flex items-center gap-1.5 text-emerald-300">
                  <CheckCircle2 size={13} aria-hidden /> You&apos;re subscribed! Watch your inbox for new arrivals and offers.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Footer() {
  const navigate = useNav((s) => s.navigate);

  const go = (link: FooterLink) => () => navigate(link.view, link.params);

  return (
    <footer className="mt-auto bg-brand-navy text-brand-navy-foreground">
      {/* A. Benefits bar */}
      <section aria-label="Why shop with ShopEase" className="border-b border-white/10">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-x-2 gap-y-1 px-4 py-5 max-[359px]:grid-cols-1 sm:px-6 lg:grid-cols-4 lg:gap-x-4 lg:py-6">
          {BENEFITS.map((b) => (
            <div
              key={b.title}
              className="group flex items-center gap-3 rounded-xl p-2 transition-colors duration-200 hover:bg-white/[0.05]"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/10 text-brand-yellow ring-1 ring-white/10 transition-colors duration-200 group-hover:bg-primary group-hover:text-white">
                <b.icon size={18} strokeWidth={1.9} aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-white">{b.title}</p>
                <p className="mt-0.5 text-xs leading-snug text-slate-300">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* B. Newsletter */}
      <NewsletterBand />

      {/* C. Brand + link columns */}
      <section aria-label="Footer" className="border-b border-white/10">
        <div className="mx-auto grid max-w-7xl grid-cols-1 gap-6 px-4 py-6 sm:grid-cols-2 sm:px-6 sm:py-8 lg:grid-cols-[1.4fr_1fr_1.2fr_1.2fr]">
          <div className="space-y-3">
            <BrandLogo variant="onDark" size="lg" onClick={() => navigate("home")} />
            <p className="max-w-xs text-sm leading-relaxed text-slate-300">
              Discover quality products across electronics, fashion, home essentials, and more.
              Enjoy a convenient shopping experience with ShopEase.
            </p>
          </div>

          {LINK_COLUMNS.map((col) => (
            <nav key={col.heading} aria-label={col.heading}>
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-white/45">
                {col.heading}
              </h4>
              <ul className="space-y-2 sm:space-y-1.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <button
                      onClick={go(link)}
                      className="rounded text-sm text-slate-300 transition-colors duration-150 hover:text-orange-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                    >
                      {link.label}
                    </button>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>
      </section>

      {/* D. Legal bar */}
      <div>
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-center sm:flex-row sm:px-6 sm:text-left">
          <p className="text-xs text-white/55">© {new Date().getFullYear()} ShopEase. All rights reserved.</p>
          <nav aria-label="Legal">
            <ul className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5">
              {LEGAL_LINKS.map((link) => (
                <li key={link.label}>
                  <button
                    onClick={go(link)}
                    className="rounded text-xs text-white/55 transition-colors duration-150 hover:text-orange-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-300"
                  >
                    {link.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      {/* Spacer so the fixed mobile bottom nav never covers footer content */}
      <div className="h-14 sm:hidden" aria-hidden />
    </footer>
  );
}
