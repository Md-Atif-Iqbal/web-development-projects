"use client";

// Seller Hub — Returns: review / approve / reject / pickup pipeline for the
// seller's own items. Refund itself is initiated by the admin.

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ClipboardCheck,
  Eye,
  Loader2,
  LogOut,
  PackageOpen,
  RotateCcw,
  Store,
  Truck,
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { BrandLogo, EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, ApiClientError } from "@/lib/client/api";
import { formatINR } from "@/lib/money";
import { RETURN_REASON_LABELS } from "@/lib/constants";
import type { ReturnRequestView } from "@/lib/types";

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
            <span className="truncate text-sm font-semibold text-muted-foreground">Seller Hub · Returns</span>
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
      <SellerShell active="seller-returns">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      </SellerShell>
    );
  }
  if (!user || user.role !== "SELLER" || user.sellerStatus !== "APPROVED") {
    return (
      <SellerShell active="seller-returns">
        <div className="py-16">
          <EmptyState
            icon={<RotateCcw size={28} />}
            title={!user ? "Seller access required" : user.role === "ADMIN" ? "Access denied" : "Seller account required"}
            description={
              !user
                ? "Sign in with your seller account to manage returns."
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

// ── Actions ───────────────────────────────────────────────────────────────

type ReturnAction = { action: string; label: string; icon: React.ComponentType<{ size?: number }>; needsNote?: boolean };

function actionsFor(status: string): ReturnAction[] {
  switch (status) {
    case "REQUESTED":
      return [
        { action: "review", label: "Start review", icon: Eye },
        { action: "approve", label: "Approve", icon: ClipboardCheck },
        { action: "reject", label: "Reject", icon: XCircle, needsNote: true },
      ];
    case "UNDER_REVIEW":
      return [
        { action: "approve", label: "Approve", icon: ClipboardCheck },
        { action: "reject", label: "Reject", icon: XCircle, needsNote: true },
      ];
    case "APPROVED":
      return [{ action: "schedule_pickup", label: "Schedule pickup", icon: Truck }];
    case "PICKUP_SCHEDULED":
      return [{ action: "picked_up", label: "Mark picked up", icon: PackageOpen }];
    case "PICKED_UP":
      return [{ action: "inspection", label: "Mark inspection", icon: ClipboardCheck }];
    case "REJECTED":
    case "REFUND_COMPLETED":
      return [{ action: "close", label: "Close request", icon: XCircle }];
    default:
      return [];
  }
}

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
  "REJECTED",
  "CLOSED",
];

// ── Note dialog ───────────────────────────────────────────────────────────

function NoteDialog({
  title,
  description,
  actionLabel,
  destructive,
  requireNote,
  pending,
  onSubmit,
  onOpenChange,
}: {
  title: string;
  description: string;
  actionLabel: string;
  destructive?: boolean;
  requireNote?: boolean;
  pending: boolean;
  onSubmit: (note: string) => void;
  onOpenChange: (open: boolean) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{title}</DialogTitle>
      </DialogHeader>
      <p className="text-sm text-muted-foreground">{description}</p>
      <div className="space-y-1.5">
        <Label htmlFor="return-note">Note {requireNote ? "(required)" : "(optional)"}</Label>
        <Textarea
          id="return-note"
          rows={3}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Shared with the customer and recorded on the return"
        />
        {requireNote && note.trim().length === 0 && (
          <p className="text-xs text-muted-foreground">A short reason helps the customer understand the decision.</p>
        )}
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
          Cancel
        </Button>
        <Button
          variant={destructive ? "destructive" : "default"}
          disabled={pending || (requireNote === true && note.trim().length === 0)}
          onClick={() => onSubmit(note.trim())}
        >
          {pending && <Loader2 size={14} className="animate-spin" />}
          {actionLabel}
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

// ── Return card ───────────────────────────────────────────────────────────

function ReturnCard({ r }: { r: ReturnRequestView & { userName: string } }) {
  const qc = useQueryClient();
  const [noteDialog, setNoteDialog] = useState<{ action: string; title: string; destructive: boolean; requireNote: boolean } | null>(null);
  const [closeDialog, setCloseDialog] = useState(false);

  const mutation = useMutation({
    mutationFn: (payload: { action: string; note?: string }) =>
      api.patch<{ ok: boolean; status: string }>(`/api/seller/returns/${r.id}`, payload),
    onSuccess: (res) => {
      toast.success(`Return updated — ${res.status.replaceAll("_", " ").toLowerCase()}`);
      qc.invalidateQueries({ queryKey: ["seller-returns"] });
      qc.invalidateQueries({ queryKey: ["seller-dashboard"] });
      setNoteDialog(null);
      setCloseDialog(false);
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not update return");
    },
  });

  const actions = actionsFor(r.status);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="font-semibold">RMA {r.rmaNumber}</p>
            <p className="text-xs text-muted-foreground">
              Order #{r.orderNumber} · {r.userName} · {new Date(r.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <StatusBadge status={r.status} />
        </div>

        <div className="grid gap-2 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Items (yours)</p>
            {r.items.map((it) => (
              <p key={it.id}>
                {it.productName} <span className="text-muted-foreground">× {it.qty}</span>
              </p>
            ))}
          </div>
          <div>
            <p className="text-xs font-semibold text-muted-foreground">Reason</p>
            <p>
              {RETURN_REASON_LABELS[r.reason] ?? r.reason}
              {r.type === "EXCHANGE" && <Badge variant="secondary" className="ml-1.5">Exchange</Badge>}
            </p>
            {r.description && <p className="mt-1 text-xs text-muted-foreground">“{r.description}”</p>}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm">
            <span className="text-muted-foreground">Refund amount</span>{" "}
            <span className="font-bold">{formatINR(r.refundAmount)}</span>{" "}
            <span className="text-xs text-muted-foreground">({r.refundMode === "BANK_TRANSFER" ? "bank transfer" : "original payment method"})</span>
          </p>
          <div className="flex flex-wrap gap-2">
            {actions.map((a) => (
              <Button
                key={a.action}
                size="sm"
                variant={a.needsNote || a.action === "close" ? "outline" : "default"}
                disabled={mutation.isPending}
                onClick={() => {
                  if (a.action === "close") {
                    setCloseDialog(true);
                  } else if (a.needsNote) {
                    setNoteDialog({ action: a.action, title: "Reject return", destructive: true, requireNote: true });
                  } else {
                    mutation.mutate({ action: a.action });
                  }
                }}
              >
                <a.icon size={14} /> {a.label}
              </Button>
            ))}
          </div>
        </div>

        {r.status === "INSPECTION_PENDING" && (
          <p className="rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            Inspection done — the ShopEase admin team initiates the refund from here.
          </p>
        )}
        {r.refund && (
          <p className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-xs text-teal-900 dark:border-teal-800 dark:bg-teal-950 dark:text-teal-200">
            Refund {r.refund.id.slice(0, 10)}… · {formatINR(r.refund.amount)} · {r.refund.status.replaceAll("_", " ").toLowerCase()} via {r.refund.mode.replaceAll("_", " ").toLowerCase()}
          </p>
        )}
        {r.decisionNote && (
          <p className="text-xs text-muted-foreground">Decision note: {r.decisionNote}</p>
        )}

      {/* Reject note dialog */}
      <Dialog open={noteDialog !== null} onOpenChange={(o) => !o && setNoteDialog(null)}>
        {noteDialog && (
          <NoteDialog
            title={noteDialog.title}
            description="Rejecting moves this return to REJECTED and returns the items to ACTIVE on the order."
            actionLabel="Reject return"
            destructive
            requireNote
            pending={mutation.isPending}
            onSubmit={(note) => mutation.mutate({ action: noteDialog.action, note })}
            onOpenChange={(o) => !o && setNoteDialog(null)}
          />
        )}
      </Dialog>

      {/* Close confirm */}
      <AlertDialog open={closeDialog} onOpenChange={setCloseDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Close this return request?</AlertDialogTitle>
            <AlertDialogDescription>
              Closing is final — the return can no longer be progressed. RMA {r.rmaNumber}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Back</AlertDialogCancel>
            <AlertDialogAction onClick={() => mutation.mutate({ action: "close" })}>Close request</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </CardContent>
    </Card>
  );
}

// ── List ──────────────────────────────────────────────────────────────────

function ReturnsList() {
  const [status, setStatus] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["seller-returns"],
    queryFn: () => api.get<{ items: (ReturnRequestView & { userName: string })[] }>("/api/seller/returns"),
  });

  const all = data?.items ?? [];
  const items = useMemo(() => (status ? all.filter((r) => r.status === status) : all), [all, status]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Customer returns</h1>
        <p className="text-sm text-muted-foreground">Review, approve and coordinate pickups for your items.</p>
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
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-xl" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<RotateCcw size={28} />}
          title={status ? `No ${status.toLowerCase().replaceAll("_", " ")} returns` : "No returns yet"}
          description="Return requests for your products will show up here when customers raise them."
        />
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <ReturnCard key={r.id} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function SellerReturnsView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <SellerGate>
      <SellerShell active="seller-returns">
        <ReturnsList />
      </SellerShell>
    </SellerGate>
  );
}
