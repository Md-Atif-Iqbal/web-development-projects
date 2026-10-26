"use client";

// Admin Console — Overview: platform stats, 14-day revenue chart, order status
// breakdown, top categories, audit note. Full-screen dashboard shell.

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import {
  AlertTriangle,
  BarChart3,
  IndianRupee,
  LifeBuoy,
  Loader2,
  LogOut,
  Package,
  Percent,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Store,
  Users,
  UsersRound,
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
import type { AdminDashboard } from "@/lib/types";

// ── Layout (replicated per-file by design) ────────────────────────────────

const ADMIN_TABS: { key: ViewName; label: string }[] = [
  { key: "admin", label: "Dashboard" },
  { key: "admin-sellers", label: "Sellers" },
  { key: "admin-products", label: "Products" },
  { key: "admin-orders", label: "Orders" },
  { key: "admin-payments", label: "Payments" },
  { key: "admin-returns", label: "Returns" },
  { key: "admin-catalog", label: "Catalog" },
  { key: "admin-users", label: "Users" },
  { key: "admin-support", label: "Support" },
  { key: "admin-audit", label: "Audit" },
];

function AdminShell({ active, children }: { active: ViewName; children: React.ReactNode }) {
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
            <span className="truncate text-sm font-semibold text-muted-foreground">Admin Console</span>
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
            {ADMIN_TABS.map((t) => (
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

function AdminGate({ active, children }: { active: ViewName; children: React.ReactNode }) {
  const { user, loading } = useSession();
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);
  if (loading) {
    return (
      <AdminShell active={active}>
        <div className="space-y-6">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-24 rounded-xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-xl" />
        </div>
      </AdminShell>
    );
  }
  if (!user || user.role !== "ADMIN") {
    return (
      <AdminShell active={active}>
        <div className="py-16">
          <EmptyState
            icon={<ShieldCheck size={28} />}
            title={!user ? "Admin sign-in required" : "Access denied"}
            description={
              !user
                ? "Please sign in with an administrator account to open the Admin Console."
                : "Your account does not have administrator privileges. This area is restricted."
            }
            action={
              !user ? (
                <Button className="mt-2" onClick={() => navigate("login")}>
                  Sign in
                </Button>
              ) : (
                <Button variant="outline" className="mt-2" onClick={goHome}>
                  Back to home
                </Button>
              )
            }
          />
        </div>
      </AdminShell>
    );
  }
  return <>{children}</>;
}

// ── Building blocks ───────────────────────────────────────────────────────

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

function RevenueChart({ data }: { data: AdminDashboard["revenueChart"] }) {
  const chartData = data.map((d) => ({
    label: new Date(d.date).toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    revenue: d.revenue,
    orders: d.orders,
  }));
  return (
    <div className="w-full text-muted-foreground">
      <ResponsiveContainer width="100%" height={260}>
        <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="adminRevFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#FF6B35" stopOpacity={0.35} />
              <stop offset="100%" stopColor="#FF6B35" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border, #e7e5e4)" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval="preserveStartEnd" />
          <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={56} tickFormatter={(v: number) => formatCompactINR(v)} />
          <Tooltip
            formatter={(value, name) => (name === "Orders" ? [String(value), "Orders"] : [formatINR(Number(value)), "Revenue"])}
            labelStyle={{ color: "var(--foreground, #1c1917)" }}
            contentStyle={{
              background: "var(--popover, #ffffff)",
              border: "1px solid var(--border, #e7e5e4)",
              borderRadius: 8,
              color: "var(--popover-foreground, #1c1917)",
            }}
          />
          <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#FF6B35" strokeWidth={2} fill="url(#adminRevFill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Overview ──────────────────────────────────────────────────────────────

function Overview() {
  const navigate = useNav((s) => s.navigate);
  const { data, isLoading, isError } = useQuery({
    queryKey: ["admin-dashboard"],
    queryFn: () => api.get<AdminDashboard>("/api/admin/dashboard"),
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }
  if (isError || !data) {
    return (
      <EmptyState
        icon={<AlertTriangle size={28} />}
        title="Could not load dashboard"
        description="Something went wrong while fetching platform statistics. Please try again."
      />
    );
  }

  const { stats } = data;
  const maxStatusCount = Math.max(1, ...data.orderStatusBreakdown.map((b) => b.count));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Customers" value={String(stats.totalCustomers)} sub="Registered shoppers" icon={Users} />
        <StatCard label="Sellers" value={String(stats.totalSellers)} sub="On the platform" icon={Store} />
        <StatCard
          label="Pending sellers"
          value={String(stats.pendingSellers)}
          sub="Awaiting verification"
          icon={UsersRound}
          tone={stats.pendingSellers > 0 ? "warn" : "default"}
          onClick={() => navigate("admin-sellers")}
        />
        <StatCard label="Products" value={String(stats.totalProducts)} sub="All listings" icon={Package} />
        <StatCard
          label="Pending products"
          value={String(stats.pendingProducts)}
          sub="In moderation queue"
          icon={Package}
          tone={stats.pendingProducts > 0 ? "warn" : "default"}
          onClick={() => navigate("admin-products")}
        />
        <StatCard label="Orders today" value={String(stats.ordersToday)} sub={`${stats.totalOrders} total`} icon={ShoppingBag} />
        <StatCard label="Revenue (30d)" value={formatINR(stats.revenue30d)} sub="GMV last 30 days" icon={IndianRupee} />
        <StatCard label="Commission (30d)" value={formatINR(stats.commission30d)} sub="Platform take" icon={Percent} tone="good" />
        <StatCard
          label="Pending returns"
          value={String(stats.pendingReturns)}
          sub="Need refund decision"
          icon={RotateCcw}
          tone={stats.pendingReturns > 0 ? "warn" : "default"}
          onClick={() => navigate("admin-returns")}
        />
        <StatCard
          label="Open tickets"
          value={String(stats.openTickets)}
          sub="Support conversations"
          icon={LifeBuoy}
          tone={stats.openTickets > 0 ? "warn" : "default"}
          onClick={() => navigate("admin-support")}
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <BarChart3 size={16} /> Order status breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {data.orderStatusBreakdown.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No orders yet.</p>
            ) : (
              data.orderStatusBreakdown.map((b) => (
                <button
                  key={b.status}
                  onClick={() => navigate("admin-orders", { status: b.status })}
                  className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted/60"
                >
                  <StatusBadge status={b.status} className="w-36 shrink-0 justify-center" />
                  <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary/70 transition-all group-hover:bg-primary"
                      style={{ width: `${Math.max(4, (b.count / maxStatusCount) * 100)}%` }}
                    />
                  </div>
                  <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums">{b.count}</span>
                </button>
              ))
            )}
            <p className="pt-1 text-xs text-muted-foreground">Click a status to filter the orders page.</p>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Top categories</CardTitle>
          </CardHeader>
          <CardContent>
            {data.topCategories.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No sales yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Units sold</TableHead>
                      <TableHead className="text-right">Revenue</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.topCategories.map((c) => (
                      <TableRow key={c.name}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="text-right">{c.unitsSold}</TableCell>
                        <TableCell className="text-right font-semibold">{formatINR(c.revenue)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3">
        <p className="text-sm text-muted-foreground">
          <ShieldCheck size={14} className="mr-1.5 inline text-primary" />
          Every privileged action — seller approvals, product moderation, refunds — is recorded in the audit log.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate("admin-audit")}>
          View audit log
        </Button>
      </div>
    </div>
  );
}

export default function AdminDashboardView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <AdminGate active="admin">
      <AdminShell active="admin">
        <Overview />
      </AdminShell>
    </AdminGate>
  );
}
