"use client";

// Admin Console — Sellers: verification queue with approve / reject / suspend /
// reactivate / commission management. Full-screen dashboard shell.

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  BadgeCheck,
  Ban,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Landmark,
  Loader2,
  LogOut,
  Percent,
  Search,
  ShieldCheck,
  Store,
  XCircle,
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo, EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, ApiClientError, qs } from "@/lib/client/api";
import type { SellerAdminRow } from "@/lib/types";

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
            <span className="truncate text-sm font-semibold text-muted-foreground">Admin Console · Sellers</span>
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
      <AdminShell active="admin-sellers">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AdminShell>
    );
  }
  if (!user || user.role !== "ADMIN") {
    return (
      <AdminShell active="admin-sellers">
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

// ── Helpers ───────────────────────────────────────────────────────────────

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "", label: "All" },
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "REJECTED", label: "Rejected" },
  { key: "SUSPENDED", label: "Suspended" },
];

// ── Action dialogs ────────────────────────────────────────────────────────

function RejectDialog({
  seller,
  pending,
  onClose,
  onSubmit,
}: {
  seller: SellerAdminRow;
  pending: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject {seller.businessName}?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          The seller will be notified and their active listings will be archived. Share a reason below.
        </p>
        <div className="space-y-1.5">
          <Label htmlFor="reject-note">Reason (required)</Label>
          <Input id="reject-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Bank verification failed" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending || note.trim().length === 0} onClick={() => onSubmit(note.trim())}>
            {pending && <Loader2 size={14} className="animate-spin" />} Reject seller
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CommissionDialog({
  seller,
  pending,
  onClose,
  onSubmit,
  title,
}: {
  seller: SellerAdminRow;
  pending: boolean;
  onClose: () => void;
  onSubmit: (commissionBps: number) => void;
  title: string;
}) {
  const [pct, setPct] = useState(String(seller.commissionBps / 100));
  const valid = /^\d+(\.\d{1,2})?$/.test(pct) && Number(pct) >= 0 && Number(pct) <= 100;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="commission-pct">Commission rate (%)</Label>
          <div className="relative">
            <Percent size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input id="commission-pct" className="pl-8" inputMode="decimal" value={pct} onChange={(e) => setPct(e.target.value)} />
          </div>
          <p className="text-xs text-muted-foreground">
            e.g. 12.5 → 12.5% of each fulfilled order. Current: {(seller.commissionBps / 100).toFixed(1)}%.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button disabled={pending || !valid} onClick={() => onSubmit(Math.round(Number(pct) * 100))}>
            {pending && <Loader2 size={14} className="animate-spin" />} Save rate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Detail sheet ──────────────────────────────────────────────────────────

function VerificationRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}

function SellerSheet({
  seller,
  onAction,
  pending,
  onClose,
}: {
  seller: SellerAdminRow;
  onAction: (action: string, opts?: { note?: string; commissionBps?: number }) => void;
  pending: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-md sk-scrollbar">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            {seller.businessName} <StatusBadge status={seller.status} />
          </SheetTitle>
          <SheetDescription>
            {seller.ownerName} · {seller.ownerEmail}
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-5 px-4 pb-8">
          <div className="flex gap-4 rounded-lg border bg-muted/40 p-3 text-sm">
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Commission</p>
              <p className="font-semibold">{(seller.commissionBps / 100).toFixed(1)}%</p>
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Products</p>
              <p className="font-semibold">{seller.productCount}</p>
            </div>
            <div className="flex-1">
              <p className="text-xs text-muted-foreground">Joined</p>
              <p className="font-semibold">{new Date(seller.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</p>
            </div>
          </div>

          <div>
            <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold">
              <Landmark size={14} /> Verification &amp; banking
            </p>
            {seller.verification ? (
              <div className="divide-y rounded-lg border">
                <VerificationRow label="Verification status" value={<StatusBadge status={seller.verification.status} />} />
                <VerificationRow label="Account type" value={seller.verification.accountType} />
                <VerificationRow label="GSTIN" value={seller.verification.gstin ?? <span className="text-muted-foreground">Not provided</span>} />
                <VerificationRow
                  label="Bank account"
                  value={<span className="font-mono text-xs">{seller.verification.bankAccountMasked ?? "—"}</span>}
                />
                <VerificationRow label="IFSC" value={<span className="font-mono text-xs">{seller.verification.bankIfsc ?? "—"}</span>} />
                {seller.verification.reviewerNote && (
                  <VerificationRow label="Reviewer note" value={<span className="text-xs">{seller.verification.reviewerNote}</span>} />
                )}
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                No verification record found.
              </p>
            )}
            <p className="mt-1.5 text-xs text-muted-foreground">
              Bank details are masked at registration — only the last 4 digits are visible.
            </p>
          </div>

          <Separator />

          <div>
            <p className="mb-2 text-sm font-semibold">Actions</p>
            <div className="grid grid-cols-2 gap-2">
              {seller.status === "PENDING" && (
                <>
                  <Button
                    disabled={pending}
                    onClick={() => onAction("approve")}
                    className="col-span-2"
                  >
                    {pending ? <Loader2 size={14} className="animate-spin" /> : <BadgeCheck size={14} />}
                    Approve seller
                  </Button>
                  <Button variant="outline" disabled={pending} onClick={() => onAction("__reject")}>
                    <XCircle size={14} /> Reject…
                  </Button>
                </>
              )}
              {seller.status === "APPROVED" && (
                <>
                  <Button variant="outline" disabled={pending} onClick={() => onAction("__commission")}>
                    <Percent size={14} /> Set commission…
                  </Button>
                  <Button variant="outline" disabled={pending} onClick={() => onAction("__suspend")}>
                    <Ban size={14} /> Suspend…
                  </Button>
                </>
              )}
              {(seller.status === "SUSPENDED" || seller.status === "REJECTED") && (
                <Button disabled={pending} onClick={() => onAction("reactivate")} className="col-span-2">
                  {pending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                  {seller.status === "SUSPENDED" ? "Reactivate seller" : "Approve (reactivate)"}
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

// ── List ──────────────────────────────────────────────────────────────────

function SellersList() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<SellerAdminRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<SellerAdminRow | null>(null);
  const [commissionTarget, setCommissionTarget] = useState<{ seller: SellerAdminRow; title: string } | null>(null);
  const [suspendTarget, setSuspendTarget] = useState<SellerAdminRow | null>(null);
  const q = useDebounced(search);

  // Reset to page 1 whenever filters change (render-time state adjustment).
  const pageResetKey = `${status}|${q}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-sellers", page, status, q],
    queryFn: () => api.get<{ items: SellerAdminRow[]; total: number; page: number; totalPages: number }>(
      `/api/admin/sellers${qs({ page, status: status || undefined, q: q || undefined })}`
    ),
    placeholderData: keepPreviousData,
  });

  const pendingCount = useQuery({
    queryKey: ["admin-sellers-pending-count"],
    queryFn: () => api.get<{ total: number }>("/api/admin/sellers?status=PENDING&pageSize=1"),
    staleTime: 30_000,
  });

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { action: string; note?: string; commissionBps?: number } }) =>
      api.patch(`/api/admin/sellers/${id}`, body),
    onSuccess: (_res, vars) => {
      const labels: Record<string, string> = {
        approve: "approved",
        reject: "rejected",
        suspend: "suspended",
        reactivate: "reactivated",
      };
      toast.success(`Seller ${labels[vars.body.action] ?? vars.body.action}`);
      qc.invalidateQueries({ queryKey: ["admin-sellers"] });
      qc.invalidateQueries({ queryKey: ["admin-sellers-pending-count"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setSelected(null);
      setRejectTarget(null);
      setCommissionTarget(null);
      setSuspendTarget(null);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Action failed");
    },
  });

  const handleSheetAction = (seller: SellerAdminRow, action: string) => {
    if (action === "__reject") {
      setSelected(null);
      setRejectTarget(seller);
    } else if (action === "__commission") {
      setSelected(null);
      setCommissionTarget({ seller, title: `Commission for ${seller.businessName}` });
    } else if (action === "__suspend") {
      setSelected(null);
      setSuspendTarget(seller);
    } else {
      mutation.mutate({ id: seller.id, body: { action } });
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Sellers</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} seller${data.total === 1 ? "" : "s"}` : "Loading…"} · verify businesses, manage
            commissions and suspensions.
          </p>
        </div>
        {typeof pendingCount.data?.total === "number" && pendingCount.data.total > 0 && (
          <Badge className="bg-amber-100 text-amber-800">
            {pendingCount.data.total} pending verification
          </Badge>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-background p-1 sk-scrollbar">
          {STATUS_TABS.map((t) => (
            <button
              key={t.key || "all"}
              onClick={() => setStatus(t.key)}
              className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                status === t.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
              {t.key === "PENDING" && typeof pendingCount.data?.total === "number" && pendingCount.data.total > 0 && (
                <span className={`ml-1.5 rounded-full px-1.5 text-xs font-semibold ${status === t.key ? "bg-white/25" : "bg-amber-100 text-amber-800"}`}>
                  {pendingCount.data.total}
                </span>
              )}
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search business, owner or email…"
            className="pl-8"
            aria-label="Search sellers"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Store size={28} />} title="No sellers found" description="Try a different search or status filter." />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className={`overflow-x-auto ${isFetching ? "opacity-70" : ""}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Business</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead className="hidden md:table-cell">Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Commission</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Products</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((s) => (
                    <TableRow key={s.id} className="cursor-pointer" onClick={() => setSelected(s)}>
                      <TableCell className="font-medium">{s.businessName}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{s.ownerName}</TableCell>
                      <TableCell className="hidden max-w-52 truncate text-sm text-muted-foreground md:table-cell">{s.ownerEmail}</TableCell>
                      <TableCell>
                        <StatusBadge status={s.status} />
                      </TableCell>
                      <TableCell className="text-right font-medium">{(s.commissionBps / 100).toFixed(1)}%</TableCell>
                      <TableCell className="hidden text-right sm:table-cell">{s.productCount}</TableCell>
                      <TableCell className="hidden text-right text-sm text-muted-foreground lg:table-cell">
                        {new Date(s.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
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
        <SellerSheet
          seller={selected}
          pending={mutation.isPending}
          onClose={() => setSelected(null)}
          onAction={(action) => handleSheetAction(selected, action)}
        />
      )}

      {rejectTarget && (
        <RejectDialog
          seller={rejectTarget}
          pending={mutation.isPending}
          onClose={() => setRejectTarget(null)}
          onSubmit={(note) => mutation.mutate({ id: rejectTarget.id, body: { action: "reject", note } })}
        />
      )}

      {commissionTarget && (
        <CommissionDialog
          seller={commissionTarget.seller}
          title={commissionTarget.title}
          pending={mutation.isPending}
          onClose={() => setCommissionTarget(null)}
          onSubmit={(commissionBps) =>
            mutation.mutate({ id: commissionTarget.seller.id, body: { action: "approve", commissionBps } })
          }
        />
      )}

      <AlertDialog open={suspendTarget !== null} onOpenChange={(o) => !o && setSuspendTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspend {suspendTarget?.businessName}?</AlertDialogTitle>
            <AlertDialogDescription>
              The seller account will be suspended and their active listings archived. You can reactivate them
              later from this page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => suspendTarget && mutation.mutate({ id: suspendTarget.id, body: { action: "suspend" } })}
            >
              Suspend seller
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminSellersView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <AdminGate>
      <AdminShell active="admin-sellers">
        <SellersList />
      </AdminShell>
    </AdminGate>
  );
}
