"use client";

// Admin Console — Users: customer/seller account management with suspend/activate.

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Users, Loader2, LogOut, ShieldCheck, Store, Search, Ban, CheckCircle2, ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { BrandLogo, EmptyState, StatusBadge } from "@/components/shopkart/shared";
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
            <span className="truncate text-sm font-semibold text-muted-foreground">Admin Console · Users</span>
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
      <AdminShell active="admin-users">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AdminShell>
    );
  }
  if (!user || user.role !== "ADMIN") {
    return (
      <AdminShell active="admin-users">
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

// ── Types ─────────────────────────────────────────────────────────────────

type AdminUserRow = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  createdAt: string;
  orderCount?: number;
};

const ROLE_TABS = ["", "CUSTOMER", "SELLER", "ADMIN"];

function UsersManager() {
  const { user: me } = useSession();
  const qc = useQueryClient();
  const [role, setRole] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [target, setTarget] = useState<AdminUserRow | null>(null);
  const [busy, setBusy] = useState(false);

  // Reset to page 1 whenever filters change (render-time state adjustment).
  const pageResetKey = `${role}|${q}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-users", role, q, page],
    queryFn: () => api.get<{ items: AdminUserRow[]; total: number; page: number; totalPages: number }>(
      `/api/admin/users${qs({ role: role || undefined, q: q || undefined, page, pageSize: 12 })}`
    ),
    placeholderData: keepPreviousData,
  });

  const act = async () => {
    if (!target) return;
    setBusy(true);
    try {
      const action = target.status === "ACTIVE" ? "suspend" : "activate";
      await api.patch(`/api/admin/users/${target.id}`, { action });
      toast.success(`${target.name} ${action === "suspend" ? "suspended" : "reactivated"}`);
      await qc.invalidateQueries({ queryKey: ["admin-users"] });
      await qc.invalidateQueries({ queryKey: ["admin-dashboard"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setBusy(false);
      setTarget(null);
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">Users</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} account${data.total === 1 ? "" : "s"}` : "Loading…"}
          </p>
        </div>
        <div className="relative w-full max-w-xs">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name or email…" className="pl-9" />
        </div>
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border bg-background p-1 sk-scrollbar">
        {ROLE_TABS.map((key) => (
          <button
            key={key || "all"}
            onClick={() => setRole(key)}
            className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
              role === key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {key ? key.charAt(0) + key.slice(1).toLowerCase() : "All roles"}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Users size={28} />} title="No users found" description="Try a different search or role filter." />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className={`overflow-x-auto ${isFetching ? "opacity-70" : ""}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Orders</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Joined</TableHead>
                    <TableHead className="w-28 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell>
                        <p className="font-medium">{u.name}</p>
                        <p className="text-xs text-muted-foreground">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={u.role === "ADMIN" ? "border-primary/40 text-primary" : ""}>
                          {u.role.toLowerCase()}
                        </Badge>
                      </TableCell>
                      <TableCell className="hidden text-right text-sm sm:table-cell">{u.orderCount ?? "—"}</TableCell>
                      <TableCell><StatusBadge status={u.status} /></TableCell>
                      <TableCell className="hidden text-sm text-muted-foreground md:table-cell">
                        {new Date(u.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right">
                        {u.role !== "ADMIN" && u.id !== me?.id ? (
                          <Button
                            variant={u.status === "ACTIVE" ? "outline" : "default"}
                            size="sm"
                            className={u.status === "ACTIVE" ? "gap-1 text-rose-600 hover:bg-rose-50 hover:text-rose-700" : "gap-1"}
                            onClick={() => setTarget(u)}
                          >
                            {u.status === "ACTIVE" ? <><Ban size={13} /> Suspend</> : <><CheckCircle2 size={13} /> Activate</>}
                          </Button>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                            <ShieldAlert size={12} /> Protected
                          </span>
                        )}
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

      <AlertDialog open={!!target} onOpenChange={(o) => !o && setTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target?.status === "ACTIVE" ? "Suspend this account?" : "Reactivate this account?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target?.status === "ACTIVE"
                ? `${target?.name} (${target?.email}) will be signed out and blocked from the marketplace. Their seller listings, if any, will be archived.`
                : `${target?.name} will regain full access.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className={target?.status === "ACTIVE" ? "bg-rose-600 hover:bg-rose-700" : ""}
              onClick={(e) => { e.preventDefault(); act(); }}
              disabled={busy}
            >
              {busy && <Loader2 size={14} className="mr-1.5 animate-spin" />}
              {target?.status === "ACTIVE" ? "Suspend" : "Activate"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminUsersView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <AdminGate>
      <AdminShell active="admin-users">
        <UsersManager />
      </AdminShell>
    </AdminGate>
  );
}
