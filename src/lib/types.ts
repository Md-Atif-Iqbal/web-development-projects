// Shared types between API routes and the frontend. Mirrors docs/CONTRACT.md.
// Money: all amounts are INTEGER PAISE.

export type Role = "CUSTOMER" | "SELLER" | "ADMIN";

export interface Me {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  role: Role;
  sellerId: string | null;
  sellerStatus: string | null; // PENDING | APPROVED | REJECTED | SUSPENDED
}

export interface ApiError {
  error: { code: string; message: string; details?: unknown };
}

// ── Catalog ──
export interface Category {
  id: string;
  name: string;
  slug: string;
  icon: string | null;
  imageUrl: string | null;
  children: Category[];
}

export interface Brand {
  id: string;
  name: string;
  slug: string;
}

export interface ProductCard {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  price: number; // paise
  mrp: number;
  discountPercent: number;
  rating: number; // 0..5 (one decimal)
  ratingCount: number;
  brand: string | null;
  categoryName: string;
  inStock: boolean;
  sellerName: string;
  isFeatured?: boolean;
}

export interface SellerOfferView {
  id: string;
  sellerId: string;
  sellerName: string;
  price: number;
  deliveryDays: number;
  isPrimary: boolean;
}

export interface ProductVariantView {
  id: string;
  sku: string;
  name: string;
  attributes: Record<string, string>;
  mrp: number;
  price: number;
  availableQty: number;
  inStock: boolean;
}

export interface ProductReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  verifiedPurchase: boolean;
  createdAt: string;
  userName: string;
}

export interface ProductDetail {
  id: string;
  name: string;
  slug: string;
  description: string;
  highlights: string[];
  specifications: Record<string, string>;
  images: string[];
  brand: string | null;
  category: { id: string; name: string; slug: string };
  seller: { id: string; name: string; rating: number | null };
  variants: ProductVariantView[];
  offers: SellerOfferView[];
  warrantyMonths: number;
  returnDays: number;
  codAvailable: boolean;
  rating: number;
  ratingCount: number;
  soldCount: number;
  createdAt: string;
}

export interface ProductListResponse {
  items: ProductCard[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  facets: {
    brands: { id: string; name: string; count: number }[];
    priceRange: { min: number; max: number };
    categories: { id: string; name: string; slug: string; count: number }[];
  };
}

export interface SearchSuggestion {
  type: "product" | "category";
  id: string;
  label: string;
  sublabel?: string;
}

// ── Cart ──
export interface CartItemView {
  cartItemId: string;
  productId: string;
  variantId: string;
  sellerOfferId: string | null;
  sellerId: string;
  sellerName: string;
  productName: string;
  productSlug: string;
  variantName: string;
  sku: string;
  image: string | null;
  qty: number;
  maxQty: number;
  unitPrice: number;
  listPrice: number;
  lineTotal: number;
  inStock: boolean;
  availableQty: number;
  codAvailable: boolean;
  returnDays: number;
}

export interface CartIssue {
  cartItemId: string;
  type: "OUT_OF_STOCK" | "QTY_LIMIT" | "UNAVAILABLE" | "PRICE_CHANGED";
  message: string;
  availableQty?: number;
  currentUnitPrice?: number;
}

export interface FulfillmentGroupView {
  sellerId: string;
  sellerName: string;
  itemsTotal: number;
  shippingFee: number;
  cartItemIds: string[];
}

export interface CartPricingView {
  items: CartItemView[];
  issues: CartIssue[];
  itemsTotal: number;
  listTotal: number;
  savingsTotal: number;
  couponDiscount: number;
  couponCode: string | null;
  couponMessage: string | null;
  shippingTotal: number;
  grandTotal: number;
  fulfillmentGroups: FulfillmentGroupView[];
}

// ── Wishlist ──
export interface WishlistItemView {
  id: string;
  productId: string;
  productName: string;
  slug: string;
  image: string | null;
  price: number;
  mrp: number;
  discountPercent: number;
  rating: number;
  inStock: boolean;
  addedAt: string;
}

// ── Address ──
export interface AddressView {
  id: string;
  fullName: string;
  phone: string;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  type: string;
  isDefault: boolean;
}

// ── Checkout / Orders ──
export interface OrderItemView {
  id: string;
  productId: string;
  name: string;
  sku: string;
  image: string | null;
  variantName: string | null;
  unitPrice: number;
  listPrice: number;
  qty: number;
  lineTotal: number;
  status: string;
  returnDays: number;
  sellerId: string;
  sellerName: string;
  fulfillmentId: string | null;
  fulfillmentStatus: string | null;
  trackingNumber: string | null;
}

export interface OrderView {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  paymentStatus: string;
  itemsTotal: number;
  discountTotal: number;
  couponCode: string | null;
  couponDiscount: number;
  shippingTotal: number;
  grandTotal: number;
  placedAt: string;
  confirmedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  address: AddressView;
  statusHistory: { status: string; at: string; note?: string }[];
  items: OrderItemView[];
  payments: PaymentView[];
}

export interface PaymentView {
  id: string;
  provider: string;
  method: string;
  amount: number;
  status: string;
  providerRef: string | null;
  sandbox: boolean;
  failureReason: string | null;
  createdAt: string;
}

export interface CheckoutValidateResponse {
  pricing: CartPricingView;
  addresses: AddressView[];
  codAllowed: boolean;
  codFee: number;
}

// ── Returns ──
export interface ReturnRequestView {
  id: string;
  rmaNumber: string;
  orderId: string;
  orderNumber: string;
  type: string;
  status: string;
  reason: string;
  description: string | null;
  refundAmount: number;
  refundMode: string;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
  items: {
    id: string;
    orderItemId: string;
    productName: string;
    image: string | null;
    qty: number;
    reason: string;
  }[];
  refund?: { id: string; amount: number; status: string; mode: string } | null;
}

// ── Seller ──
export interface SellerDashboard {
  seller: { id: string; businessName: string; status: string; commissionBps: number; rating: number | null };
  stats: {
    totalProducts: number;
    activeProducts: number;
    pendingProducts: number;
    lowStockCount: number;
    ordersToProcess: number;
    revenue30d: number;
    earnings30d: number;
    pendingReturns: number;
  };
  revenueChart: { date: string; revenue: number; orders: number }[];
  topProducts: { productId: string; name: string; unitsSold: number; revenue: number }[];
}

export interface SellerProduct {
  id: string;
  name: string;
  slug: string;
  status: string;
  categoryName: string;
  brandName: string | null;
  images: string[];
  description: string;
  highlights: string[];
  specifications: Record<string, string>;
  warrantyMonths: number;
  returnDays: number;
  codAvailable: boolean;
  moderationNote: string | null;
  variants: {
    id: string;
    sku: string;
    name: string;
    attributes: Record<string, string>;
    mrp: number;
    price: number;
    onHand: number;
    reserved: number;
    availableQty: number;
  }[];
  createdAt: string;
}

// ── Admin ──
export interface AdminDashboard {
  stats: {
    totalCustomers: number;
    totalSellers: number;
    pendingSellers: number;
    totalProducts: number;
    pendingProducts: number;
    totalOrders: number;
    ordersToday: number;
    revenue30d: number;
    commission30d: number;
    pendingReturns: number;
    openTickets: number;
  };
  revenueChart: { date: string; revenue: number; orders: number }[];
  orderStatusBreakdown: { status: string; count: number }[];
  topCategories: { name: string; unitsSold: number; revenue: number }[];
}

export interface SellerAdminRow {
  id: string;
  businessName: string;
  ownerName: string;
  ownerEmail: string;
  status: string;
  commissionBps: number;
  productCount: number;
  createdAt: string;
  verification: {
    accountType: string;
    gstin: string | null;
    bankAccountMasked: string | null;
    bankIfsc: string | null;
    status: string;
    reviewerNote: string | null;
  } | null;
}

// ── Support ──
export interface TicketView {
  id: string;
  ticketNumber: string;
  subject: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  userName?: string;
  userEmail?: string;
  messages: { id: string; authorRole: string; authorName: string | null; body: string; createdAt: string }[];
}

// ── Misc ──
export interface BannerView {
  id: string;
  title: string;
  subtitle: string | null;
  imageUrl: string;
  ctaText: string | null;
  linkType: string;
  linkValue: string | null;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string | null;
  readAt: string | null;
  createdAt: string;
}

export interface TrackingView {
  trackingNumber: string;
  provider: string;
  status: string;
  estimatedDelivery: string | null;
  deliveredAt: string | null;
  events: { status: string; at: string; note?: string }[];
  orderNumber: string;
  sellerName: string;
}

export interface ServiceabilityResponse {
  pincode: string;
  serviceable: boolean;
  city: string;
  state: string;
  estimatedDays: number;
  codAvailable: boolean;
}
