"use client";

// Admin Console — Catalog: categories tree, brands and coupons management.
// Full-screen dashboard shell (per-file layout pattern).

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  Layers,
  Loader2,
  LogOut,
  Plus,
  ShieldCheck,
  Store,
  Tag,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo, EmptyState } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, ApiClientError } from "@/lib/client/api";
import { formatINR, rupeesToPaise } from "@/lib/money";

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
            <span className="truncate text-sm font-semibold text-muted-foreground">Admin Console · Catalog</span>
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
      <AdminShell active="admin-catalog">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </AdminShell>
    );
  }
  if (!user || user.role !== "ADMIN") {
    return (
      <AdminShell active="admin-catalog">
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

type CatNode = {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  imageUrl: string | null;
  isActive: boolean;
  sortOrder: number;
  children: CatNode[];
};

type BrandRow = { id: string; name: string; slug: string; logoUrl: string | null; productCount: number };

type CouponRow = {
  id: string;
  code: string;
  description: string;
  type: string;
  value: number;
  minOrderValue: number;
  maxDiscount: number | null;
  usageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  validFrom: string;
  validTo: string;
  isActive: boolean;
};

function errToast(err: unknown, fallback: string) {
  toast.error(err instanceof ApiClientError ? err.message : fallback);
}

// ── Categories ────────────────────────────────────────────────────────────

function CategoryRow({ node, depth, onAddChild }: { node: CatNode; depth: number; onAddChild: (parent: CatNode) => void }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(depth === 0);
  const toggleActive = useMutation({
    mutationFn: (isActive: boolean) => api.patch(`/api/admin/categories/${node.id}`, { isActive }),
    onSuccess: () => {
      toast.success(`${node.name} ${node.isActive ? "deactivated" : "activated"}`);
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
    },
    onError: (err) => errToast(err, "Could not update category"),
  });

  return (
    <div>
      <div className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/50" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="text-muted-foreground"
          aria-label={open ? "Collapse" : "Expand"}
          disabled={node.children.length === 0}
        >
          {node.children.length > 0 ? (
            open ? (
              <ChevronDown size={15} />
            ) : (
              <ChevronRight size={15} />
            )
          ) : (
            <span className="inline-block w-[15px]" />
          )}
        </button>
        {node.icon && <span className="text-sm">{node.icon}</span>}
        <span className={`text-sm font-medium ${node.isActive ? "" : "text-muted-foreground line-through"}`}>{node.name}</span>
        <Badge variant="outline" className="hidden text-[10px] sm:inline-flex">{node.slug}</Badge>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => onAddChild(node)}>
            <Plus size={13} /> <span className="hidden sm:inline">Add child</span>
          </Button>
          <Switch checked={node.isActive} onCheckedChange={(c) => toggleActive.mutate(c)} disabled={toggleActive.isPending} />
        </div>
      </div>
      {open && node.children.map((c) => <CategoryRow key={c.id} node={c} depth={depth + 1} onAddChild={onAddChild} />)}
    </div>
  );
}

function CategoriesTab() {
  const qc = useQueryClient();
  const [addOpen, setAddOpen] = useState<{ parentId: string | null; parentName?: string } | null>(null);
  const [name, setName] = useState("");
  const [icon, setIcon] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-categories"],
    queryFn: () => api.get<{ items: CatNode[] }>("/api/admin/categories"),
  });

  const create = useMutation({
    mutationFn: (body: { name: string; parentId?: string | null; icon?: string | null }) =>
      api.post("/api/admin/categories", body),
    onSuccess: () => {
      toast.success("Category created");
      qc.invalidateQueries({ queryKey: ["admin-categories"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
      setAddOpen(null);
      setName("");
      setIcon("");
    },
    onError: (err) => errToast(err, "Could not create category"),
  });

  const flatOptions: { id: string; label: string }[] = [];
  const walk = (nodes: CatNode[], depth: number) => {
    for (const n of nodes) {
      flatOptions.push({ id: n.id, label: `${"– ".repeat(depth)}${n.name}` });
      walk(n.children, depth + 1);
    }
  };
  walk(data?.items ?? [], 0);

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Category tree shown to shoppers (inactive categories are hidden).</p>
          <Button
            size="sm"
            onClick={() => {
              setName("");
              setIcon("");
              setAddOpen({ parentId: null });
            }}
          >
            <Plus size={14} /> Add category
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 rounded-lg" />
            ))}
          </div>
        ) : (data?.items ?? []).length === 0 ? (
          <EmptyState icon={<FolderTree size={28} />} title="No categories yet" description="Create your first category to organize products." />
        ) : (
          <div className="divide-y rounded-lg border">
            {(data?.items ?? []).map((n) => (
              <CategoryRow
                key={n.id}
                node={n}
                depth={0}
                onAddChild={(parent) => {
                  setName("");
                  setIcon("");
                  setAddOpen({ parentId: parent.id, parentName: parent.name });
                }}
              />
            ))}
          </div>
        )}

        <Dialog open={addOpen !== null} onOpenChange={(o) => !o && setAddOpen(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add category{addOpen?.parentName ? ` under ${addOpen.parentName}` : ""}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Parent</Label>
                <Select
                  value={addOpen?.parentId ?? "root"}
                  onValueChange={(v) => setAddOpen((cur) => (cur ? { ...cur, parentId: v === "root" ? null : v } : cur))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="root">Top level (no parent)</SelectItem>
                    {flatOptions.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-name">Name</Label>
                <Input id="cat-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Headphones" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cat-icon">Icon (emoji or name, optional)</Label>
                <Input id="cat-icon" value={icon} onChange={(e) => setIcon(e.target.value)} placeholder="e.g. 🎧" maxLength={24} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddOpen(null)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button
                disabled={create.isPending || name.trim().length < 2}
                onClick={() => create.mutate({ name: name.trim(), parentId: addOpen?.parentId ?? null, icon: icon.trim() || null })}
              >
                {create.isPending && <Loader2 size={14} className="animate-spin" />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ── Brands ────────────────────────────────────────────────────────────────

function BrandsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { data, isLoading } = useQuery({
    queryKey: ["admin-brands"],
    queryFn: () => api.get<{ items: BrandRow[] }>("/api/admin/brands"),
  });

  const create = useMutation({
    mutationFn: (body: { name: string }) => api.post("/api/admin/brands", body),
    onSuccess: () => {
      toast.success("Brand created");
      qc.invalidateQueries({ queryKey: ["admin-brands"] });
      qc.invalidateQueries({ queryKey: ["brands"] });
      setOpen(false);
      setName("");
    },
    onError: (err) => errToast(err, "Could not create brand"),
  });

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{data ? `${data.items.length} brand${data.items.length === 1 ? "" : "s"}` : "Loading…"}</p>
          <Button
            size="sm"
            onClick={() => {
              setName("");
              setOpen(true);
            }}
          >
            <Plus size={14} /> Add brand
          </Button>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-lg" />
            ))}
          </div>
        ) : (data?.items ?? []).length === 0 ? (
          <EmptyState icon={<Tag size={28} />} title="No brands yet" description="Add brands that sellers can attach to products." />
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {data?.items.map((b) => (
              <div key={b.id} className="rounded-lg border p-3">
                <p className="truncate font-medium">{b.name}</p>
                <p className="text-xs text-muted-foreground">
                  {b.slug} · {b.productCount} product{b.productCount === 1 ? "" : "s"}
                </p>
              </div>
            ))}
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Add brand</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label htmlFor="brand-name">Brand name</Label>
              <Input id="brand-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. NovaTech" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button disabled={create.isPending || name.trim().length < 1} onClick={() => create.mutate({ name: name.trim() })}>
                {create.isPending && <Loader2 size={14} className="animate-spin" />} Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ── Coupons ───────────────────────────────────────────────────────────────

function couponValueLabel(c: CouponRow): string {
  return c.type === "PERCENT" ? `${c.value}% off` : `${formatINR(c.value)} off`;
}

function CouponsTab() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    code: "",
    description: "",
    type: "PERCENT",
    value: "10",
    minOrderValue: "499",
    maxDiscount: "",
    usageLimit: "",
    perUserLimit: "1",
    validFrom: new Date().toISOString().slice(0, 10),
    validTo: new Date(Date.now() + 30 * 86400_000).toISOString().slice(0, 10),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["admin-coupons"],
    queryFn: () => api.get<{ items: CouponRow[] }>("/api/admin/coupons"),
  });

  const create = useMutation({
    mutationFn: () => {
      const isPercent = form.type === "PERCENT";
      return api.post("/api/admin/coupons", {
        code: form.code.trim().toUpperCase(),
        description: form.description.trim(),
        type: form.type,
        value: isPercent ? Number(form.value) : rupeesToPaise(Number(form.value)),
        minOrderValue: rupeesToPaise(Number(form.minOrderValue || "0")),
        maxDiscount: isPercent && form.maxDiscount ? rupeesToPaise(Number(form.maxDiscount)) : null,
        usageLimit: form.usageLimit ? Number(form.usageLimit) : null,
        perUserLimit: Number(form.perUserLimit || "1"),
        validFrom: new Date(`${form.validFrom}T00:00:00`).toISOString(),
        validTo: new Date(`${form.validTo}T23:59:59`).toISOString(),
      });
    },
    onSuccess: () => {
      toast.success("Coupon created");
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
      setOpen(false);
    },
    onError: (err) => errToast(err, "Could not create coupon"),
  });

  const toggle = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/api/admin/coupons/${id}`, { isActive }),
    onSuccess: () => {
      toast.success("Coupon updated");
      qc.invalidateQueries({ queryKey: ["admin-coupons"] });
    },
    onError: (err) => errToast(err, "Could not update coupon"),
  });

  const valid =
    form.code.trim().length >= 3 &&
    form.description.trim().length >= 3 &&
    /^\d+(\.\d{1,2})?$/.test(form.value) &&
    (form.type !== "PERCENT" || (Number(form.value) >= 1 && Number(form.value) <= 90)) &&
    form.validFrom.length === 10 &&
    form.validTo.length === 10;

  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Percent coupons take whole percentage points; flat coupons are rupee amounts.</p>
          <Button size="sm" onClick={() => setOpen(true)}>
            <Plus size={14} /> Create coupon
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 rounded-lg" />
            ))}
          </div>
        ) : (data?.items ?? []).length === 0 ? (
          <EmptyState icon={<Layers size={28} />} title="No coupons yet" description="Create discount codes for festive sales and first orders." />
        ) : (
          <div className="max-h-96 overflow-y-auto sk-scrollbar">
            <div className="overflow-x-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead className="hidden md:table-cell">Description</TableHead>
                    <TableHead>Discount</TableHead>
                    <TableHead className="hidden text-right sm:table-cell">Min order</TableHead>
                    <TableHead className="hidden text-right md:table-cell">Usage</TableHead>
                    <TableHead className="hidden lg:table-cell">Valid</TableHead>
                    <TableHead className="text-right">Active</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data?.items.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="font-mono text-xs font-bold">{c.code}</TableCell>
                      <TableCell className="hidden max-w-56 truncate text-sm text-muted-foreground md:table-cell">{c.description}</TableCell>
                      <TableCell className="text-sm">
                        {couponValueLabel(c)}
                        {c.type === "PERCENT" && c.maxDiscount ? (
                          <span className="block text-xs text-muted-foreground">max {formatINR(c.maxDiscount)}</span>
                        ) : null}
                      </TableCell>
                      <TableCell className="hidden text-right text-sm sm:table-cell">
                        {c.minOrderValue > 0 ? formatINR(c.minOrderValue) : "—"}
                      </TableCell>
                      <TableCell className="hidden text-right text-sm md:table-cell">
                        {c.usedCount}
                        {c.usageLimit ? ` / ${c.usageLimit}` : ""}
                        <span className="block text-xs text-muted-foreground">{c.perUserLimit}/user</span>
                      </TableCell>
                      <TableCell className="hidden text-xs text-muted-foreground lg:table-cell">
                        {new Date(c.validFrom).toLocaleDateString("en-IN", { day: "numeric", month: "short" })} –{" "}
                        {new Date(c.validTo).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Switch
                          checked={c.isActive}
                          onCheckedChange={(v) => toggle.mutate({ id: c.id, isActive: v })}
                          disabled={toggle.isPending}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg sk-scrollbar">
            <DialogHeader>
              <DialogTitle>Create coupon</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="c-code">Code</Label>
                <Input id="c-code" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })} placeholder="FESTIVE10" className="font-mono uppercase" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-type">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger id="c-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PERCENT">Percent (% points)</SelectItem>
                    <SelectItem value="FLAT">Flat (₹)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="c-desc">Description</Label>
                <Input id="c-desc" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="10% off festive electronics" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-value">{form.type === "PERCENT" ? "Discount (%) 1–90" : "Discount (₹)"}</Label>
                <Input id="c-value" inputMode="decimal" value={form.value} onChange={(e) => setForm({ ...form, value: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-min">Min order (₹)</Label>
                <Input id="c-min" inputMode="decimal" value={form.minOrderValue} onChange={(e) => setForm({ ...form, minOrderValue: e.target.value })} />
              </div>
              {form.type === "PERCENT" && (
                <div className="space-y-1.5">
                  <Label htmlFor="c-max">Max discount (₹, optional)</Label>
                  <Input id="c-max" inputMode="decimal" value={form.maxDiscount} onChange={(e) => setForm({ ...form, maxDiscount: e.target.value })} placeholder="e.g. 500" />
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="c-usage">Total usage limit (optional)</Label>
                <Input id="c-usage" inputMode="numeric" value={form.usageLimit} onChange={(e) => setForm({ ...form, usageLimit: e.target.value })} placeholder="unlimited" />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-peruser">Per-user limit</Label>
                <Input id="c-peruser" inputMode="numeric" value={form.perUserLimit} onChange={(e) => setForm({ ...form, perUserLimit: e.target.value })} />
              </div>
              <div className="hidden sm:block" />
              <div className="space-y-1.5">
                <Label htmlFor="c-from">Valid from</Label>
                <Input id="c-from" type="date" value={form.validFrom} onChange={(e) => setForm({ ...form, validFrom: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="c-to">Valid to</Label>
                <Input id="c-to" type="date" value={form.validTo} onChange={(e) => setForm({ ...form, validTo: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
                Cancel
              </Button>
              <Button disabled={create.isPending || !valid} onClick={() => create.mutate()}>
                {create.isPending && <Loader2 size={14} className="animate-spin" />} Create coupon
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────

function CatalogContent() {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight sm:text-xl">Catalog management</h1>
        <p className="text-sm text-muted-foreground">Categories, brands and discount coupons used across the marketplace.</p>
      </div>
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">Categories</TabsTrigger>
          <TabsTrigger value="brands">Brands</TabsTrigger>
          <TabsTrigger value="coupons">Coupons</TabsTrigger>
        </TabsList>
        <TabsContent value="categories" className="mt-4">
          <CategoriesTab />
        </TabsContent>
        <TabsContent value="brands" className="mt-4">
          <BrandsTab />
        </TabsContent>
        <TabsContent value="coupons" className="mt-4">
          <CouponsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default function AdminCatalogView(_props: { params?: Record<string, string>; mode?: string }) {
  return (
    <AdminGate>
      <AdminShell active="admin-catalog">
        <CatalogContent />
      </AdminShell>
    </AdminGate>
  );
}
