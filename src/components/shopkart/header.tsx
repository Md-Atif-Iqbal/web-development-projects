"use client";

// ShopEase header: brand, search with autocomplete, categories, account menu,
// wishlist & cart counters. Responsive (mobile search row below).

import { useEffect, useRef, useState } from "react";
import { Search, Heart, ShoppingCart, User, Menu, X, ChevronDown, Bell, Package, Store, ShieldCheck, MapPin, LogOut, Settings, Moon, Sun, Loader2, Flame, Home } from "lucide-react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/client/api";
import type { Category, SearchSuggestion } from "@/lib/types";
import { useNav, useNav as useNavStore } from "@/lib/store";
import { useSession } from "@/lib/session";
import { BrandLogo } from "@/components/shopkart/shared";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";

export function Header() {
  const navigate = useNavStore((s) => s.navigate);
  const view = useNavStore((s) => s.view);
  const { user, refresh } = useSession();
  const [term, setTerm] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: () => api.get<{ items: Category[] }>("/api/categories"),
    staleTime: 5 * 60_000,
  });

  const { data: suggestions, isFetching: suggesting } = useQuery({
    queryKey: ["suggest", term],
    queryFn: () => api.get<{ items: SearchSuggestion[] }>(`/api/search/suggest?q=${encodeURIComponent(term)}`),
    enabled: term.trim().length >= 2,
  });

  const { data: cartData } = useQuery({
    queryKey: ["cart"],
    queryFn: () => api.get<{ items: unknown[]; grandTotal: number }>("/api/cart"),
    enabled: !!user,
  });

  const { data: wishData } = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api.get<{ items: unknown[] }>("/api/wishlist"),
    enabled: !!user,
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Cancels a pending suggest-debounce so a suggestion panel can never pop
  // open over a view the user has just navigated to.
  const cancelSuggest = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    setOpen(false);
  };

  const doSearch = (q: string) => {
    if (!q.trim()) return;
    cancelSuggest();
    navigate("search", { q: q.trim() });
  };

  const onTermChange = (v: string) => {
    setTerm(v);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setOpen(v.trim().length >= 2), 250);
  };

  const logout = async () => {
    await api.post("/api/auth/logout");
    await refresh();
    toast.success("Signed out");
    navigate("home");
  };

  const cartCount = (cartData?.items as { qty: number }[] | undefined)?.reduce((s, i) => s + i.qty, 0) ?? 0;
  const wishCount = wishData?.items?.length ?? 0;

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-3 sm:px-6">
        <div className="flex items-center gap-2 lg:hidden">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" aria-label="Open menu">
                <Menu size={22} />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-80 overflow-y-auto sk-scrollbar">
              <SheetTitle className="flex items-center gap-2">
                <BrandLogo onClick={() => { setMobileOpen(false); navigate("home"); }} />
              </SheetTitle>
              <div className="mt-2 space-y-1">
                {user ? (
                  <div className="rounded-lg bg-muted p-3">
                    <p className="text-sm font-semibold">{user.name}</p>
                    <p className="text-xs text-muted-foreground">{user.email}</p>
                  </div>
                ) : (
                  <Button className="w-full" onClick={() => { setMobileOpen(false); navigate("login"); }}>Sign in</Button>
                )}
                <Accordion type="single" collapsible className="mt-2">
                  {categories?.items.map((cat) => (
                    <AccordionItem key={cat.id} value={cat.id}>
                      <AccordionTrigger className="py-2.5 text-sm">{cat.name}</AccordionTrigger>
                      <AccordionContent>
                        <div className="flex flex-col gap-1 pl-2">
                          <button className="rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted" onClick={() => { setMobileOpen(false); navigate("category", { slug: cat.slug }); }}>
                            All {cat.name}
                          </button>
                          {cat.children.map((sub) => (
                            <button key={sub.id} className="rounded px-2 py-1.5 text-left text-sm text-muted-foreground hover:bg-muted" onClick={() => { setMobileOpen(false); navigate("category", { slug: sub.slug }); }}>
                              {sub.name}
                            </button>
                          ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
                </Accordion>
                <div className="mt-2 border-t pt-2">
                  <MobileNavLink icon={<Package size={16} />} label="My Orders" onClick={() => { setMobileOpen(false); navigate("orders"); }} />
                  <MobileNavLink icon={<Heart size={16} />} label="Wishlist" onClick={() => { setMobileOpen(false); navigate("wishlist"); }} />
                  <MobileNavLink icon={<MapPin size={16} />} label="Addresses" onClick={() => { setMobileOpen(false); navigate("addresses"); }} />
                  {user?.role === "SELLER" && <MobileNavLink icon={<Store size={16} />} label="Seller Dashboard" onClick={() => { setMobileOpen(false); navigate("seller"); }} />}
                  {user?.role === "ADMIN" && <MobileNavLink icon={<ShieldCheck size={16} />} label="Admin Panel" onClick={() => { setMobileOpen(false); navigate("admin"); }} />}
                  <MobileNavLink icon={<Settings size={16} />} label="Support" onClick={() => { setMobileOpen(false); navigate("support"); }} />
                  {user && <MobileNavLink icon={<LogOut size={16} />} label="Sign out" onClick={() => { setMobileOpen(false); logout(); }} />}
                </div>
              </div>
            </SheetContent>
          </Sheet>
          <BrandLogo onClick={() => navigate("home")} />
        </div>

        <div className="hidden lg:block">
          <BrandLogo onClick={() => navigate("home")} />
        </div>

        {/* Search */}
        <div ref={boxRef} className="relative mx-auto hidden w-full max-w-xl sm:block">
          <form
            onSubmit={(e) => { e.preventDefault(); doSearch(term); }}
            role="search"
          >
            <div className="flex items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2 focus-within:border-ring focus-within:bg-background">
              <Search size={17} className="shrink-0 text-muted-foreground" />
              <input
                value={term}
                onChange={(e) => onTermChange(e.target.value)}
                onFocus={() => term.trim().length >= 2 && setOpen(true)}
                placeholder="Search for products, brands and more"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                aria-label="Search products"
              />
              {suggesting && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
            </div>
          </form>
          {open && suggestions && suggestions.items.length > 0 && (
            <div className="absolute inset-x-0 top-full z-50 mt-1.5 overflow-hidden rounded-xl border bg-popover shadow-lg">
              {suggestions.items.map((s) => (
                <button
                  key={`${s.type}-${s.id}`}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-sm hover:bg-muted"
                  onClick={() => {
                    cancelSuggest();
                    if (s.type === "product") navigate("product", { slug: s.id });
                    else if (s.type === "category") navigate("category", { slug: s.id });
                    else doSearch(s.label);
                  }}
                >
                  <Search size={13} className="shrink-0 text-muted-foreground" />
                  <span className="truncate">{s.label}</span>
                  {s.sublabel && <span className="ml-auto shrink-0 text-xs text-muted-foreground">{s.sublabel}</span>}
                </button>
              ))}
              <button className="w-full border-t bg-muted/40 px-3.5 py-2 text-left text-xs font-medium text-primary hover:bg-muted" onClick={() => doSearch(term)}>
                See all results for &quot;{term}&quot;
              </button>
            </div>
          )}
        </div>

        {/* Desktop actions */}
        <div className="ml-auto hidden items-center gap-1 sm:flex">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="gap-1.5">
                <User size={17} />
                <span className="hidden md:inline">{user ? user.name.split(" ")[0] : "Account"}</span>
                <ChevronDown size={13} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              {user ? (
                <>
                  <DropdownMenuLabel>
                    <div className="text-sm font-semibold">{user.name}</div>
                    <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("orders")}><Package size={14} className="mr-2" />My Orders</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("wishlist")}><Heart size={14} className="mr-2" />Wishlist</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("profile")}><User size={14} className="mr-2" />My Profile</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("returns")}><Package size={14} className="mr-2" />Returns & Refunds</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("notifications")}><Bell size={14} className="mr-2" />Notifications</DropdownMenuItem>
                  {user.role === "CUSTOMER" && (
                    <DropdownMenuItem onClick={() => navigate("seller-onboarding")}><Store size={14} className="mr-2" />Become a Seller</DropdownMenuItem>
                  )}
                  {user.role === "SELLER" && user.sellerStatus === "APPROVED" && (
                    <DropdownMenuItem onClick={() => navigate("seller")}><Store size={14} className="mr-2" />Seller Dashboard</DropdownMenuItem>
                  )}
                  {user.role === "ADMIN" && (
                    <DropdownMenuItem onClick={() => navigate("admin")}><ShieldCheck size={14} className="mr-2" />Admin Panel</DropdownMenuItem>
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={logout}><LogOut size={14} className="mr-2" />Sign out</DropdownMenuItem>
                </>
              ) : (
                <>
                  <DropdownMenuItem onClick={() => navigate("login")}><User size={14} className="mr-2" />Sign in</DropdownMenuItem>
                  <DropdownMenuItem onClick={() => navigate("register")}><User size={14} className="mr-2" />Create account</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => navigate("seller-onboarding")}><Store size={14} className="mr-2" />Become a Seller</DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="relative" aria-label="Wishlist" onClick={() => navigate("wishlist")}>
            <Heart size={19} />
            {wishCount > 0 && <CountBadge count={wishCount} />}
          </Button>
          <Button variant="ghost" size="icon" className="relative" aria-label="Cart" onClick={() => navigate("cart")}>
            <ShoppingCart size={19} />
            {cartCount > 0 && <CountBadge count={cartCount} />}
          </Button>
        </div>
      </div>

      {/* Mobile search */}
      <div className="px-3 pb-2.5 sm:hidden">
        <form onSubmit={(e) => { e.preventDefault(); doSearch(term); }} role="search">
          <div className="flex items-center gap-2 rounded-xl border bg-muted/50 px-3 py-2">
            <Search size={16} className="text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search ShopEase"
              className="w-full bg-transparent text-sm outline-none"
              aria-label="Search products"
            />
          </div>
        </form>
      </div>

      {/* Desktop category bar */}
      <nav className="hidden border-t bg-muted/30 lg:block" aria-label="Product categories">
        <div className="mx-auto flex h-10 max-w-7xl items-center gap-1 overflow-x-auto px-6 sk-scrollbar">
          {categories?.items.map((cat) => (
            <CategoryMenu key={cat.id} category={cat} />
          ))}
          <button className="ml-2 flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-accent" onClick={() => navigate("search", { q: "", deals: "1" })}>
            <Flame size={15} className="fill-brand-yellow/60" />
            Today&apos;s Deals
          </button>
        </div>
      </nav>
    </header>
  );
}

function MobileNavLink({ icon, label, onClick }: { icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm hover:bg-muted">
      <span className="text-muted-foreground">{icon}</span>
      {label}
    </button>
  );
}

function CountBadge({ count }: { count: number }) {
  return (
    <span
      key={count}
      className="count-pop absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle theme"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
    >
      {/* CSS-driven icons avoid hydration mismatch without mounted state */}
      <Sun size={18} className="hidden dark:block" />
      <Moon size={18} className="block dark:hidden" />
    </Button>
  );
}

function CategoryMenu({ category }: { category: Category }) {
  const navigate = useNav((s) => s.navigate);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-3 py-1.5 text-sm font-medium hover:bg-accent">
          {category.name}
          {category.children.length > 0 && <ChevronDown size={12} />}
        </button>
      </DropdownMenuTrigger>
      {category.children.length > 0 && (
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem onClick={() => navigate("category", { slug: category.slug })}>
            <span className="font-medium">All {category.name}</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {category.children.map((sub) => (
            <DropdownMenuItem key={sub.id} onClick={() => navigate("category", { slug: sub.slug })}>
              {sub.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      )}
    </DropdownMenu>
  );
}

export function BottomNav() {
  const navigate = useNavStore((s) => s.navigate);
  const view = useNavStore((s) => s.view);
  const { user } = useSession();
  const { data: cartData } = useQuery({
    queryKey: ["cart"],
    queryFn: () => api.get<{ items: { qty: number }[] }>("/api/cart"),
    enabled: !!user,
  });
  const cartCount = cartData?.items?.reduce((s, i) => s + i.qty, 0) ?? 0;

  const items = [
    { key: "home", label: "Home", node: <Home size={20} />, onClick: () => navigate("home") },
    { key: "search", label: "Search", node: <Search size={20} />, onClick: () => navigate("search", { q: "" }) },
    { key: "cart", label: "Cart", node: <ShoppingCart size={20} />, onClick: () => navigate("cart"), badge: cartCount },
    { key: "wishlist", label: "Profile", node: <User size={20} />, onClick: () => navigate(user ? "profile" : "login") },
  ];

  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Primary">
      <div className="grid grid-cols-4">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={item.onClick}
            aria-label={item.label}
            aria-current={view.name === item.key ? "page" : undefined}
            className={`relative flex flex-col items-center gap-0.5 py-2 text-[11px] transition-colors ${view.name === item.key ? "text-primary" : "text-muted-foreground"}`}
          >
            {item.node}
            {item.badge ? (
              <span className="absolute right-1/4 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
                {item.badge}
              </span>
            ) : null}
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
