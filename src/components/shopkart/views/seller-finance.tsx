"use client";

// Seller Hub — Finance: payouts summary, 6-month trend, delivered settlements.
// Full-screen dashboard shell (per-file layout pattern).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, IndianRupee, Loader2, LogOut, Percent, Store, TrendingUp, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo, EmptyState, SandboxNotice } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api } from "@/lib/client/api";
import { formatINR, formatCompactINR } from "@/lib/money";

// ── Layout (same per-file pattern) ────────────────────────────────────────

const SELLER_TABS: { key: ViewName; label: string }[] = [
  { key: "seller", label: "Overview" },
  { key: "seller-products", label: "Products" },
  { key: "seller-orders", label: "Orders" },
  { key: "seller-returns", label: "Returns" },
  { key: "seller-finance", label: "Finance" },
];

function SellerShell({ active, children }: { active: ViewName; children: React.ReactNode }) {
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);
  const { user, refresh } = useSession();
  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    setSigningOut(true);
    try {
      await api.post("/api/auth/logout");
    } catch {
      /* ignore */
    }
    await refresh();
    goHome();
  };
  return (
    <div className="min-h-screen bg-muted/30">
      <header className="sticky top-0 z-20 border-b bg-background">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between gap-3 px-4">
          <div className="flex min-w-0 items-center gap-3">
            <BrandLogo onClick={goHome} />
            <span className="hidden h-6 w-px bg-border sm:block" />
            <span className="truncate text-sm font-semibold text-muted-foreground">Seller Hub · Finance</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden max-w-40 truncate text-sm text-muted-foreground md:block">{user?.name}</span>
            <Button variant="outline" size="sm" onClick={goHome}>
              <Store size={14} className="sm:hidden" />
              <span className="hidden sm:inline">View store</span>
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut} disabled={signingOut}>
              {signingOut ? <Loader2 size={14} className="animate-spin" /> : <LogOut size={14} />}
              <span className="hidden sm:inline">Sign out</span>
            </Button>
          </div>
        </div>
        <nav className="border-t bg-background">
          <div className="mx-auto flex max-w-7xl items-center gap-1 overflow-x-auto px-4 sk-scrollbar">
            {SELLER_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => navigate(t.key)}
                className={`whitespace-nowrap border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  active === t.key
                    ? "border-primary font-semibold text-primary"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}

function SellerGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);
  if (loading) {
    return (
      <SellerShell active="seller-finance">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </SellerShell>
    );
  }
  if (!user || user.role !== "SELLER" || user.sellerStatus !== "APPROVED") {
    return (
      <SellerShell active="seller-finance">
        <div className="py-16">
          <EmptyState
            icon={<Wallet size={28} />}
            title={!user ? "Seller access required" : user.role === "ADMIN" ? "Access denied" : "Seller account required"}
            description={
              !user
                ? "Sign in with your seller account to view payouts."
                : user.role === "ADMIN"
                  ? "This area is for marketplace sellers."
                  : `Your seller status is ${user.sellerStatus ?? "not registered"}. Open the onboarding page for details.`
            }
            action={
              !user ? (
                <Button className="mt-2" onClick={() => navigate("login")}>
                  Sign in
                </Button>
              ) : user.role === "ADMIN" ? (
                <Button variant="outline" className="mt-2" onClick={goHome}>
                  Back to home
                </Button>
              ) : (
                <Button className="mt-2" onClick={() => navigate("seller-onboarding")}>
                  Seller onboarding
                </Button>
              )
            }
          />
        </div>
      </SellerShell>
    );
  }
  return <>{children}</>;
}

// ── Types ─────────────────────────────────────────────────────────────────

type FinanceResponse = {
  summary: { grossRevenue: number; totalCommission: number; netEarning: number; pendingPayout: number; deliveredOrders: number };
  settlements: { orderNumber: string; deliveredAt: string; itemsTotal: number; commission: number; earning: number }[];
  monthly: { month: string; revenue: number; earning: number }[];
};

function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

// ── Content ───────────────────────────────────────────────────────────────

function FinanceContent() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["seller-finance"],
    queryFn: () => api.get<FinanceResponse>("/api/seller/finance"),
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} />}
        title="Could not load finance data"
        description="Please refresh and try again in a moment."
      />
    );
  }

  const { summary, settlements, monthly } = data;
  const effectiveRate = summary.grossRevenue > 0 ? (summary.totalCommission / summary.grossRevenue) * 100 : 0;
  const chartData = monthly.map((m) => ({ label: monthLabel(m.month), Revenue: m.revenue, Earning: m.earning }));

  const cards = [
    { label: "Gross revenue", value: formatINR(summary.grossRevenue), icon: IndianRupee, tone: "" },
    { label: "Commission", value: formatINR(summary.totalCommission), icon: Percent, tone: "text-rose-600" },
    { label: "Net earning", value: formatINR(summary.netEarning), icon: TrendingUp, tone: "text-emerald-700 dark:text-emerald-400" },
    { label: "Pending payout", value: formatINR(summary.pendingPayout), icon: Wallet, tone: "" },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Payments &amp; payouts</h1>
        <p className="text-sm text-muted-foreground">
          {summary.deliveredOrders} delivered order{summary.deliveredOrders === 1 ? "" : "s"} settled so far.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-medium text-muted-foreground">{c.label}</p>
                <c.icon size={16} className="shrink-0 text-muted-foreground" />
              </div>
              <p className={`mt-1 truncate text-xl font-bold tracking-tight ${c.tone}`}>{c.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Monthly trend — last 6 months</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground">
          <div className="w-full">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e7e5e4)" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatCompactINR(v)} />
                <Tooltip
                  formatter={(value) => formatINR(Number(value))}
                  labelStyle={{ color: "var(--foreground, #1c1917)" }}
                  contentStyle={{
                    background: "var(--popover, #ffffff)",
                    border: "1px solid var(--border, #e7e5e4)",
                    borderRadius: 8,
                    color: "var(--popover-foreground, #1c1917)",
                  }}
                />
                <Bar dataKey="Revenue" fill="#FF6B35" radius={[4, 4, 0, 0]} maxBarSize={36} />
                <Bar dataKey="Earning" fill="#16A34A" radius={[4, 4, 0, 0]} maxBarSize={36} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Settlements</CardTitle>
          <p className="text-xs text-muted-foreground">
            Effective commission rate: <strong>{effectiveRate.toFixed(1)}%</strong> of gross revenue. Payouts are
            credited to your registered bank account after each order is delivered.
          </p>
        </CardHeader>
        <CardContent>
          {settlements.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No settlements yet — amounts appear here once orders are delivered.
            </p>
          ) : (
            <div className="max-h-96 overflow-y-auto sk-scrollbar">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order</TableHead>
                      <TableHead>Delivered</TableHead>
                      <TableHead className="text-right">Items total</TableHead>
                      <TableHead className="text-right">Commission</TableHead>
                      <TableHead className="text-right">Earning</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {settlements.map((s) => (
                      <TableRow key={s.orderNumber}>
                        <TableCell className="font-medium">#{s.orderNumber}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {new Date(s.deliveredAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </TableCell>
                        <TableCell className="text-right">{formatINR(s.itemsTotal)}</TableCell>
                        <TableCell className="text-right text-rose-600">−{formatINR(s.commission)}</TableCell>
                        <TableCell className="text-right font-semibold text-emerald-700 dark:text-emerald-400">{formatINR(s.earning)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <SandboxNotice>Payout bank transfers are simulated in this environment — no real money moves.</SandboxNotice>
    </div>
  );
}

export default function SellerFinanceView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <SellerGate>
      <SellerShell active="seller-finance">
        <FinanceContent />
      </SellerShell>
    </SellerGate>
  );
}
