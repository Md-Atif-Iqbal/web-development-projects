"use client";

// Client-only root for the storefront SPA.
// The whole marketplace is a client-side application (cookie session,
// zustand navigation, localStorage, TanStack Query) — rendering it
// exclusively on the client avoids every class of SSR hydration mismatch.

import dynamic from "next/dynamic";
import { BrandMark } from "@/components/shopkart/shared";

function Splash() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-background">
      <BrandMark className="h-14 w-14 drop-shadow-sm" />
      <div className="text-lg font-extrabold tracking-tight text-foreground">
        Shop<span className="text-primary">Ease</span>
      </div>
      <div className="text-xs text-muted-foreground">Loading marketplace…</div>
    </div>
  );
}

const ShopEaseApp = dynamic(() => import("@/components/shopkart/app"), {
  ssr: false,
  loading: () => <Splash />,
});

export default function SpaRoot() {
  return <ShopEaseApp />;
}
