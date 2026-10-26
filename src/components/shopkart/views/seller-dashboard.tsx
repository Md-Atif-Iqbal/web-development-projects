"use client";

// Seller Hub — Overview: stats, 14-day revenue chart, top products, quick actions.
// Full-screen dashboard with local shell (no site header/footer).

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  IndianRupee,
  Loader2,
  LogOut,
  Package,
  PackageSearch,
  Plus,
  RotateCcw,
  ShoppingBag,
  Store,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo, EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api } from "@/lib/client/api";
import { formatINR, formatCompactINR } from "@/lib/money";
import type { SellerDashboard, Me } from "@/lib/types";

// ── Layout (replicated per-file by design) ────────────────────────────────

const SELLER_TABS: { key: ViewName; label: string }[] = [
  { key: "seller", label: "Overview" },
  { key: "seller-products", label: "Products" },
  { key: "seller-orders", label: "Orders" },
  { key: "seller-returns", label: "Returns" },
  { key: "seller-finance", label: "Finance" },
];

function DashSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function SellerShell({ active, title, children }: { active: ViewName; title?: string; children: React.ReactNode }) {
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
            <span className="truncate text-sm font-semibold text-muted-foreground">{title ?? "Seller Hub"}</span>
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

/** Role guard: seller hub requires an approved SELLER. Never leaks data otherwise. */
function SellerGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);

  if (loading) {
    return (
      <SellerShell active="seller">
        <DashSkeleton />
      </SellerShell>
    );
  }
  if (!user) {
    return (
      <SellerShell active="seller">
        <div className="py-16">
          <EmptyState
            icon={<Store size={28} />}
            title="Seller access required"
            description="Please sign in with your seller account to open the Seller Hub."
            action={
              <Button onClick={() => navigate("login")} className="mt-2">
                Sign in
              </Button>
            }
          />
        </div>
      </SellerShell>
    );
  }
  if (user.role === "ADMIN") {
    return (
      <SellerShell active="seller">
        <div className="py-16">
          <EmptyState
            icon={<Store size={28} />}
            title="Access denied"
            description="This area is for marketplace sellers. Admin accounts can manage the platform from the Admin Console."
            action={
              <Button variant="outline" onClick={goHome} className="mt-2">
                Back to home
              </Button>
            }
          />
        </div>
      </SellerShell>
    );
  }
  if (user.role !== "SELLER" || user.sellerStatus !== "APPROVED") {
    return (
      <SellerShell active="seller">
        <div className="mx-auto max-w-lg py-16">
          <EmptyState
            icon={<Store size={28} />}
            title={
              user.sellerStatus === "PENDING"
                ? "Your seller application is under review"
                : user.sellerStatus === "REJECTED"
                  ? "Your seller application was not approved"
                  : user.sellerStatus === "SUSPENDED"
                    ? "Your seller account is suspended"
                    : "Become a ShopEase seller"
            }
            description={
              user.sellerStatus
                ? `Current seller status: ${user.sellerStatus}. Check the onboarding page for details and next steps.`
                : "Sell to millions of shoppers across India. Register your business in under five minutes."
            }
            action={
              <Button onClick={() => navigate("seller-onboarding")} className="mt-2">
                {user.sellerStatus ? "View application status" : "Start selling"}
              </Button>
            }
          />
        </div>
      </SellerShell>
    );
  }
  return <>{children}</>;
}

// ── Small building blocks ─────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  onClick,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ComponentType<{ size?: number | string; className?: string }>;
  tone?: "default" | "warn" | "good";
  onClick?: () => void;
}) {
  const toneCls =
    tone === "warn"
      ? "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300"
      : tone === "good"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
        : "bg-primary/10 text-primary";
  return (
    <Card
      className={onClick ? "cursor-pointer transition-shadow hover:shadow-md" : undefined}
      onClick={onClick}
      role={onClick ? "button" : undefined}
    >
      <CardContent className="flex items-start justify-between gap-2 p-4">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
          <p className="mt-1 truncate text-xl font-bold tracking-tight">{value}</p>
          {sub && <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${toneCls}`}>
          <Icon size={18} />
        </div>
      </CardContent>
    </Card>
  );
}

// ── Chart ─────────────────────────────────────────────────────────────────

function RevenueChart({ data }: { data: SellerDashboard["revenueChart"] }) {
  const chartData = data.map((d) => ({
    label: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    revenue: d.revenue,
    orders: d.orders,
  }));
  return (
    <div className="h-64 w-full text-muted-foreground">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF6B35" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#FF6B35" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e7e5e4)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis
            tick={{ fontSize: 11 }}
            tickLine={false}
            axisLine={false}
            width={56}
            tickFormatter={(v: number) => formatCompactINR(v)}
          />
          <Tooltip
            formatter={(value) => [formatINR(Number(value)), "Revenue"]}
            labelStyle={{ color: "var(--foreground, #1c1917)" }}
            contentStyle={{
              background: "var(--popover, #ffffff)",
              border: "1px solid var(--border, #e7e5e4)",
              borderRadius: 8,
              color: "var(--popover-foreground, #1c1917)",
            }}
          />
          <Area type="monotone" dataKey="revenue" stroke="#FF6B35" strokeWidth={2} fill="url(#revFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Overview content ──────────────────────────────────────────────────────

function Overview({ seller }: { seller: Me }) {
  const navigate = useNav((s) => s.navigate);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["seller-dashboard"],
    queryFn: () => api.get<SellerDashboard>("/api/seller/dashboard"),
  });

  if (isLoading) return <DashSkeleton />;
  if (isError || !data) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} />}
        title="Could not load dashboard"
        description="Something went wrong while fetching your seller stats. Please try again shortly."
      />
    );
  }

  const { stats, seller: sellerInfo } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Products"
          value={String(stats.totalProducts)}
          sub={`${stats.activeProducts} active · ${stats.pendingProducts} pending`}
          icon={Package}
          onClick={() => navigate("seller-products")}
        />
        <StatCard
          label="Orders to process"
          value={String(stats.ordersToProcess)}
          sub="Confirmed & awaiting dispatch"
          icon={ShoppingBag}
          tone={stats.ordersToProcess > 0 ? "warn" : "default"}
          onClick={() => navigate("seller-orders")}
        />
        <StatCard label="Revenue (30d)" value={formatINR(stats.revenue30d)} sub="Last 30 days" icon={IndianRupee} />
        <StatCard label="Earnings (30d)" value={formatINR(stats.earnings30d)} sub="After commission" icon={Wallet} tone="good" />
        <StatCard
          label="Low stock variants"
          value={String(stats.lowStockCount)}
          sub="5 or fewer units left"
          icon={PackageSearch}
          tone={stats.lowStockCount > 0 ? "warn" : "default"}
          onClick={() => navigate("seller-products")}
        />
        <StatCard
          label="Pending returns"
          value={String(stats.pendingReturns)}
          sub="Awaiting your action"
          icon={RotateCcw}
          tone={stats.pendingReturns > 0 ? "warn" : "default"}
          onClick={() => navigate("seller-returns")}
        />
        <StatCard
          label="Quick action"
          value="Add product"
          sub="List a new item"
          icon={Plus}
          onClick={() => navigate("seller-product-form", {})}
        />
        <StatCard
          label="Quick action"
          value="Process orders"
          sub="Pack & ship pending items"
          icon={ArrowRight}
          onClick={() => navigate("seller-orders")}
        />
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">Revenue — last 14 days</CardTitle>
        </CardHeader>
        <CardContent>
          <RevenueChart data={data.revenueChart} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top products</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topProducts.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">
                No sales yet — list products and share your store to get started.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Units sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topProducts.map((p) => (
                      <TableRow key={p.productId}>
                        <TableCell className="max-w-64 truncate font-medium">{p.name}</TableCell>
                        <TableCell className="text-right">{p.unitsSold}</TableCell>
                        <TableCell className="text-right font-semibold">{formatINR(p.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Seller profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Boxes size={22} />
              </div>
              <div className="min-w-0">
                <p className="truncate font-semibold">{sellerInfo.businessName}</p>
                <p className="text-xs text-muted-foreground">{seller.email}</p>
              </div>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Status</span>
              <StatusBadge status={sellerInfo.status} />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Commission rate</span>
              <span className="font-semibold">{(sellerInfo.commissionBps / 100).toFixed(1)}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground">Seller rating</span>
              <span className="font-semibold">{sellerInfo.rating != null ? `${sellerInfo.rating.toFixed(1)} / 5` : "New seller"}</span>
            </div>
            <p className="text-xs text-muted-foreground">
              Commission is deducted from each fulfilled order before your earning is settled.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function SellerDashboardView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <SellerGate>
      <OverviewContent />
    </SellerGate>
  );
}

function OverviewContent() {
  const { user } = useSession();
  if (!user) return null;
  return (
    <SellerShell active="seller">
      <Overview seller={user} />
    </SellerShell>
  );
}
