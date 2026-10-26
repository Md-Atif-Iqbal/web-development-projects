"use client";

// Admin Console — Audit: immutable trail of privileged actions.

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronLeft, ChevronRight, Loader2, LogOut, ShieldCheck, Store, ScrollText } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { BrandLogo, EmptyState } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, qs } from "@/lib/client/api";

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
    try { await api.post("/api/auth/logout"); } catch { /* ignore */ }
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
            <span className="truncate text-sm font-semibold text-muted-foreground">Admin Console · Audit Log</span>
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
      <AdminShell active="admin-audit">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AdminShell>
    );
  }
  if (!user || user.role !== "ADMIN") {
    return (
      <AdminShell active="admin-audit">
        <div className="py-16">
          <EmptyState
            icon={<ShieldCheck size={28} />}
            title={!user ? "Admin sign-in required" : "Access denied"}
            description={!user ? "Please sign in with an administrator account." : "Your account does not have administrator privileges."}
            action={!user ? <Button className="mt-2" onClick={() => navigate("login")}>Sign in</Button> : <Button variant="outline" className="mt-2" onClick={goHome}>Back to home</Button>}
          />
        </div>
      </AdminShell>
    );
  }
  return <>{children}</>;
}

type AuditRow = {
  id: string;
  actorId: string | null;
  actorRole: string | null;
  actorEmail: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  meta: string | null;
  ip: string | null;
  createdAt: string;
};

const ACTION_FILTERS = [
  "",
  "USER_REGISTER", "USER_SUSPENDED", "USER_ACTIVATED",
  "SELLER_REGISTERED", "SELLER_APPROVED", "SELLER_REJECTED",
  "PRODUCT_CREATED", "PRODUCT_ACTIVATED", "PRODUCT_REJECTED",
  "ORDER_PLACED", "ORDER_CANCELLED",
  "PAYMENT_CAPTURED", "PAYMENT_FAILED", "PAYMENT_WEBHOOK_REJECTED",
  "RETURN_REQUESTED", "REFUND_INITIATED", "REFUND_COMPLETED",
  "SHIPMENT_ADVANCED",
];

function AuditLogTable() {
  const [action, setAction] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);

  // Reset to page 1 whenever filters change (render-time state adjustment).
  const pageResetKey = `${action}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-audit", action, page],
    queryFn: () => api.get<{ items: AuditRow[]; total: number; page: number; totalPages: number }>(
      `/api/admin/audit-logs${qs({ action: action || undefined, page, pageSize: 20 })}`
    ),
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Audit Log</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} event${data.total === 1 ? "" : "s"}` : "Loading…"} — every privileged, money-affecting action is recorded here.
        </p>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-background p-1 sk-scrollbar">
        {ACTION_FILTERS.map((key) => (
          <button
            key={key || "all"}
            onClick={() => setAction(key)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs transition-colors ${
              action === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {key ? key.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "All actions"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<ScrollText size={28} />} title="No audit events" description="Events appear here as admins and sellers perform sensitive actions." />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className={`overflow-x-auto ${isFetching ? "opacity-70" : ""}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10" />
                    <TableHead>Time</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead className="hidden md:table-cell">Actor</TableHead>
                    <TableHead className="hidden lg:table-cell">Entity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((row) => (
                    <Fragment key={row.id}>
                      <TableRow
                        className="cursor-pointer"
                        onClick={() => setExpanded((cur) => (cur === row.id ? null : row.id))}
                      >
                        <TableCell>
                          {expanded === row.id
                            ? <ChevronDown size={14} className="text-muted-foreground" />
                            : <ChevronRight size={14} className="text-muted-foreground" />}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {new Date(row.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="font-mono text-[11px]">{row.action}</Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell">
                          <p className="text-sm">{row.actorEmail ?? "system"}</p>
                          <p className="text-xs text-muted-foreground">{row.actorRole?.toLowerCase() ?? "—"}</p>
                        </TableCell>
                        <TableCell className="hidden lg:table-cell">
                          {row.entityType ? (
                            <span className="text-xs text-muted-foreground">
                              {row.entityType}: <span className="font-mono">{(row.entityId ?? "").slice(0, 14)}</span>
                            </span>
                          ) : "—"}
                        </TableCell>
                      </TableRow>
                      {expanded === row.id && (
                        <TableRow className="hover:bg-transparent">
                          <TableCell />
                          <TableCell colSpan={4} className="bg-muted/40 pb-3">
                            <pre className="max-h-40 overflow-auto rounded-lg bg-background p-3 text-xs leading-relaxed sk-scrollbar">
{row.meta ? JSON.stringify(JSON.parse(row.meta), null, 2) : "No metadata"}
                            </pre>
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
          <p className="text-sm text-muted-foreground">Page {data.page} of {data.totalPages}</p>
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
    </div>
  );
}

export default function AdminAuditView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <AdminGate>
      <AdminShell active="admin-audit">
        <AuditLogTable />
      </AdminShell>
    </AdminGate>
  );
}
