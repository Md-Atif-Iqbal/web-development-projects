"use client";

// Seller Hub — Product create/edit form: basics, images (URL or preset gallery),
// variants with price/stock. Zod + react-hook-form. Full-screen dashboard shell.

import { useEffect, useMemo, useState } from "react";
import { useFieldArray, useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronLeft,
  ImageOff,
  Images,
  Loader2,
  LogOut,
  Package,
  Plus,
  Store,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { BrandLogo, StatusBadge } from "@/components/shopkart/shared";
import { useNav, type ViewName } from "@/lib/store";
import { useSession } from "@/lib/session";
import { api, ApiClientError } from "@/lib/client/api";
import { rupeesToPaise } from "@/lib/money";
import type { Category, Brand, SellerProduct } from "@/lib/types";

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
            <span className="truncate text-sm font-semibold text-muted-foreground">Seller Hub · Product editor</span>
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
      <SellerShell active="seller-products">
        <div className="space-y-4">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-96 rounded-xl" />
        </div>
      </SellerShell>
    );
  }
  if (!user || user.role !== "SELLER" || user.sellerStatus !== "APPROVED") {
    return (
      <SellerShell active="seller-products">
        <div className="py-16 text-center">
          <p className="text-sm text-muted-foreground">
            {!user
              ? "Please sign in with your seller account."
              : "Seller account required to list products."}
          </p>
          <div className="mt-4 flex justify-center gap-2">
            {!user ? (
              <Button onClick={() => navigate("login")}>Sign in</Button>
            ) : (
              <Button variant="outline" onClick={() => navigate("seller-onboarding")}>
                Seller onboarding
              </Button>
            )}
            <Button variant="ghost" onClick={goHome}>
              Back to home
            </Button>
          </div>
        </div>
      </SellerShell>
    );
  }
  return <>{children}</>;
}

// ── Preset image gallery (18 images shipped with the app) ─────────────────

const PRESET_IMAGES = [
  "backpack", "books", "bottle", "camera", "chair", "earbuds", "headphones", "kettle", "kurti",
  "laptop", "mixer", "phone", "saree", "shoes", "skincare", "smartwatch", "tshirt", "tv",
].map((n) => `/products/${n}.png`);

// ── Form schema ───────────────────────────────────────────────────────────

const AMOUNT_RE = /^\d+(\.\d{1,2})?$/;

const formSchema = z
  .object({
    name: z.string().min(3, "Name must be at least 3 characters").max(150),
    description: z.string().min(10, "Describe the product in at least 10 characters").max(5000),
    highlights: z.array(z.object({ value: z.string() })),
    categoryId: z.string().min(1, "Select a category"),
    brandId: z.string(),
    warrantyMonths: z
      .string()
      .refine((v) => /^\d+$/.test(v) && Number(v) <= 60, "Warranty: months 0-60"),
    returnDays: z.string().refine((v) => /^\d+$/.test(v) && Number(v) <= 90, "Return window: days 0-90"),
    codAvailable: z.boolean(),
    images: z.array(z.object({ url: z.string().min(1) })).min(1, "Add at least one image"),
    variants: z
      .array(
        z.object({
          id: z.string().optional(),
          name: z.string().min(1, "Variant name is required").max(120),
          sku: z
            .string()
            .min(2, "SKU is too short")
            .max(40)
            .regex(/^[A-Za-z0-9_-]+$/, "SKU: letters, numbers, - and _ only"),
          option: z.string().min(1, "Required — e.g. Color: Black"),
          mrp: z.string().regex(AMOUNT_RE, "Enter a valid amount"),
          price: z.string().regex(AMOUNT_RE, "Enter a valid amount"),
          onHand: z.string().regex(/^\d+$/, "Enter a number"),
        })
      )
      .min(1, "Add at least one variant"),
  })
  .superRefine((v, ctx) => {
    for (const [i, vr] of v.variants.entries()) {
      if (Number(vr.mrp) < Number(vr.price)) {
        ctx.addIssue({ code: "custom", path: ["variants", i, "mrp"], message: "MRP must be ≥ selling price" });
      }
    }
    const skus = v.variants.map((vr) => vr.sku.toUpperCase());
    if (new Set(skus).size !== skus.length) {
      ctx.addIssue({ code: "custom", path: ["variants"], message: "SKU must be unique across variants" });
    }
  });

type FormValues = z.infer<typeof formSchema>;

function optionToAttributes(option: string): Record<string, string> {
  const trimmed = option.trim();
  const idx = trimmed.indexOf(":");
  if (idx > 0) {
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim();
    if (key && val) return { [key]: val };
  }
  return { Option: trimmed };
}

function attributesToOption(attrs: Record<string, string>): string {
  const first = Object.entries(attrs)[0];
  return first ? `${first[0]}: ${first[1]}` : "";
}

// ── Category tree flattening ──────────────────────────────────────────────

type FlatCat = { id: string; label: string };

function flattenCategories(cats: Category[], depth = 0, out: FlatCat[] = []): FlatCat[] {
  for (const c of cats) {
    out.push({ id: c.id, label: `${"\u00A0\u00A0".repeat(depth)}${depth > 0 ? "↳ " : ""}${c.name}` });
    flattenCategories(c.children ?? [], depth + 1, out);
  }
  return out;
}

// ── Form ──────────────────────────────────────────────────────────────────

function ProductForm({ id }: { id?: string }) {
  const navigate = useNav((s) => s.navigate);
  const qc = useQueryClient();
  const [customUrl, setCustomUrl] = useState("");

  const catsQuery = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<{ items: Category[] }>("/api/categories"),
    staleTime: 5 * 60_000,
  });
  const brandsQuery = useQuery({
    queryKey: ["brands"],
    queryFn: () => api.get<{ items: Brand[] }>("/api/brands"),
    staleTime: 5 * 60_000,
  });
  const productQuery = useQuery({
    queryKey: ["seller-product", id],
    queryFn: () => api.get<SellerProduct>(`/api/seller/products/${id}`),
    enabled: Boolean(id),
  });

  const flatCats = useMemo(
    () => flattenCategories(catsQuery.data?.items ?? []),
    [catsQuery.data]
  );

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: "",
      description: "",
      highlights: [{ value: "" }],
      categoryId: "",
      brandId: "",
      warrantyMonths: "0",
      returnDays: "7",
      codAvailable: true,
      images: [],
      variants: [{ name: "", sku: "", option: "", mrp: "", price: "", onHand: "10" }],
    },
    mode: "onTouched",
  });

  const highlightsArray = useFieldArray({ control: form.control, name: "highlights" });
  const imagesArray = useFieldArray({ control: form.control, name: "images" });
  const variantsArray = useFieldArray({ control: form.control, name: "variants" });

  // Prefill for edit mode
  useEffect(() => {
    const p = productQuery.data;
    if (!p) return;
    form.reset({
      name: p.name,
      description: p.description,
      highlights: p.highlights.length ? p.highlights.map((h) => ({ value: h })) : [{ value: "" }],
      categoryId: "",
      brandId: "",
      warrantyMonths: String(p.warrantyMonths),
      returnDays: String(p.returnDays),
      codAvailable: p.codAvailable,
      images: p.images.map((url) => ({ url })),
      variants: p.variants.map((v) => ({
        id: v.id,
        name: v.name,
        sku: v.sku,
        option: attributesToOption(v.attributes) || v.name,
        mrp: String(v.mrp / 100),
        price: String(v.price / 100),
        onHand: String(v.onHand),
      })),
    });
    // Resolve category/brand ids by name (list API returns names only)
    if (catsQuery.data) {
      const all = flattenCategories(catsQuery.data.items);
      const match = all.find((c) => c.label.trim().replace(/^↳\s*/, "").trim() === p.categoryName);
      if (match) form.setValue("categoryId", match.id);
    }
    if (brandsQuery.data && p.brandName) {
      const b = brandsQuery.data.items.find((x) => x.name === p.brandName);
      if (b) form.setValue("brandId", b.id);
    }
  }, [productQuery.data, catsQuery.data, brandsQuery.data, form]);

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        name: values.name.trim(),
        description: values.description.trim(),
        highlights: values.highlights.map((h) => h.value.trim()).filter(Boolean),
        specifications: {},
        categoryId: values.categoryId,
        brandId: values.brandId || null,
        images: values.images.map((i) => ({ url: i.url })),
        variants: values.variants.map((v) => ({
          ...(v.id ? { id: v.id } : {}),
          sku: v.sku.trim().toUpperCase(),
          name: v.name.trim(),
          attributes: optionToAttributes(v.option),
          mrp: rupeesToPaise(Number(v.mrp)),
          price: rupeesToPaise(Number(v.price)),
          onHand: Number(v.onHand),
        })),
        warrantyMonths: Number(values.warrantyMonths),
        returnDays: Number(values.returnDays),
        codAvailable: values.codAvailable,
      };
      return id
        ? api.patch<SellerProduct>(`/api/seller/products/${id}`, payload)
        : api.post<SellerProduct>("/api/seller/products", payload);
    },
    onSuccess: () => {
      toast.success(id ? "Product updated" : "Product submitted for approval", {
        description: id
          ? "Stock changes apply instantly; content edits go back into moderation."
          : "Our team reviews new listings before they go live.",
      });
      qc.invalidateQueries({ queryKey: ["seller-products"] });
      qc.invalidateQueries({ queryKey: ["seller-dashboard"] });
      navigate("seller-products");
    },
    onError: (err) => {
      toast.error(err instanceof ApiClientError ? err.message : "Could not save product");
    },
  });

  if (id && productQuery.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }
  if (id && (productQuery.isError || !productQuery.data)) {
    return (
      <div className="py-16 text-center">
        <Package size={28} className="mx-auto text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">Product not found in your catalogue.</p>
        <Button variant="outline" className="mt-4" onClick={() => navigate("seller-products")}>
          Back to products
        </Button>
      </div>
    );
  }

  const p = productQuery.data;
  const err = form.formState.errors;
  const usedImages = form.watch("images").map((i) => i.url);

  const addCustomUrl = () => {
    const url = customUrl.trim();
    if (!url) return;
    imagesArray.append({ url });
    setCustomUrl("");
  };

  return (
    <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4" noValidate>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-bold tracking-tight sm:text-xl">{id ? "Edit product" : "Add product"}</h1>
          <p className="text-sm text-muted-foreground">
            {id ? "Update listing details, price and stock." : "New listings are reviewed before going live."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {p && <StatusBadge status={p.status} />}
          <Button type="button" variant="outline" onClick={() => navigate("seller-products")} disabled={mutation.isPending}>
            <ChevronLeft size={16} /> Back
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
            {id ? "Save changes" : "Submit for approval"}
          </Button>
        </div>
      </div>

      {p?.status === "REJECTED" && (
        <Alert className="border-rose-300 bg-rose-50 text-rose-900 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Rejected by moderation{p.moderationNote ? "" : "."}</strong>
            {p.moderationNote ? ` — ${p.moderationNote}` : " Fix the issues and resubmit."}
          </AlertDescription>
        </Alert>
      )}
      {p?.status === "PENDING" && (
        <Alert className="border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-700 dark:bg-amber-950 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>This listing is awaiting approval and is not yet visible to shoppers.</AlertDescription>
        </Alert>
      )}

      {/* Basics */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Basics</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-name">Product name *</Label>
            <Input id="p-name" placeholder="e.g. NovaTech Pulse 5G Smartphone (8GB/128GB)" {...form.register("name")} />
            {err.name && <p className="text-xs text-rose-600">{err.name.message}</p>}
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="p-desc">Description *</Label>
            <Textarea
              id="p-desc"
              rows={4}
              placeholder="Key features, materials, what's in the box…"
              {...form.register("description")}
            />
            {err.description && <p className="text-xs text-rose-600">{err.description.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Category *</Label>
            <Select value={form.watch("categoryId")} onValueChange={(v) => form.setValue("categoryId", v)}>
              <SelectTrigger aria-label="Category">
                <SelectValue placeholder="Select category" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {flatCats.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    <span className="whitespace-pre">{c.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {err.categoryId && <p className="text-xs text-rose-600">{err.categoryId.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label>Brand</Label>
            <Select
              value={form.watch("brandId") || "none"}
              onValueChange={(v) => form.setValue("brandId", v === "none" ? "" : v)}
            >
              <SelectTrigger aria-label="Brand">
                <SelectValue placeholder="No brand" />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                <SelectItem value="none">No brand / unbranded</SelectItem>
                {(brandsQuery.data?.items ?? []).map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5 sm:col-span-2">
            <Label>Highlights (key selling points)</Label>
            <div className="space-y-2">
              {highlightsArray.fields.map((field, i) => (
                <div key={field.id} className="flex gap-2">
                  <Input placeholder={`Highlight ${i + 1} — e.g. 1 year manufacturer warranty`} {...form.register(`highlights.${i}.value`)} />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove highlight"
                    onClick={() => highlightsArray.remove(i)}
                  >
                    <Trash2 size={15} className="text-muted-foreground" />
                  </Button>
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => highlightsArray.append({ value: "" })}
              disabled={highlightsArray.fields.length >= 12}
            >
              <Plus size={14} /> Add highlight
            </Button>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:col-span-2 lg:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="p-warranty">Warranty (months)</Label>
              <Input id="p-warranty" inputMode="numeric" {...form.register("warrantyMonths")} />
              {err.warrantyMonths && <p className="text-xs text-rose-600">{err.warrantyMonths.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="p-return">Return window (days)</Label>
              <Input id="p-return" inputMode="numeric" {...form.register("returnDays")} />
              {err.returnDays && <p className="text-xs text-rose-600">{err.returnDays.message}</p>}
            </div>
            <div className="flex items-end justify-between gap-3 pb-1">
              <Label htmlFor="p-cod">Cash on delivery</Label>
              <Switch
                id="p-cod"
                checked={form.watch("codAvailable")}
                onCheckedChange={(c) => form.setValue("codAvailable", c)}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Images */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Images size={16} /> Images
            <span className="text-xs font-normal text-muted-foreground">(at least 1, max 8)</span>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {err.images && err.images.message && <p className="text-xs text-rose-600">{err.images.message}</p>}

          {imagesArray.fields.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {imagesArray.fields.map((field, i) => {
                // eslint-disable-next-line react-hooks/rules-of-hooks -- stable hook per field row
                const imgUrl = useWatch({ control: form.control, name: `images.${i}.url` }) as string | undefined;
                return (
                <div key={field.id} className="group relative">
                  <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-lg border bg-muted/40">
                    {imgUrl ? (
                       
                      <img src={imgUrl} alt={`Product image ${i + 1}`} className="h-full w-full object-contain" />
                    ) : (
                      <ImageOff size={16} className="text-muted-foreground" />
                    )}
                  </div>
                  <button
                    type="button"
                    aria-label="Remove image"
                    onClick={() => imagesArray.remove(i)}
                    className="absolute -right-1.5 -top-1.5 rounded-full bg-rose-600 p-1 text-white shadow"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-2">
            <Input
              value={customUrl}
              onChange={(e) => setCustomUrl(e.target.value)}
              placeholder="Paste an image URL — e.g. /products/camera.png"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  addCustomUrl();
                }
              }}
            />
            <Button type="button" variant="outline" onClick={addCustomUrl}>
              <Plus size={14} /> Add
            </Button>
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">Or pick from the ShopEase gallery:</p>
            <div className="grid grid-cols-6 gap-2 sm:grid-cols-9">
              {PRESET_IMAGES.map((url) => {
                const used = usedImages.includes(url);
                return (
                  <button
                    key={url}
                    type="button"
                    aria-label={used ? "Image added — click to remove" : "Add image"}
                    onClick={() =>
                      used
                        ? imagesArray.remove(usedImages.indexOf(url))
                        : imagesArray.append({ url })
                    }
                    className={`relative flex aspect-square items-center justify-center overflow-hidden rounded-lg border bg-muted/40 transition-all hover:ring-2 hover:ring-ring ${
                      used ? "ring-2 ring-primary" : ""
                    }`}
                  >
                    { }
                    <img src={url} alt={url.split("/").pop() ?? ""} className="h-full w-full object-contain p-1" loading="lazy" />
                    {used && (
                      <span className="absolute inset-0 flex items-center justify-center bg-primary/30">
                        <Check size={14} className="text-white" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Variants */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Variants &amp; pricing</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {id && (
            <p className="text-xs text-muted-foreground">
              Tip: for existing variants you can change just price and stock — only content edits send the
              listing back for moderation.
            </p>
          )}
          {/* Mobile variant cards */}
          <div className="space-y-3 lg:hidden">
            {variantsArray.fields.map((field, i) => (
              <div key={field.id} className="space-y-2 rounded-lg border p-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold text-muted-foreground">Variant {i + 1}</p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => variantsArray.remove(i)}
                    disabled={variantsArray.fields.length === 1}
                  >
                    <Trash2 size={14} /> Remove
                  </Button>
                </div>
                <Input placeholder="Variant name — e.g. Black" {...form.register(`variants.${i}.name`)} />
                <Input placeholder="SKU — e.g. NT-PULSE-BLK" {...form.register(`variants.${i}.sku`)} />
                <Input placeholder="Option — e.g. Color: Black" {...form.register(`variants.${i}.option`)} />
                <div className="grid grid-cols-3 gap-2">
                  <Input placeholder="MRP ₹" inputMode="decimal" {...form.register(`variants.${i}.mrp`)} />
                  <Input placeholder="Price ₹" inputMode="decimal" {...form.register(`variants.${i}.price`)} />
                  <Input placeholder="Stock" inputMode="numeric" {...form.register(`variants.${i}.onHand`)} />
                </div>
                {err.variants?.[i]?.name && <p className="text-xs text-rose-600">{err.variants[i]?.name?.message}</p>}
                {err.variants?.[i]?.sku && <p className="text-xs text-rose-600">{err.variants[i]?.sku?.message}</p>}
                {err.variants?.[i]?.option && <p className="text-xs text-rose-600">{err.variants[i]?.option?.message}</p>}
                {err.variants?.[i]?.mrp && <p className="text-xs text-rose-600">{err.variants[i]?.mrp?.message}</p>}
                {err.variants?.[i]?.price && <p className="text-xs text-rose-600">{err.variants[i]?.price?.message}</p>}
                {err.variants?.[i]?.onHand && <p className="text-xs text-rose-600">{err.variants[i]?.onHand?.message}</p>}
              </div>
            ))}
          </div>

          {/* Desktop variants table */}
          <div className="hidden overflow-x-auto rounded-lg border lg:block">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="min-w-44">Variant name</TableHead>
                  <TableHead className="min-w-40">SKU</TableHead>
                  <TableHead className="min-w-44">Option (Label: Value)</TableHead>
                  <TableHead className="w-28">MRP ₹</TableHead>
                  <TableHead className="w-28">Price ₹</TableHead>
                  <TableHead className="w-24">Stock</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {variantsArray.fields.map((field, i) => (
                  <TableRow key={field.id}>
                    <TableCell>
                      <Input {...form.register(`variants.${i}.name`)} aria-label="Variant name" />
                      {err.variants?.[i]?.name && <p className="mt-1 text-xs text-rose-600">{err.variants[i]?.name?.message}</p>}
                    </TableCell>
                    <TableCell>
                      <Input {...form.register(`variants.${i}.sku`)} aria-label="SKU" />
                      {err.variants?.[i]?.sku && <p className="mt-1 text-xs text-rose-600">{err.variants[i]?.sku?.message}</p>}
                    </TableCell>
                    <TableCell>
                      <Input placeholder="Color: Black" {...form.register(`variants.${i}.option`)} aria-label="Option" />
                      {err.variants?.[i]?.option && <p className="mt-1 text-xs text-rose-600">{err.variants[i]?.option?.message}</p>}
                    </TableCell>
                    <TableCell>
                      <Input inputMode="decimal" {...form.register(`variants.${i}.mrp`)} aria-label="MRP in rupees" />
                      {err.variants?.[i]?.mrp && <p className="mt-1 text-xs text-rose-600">{err.variants[i]?.mrp?.message}</p>}
                    </TableCell>
                    <TableCell>
                      <Input inputMode="decimal" {...form.register(`variants.${i}.price`)} aria-label="Price in rupees" />
                      {err.variants?.[i]?.price && <p className="mt-1 text-xs text-rose-600">{err.variants[i]?.price?.message}</p>}
                    </TableCell>
                    <TableCell>
                      <Input inputMode="numeric" {...form.register(`variants.${i}.onHand`)} aria-label="Stock on hand" />
                      {err.variants?.[i]?.onHand && <p className="mt-1 text-xs text-rose-600">{err.variants[i]?.onHand?.message}</p>}
                    </TableCell>
                    <TableCell>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove variant"
                        onClick={() => variantsArray.remove(i)}
                        disabled={variantsArray.fields.length === 1}
                      >
                        <Trash2 size={15} className="text-muted-foreground" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
          {typeof err.variants?.message === "string" && <p className="text-xs text-rose-600">{err.variants.message}</p>}

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => variantsArray.append({ name: "", sku: "", option: "", mrp: "", price: "", onHand: "10" })}
            disabled={variantsArray.fields.length >= 20}
          >
            <Plus size={14} /> Add variant
          </Button>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2 pb-4">
        <Button type="button" variant="outline" onClick={() => navigate("seller-products")} disabled={mutation.isPending}>
          Cancel
        </Button>
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 size={16} className="animate-spin" />}
          {id ? "Save changes" : "Submit for approval"}
        </Button>
      </div>
    </form>
  );
}

export default function SellerProductFormView({ params }: { params?: Record<string, string>; mode?: string }) {
  const id = params?.id;
  return (
    <SellerGate>
      <SellerShell active="seller-products">
        <ProductForm id={id} />
      </SellerShell>
    </SellerGate>
  );
}
