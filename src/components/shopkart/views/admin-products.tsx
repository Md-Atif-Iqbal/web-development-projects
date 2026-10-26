"use client";

// Admin Console — Products: moderation queue with detail dialog and
// activate / reject / archive decisions. Full-screen dashboard shell.

import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ImageOff,
  Loader2,
  LogOut,
  Package,
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
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo, EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, ApiClientError, qs } from "@/lib/client/api";
import { formatINR } from "@/lib/money";
import type { ProductDetail } from "@/lib/types";

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
            <span className="truncate text-sm font-semibold text-muted-foreground">Admin Console · Products</span>
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
      <AdminShell active="admin-products">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AdminShell>
    );
  }
  if (!user || user.role !== "ADMIN") {
    return (
      <AdminShell active="admin-products">
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

type AdminProductRow = {
  id: string;
  name: string;
  slug: string;
  status: string;
  sellerId: string;
  sellerName: string;
  sellerStatus: string;
  categoryName: string;
  image: string | null;
  variantCount: number;
  price: number;
  isFeatured: boolean;
  moderationNote: string | null;
  createdAt: string;
};

function useDebounced<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "ACTIVE", label: "Active" },
  { key: "REJECTED", label: "Rejected" },
  { key: "ARCHIVED", label: "Archived" },
  { key: "", label: "All" },
];

// ── Detail dialog ─────────────────────────────────────────────────────────

function DetailDialog({
  row,
  pending,
  onClose,
  onAction,
}: {
  row: AdminProductRow;
  pending: boolean;
  onClose: () => void;
  onAction: (action: "activate" | "reject" | "__reject" | "__archive") => void;
}) {
  // Full content is available from the public endpoint for ACTIVE listings only.
  const detail = useQuery({
    queryKey: ["admin-product-detail", row.slug],
    queryFn: () => api.get<ProductDetail>(`/api/products/${row.slug}`),
    enabled: row.status === "ACTIVE",
    retry: false,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl sk-scrollbar">
        <DialogHeader>
          <DialogTitle className="flex flex-wrap items-center gap-2 pr-6">
            <span className="line-clamp-2">{row.name}</span> <StatusBadge status={row.status} />
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex gap-4">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
              {row.image ? (
                 
                <img src={row.image} alt={row.name} className="h-full w-full object-contain" />
              ) : (
                <ImageOff size={20} className="text-muted-foreground" />
              )}
            </div>
            <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-1 text-sm">
              <div>
                <p className="text-xs text-muted-foreground">Seller</p>
                <p className="font-medium">{row.sellerName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Seller status</p>
                <StatusBadge status={row.sellerStatus} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="font-medium">{row.categoryName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Price from</p>
                <p className="font-semibold">{formatINR(row.price)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Variants</p>
                <p className="font-medium">{row.variantCount}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Submitted</p>
                <p className="font-medium">
                  {new Date(row.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                </p>
              </div>
            </div>
          </div>

          {row.moderationNote && (
            <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
              Moderation note: {row.moderationNote}
            </p>
          )}

          {row.status === "ACTIVE" && detail.data ? (
            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
                <p className="mt-1 whitespace-pre-line text-sm">{detail.data.description}</p>
              </div>
              {detail.data.highlights.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Highlights</p>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm">
                    {detail.data.highlights.map((h, i) => (
                      <li key={i}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
              {Object.keys(detail.data.specifications).length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Specifications</p>
                  <div className="mt-1 grid grid-cols-1 gap-x-4 text-sm sm:grid-cols-2">
                    {Object.entries(detail.data.specifications).map(([k, v]) => (
                      <p key={k}>
                        <span className="text-muted-foreground">{k}:</span> <span className="font-medium">{v}</span>
                      </p>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Variants</p>
                <div className="mt-1 overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>SKU</TableHead>
                        <TableHead className="text-right">Price</TableHead>
                        <TableHead className="text-right">Stock</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detail.data.variants.map((v) => (
                        <TableRow key={v.id}>
                          <TableCell className="text-sm">{v.name}</TableCell>
                          <TableCell className="font-mono text-xs">{v.sku}</TableCell>
                          <TableCell className="text-right text-sm">{formatINR(v.price)}</TableCell>
                          <TableCell className="text-right text-sm">{v.availableQty}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          ) : (
            <p className="rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
              {row.status === "ACTIVE"
                ? "Loading full listing content…"
                : "Full description/specs preview is only available for live (ACTIVE) listings. Decide using the summary, moderation note and seller record."}
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {row.status === "PENDING" && (
            <>
              <Button variant="outline" disabled={pending} onClick={() => onAction("__reject")}>
                <XCircle size={14} /> Reject…
              </Button>
              <Button disabled={pending} onClick={() => onAction("activate")}>
                {pending ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Activate
              </Button>
            </>
          )}
          {(row.status === "ACTIVE" || row.status === "REJECTED") && (
            <Button variant="outline" disabled={pending} onClick={() => onAction("__archive")}>
              <Archive size={14} /> Archive
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── List ──────────────────────────────────────────────────────────────────

function ProductsQueue() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("PENDING");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AdminProductRow | null>(null);
  const [rejectTarget, setRejectTarget] = useState<AdminProductRow | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<AdminProductRow | null>(null);
  const q = useDebounced(search);

  // Reset to page 1 whenever filters change (render-time state adjustment).
  const pageResetKey = `${status}|${q}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-products", page, status, q],
    queryFn: () => api.get<{ items: AdminProductRow[]; total: number; page: number; totalPages: number }>(
      `/api/admin/products${qs({ page, status: status || undefined, q: q || undefined })}`
    ),
    placeholderData: keepPreviousData,
  });

  const mutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: { action: string; note?: string } }) =>
      api.patch(`/api/admin/products/${id}`, body),
    onSuccess: (_res, vars) => {
      const labels: Record<string, string> = { activate: "activated — now live", reject: "rejected", archive: "archived" };
      toast.success(`Product ${labels[vars.body.action] ?? vars.body.action}`);
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
      setDetail(null);
      setRejectTarget(null);
      setArchiveTarget(null);
    },
    onError: (err) => {
      // e.g. 422 PRODUCT_INCOMPLETE — surface the server's message to the admin
      toast.error(err instanceof ApiClientError ? err.message : "Action failed");
    },
  });

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Product moderation</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} product${data.total === 1 ? "" : "s"}` : "Loading…"} — review listings before
            they go live.
          </p>
        </div>
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
            </button>
          ))}
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search products…"
            className="pl-8"
            aria-label="Search products"
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
        <EmptyState
          icon={<Package size={28} />}
          title={status === "PENDING" ? "Moderation queue is clear" : "No products found"}
          description={status ? "Try a different status filter or search." : undefined}
        />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className={`overflow-x-auto ${isFetching ? "opacity-70" : ""}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-64">Product</TableHead>
                    <TableHead>Seller</TableHead>
                    <TableHead className="hidden md:table-cell">Category</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden text-right lg:table-cell">Submitted</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((p) => (
                    <TableRow key={p.id} className="cursor-pointer" onClick={() => setDetail(p)}>
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                            {p.image ? (
                               
                              <img src={p.image} alt={p.name} className="h-full w-full object-contain" loading="lazy" />
                            ) : (
                              <ImageOff size={16} className="text-muted-foreground" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <p className="max-w-72 truncate font-medium">{p.name}</p>
                            {p.moderationNote && p.status === "REJECTED" && (
                              <p className="max-w-72 truncate text-xs text-rose-600" title={p.moderationNote}>
                                Note: {p.moderationNote}
                              </p>
                            )}
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{p.sellerName}</TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">{p.categoryName}</TableCell>
                      <TableCell className="text-right font-medium">{formatINR(p.price)}</TableCell>
                      <TableCell>
                        <StatusBadge status={p.status} />
                      </TableCell>
                      <TableCell className="hidden text-right text-sm text-muted-foreground lg:table-cell">
                        {new Date(p.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
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

      {detail && (
        <DetailDialog
          row={detail}
          pending={mutation.isPending}
          onClose={() => setDetail(null)}
          onAction={(action) => {
            if (action === "__reject") {
              setDetail(null);
              setRejectTarget(detail);
            } else if (action === "__archive") {
              setDetail(null);
              setArchiveTarget(detail);
            } else {
              mutation.mutate({ id: detail.id, body: { action } });
            }
          }}
        />
      )}

      {rejectTarget && <RejectNoteDialog row={rejectTarget} pending={mutation.isPending} onClose={() => setRejectTarget(null)} onSubmit={(note) => mutation.mutate({ id: rejectTarget.id, body: { action: "reject", note } })} />}

      <AlertDialog open={archiveTarget !== null} onOpenChange={(o) => !o && setArchiveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive this product?</AlertDialogTitle>
            <AlertDialogDescription>
              Archived listings are hidden from the storefront. {archiveTarget?.name}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => archiveTarget && mutation.mutate({ id: archiveTarget.id, body: { action: "archive" } })}>
              Archive product
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RejectNoteDialog({
  row,
  pending,
  onClose,
  onSubmit,
}: {
  row: AdminProductRow;
  pending: boolean;
  onClose: () => void;
  onSubmit: (note: string) => void;
}) {
  const [note, setNote] = useState("");
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reject “{row.name}”?</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">The seller is notified with your note and can fix and resubmit.</p>
        <div className="space-y-1.5">
          <Label htmlFor="prod-reject-note">Reason (required)</Label>
          <Input
            id="prod-reject-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Images do not match the description"
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            Cancel
          </Button>
          <Button variant="destructive" disabled={pending || note.trim().length === 0} onClick={() => onSubmit(note.trim())}>
            {pending && <Loader2 size={14} className="animate-spin" />} Reject listing
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function AdminProductsView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <AdminGate>
      <AdminShell active="admin-products">
        <ProductsQueue />
      </AdminShell>
    </AdminGate>
  );
}
