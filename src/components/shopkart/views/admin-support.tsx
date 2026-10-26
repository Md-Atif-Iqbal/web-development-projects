"use client";

// Admin Console — Support: ticket queue with reply thread and status control.

import { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, LogOut, ShieldCheck, Store, LifeBuoy, Send, ChevronLeft, ChevronRight, MessagesSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { BrandLogo, EmptyState, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, qs } from "@/lib/client/api";
import type { TicketView } from "@/lib/types";

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
            <span className="truncate text-sm font-semibold text-muted-foreground">Admin Console · Support</span>
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
      <AdminShell active="admin-support">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AdminShell>
    );
  }
  if (!user || user.role !== "ADMIN") {
    return (
      <AdminShell active="admin-support">
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

const STATUS_TABS = ["", "OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"];

function SupportQueue() {
  const qc = useQueryClient();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);

  // Reset to page 1 whenever filters change (render-time state adjustment).
  const pageResetKey = `${status}`;
  const [prevPageResetKey, setPrevPageResetKey] = useState(pageResetKey);
  if (pageResetKey !== prevPageResetKey) {
    setPrevPageResetKey(pageResetKey);
    setPage(1);
  }

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["admin-tickets", status, page],
    queryFn: () => api.get<{ items: TicketView[]; total: number; page: number; totalPages: number }>(
      `/api/admin/tickets${qs({ status: status || undefined, page, pageSize: 12 })}`
    ),
    placeholderData: keepPreviousData,
  });

  const { data: detail, refetch: refetchDetail } = useQuery({
    queryKey: ["admin-ticket", openId],
    queryFn: () => api.get<TicketView>(`/api/support/tickets/${openId}`),
    enabled: !!openId,
  });

  const send = async () => {
    if (!openId || !reply.trim()) return;
    setSending(true);
    try {
      await api.post(`/api/support/tickets/${openId}/messages`, { body: reply.trim() });
      setReply("");
      await refetchDetail();
      await qc.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast.success("Reply sent");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not send reply");
    } finally {
      setSending(false);
    }
  };

  const changeStatus = async (next: string) => {
    if (!openId) return;
    try {
      await api.patch(`/api/admin/tickets/${openId}`, { status: next });
      toast.success(`Ticket marked ${next.replaceAll("_", " ").toLowerCase()}`);
      await refetchDetail();
      await qc.invalidateQueries({ queryKey: ["admin-tickets"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update status");
    }
  };

  const items = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Support Tickets</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} ticket${data.total === 1 ? "" : "s"}` : "Loading…"} — reply inline, update status as you resolve.
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
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState icon={<LifeBuoy size={28} />} title="No tickets found" description="Try a different status filter." />
      ) : (
        <Card className="py-0">
          <CardContent className="p-0">
            <div className={`overflow-x-auto ${isFetching ? "opacity-70" : ""}`}>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Ticket</TableHead>
                    <TableHead className="hidden md:table-cell">Customer</TableHead>
                    <TableHead>Category</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((t) => (
                    <TableRow key={t.id} className="cursor-pointer" onClick={() => setOpenId(t.id)}>
                      <TableCell>
                        <p className="font-medium">{t.subject}</p>
                        <p className="font-mono text-xs text-muted-foreground">{t.ticketNumber}</p>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        <p className="text-sm">{t.userName ?? "—"}</p>
                        <p className="text-xs text-muted-foreground">{t.userEmail}</p>
                      </TableCell>
                      <TableCell className="text-sm">{t.category}</TableCell>
                      <TableCell><StatusBadge status={t.status} /></TableCell>
                      <TableCell className="hidden text-right text-sm text-muted-foreground sm:table-cell">
                        {new Date(t.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
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

      {/* Ticket detail sheet */}
      <Sheet open={!!openId} onOpenChange={(o) => !o && setOpenId(null)}>
        <SheetContent className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-lg">
          {detail ? (
            <>
              <SheetHeader className="border-b p-4">
                <SheetTitle className="text-left text-base">{detail.subject}</SheetTitle>
                <SheetDescription className="text-left">
                  {detail.ticketNumber} · {detail.userName} ({detail.userEmail}) · {detail.category}
                </SheetDescription>
                <div className="mt-2 flex items-center gap-2">
                  <Select value={detail.status} onValueChange={changeStatus}>
                    <SelectTrigger className="h-8 w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {["OPEN", "IN_PROGRESS", "RESOLVED", "CLOSED"].map((s) => (
                        <SelectItem key={s} value={s}>{s.replaceAll("_", " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </SheetHeader>
              <div className="flex-1 space-y-2.5 overflow-y-auto sk-scrollbar p-4">
                {detail.messages.map((m) => (
                  <div key={m.id} className={`flex ${m.authorRole === "ADMIN" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                      m.authorRole === "ADMIN" ? "rounded-tr-sm bg-primary text-primary-foreground" : "rounded-tl-sm bg-muted"
                    }`}>
                      <p className="mb-0.5 text-[11px] opacity-70">
                        {m.authorRole === "ADMIN" ? "Support (you)" : m.authorName ?? "Customer"} · {new Date(m.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                      </p>
                      <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="border-t p-3">
                <div className="flex gap-2">
                  <Textarea
                    rows={2}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write a reply… (Ctrl+Enter to send)"
                    onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) send(); }}
                  />
                  <Button size="icon" aria-label="Send reply" className="h-auto" disabled={sending || !reply.trim()} onClick={send}>
                    {sending ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <MessagesSquare size={28} className="text-muted-foreground" />
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

export default function AdminSupportView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <AdminGate>
      <AdminShell active="admin-support">
        <SupportQueue />
      </AdminShell>
    </AdminGate>
  );
}
