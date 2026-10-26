"use client";

// Admin Console — Returns: refund pipeline. Initiate refunds after inspection,
// complete them, or close requests. Full-screen dashboard shell.

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeIndianRupee,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  Loader2,
  LogOut,
  RotateCcw,
  ShieldCheck,
  Store,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo, EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, ApiClientError, qs } from "@/lib/client/api";
import { formatINR } from "@/lib/money";
import { RETURN_REASON_LABELS } from "@/lib/constants";
import type { ReturnRequestView } from "@/lib/types";

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
            <span className="truncate text-sm font-semibold text-muted-foreground">Admin Console · Returns</span>
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
      <AdminShell active="admin-returns">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AdminShell>
    );
  }
  if (!user || user.role !== "ADMIN") {
    return (
      <AdminShell active="admin-returns">
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

// ── Types & helpers ───────────────────────────────────────────────────────

type AdminReturnRow = ReturnRequestView & { userName: string };

const STATUS_TABS = [
  "",
  "REQUESTED",
  "UNDER_REVIEW",
  "APPROVED",
  "PICKUP_SCHEDULED",
  "PICKED_UP",
  "INSPECTION_PENDING",
  "REFUND_INITIATED",
  "REFUND_COMPLETED",
  "CLOSED",
];

const REFUNDABLE = ["APPROVED", "PICKED_UP", "INSPECTION_PENDING"];

// ── Detail dialog ─────────────────────────────────────────────────────────

function ReturnDialog({
  row,
  pending,
  onClose,
  onAction,
}: {
  row: AdminReturnRow;
  pending: boolean;
  onClose: () => void;
  onAction: (action: "initiate_refund" | "complete_refund" | "close" | "__confirm_initiate") => void;
}) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl sk-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2">
            RMA {row.rmaNumber} <StatusBadge status={row.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            <div>
              <p className="text-xs text-muted-foreground">Order</p>
              <p className="font-medium">#{row.orderNumber}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Customer</p>
              <p className="font-medium">{row.userName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Type</p>
              <p className="font-medium">{row.type}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Refund mode</p>
              <p className="font-medium">{row.refundMode === "BANK_TRANSFER" ? "Bank transfer" : "Original method"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Reason</p>
              <p className="font-medium">{RETURN_REASON_LABELS[row.reason] ?? row.reason}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Refund amount</p>
              <p className="font-bold">{formatINR(row.refundAmount)}</p>
            </div>
          </div>

          {row.description && <p className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">“{row.description}”</p>}

          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Items</p>
            <ul className="space-y-1">
              {row.items.map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5">
                  <span className="truncate">{it.productName}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">× {it.qty}</span>
                </li>
              ))}
            </ul>
          </div>

          {row.decisionNote && (
            <div>
              <p className="text-xs text-muted-foreground">Decision note</p>
              <p className="text-sm">{row.decisionNote}</p>
            </div>
          )}

          {row.refund ? (
            <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200">
              <p className="font-semibold">
                Refund {row.refund.id} · {formatINR(row.refund.amount)}
              </p>
              <p>
                Status: {row.refund.status.replaceAll("_", " ").toLowerCase()} · Mode: {row.refund.mode.replaceAll("_", " ").toLowerCase()}
              </p>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">No refund has been initiated yet.</p>
          )}
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:gap-0">
          {REFUNDABLE.includes(row.status) && (
            <Button disabled={pending} onClick={() => onAction("__confirm_initiate")}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : <BadgeIndianRupee size={14} />}
              Initiate refund
            </Button>
          )}
          {row.status === "REFUND_INITIATED" && (
            <Button disabled={pending} onClick={() => onAction("complete_refund")}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : <CircleCheck size={14} />}
              Complete refund
            </Button>
          )}
          {row.status !== "CLOSED" && (
            <Button variant="outline" disabled={pending} onClick={() => onAction("close")}>
              Close request
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── List ──────────────────────────────────────────────────────────────────

function ReturnsList() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AdminReturnRow | null>(null);
  const [confirmInitiate, setConfirmInitiate] = useState<AdminReturnRow | null>(null);

  // Reset to page 1 whenever filters change (render-time state adjustment).
  const pageResetKey = `${status}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-returns", page, status],
    queryFn: () => api.get<{ items: AdminReturnRow[]; total: number; page: number; totalPages: number }>(
      `/api/admin/returns${qs({ page, status: status || undefined })}`
    ),
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { action: string; note?: string } }) =>
      api.patch<{ ok: boolean; refund?: { id: string; amount: number; status: string }; status?: string }>(
        `/api/admin/returns/${id}`,
        body
      ),
    onSuccess: (res, vars) => {
      if (vars.body.action === "initiate_refund" && res.refund) {
        toast.success(`Refund initiated — ${formatINR(res.refund.amount)}`, {
          description: `Refund id ${res.refund.id} · ${res.refund.status.replaceAll("_", " ").toLowerCase()}`,
        });
      } else if (vars.body.action === "complete_refund") {
        toast.success("Refund completed");
      } else {
        toast.success(`Return ${res.status?.replaceAll("_", " ").toLowerCase() ?? "updated"}`);
      }
      qc.invalidateQueries({ queryKey: ["admin-returns"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setSelected(null);
      setConfirmInitiate(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Action failed");
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Returns &amp; refunds</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} request${data.total === 1 ? "" : "s"}` : "Loading…"} — sellers handle pickups; you
          initiate and complete refunds.
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
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-12 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<RotateCcw size={28} />} title="No returns found" description="Try a different status filter." />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className={`overflow-x-auto ${isFetching ? "opacity-70" : ""}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>RMA</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead className="hidden md:table-cell">Type</TableHead>
                    <TableHead className="hidden lg:table-cell">Reason</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((r) => (
                    <TableRow key={r.id} className="cursor-pointer" onClick={() => setSelected(r)}>
                      <TableCell className="font-mono text-xs font-semibold">{r.rmaNumber}</TableCell>
                      <TableCell className="font-medium">#{r.orderNumber}</TableCell>
                      <TableCell className="text-sm">{r.userName}</TableCell>
                      <TableCell className="hidden text-sm md:table-cell">{r.type}</TableCell>
                      <TableCell className="hidden max-w-44 truncate text-sm text-muted-foreground lg:table-cell">
                        {RETURN_REASON_LABELS[r.reason] ?? r.reason}
                      </TableCell>
                      <TableCell className="text-right font-semibold">{formatINR(r.refundAmount)}</TableCell>
                      <TableCell>
                        <StatusBadge status={r.status} />
                      </TableCell>
                      <TableCell className="hidden text-right text-sm text-muted-foreground lg:table-cell">
                        {new Date(r.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      </TableCell>
                    </TableRow>
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

      {selected && (
        <ReturnDialog
          row={selected}
          pending={mutation.isPending}
          onClose={() => setSelected(null)}
          onAction={(action) => {
            if (action === "__confirm_initiate") {
              setSelected(null);
              setConfirmInitiate(selected);
            } else {
              mutation.mutate({ id: selected.id, body: { action } });
            }
          }}
        />
      )}

      <AlertDialog open={confirmInitiate !== null} onOpenChange={(o) => !o && setConfirmInitiate(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Initiate refund for {confirmInitiate?.rmaNumber}?</AlertDialogTitle>
            <AlertDialogDescription>
              {formatINR(confirmInitiate?.refundAmount ?? 0)} will be refunded via{" "}
              {confirmInitiate?.refundMode === "BANK_TRANSFER" ? "bank transfer" : "the original payment method"}.
              This action is audited and idempotent.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => confirmInitiate && mutation.mutate({ id: confirmInitiate.id, body: { action: "initiate_refund" } })}
            >
              Initiate refund
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminReturnsView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <AdminGate>
      <AdminShell active="admin-returns">
        <ReturnsList />
      </AdminShell>
    </AdminGate>
  );
}
