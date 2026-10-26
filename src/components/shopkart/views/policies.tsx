"use client";

// Policies — static legal / informational pages (demo content).

import { ArrowLeft, ChevronRight, FileText } from "lucide-react";
import { useNav } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

type Doc = { key: string; title: string; updated: string; intro: string; sections: { heading: string; body: string[] }[] };

const DOCS: Doc[] = [
  {
    key: "privacy", title: "Privacy Policy", updated: "1 January 2025",
    intro: "ShopEase Marketplace Pvt. Ltd. ('ShopEase', 'we') respects your privacy. This policy explains what we collect, why, and the choices you have. This demo deployment stores data only for evaluation purposes.",
    sections: [
      { heading: "1. Information we collect", body: [
        "Account details: name, email address, mobile number and a securely hashed password. We never store plain-text passwords.",
        "Order information: delivery addresses, order history, payment method labels and transaction references.",
        "Usage information: product views, searches and cart interactions used to improve recommendations.",
        "Seller information: business name, GSTIN, pickup address and masked bank account details for verification and settlements.",
      ]},
      { heading: "2. How we use information", body: [
        "To operate the marketplace: process orders, arrange delivery, handle returns and refunds, and provide support.",
        "To verify sellers and pay settlements.",
        "To prevent fraud and abuse, and to comply with applicable Indian law, including requests from lawful authorities.",
        "We do not sell your personal information to third parties.",
      ]},
      { heading: "3. Payments", body: [
        "Payments are processed by our payment service provider. Card details are entered on the provider's page; ShopEase never receives or stores full card numbers or CVV.",
        "In this sandbox environment, a clearly-labelled simulated gateway is used and no real money moves.",
      ]},
      { heading: "4. Data retention & your rights", body: [
        "You can request access, correction or deletion of your personal data from your profile or by contacting support.",
        "Order and financial records are retained as required by applicable tax and accounting rules.",
      ]},
      { heading: "5. Contact", body: [
        "Grievance Officer, ShopEase Marketplace Pvt. Ltd., Bengaluru, India. We respond within 30 days. Reach us any time from the in-app Help Center (Support) page.",
      ]},
    ],
  },
  {
    key: "terms", title: "Terms of Use", updated: "1 January 2025",
    intro: "By accessing ShopEase you agree to these terms. ShopEase is a marketplace: products are listed and sold by independent sellers, and ShopEase facilitates the transaction.",
    sections: [
      { heading: "1. Accounts", body: [
        "You must provide accurate information and keep credentials secure. You are responsible for activity under your account.",
        "We may suspend accounts that violate these terms, attempt fraud, or abuse promotions.",
      ]},
      { heading: "2. Marketplace role", body: [
        "Sellers are responsible for their listings, quality, warranties and statutory permits. ShopEase moderates listings and may remove any that are inaccurate or prohibited.",
        "Prices include applicable GST unless stated otherwise. Order totals are computed server-side; listed prices can change until an order is placed.",
      ]},
      { heading: "3. Acceptable use", body: [
        "Do not misuse reviews, scrape the platform, interfere with security controls, or resell platform content without permission.",
      ]},
      { heading: "4. Liability", body: [
        "To the maximum extent permitted by law, ShopEase's aggregate liability for any claim is limited to the value of the relevant order.",
        "These terms are governed by the laws of India; courts at Bengaluru have exclusive jurisdiction.",
      ]},
    ],
  },
  {
    key: "shipping", title: "Shipping Policy", updated: "1 January 2025",
    intro: "We deliver across serviceable PIN codes in India through our logistics partners.",
    sections: [
      { heading: "1. Serviceability & timelines", body: [
        "Enter your PIN code on any product page to check delivery estimates. Metro PIN codes typically receive orders in 2 days; other serviceable areas in 3–5 days.",
        "Multi-seller orders arrive as separate shipments, each tracked independently.",
      ]},
      { heading: "2. Charges", body: [
        "Delivery is free on orders of ₹500 and above per seller; below that a ₹40 handling fee applies per seller shipment.",
        "Cash on Delivery (where available) carries a ₹19 handling fee and is limited to orders up to ₹50,000.",
      ]},
      { heading: "3. Tracking & delivery attempts", body: [
        "Tracking numbers appear under your order once the seller dispatches. Couriers usually make up to 3 delivery attempts before returning a shipment.",
        "Note: this sandbox deployment uses a simulated logistics provider — tracking events are illustrative.",
      ]},
    ],
  },
  {
    key: "cancellation", title: "Cancellation Policy", updated: "1 January 2025",
    intro: "You stay in control of your order until it ships — cancel in a couple of taps from My Orders, with no calls or emails needed.",
    sections: [
      { heading: "1. When you can cancel", body: [
        "Orders can be cancelled while they are awaiting payment confirmation, confirmed, or being processed by the seller — any time before dispatch.",
        "Once a shipment is handed to the courier, cancellation closes for that shipment and the returns process applies instead.",
      ]},
      { heading: "2. How to cancel", body: [
        "Open My Orders, select the order or shipment and choose Cancel.",
        "Multi-seller orders are fulfilled as separate shipments, so you can cancel one part and keep the rest.",
      ]},
      { heading: "3. Refunds on cancellation", body: [
        "Prepaid orders are refunded to the original payment method once the cancellation is confirmed; banks typically credit in 3–5 working days.",
        "Cash-on-Delivery orders are simply cancelled — you are never charged for a cancelled COD shipment.",
      ]},
    ],
  },
  {
    key: "returns", title: "Return and Refund Policy", updated: "1 January 2025",
    intro: "Our buyer-protection programme lets you return eligible items within the policy window and tracks every refund to completion.",
    sections: [
      { heading: "1. Returns", body: [
        "Most categories include a 7-day return window (14 days for fashion) from delivery, shown on the product page. Items must be unused, with tags/packaging intact.",
        "Open eligible reasons include damaged/defective, wrong item, not as described, size issues and changed mind.",
      ]},
      { heading: "2. Refunds", body: [
        "After pickup and quality check, refunds are initiated within 24–48 hours. Prepaid refunds go to the original payment method (banks typically credit in 3–5 working days); COD refunds are made to your bank account.",
        "Refund amounts are capped at what was actually paid for the returned items, including proportionate coupons.",
      ]},
      { heading: "3. Exchanges", body: [
        "For size/colour issues, choose Exchange when raising the request — the seller ships the replacement after pickup.",
      ]},
    ],
  },
  {
    key: "about", title: "About ShopEase", updated: "1 January 2025",
    intro: "ShopEase is an Indian multi-vendor marketplace MVP built to demonstrate a complete, safe e-commerce stack: real catalogue and inventory, seller operations, moderation, payments with verified webhooks, and after-sales workflows.",
    sections: [
      { heading: "What makes this build different", body: [
        "Server-authoritative pricing and stock — the client never dictates money.",
        "Concurrency-safe inventory reservations with automatic expiry.",
        "A sandbox payment gateway that exercises the same signed-webhook verification path a production provider would.",
        "Independent seller fulfilments, commission accounting, and an auditable admin trail.",
      ]},
      { heading: "For sellers", body: [
        "Apply from your account menu, get verified, and start listing in minutes. Dashboard gives orders, returns, settlements and finance views.",
      ]},
    ],
  },
  {
    key: "faqs", title: "FAQs", updated: "1 January 2025",
    intro: "Quick answers to the questions shoppers ask most. For anything else, the Help Center team is one tap away.",
    sections: [
      { heading: "Orders & delivery", body: [
        "How fast is delivery? Metro PIN codes typically receive orders in 2 days; other serviceable areas in 3–5 days. Check the estimate on any product page by entering your PIN code.",
        "Why did my order arrive in multiple shipments? Products from different sellers ship independently, each with its own tracking — you are never charged extra for this.",
        "Can I change my delivery address after ordering? Addresses can be edited from your account, but a shipment address is fixed once the order is placed.",
      ]},
      { heading: "Payments", body: [
        "Which payment methods are supported? UPI, cards, netbanking, wallets and Cash on Delivery (where available, up to ₹50,000 with a ₹19 handling fee).",
        "Is this checkout real? This deployment uses a clearly-labelled sandbox gateway — you can explore success and failure paths without moving real money.",
      ]},
      { heading: "Returns & refunds", body: [
        "What is the return window? Most categories include 7 days from delivery (14 for fashion), shown on the product page. Items must be unused with tags and packaging intact.",
        "When do I get my refund? After pickup and quality check, refunds are initiated within 24–48 hours and typically credit in 3–5 working days.",
        "Can I exchange instead of returning? Yes — choose Exchange when raising the request for eligible size/colour issues.",
      ]},
      { heading: "Account & coupons", body: [
        "Forgot your password? Use \"Forgot password?\" on the sign-in page — we email a secure link that expires in 30 minutes and can be used once.",
        "How do coupons work? Apply an eligible coupon in your cart; discounts are validated server-side against order value and usage limits.",
      ]},
    ],
  },
  {
    key: "careers", title: "Careers", updated: "1 January 2025",
    intro: "We're a small, focused team building the friendliest marketplace in India. This is a demo project — but if it were real, here's who we'd hire:",
    sections: [
      { heading: "Open roles (illustrative)", body: [
        "Senior Full-Stack Engineer — TypeScript, Next.js, PostgreSQL.",
        "Marketplace Operations Lead — seller success, category management.",
        "Payments & Risk Analyst — reconciliation, fraud signals.",
      ]},
      { heading: "How to apply", body: [
        "Applications aren't open in this demo build — watch this space.",
      ]},
    ],
  },
];

export default function PoliciesView({ params }: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  const back = useNav((s) => s.back);
  const doc = DOCS.find((d) => d.key === params?.doc);

  if (!doc) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
        <h1 className="text-xl font-bold tracking-tight sm:text-2xl">Help & Policies</h1>
        <p className="mt-1 text-sm text-muted-foreground">Everything you need to know about shopping on ShopEase.</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {DOCS.map((d) => (
            <Card
              key={d.key}
              className="cursor-pointer py-0 transition-shadow hover:shadow-md"
              onClick={() => navigate("policies", { doc: d.key })}
            >
              <CardContent className="flex items-center gap-3 p-4">
                <span className="rounded-lg bg-primary/10 p-2.5 text-primary"><FileText size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">{d.title}</p>
                  <p className="truncate text-xs text-muted-foreground">{d.intro}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-muted-foreground" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <button onClick={back} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft size={14} /> Back
      </button>
      <p className="text-xs font-semibold uppercase tracking-wider text-primary">ShopEase</p>
      <h1 className="mt-1 text-2xl font-bold tracking-tight">{doc.title}</h1>
      <p className="mt-1 text-xs text-muted-foreground">Last updated: {doc.updated} · Demo content, not legal advice</p>

      <div className="mt-6 space-y-7">
        <p className="text-sm leading-relaxed text-muted-foreground">{doc.intro}</p>
        {doc.sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-base font-bold">{s.heading}</h2>
            <div className="mt-2 space-y-2">
              {s.body.map((p, i) => (
                <p key={i} className="text-sm leading-relaxed text-muted-foreground">{p}</p>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-2 border-t pt-6">
        {DOCS.filter((d) => d.key !== doc.key).map((d) => (
          <Button key={d.key} variant="outline" size="sm" onClick={() => navigate("policies", { doc: d.key })}>
            {d.title}
          </Button>
        ))}
      </div>
    </div>
  );
}
