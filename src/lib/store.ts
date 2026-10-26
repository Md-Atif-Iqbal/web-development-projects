"use client";

// App-wide client state: in-app navigation (single-page marketplace),
// toasts coordination and lightweight UI state.

import { create } from "zustand";

export type ViewName =
  | "home"
  | "search"
  | "category"
  | "product"
  | "cart"
  | "wishlist"
  | "checkout"
  | "sandbox-payment"
  | "payment-result"
  | "order-confirm"
  | "orders"
  | "order-detail"
  | "addresses"
  | "profile"
  | "returns"
  | "return-detail"
  | "support"
  | "policies"
  | "seller"
  | "seller-onboarding"
  | "seller-products"
  | "seller-product-form"
  | "seller-orders"
  | "seller-returns"
  | "seller-finance"
  | "admin"
  | "admin-sellers"
  | "admin-products"
  | "admin-orders"
  | "admin-payments"
  | "admin-returns"
  | "admin-catalog"
  | "admin-users"
  | "admin-support"
  | "admin-audit"
  | "login"
  | "register"
  | "forgot-password"
  | "reset-password"
  | "notifications";

export type ViewParams = Record<string, string>;

export type View = { name: ViewName; params: ViewParams };

type NavState = {
  view: View;
  history: View[];
  navigate: (name: ViewName, params?: ViewParams) => void;
  replace: (name: ViewName, params?: ViewParams) => void;
  back: () => void;
  goHome: () => void;
};

function makeView(name: ViewName, params?: ViewParams): View {
  return { name, params: params ?? {} };
}

export const useNav = create<NavState>((set, get) => ({
  view: makeView("home"),
  history: [],
  navigate: (name, params) => {
    const current = get().view;
    set((s) => ({ view: makeView(name, params), history: [...s.history.slice(-30), current] }));
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  },
  replace: (name, params) => set({ view: makeView(name, params) }),
  back: () => {
    const { history } = get();
    if (history.length === 0) {
      set({ view: makeView("home"), history: [] });
    } else {
      const prev = history[history.length - 1];
      set({ view: prev, history: history.slice(0, -1) });
    }
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
  },
  goHome: () => set({ view: makeView("home"), history: [] }),
}));

// Recently viewed product ids (client-side, capped at 10)
const RECENT_KEY = "sk_recent_products";
export function pushRecentProduct(productId: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
    const next = [productId, ...raw.filter((id) => id !== productId)].slice(0, 10);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    /* ignore */
  }
}
export function getRecentProducts(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}
