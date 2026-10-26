"use client";

// Profile — account summary, quick links, stats, theme toggle and sign-out.

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTheme } from "next-themes";
import { toast } from "sonner";
import {
  Package, Heart, MapPin, RotateCcw, LifeBuoy, Bell, Moon, Sun, LogOut,
  Store, ShieldCheck, Mail, Phone, User, ChevronRight, BadgeCheck,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { useNav } from "@/lib/store";
import { useSession } from "@/lib/session";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function ProfileView(_props: { params?: Record<string, string>; mode?: string }) {
  const navigate = useNav((s) => s.navigate);
  const { user, loading, refresh } = useSession();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data: ordersPage } = useQuery({
    queryKey: ["orders", "stats"],
    queryFn: () => api.get<{ items: unknown[]; total: number }>("/api/orders?page=1&pageSize=1"),
    enabled: !!user,
  });

  const { data: wishData } = useQuery({
    queryKey: ["wishlist"],
    queryFn: () => api.get<{ items: unknown[] }>("/api/wishlist"),
    enabled: !!user,
  });

  const signOut = async () => {
    setSigningOut(true);
    try {
      await api.post("/api/auth/logout");
      await refresh();
      toast.success("Signed out");
      navigate("home");
    } finally {
      setSigningOut(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-4 py-6 sm:px-6">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card px-6 py-16 text-center">
          <div className="rounded-full bg-muted p-4 text-muted-foreground"><User size={26} /></div>
          <h2 className="font-semibold">Please sign in</h2>
          <p className="text-sm text-muted-foreground">Your profile, orders and settings live here.</p>
          <Button size="lg" onClick={() => navigate("login")}>Sign in</Button>
        </div>
      </div>
    );
  }

  const quickLinks = [
    { icon: Package, label: "My Orders", desc: "Track & manage", go: () => navigate("orders") },
    { icon: Heart, label: "Wishlist", desc: `${wishData?.items?.length ?? 0} saved item${(wishData?.items?.length ?? 0) === 1 ? "" : "s"}`, go: () => navigate("wishlist") },
    { icon: MapPin, label: "Addresses", desc: "Delivery locations", go: () => navigate("addresses") },
    { icon: RotateCcw, label: "Returns", desc: "Requests & refunds", go: () => navigate("returns") },
    { icon: LifeBuoy, label: "Support", desc: "Help & tickets", go: () => navigate("support") },
    { icon: Bell, label: "Notifications", desc: "Updates & alerts", go: () => navigate("notifications") },
  ];

  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6">
      <h1 className="mb-5 text-xl font-bold tracking-tight sm:text-2xl">My Profile</h1>

      {/* Account card */}
      <section className="rounded-2xl border bg-card p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-amber-500 text-2xl font-extrabold text-white">
            {user.name.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate text-lg font-bold">{user.name}</h2>
              <Badge variant="outline" className="gap-1 text-[10px]">
                <BadgeCheck size={11} className="text-emerald-600" /> {user.role}
              </Badge>
              {user.role === "SELLER" && user.sellerStatus && (
                <Badge variant="outline" className="text-[10px]">Seller: {user.sellerStatus}</Badge>
              )}
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground"><Mail size={13} /> {user.email}</p>
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Phone size={13} /> {user.phone ?? "No mobile number added"}
            </p>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-5 grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/50 p-3.5 text-center">
            <p className="text-2xl font-extrabold">{ordersPage?.total ?? 0}</p>
            <p className="text-xs text-muted-foreground">Total orders</p>
          </div>
          <div className="rounded-xl bg-muted/50 p-3.5 text-center">
            <p className="text-2xl font-extrabold">{wishData?.items?.length ?? 0}</p>
            <p className="text-xs text-muted-foreground">Wishlist items</p>
          </div>
        </div>

        {/* Dashboard links */}
        {(user.role === "SELLER" || user.role === "ADMIN") && (
          <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            {user.role === "SELLER" && user.sellerStatus === "APPROVED" && (
              <Button variant="outline" className="justify-between gap-2" onClick={() => navigate("seller")}>
                <span className="flex items-center gap-2"><Store size={15} className="text-primary" /> Seller dashboard</span>
                <ChevronRight size={15} />
              </Button>
            )}
            {user.role === "SELLER" && user.sellerStatus === "PENDING" && (
              <Button variant="outline" className="justify-between gap-2" onClick={() => navigate("seller-onboarding")}>
                <span className="flex items-center gap-2"><Store size={15} className="text-primary" /> Seller onboarding</span>
                <ChevronRight size={15} />
              </Button>
            )}
            {user.role === "ADMIN" && (
              <Button variant="outline" className="justify-between gap-2" onClick={() => navigate("admin")}>
                <span className="flex items-center gap-2"><ShieldCheck size={15} className="text-primary" /> Admin panel</span>
                <ChevronRight size={15} />
              </Button>
            )}
          </div>
        )}
      </section>

      {/* Quick links */}
      <section className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {quickLinks.map((l) => (
          <button
            key={l.label}
            onClick={l.go}
            className="flex min-h-24 flex-col items-start gap-2 rounded-xl border bg-card p-4 text-left transition-colors hover:border-primary/40 hover:bg-muted/40"
          >
            <span className="rounded-lg bg-primary/10 p-2 text-primary"><l.icon size={17} /></span>
            <span>
              <span className="block text-sm font-semibold">{l.label}</span>
              <span className="block text-xs text-muted-foreground">{l.desc}</span>
            </span>
          </button>
        ))}
      </section>

      {/* Settings */}
      <section className="mt-5 divide-y rounded-xl border bg-card">
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2.5">
            <span className="rounded-lg bg-muted p-2 text-muted-foreground">{mounted && theme === "dark" ? <Moon size={16} /> : <Sun size={16} />}</span>
            <div>
              <p className="text-sm font-medium">Appearance</p>
              <p className="text-xs text-muted-foreground">Currently {mounted ? theme : "light"} theme</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => setTheme(theme === "dark" ? "light" : "dark")}>
            Switch to {mounted && theme === "dark" ? "light" : "dark"}
          </Button>
        </div>
        <div className="flex items-center justify-between p-4">
          <div className="flex items-center gap-2.5">
            <span className="rounded-lg bg-muted p-2 text-muted-foreground"><LogOut size={16} /></span>
            <div>
              <p className="text-sm font-medium">Sign out</p>
              <p className="text-xs text-muted-foreground">End this session on this device</p>
            </div>
          </div>
          <Button variant="outline" size="sm" className="text-rose-600 hover:text-rose-700" onClick={() => void signOut()} disabled={signingOut}>
            {signingOut && <span className="mr-1 inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />} Sign out
          </Button>
        </div>
      </section>

      <p className="mt-6 text-center text-xs text-muted-foreground">Profile details are read-only in this MVP demo.</p>
    </div>
  );
}
