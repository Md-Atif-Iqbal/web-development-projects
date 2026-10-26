"use client";

// Customer support — create tickets and chat with the support team.

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { LifeBuoy, Plus, Send, MessageSquare, Loader2, ChevronLeft } from "lucide-react";
import { api, ApiClientError } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import type { TicketView } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/shopkart/shared";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const ticketSchema = z.object({
  subject: z.string().min(5, "Subject needs at least 5 characters").max(120),
  category: z.enum(["ORDER", "PAYMENT", "RETURN", "ACCOUNT", "SELLER", "OTHER"]),
  message: z.string().min(10, "Describe your issue in at least 10 characters").max(2000),
});

type TicketForm = z.infer<typeof ticketSchema>;

const CATEGORY_LABELS: Record<string, string> = {
  ORDER: "Order issue", PAYMENT: "Payment", RETURN: "Return / refund",
  ACCOUNT: "Account", SELLER: "Seller", OTHER: "Something else",
};

export default function SupportView(_props: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  const back = useNav((s) => s.back);
  const { user, loading: sessionLoading } = useSession();
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openTicketId, setOpenTicketId] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["tickets"],
    queryFn: () => api.get<{ items: TicketView[] }>("/api/support/tickets"),
    enabled: !!user,
  });

  const form = useForm<TicketForm>({
    resolver: zodResolver(ticketSchema),
    defaultValues: { subject: "", category: "ORDER", message: "" },
  });

  const create = async (values: TicketForm) => {
    setCreating(true);
    try {
      const t = await api.post<TicketView>("/api/support/tickets", values);
      toast.success(`Ticket ${t.ticketNumber} created — we usually reply within 24 hours`);
      await qc.invalidateQueries({ queryKey: ["tickets"] });
      setDialogOpen(false);
      form.reset();
      setOpenTicketId(t.id);
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not create ticket");
    } finally {
      setCreating(false);
    }
  };

  const sendReply = async () => {
    if (!openTicketId || !reply.trim()) return;
    setReplying(true);
    try {
      await api.post(`/api/support/tickets/${openTicketId}/messages`, { body: reply.trim() });
      setReply("");
      await qc.invalidateQueries({ queryKey: ["tickets"] });
    } catch (err) {
      toast.error(err instanceof ApiClientError ? err.message : "Could not send message");
    } finally {
      setReplying(false);
    }
  };

  if (sessionLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-3 px-4 py-6 sm:px-6">
        <Skeleton className="h-9 w-52" />
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <EmptySupport action={<Button onClick={() => navigate("login")}>Sign in</Button>} />
      </div>
    );
  }

  const tickets = data?.items ?? [];
  const openTicket = tickets.find((t) => t.id === openTicketId) ?? null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <button onClick={back} className="mb-3 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft size={14} /> Back
      </button>

      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Customer Support</h1>
          <p className="text-sm text-muted-foreground">We usually reply within 24 hours.</p>
        </div>
        <Button className="gap-1.5" onClick={() => setDialogOpen(true)}>
          <Plus size={16} /> New ticket
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : tickets.length === 0 ? (
        <EmptySupport
          action={<Button onClick={() => setDialogOpen(true)} className="gap-1.5"><Plus size={16} /> Raise your first ticket</Button>}
        />
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <Card key={t.id} className="cursor-pointer py-0 transition-shadow hover:shadow-sm" onClick={() => { setOpenTicketId(t.id === openTicketId ? null : t.id); setReply(""); }}>
              <CardHeader className="py-3.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle className="text-sm font-semibold">
                    <span className="mr-2 font-mono text-xs text-muted-foreground">{t.ticketNumber}</span>
                    {t.subject}
                  </CardTitle>
                  <StatusBadge status={t.status} />
                </div>
              </CardHeader>
              <CardContent className="pb-3.5">
                <p className="text-xs text-muted-foreground">
                  {CATEGORY_LABELS[t.category] ?? t.category} · updated {new Date(t.updatedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} · {t.messages.length} message{t.messages.length === 1 ? "" : "s"}
                </p>
                {t.id === openTicketId && (
                  <div className="mt-3 space-y-3 border-t pt-3" onClick={(e) => e.stopPropagation()}>
                    <div className="max-h-72 space-y-2.5 overflow-y-auto sk-scrollbar">
                      {t.messages.map((m) => (
                        <div key={m.id} className={`flex ${m.authorRole === "ADMIN" ? "justify-start" : "justify-end"}`}>
                          <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm ${
                            m.authorRole === "ADMIN"
                              ? "rounded-tl-sm bg-muted"
                              : "rounded-tr-sm bg-primary text-primary-foreground"
                          }`}>
                            <p className="mb-0.5 text-[11px] opacity-70">
                              {m.authorRole === "ADMIN" ? `Support${m.authorName ? ` · ${m.authorName}` : ""}` : "You"} · {new Date(m.createdAt).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}
                            </p>
                            <p className="whitespace-pre-wrap leading-relaxed">{m.body}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                    {t.status !== "CLOSED" && t.status !== "RESOLVED" && (
                      <div className="flex gap-2">
                        <Input
                          value={reply}
                          onChange={(e) => setReply(e.target.value)}
                          placeholder="Type your reply…"
                          onKeyDown={(e) => e.key === "Enter" && sendReply()}
                        />
                        <Button size="icon" aria-label="Send reply" disabled={replying || !reply.trim()} onClick={sendReply}>
                          {replying ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New ticket dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Raise a ticket</DialogTitle>
            <DialogDescription>Tell us what went wrong and we&apos;ll make it right.</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(create)} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="subject">Subject</Label>
              <Input id="subject" placeholder="e.g. Wrong item received in order SK-…" {...form.register("subject")} />
              {form.formState.errors.subject && <p className="text-xs text-rose-600">{form.formState.errors.subject.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Category</Label>
              <Select value={form.watch("category")} onValueChange={(v) => form.setValue("category", v as TicketForm["category"])}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(CATEGORY_LABELS).map(([k, label]) => (
                    <SelectItem key={k} value={k}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="message">Describe the issue</Label>
              <Textarea id="message" rows={4} placeholder="Share order numbers, what happened, and what you need…" {...form.register("message")} />
              {form.formState.errors.message && <p className="text-xs text-rose-600">{form.formState.errors.message.message}</p>}
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={creating} className="gap-1.5">
                {creating && <Loader2 size={14} className="animate-spin" />} Submit ticket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function EmptySupport({ action }: { action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
      <div className="rounded-full bg-muted p-4 text-muted-foreground"><MessageSquare size={28} /></div>
      <h3 className="font-semibold">We&apos;re here to help</h3>
      <p className="max-w-sm text-sm text-muted-foreground">
        Raise a ticket for order, payment or return issues and our team will get back to you.
      </p>
      {action}
    </div>
  );
}
