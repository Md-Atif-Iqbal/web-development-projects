"use client";

// ShopEase single-page marketplace shell.
// The preview environment serves only `/`, so all screens are client-side
// views switched through the useNav store (see src/lib/store.ts).

import { Suspense, useEffect } from "react";
import { Providers } from "@/components/shopkart/providers";
import { Header, BottomNav } from "@/components/shopkart/header";
import { Footer } from "@/components/shopkart/footer";
import { useNav } from "@/lib/store";
import { Skeleton } from "@/components/ui/skeleton";

// ── Customer views ──
import HomeView from "@/components/shopkart/views/home";
import CatalogView from "@/components/shopkart/views/catalog";
import ProductDetailView from "@/components/shopkart/views/product-detail";
import CartView from "@/components/shopkart/views/cart";
import WishlistView from "@/components/shopkart/views/wishlist";
import CheckoutView from "@/components/shopkart/views/checkout";
import SandboxPaymentView from "@/components/shopkart/views/sandbox-payment";
import PaymentResultView from "@/components/shopkart/views/payment-result";
import OrdersView from "@/components/shopkart/views/orders";
import OrderDetailView from "@/components/shopkart/views/order-detail";
import AddressesView from "@/components/shopkart/views/addresses";
import ProfileView from "@/components/shopkart/views/profile";
import ReturnsView from "@/components/shopkart/views/returns";
import ReturnDetailView from "@/components/shopkart/views/return-detail";
import SupportView from "@/components/shopkart/views/support";
import NotificationsView from "@/components/shopkart/views/notifications";
import AuthView from "@/components/shopkart/views/auth";
import ForgotPasswordView from "@/components/shopkart/views/forgot-password";
import ResetPasswordView from "@/components/shopkart/views/reset-password";

// ── Seller views ──
import SellerOnboardingView from "@/components/shopkart/views/seller-onboarding";
import SellerDashboardView from "@/components/shopkart/views/seller-dashboard";
import SellerProductsView from "@/components/shopkart/views/seller-products";
import SellerProductFormView from "@/components/shopkart/views/seller-product-form";
import SellerOrdersView from "@/components/shopkart/views/seller-orders";
import SellerReturnsView from "@/components/shopkart/views/seller-returns";
import SellerFinanceView from "@/components/shopkart/views/seller-finance";

// ── Admin views ──
import AdminDashboardView from "@/components/shopkart/views/admin-dashboard";
import AdminSellersView from "@/components/shopkart/views/admin-sellers";
import AdminProductsView from "@/components/shopkart/views/admin-products";
import AdminOrdersView from "@/components/shopkart/views/admin-orders";
import AdminPaymentsView from "@/components/shopkart/views/admin-payments";
import AdminReturnsView from "@/components/shopkart/views/admin-returns";
import AdminCatalogView from "@/components/shopkart/views/admin-catalog";
import AdminUsersView from "@/components/shopkart/views/admin-users";
import AdminSupportView from "@/components/shopkart/views/admin-support";
import AdminAuditView from "@/components/shopkart/views/admin-audit";

// ── Static ──
import PoliciesView from "@/components/shopkart/views/policies";

// Per-view browser titles (SEO / tab clarity). Views not listed fall back to
// the root metadata title from layout.tsx.
const VIEW_TITLES: Record<string, string> = {
  home: "ShopEase — Everything You Love, All in One Place",
  search: "Search Products · ShopEase",
  category: "Shop by Category · ShopEase",
  product: "Product · ShopEase",
  cart: "Shopping Cart · ShopEase",
  wishlist: "My Wishlist · ShopEase",
  checkout: "Secure Checkout · ShopEase",
  "sandbox-payment": "Payment · ShopEase",
  "payment-result": "Payment Status · ShopEase",
  "order-confirm": "Order Confirmed · ShopEase",
  orders: "My Orders · ShopEase",
  "order-detail": "Order Details · ShopEase",
  addresses: "Saved Addresses · ShopEase",
  profile: "My Profile · ShopEase",
  returns: "Returns & Refunds · ShopEase",
  "return-detail": "Return Details · ShopEase",
  support: "Help Center · ShopEase",
  notifications: "Notifications · ShopEase",
  login: "Sign In · ShopEase",
  register: "Create Account · ShopEase",
  "forgot-password": "Forgot Password · ShopEase",
  "reset-password": "Reset Password · ShopEase",
  "seller-onboarding": "Become a Seller · ShopEase",
  seller: "Seller Hub · ShopEase",
  "seller-products": "Seller Products · ShopEase",
  "seller-product-form": "Seller Product Form · ShopEase",
  "seller-orders": "Seller Orders · ShopEase",
  "seller-returns": "Seller Returns · ShopEase",
  "seller-finance": "Seller Finance · ShopEase",
  admin: "Admin Console · ShopEase",
  "admin-sellers": "Manage Sellers · ShopEase",
  "admin-products": "Manage Products · ShopEase",
  "admin-orders": "Manage Orders · ShopEase",
  "admin-payments": "Payments · ShopEase",
  "admin-returns": "Returns · ShopEase",
  "admin-catalog": "Catalog · ShopEase",
  "admin-users": "Users · ShopEase",
  "admin-support": "Support Tickets · ShopEase",
  "admin-audit": "Audit Log · ShopEase",
  policies: "Policies · ShopEase",
};

function ViewOutlet() {
  const view = useNav((s) => s.view);
  const { name, params } = view;
  switch (name) {
    // Customer
    case "home": return <HomeView />;
    case "search": return <CatalogView mode="search" params={params} />;
    case "category": return <CatalogView mode="category" params={params} />;
    case "product": return <ProductDetailView params={params} />;
    case "cart": return <CartView />;
    case "wishlist": return <WishlistView />;
    case "checkout": return <CheckoutView />;
    case "sandbox-payment": return <SandboxPaymentView params={params} />;
    case "payment-result": return <PaymentResultView params={params} />;
    case "order-confirm": return <PaymentResultView params={{ ...params, confirm: "1" }} />;
    case "orders": return <OrdersView />;
    case "order-detail": return <OrderDetailView params={params} />;
    case "addresses": return <AddressesView />;
    case "profile": return <ProfileView />;
    case "returns": return <ReturnsView />;
    case "return-detail": return <ReturnDetailView params={params} />;
    case "support": return <SupportView />;
    case "notifications": return <NotificationsView />;
    case "login": return <AuthView mode="login" />;
    case "register": return <AuthView mode="register" />;
    case "forgot-password": return <ForgotPasswordView />;
    case "reset-password": return <ResetPasswordView params={params} />;
    // Seller
    case "seller-onboarding": return <SellerOnboardingView />;
    case "seller": return <SellerDashboardView />;
    case "seller-products": return <SellerProductsView />;
    case "seller-product-form": return <SellerProductFormView params={params} />;
    case "seller-orders": return <SellerOrdersView />;
    case "seller-returns": return <SellerReturnsView />;
    case "seller-finance": return <SellerFinanceView />;
    // Admin
    case "admin": return <AdminDashboardView />;
    case "admin-sellers": return <AdminSellersView />;
    case "admin-products": return <AdminProductsView />;
    case "admin-orders": return <AdminOrdersView />;
    case "admin-payments": return <AdminPaymentsView />;
    case "admin-returns": return <AdminReturnsView />;
    case "admin-catalog": return <AdminCatalogView />;
    case "admin-users": return <AdminUsersView />;
    case "admin-support": return <AdminSupportView />;
    case "admin-audit": return <AdminAuditView />;
    // Static
    case "policies": return <PoliciesView params={params} />;
    default: return <HomeView />;
  }
}

function ViewFallback() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-8">
      <Skeleton className="h-8 w-48" />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square rounded-xl" />
        ))}
      </div>
    </div>
  );
}

function FullScreenViews() {
  // Views that render their own chrome (dashboards with sidebars)
  return ["seller", "seller-products", "seller-product-form", "seller-orders", "seller-returns", "seller-finance", "admin", "admin-sellers", "admin-products", "admin-orders", "admin-payments", "admin-returns", "admin-catalog", "admin-users", "admin-support", "admin-audit"];
}

export default function ShopEaseApp() {
  const view = useNav((s) => s.view);
  const replace = useNav((s) => s.replace);
  const isFullScreen = FullScreenViews().includes(view.name);

  // Deep links from password-reset emails: /?reset=<token> boots the SPA
  // straight into the reset-password view. Runs once on mount; the URL is
  // cleaned afterwards so refreshes don't re-enter the flow with a used
  // token. (App is client-only — ssr:false — so window access is safe.)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get("reset");
    if (token) {
      replace("reset-password", { token });
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, [replace]);

  // Keep the browser tab title in sync with the current view.
  useEffect(() => {
    document.title = VIEW_TITLES[view.name] ?? "ShopEase — India's Friendly Online Marketplace";
  }, [view.name]);

  if (isFullScreen) {
    return (
      <Providers>
        <Suspense fallback={<ViewFallback />}>
          <div className="flex min-h-screen flex-col bg-background">
            <ViewOutlet />
          </div>
        </Suspense>
      </Providers>
    );
  }

  return (
    <Providers>
      <div className="flex min-h-screen flex-col bg-background">
        <Header />
        <main className="flex-1 pb-16 sm:pb-0">
          <Suspense fallback={<ViewFallback />}>
            <ViewOutlet />
          </Suspense>
        </main>
        <Footer />
        <BottomNav />
      </div>
    </Providers>
  );
}
