"use client";

// Catalog view — search results & category listings with faceted filters,
// sorting and pagination. Mobile filters open in a Sheet; desktop uses a
// sticky sidebar.

import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { ListFilter, SlidersHorizontal, SearchX, Home, ChevronRight, Star } from "lucide-react";
import { api, qs } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import type { Brand, Category, ProductListResponse } from "@/lib/types";
import { ProductCard, EmptyState, ProductGridSkeleton } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";

const PAGE_SIZE = 12;

const SORT_OPTIONS = [
  { value: "relevance", label: "Relevance" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
  { value: "rating", label: "Rating" },
  { value: "newest", label: "Newest first" },
  { value: "popular", label: "Popularity" },
];

const PRICE_BUCKETS = [
  { value: "any", label: "Any price", min: "", max: "" },
  { value: "u500", label: "Under ₹500", min: "", max: "500" },
  { value: "500-1k", label: "₹500 – ₹1,000", min: "500", max: "1000" },
  { value: "1k-5k", label: "₹1,000 – ₹5,000", min: "1000", max: "5000" },
  { value: "5k-20k", label: "₹5,000 – ₹20,000", min: "5000", max: "20000" },
  { value: "20k+", label: "Above ₹20,000", min: "20000", max: "" },
];

function bucketFor(min: string, max: string): string {
  const hit = PRICE_BUCKETS.find((b) => b.min === min && b.max === max);
  return hit?.value ?? "custom";
}

function flattenCategories(items: Category[], out: Category[] = []): Category[] {
  for (const c of items) {
    out.push(c);
    flattenCategories(c.children, out);
  }
  return out;
}

export default function CatalogView(_props: { params?: Record<string, string>; mode?: string }) {
  const { mode = "search", params = {} } = _props;
  const navigate = useNav((s) => s.navigate);
  const q = mode === "search" ? (params.q ?? "") : "";
  const categorySlug = mode === "category" ? (params.slug ?? "") : "";

  // ── Filter state (query string params mirror the API contract) ──
  const [sort, setSort] = useState<string>(params.sort || "relevance");
  const [page, setPage] = useState(1);
  const [brands, setBrands] = useState<string[]>([]); // brand slugs (CSV)
  const [minPrice, setMinPrice] = useState(""); // rupees
  const [maxPrice, setMaxPrice] = useState(""); // rupees
  const [rating, setRating] = useState("");
  const [inStock, setInStock] = useState(false);
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);

  // New search / category navigation resets everything (render-time state adjustment).
  const resetKey = `${q}|${categorySlug}|${params.sort ?? ""}`;
  const [prevResetKey, setPrevResetKey] = useState(resetKey);
  if (resetKey !== prevResetKey) {
    setPrevResetKey(resetKey);
    setSort(params.sort || "relevance");
    setPage(1);
    setBrands([]);
    setMinPrice("");
    setMaxPrice("");
    setRating("");
    setInStock(false);
  }

  const queryObj = {
    q: q || undefined,
    category: categorySlug || undefined,
    sort,
    page: String(page),
    pageSize: String(PAGE_SIZE),
    brand: brands.length > 0 ? brands.join(",") : undefined,
    minPrice: minPrice || undefined,
    maxPrice: maxPrice || undefined,
    rating: rating || undefined,
    inStock: inStock ? "1" : undefined,
  };

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["products", "catalog", queryObj],
    queryFn: () => api.get<ProductListResponse>(`/api/products${qs(queryObj)}`),
    placeholderData: keepPreviousData,
  });

  const { data: categoriesData } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<{ items: Category[] }>("/api/categories"),
    staleTime: 5 * 60_000,
  });

  const { data: brandsData } = useQuery({
    queryKey: ["brands"],
    queryFn: () => api.get<{ items: Brand[] }>("/api/brands"),
    staleTime: 5 * 60_000,
  });

  const brandIdToSlug = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of brandsData?.items ?? []) m.set(b.id, b.slug);
    return m;
  }, [brandsData]);

  const currentCategory = useMemo(() => {
    if (mode !== "category" || !categoriesData) return null;
    return flattenCategories(categoriesData.items).find((c) => c.slug === categorySlug) ?? null;
  }, [mode, categoriesData, categorySlug]);

  // ── Analytics ──
  const searchTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!q || searchTrackedRef.current === q) return;
    searchTrackedRef.current = q;
    api.post("/api/analytics/event", { type: "SEARCH", payload: { q } }).catch(() => undefined);
  }, [q]);

  const zeroTrackedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!q || !data) return;
    if (data.items.length === 0 && zeroTrackedRef.current !== q) {
      zeroTrackedRef.current = q;
      api.post("/api/analytics/event", { type: "ZERO_RESULT_SEARCH", payload: { q } }).catch(() => undefined);
    }
  }, [data, q]);

  // ── Filter mutation helpers ──
  const toggleBrand = (slug: string) => {
    setPage(1);
    setBrands((prev) => (prev.includes(slug) ? prev.filter((b) => b !== slug) : [...prev, slug]));
  };
  const applyBucket = (value: string) => {
    setPage(1);
    if (value === "custom") return;
    const bucket = PRICE_BUCKETS.find((b) => b.value === value);
    setMinPrice(bucket?.min ?? "");
    setMaxPrice(bucket?.max ?? "");
  };
  const setCustomPrice = (min: string, max: string) => {
    setPage(1);
    setMinPrice(min);
    setMaxPrice(max);
  };
  const chooseRating = (value: string) => {
    setPage(1);
    setRating(value);
  };
  const clearFilters = () => {
    setPage(1);
    setBrands([]);
    setMinPrice("");
    setMaxPrice("");
    setRating("");
    setInStock(false);
  };

  const activeFilterCount =
    brands.length + (minPrice || maxPrice ? 1 : 0) + (rating ? 1 : 0) + (inStock ? 1 : 0);

  // ── Filter panel (shared by desktop sidebar & mobile sheet) ──
  const filterPanel = (
    <div className="space-y-5">
      {/* Category tree (search mode only) */}
      {mode === "search" && categoriesData && categoriesData.items.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Categories</h3>
          <div className="max-h-52 space-y-0.5 overflow-y-auto pr-1 sk-scrollbar">
            {categoriesData.items.map((cat) => (
              <div key={cat.id}>
                <button
                  className="w-full rounded px-1.5 py-1.5 text-left text-sm font-medium hover:bg-muted"
                  onClick={() => navigate("category", { slug: cat.slug })}
                >
                  {cat.name}
                </button>
                <div className="pl-3">
                  {cat.children.map((sub) => (
                    <button
                      key={sub.id}
                      className="block w-full rounded px-1.5 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
                      onClick={() => navigate("category", { slug: sub.slug })}
                    >
                      {sub.name}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Category facet links in search mode (from result facets) */}
      {mode === "search" && (data?.facets.categories.length ?? 0) > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Refine by category</h3>
          <div className="max-h-40 space-y-1 overflow-y-auto pr-1 sk-scrollbar">
            {data!.facets.categories.map((c) => (
              <button
                key={c.id}
                className="flex w-full items-center justify-between rounded px-1.5 py-1 text-left text-sm hover:bg-muted"
                onClick={() => navigate("category", { slug: c.slug })}
              >
                <span className="truncate">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.count}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Brands */}
      {(data?.facets.brands.length ?? 0) > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Brand</h3>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1 sk-scrollbar">
            {data!.facets.brands.map((b) => {
              const slug = brandIdToSlug.get(b.id);
              if (!slug) return null;
              return (
                <label key={b.id} className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={brands.includes(slug)} onCheckedChange={() => toggleBrand(slug)} />
                  <span className="flex-1 truncate">{b.name}</span>
                  <span className="text-xs text-muted-foreground">{b.count}</span>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {/* Price */}
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Price</h3>
        <RadioGroup value={bucketFor(minPrice, maxPrice)} onValueChange={applyBucket}>
          {PRICE_BUCKETS.map((b) => (
            <label key={b.value} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
              <RadioGroupItem value={b.value} />
              {b.label}
            </label>
          ))}
          <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
            <RadioGroupItem value="custom" />
            Custom
          </label>
        </RadioGroup>
        <div className="mt-2 flex items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Min ₹"
            className="h-9"
            value={minPrice}
            onChange={(e) => setCustomPrice(e.target.value, maxPrice)}
            aria-label="Min price in rupees"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            placeholder="Max ₹"
            className="h-9"
            value={maxPrice}
            onChange={(e) => setCustomPrice(minPrice, e.target.value)}
            aria-label="Max price in rupees"
          />
        </div>
      </div>

      {/* Rating */}
      <div>
        <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Customer rating</h3>
        <RadioGroup value={rating} onValueChange={chooseRating}>
          <label className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
            <RadioGroupItem value="" /> Any
          </label>
          {[4, 3, 2].map((r) => (
            <label key={r} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
              <RadioGroupItem value={String(r)} /> {r}
              <Star size={12} className="fill-brand-yellow text-brand-yellow" aria-hidden /> &amp; up
            </label>
          ))}
        </RadioGroup>
      </div>

      {/* In stock */}
      <div className="flex items-center justify-between">
        <Label htmlFor="instock-switch" className="text-sm">
          In stock only
        </Label>
        <Switch
          id="instock-switch"
          checked={inStock}
          onCheckedChange={(v) => {
            setPage(1);
            setInStock(v);
          }}
        />
      </div>

      {activeFilterCount > 0 && (
        <Button variant="outline" className="w-full" onClick={clearFilters}>
          Clear all filters ({activeFilterCount})
        </Button>
      )}
    </div>
  );

  const heading =
    mode === "category"
      ? currentCategory
        ? currentCategory.name
        : categorySlug
          ? categorySlug.replaceAll("-", " ").replace(/\b\w/g, (c) => c.toUpperCase())
          : "Category"
      : q
        ? `Results for "${q}"`
        : "All products";

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      {/* Breadcrumb */}
      <nav className="mb-3 flex items-center gap-1 text-xs text-muted-foreground" aria-label="Breadcrumb">
        <button className="flex items-center gap-1 hover:text-foreground" onClick={() => navigate("home")}>
          <Home size={12} /> Home
        </button>
        <ChevronRight size={12} />
        <span className="font-medium text-foreground">{heading}</span>
      </nav>

      <div className="flex gap-6">
        {/* Desktop sidebar */}
        <aside className="sticky top-28 hidden h-fit w-56 shrink-0 self-start rounded-xl border bg-card p-4 lg:block">
          <h2 className="mb-4 flex items-center gap-1.5 text-sm font-bold">
            <SlidersHorizontal size={15} /> Filters
          </h2>
          {filterPanel}
        </aside>

        {/* Results */}
        <div className="min-w-0 flex-1">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">{heading}</h1>
              <p className="text-xs text-muted-foreground sm:text-sm">
                {isLoading ? "Loading products…" : `${data?.total ?? 0} product${(data?.total ?? 0) === 1 ? "" : "s"} found`}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* Mobile filter button */}
              <Sheet open={filterSheetOpen} onOpenChange={setFilterSheetOpen}>
                <SheetTrigger asChild>
                  <Button variant="outline" className="gap-1.5 lg:hidden">
                    <ListFilter size={16} />
                    Filters
                    {activeFilterCount > 0 && (
                      <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    )}
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-80 overflow-y-auto sk-scrollbar">
                  <SheetHeader>
                    <SheetTitle>Filters</SheetTitle>
                  </SheetHeader>
                  <div className="pb-6">{filterPanel}</div>
                </SheetContent>
              </Sheet>
              <div className="w-44 sm:w-52">
                <Select value={sort} onValueChange={(v) => { setSort(v); setPage(1); }}>
                  <SelectTrigger aria-label="Sort products">
                    <SelectValue placeholder="Sort" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORT_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {isError ? (
            <EmptyState
              icon={<SearchX size={26} />}
              title="Couldn't load products"
              description="Something went wrong while fetching results."
              action={<Button onClick={() => void refetch()}>Try again</Button>}
            />
          ) : isLoading ? (
            <ProductGridSkeleton count={PAGE_SIZE} />
          ) : !data || data.items.length === 0 ? (
            <EmptyState
              icon={<SearchX size={26} />}
              title="No products found"
              description={
                q
                  ? `We couldn't find anything for "${q}". Try different keywords or remove filters.`
                  : "Try removing some filters to see more products."
              }
              action={<Button onClick={clearFilters}>Clear filters</Button>}
            />
          ) : (
            <>
              <div className={isFetching ? "opacity-60 transition-opacity" : ""}>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {data.items.map((p) => (
                    <ProductCard key={p.id} product={p} />
                  ))}
                </div>
              </div>

              {/* Pagination */}
              {data.totalPages > 1 && (
                <div className="mt-8 flex items-center justify-center gap-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    Page {data.page} of {data.totalPages}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.totalPages || isFetching}
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                  >
                    Next
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
