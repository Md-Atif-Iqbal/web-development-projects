"use client";

// Notifications — list with unread highlighting and mark-as-read.

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, Package, IndianRupee, RotateCcw, Store, Megaphone, CheckCheck } from "lucide-react";
import { api } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import type { NotificationView } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shopkart/shared";

const ICONS: Record<string, React.ReactNode> = {
  ORDER: <Package size={18} />,
  PAYMENT: <IndianRupee size={18} />,
  RETURN: <RotateCcw size={18} />,
  SELLER: <Store size={18} />,
  SYSTEM: <Megaphone size={18} />,
};

export default function NotificationsView(_props: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  const { user, loading: sessionLoading } = useSession();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<{ items: NotificationView[]; unreadCount: number }>("/api/notifications"),
    enabled: !!user,
  });

  const markAllRead = async () => {
    await api.post("/api/notifications/read", {});
    await qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-6 sm:px-6">
        <Skeleton className="h-9 w-44" />
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptyState
          icon={<Bell size={28} />}
          title="Please sign in"
          description="Sign in to see your order updates and announcements."
          action={<Button onClick={() => navigate("login")}>Sign in</Button>}
        />
      </div>
    );
  }

  const items = data?.items ?? [];

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Notifications</h1>
          {data && data.unreadCount > 0 && (
            <p className="text-sm text-muted-foreground">{data.unreadCount} unread</p>
          )}
        </div>
        {data && data.unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={markAllRead}>
            <CheckCheck size={14} /> Mark all read
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={<Bell size={28} />}
          title="All caught up"
          description="Order updates, refunds and announcements will show up here."
        />
      ) : (
        <div className="space-y-2.5">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={async () => {
                if (!n.readAt) {
                  await api.post("/api/notifications/read", { ids: [n.id] });
                  await qc.invalidateQueries({ queryKey: ["notifications"] });
                }
              }}
              className={`flex w-full items-start gap-3 rounded-xl border p-4 text-left transition-colors ${
                n.readAt ? "bg-card" : "border-primary/30 bg-primary/5"
              }`}
            >
              <span className={`mt-0.5 rounded-full p-2 ${n.readAt ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary"}`}>
                {ICONS[n.type] ?? <Bell size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className={`flex items-center gap-2 ${n.readAt ? "" : "font-semibold"}`}>
                  <span className="truncate text-sm">{n.title}</span>
                  {!n.readAt && <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />}
                </span>
                {n.body && <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{n.body}</span>}
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {new Date(n.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
