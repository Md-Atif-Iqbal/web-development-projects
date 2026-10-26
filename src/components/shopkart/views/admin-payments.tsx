"use client";

// Admin Console — Payments: sandbox payment ledger with status filters and
// expandable failure/provider details. Full-screen dashboard shell.

import { Fragment, useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronLeft, Loader2, LogOut, ShieldCheck, Store, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo, EmptyState, SandboxNotice, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, qs } from "@/lib/client/api";
import { formatINR } from "@/lib/money";

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
            <span className="truncate text-sm font-semibold text-muted-foreground">Admin Console · Payments</span>
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

function AdminGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useSession();
  const navigate = useNav((s) => s.navigate);
  const goHome = useNav((s) => s.goHome);
  if (loading) {
    return (
      <AdminShell active="admin-payments">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AdminShell>
    );
  }
  if (!user || user.role !== "ADMIN") {
    return (
      <AdminShell active="admin-payments">
        <div className="py-16">
          <EmptyState
            icon={<ShieldCheck size={28} />}
            title={!user ? "Admin sign-in required" : "Access denied"}
            description={
              !user
                ? "Please sign in with an administrator account."
                : "Your account does not have administrator privileges."
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

// ── Types ─────────────────────────────────────────────────────────────────

type AdminPaymentRow = {
  id: string;
  orderId: string;
  orderNumber: string;
  provider: string;
  method: string;
  amount: number;
  status: string;
  providerRef: string | null;
  sandbox: boolean;
  failureReason: string | null;
  createdAt: string;
};

const STATUS_TABS = ["", "PENDING", "PAID", "FAILED", "REFUNDED", "CANCELLED"];

// ── List ──────────────────────────────────────────────────────────────────

function PaymentsLedger() {
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Reset to page 1 whenever filters change (render-time state adjustment).
  const pageResetKey = `${status}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-payments", page, status],
    queryFn: () => api.get<{ items: AdminPaymentRow[]; total: number; page: number; totalPages: number }>(
      `/api/admin/payments${qs({ page, status: status || undefined })}`
    ),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Payments</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} transaction${data.total === 1 ? "" : "s"}` : "Loading…"} — COD entries included as
          ledger rows.
        </p>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-background p-1 sk-scrollbar">
        {STATUS_TABS.map((key) => (
          <button
            key={key || "all"}
            onClick={() => setStatus(key)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
              status === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {key ? key.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "All"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Wallet size={28} />} title="No payments found" description="Try a different status filter." />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className={`overflow-x-auto ${isFetching ? "opacity-70" : ""}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Order</TableHead>
                    <TableHead>Provider</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => (
                    <Fragment key={p.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpanded((cur) => (cur === p.id ? null : p.id))}
                      >
                        <TableCell>
                          {expanded === p.id ? (
                            <ChevronDown size={14} className="text-muted-foreground" />
                          ) : (
                            <ChevronRight size={14} className="text-muted-foreground" />
                          )}
                        </TableCell>
                        <TableCell className="font-medium">#{p.orderNumber}</TableCell>
                        <TableCell className="text-sm">
                          {p.provider}
                          {p.sandbox && (
                            <span className="ml-1.5 rounded bg-amber-100 px-1 py-0.5 text-[10px] font-bold text-amber-800">
                              SANDBOX
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">{p.method}</TableCell>
                        <TableCell className="text-right font-semibold">{formatINR(p.amount)}</TableCell>
                        <TableCell>
                          <StatusBadge status={p.status} />
                        </TableCell>
                        <TableCell className="hidden text-right text-sm text-muted-foreground md:table-cell">
                          {new Date(p.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                        </TableCell>
                      </TableRow>
                      {expanded === p.id && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell />
                          <TableCell colSpan={6} className="bg-muted/40 pb-3">
                            <div className="grid gap-2 text-sm sm:grid-cols-2">
                              <div>
                                <p className="text-xs text-muted-foreground">Provider reference</p>
                                <p className="font-mono text-xs">{p.providerRef ?? "—"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Failure reason</p>
                                <p className={`text-xs ${p.failureReason ? "text-rose-600" : ""}`}>{p.failureReason ?? "—"}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Order id</p>
                                <p className="font-mono text-xs">{p.orderId}</p>
                              </div>
                              <div>
                                <p className="text-xs text-muted-foreground">Payment id</p>
                                <p className="font-mono text-xs">{p.id}</p>
                              </div>
                            </div>
                          </TableCell>
                        </TableRow>
                      )}
                    </Fragment>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {data && data.totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Page {data.page} of {data.totalPages}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1 || isFetching} onClick={() => setPage((p) => p - 1)}>
              <ChevronLeft size={14} /> Prev
            </Button>
            <Button variant="outline" size="sm" disabled={page >= data.totalPages || isFetching} onClick={() => setPage((p) => p + 1)}>
              Next <ChevronRight size={14} />
            </Button>
          </div>
        </div>
      )}

      <SandboxNotice>All payment captures are processed by the sandbox provider — no real money moves.</SandboxNotice>
    </div>
  );
}

export default function AdminPaymentsView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <AdminGate>
      <AdminShell active="admin-payments">
        <PaymentsLedger />
      </AdminShell>
    </AdminGate>
  );
}
