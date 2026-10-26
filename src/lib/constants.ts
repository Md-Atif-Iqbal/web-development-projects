// ShopEase platform constants, status machines and business configuration.

export const ROLES = {
  CUSTOMER: "CUSTOMER",
  SELLER: "SELLER",
  ADMIN: "ADMIN",
} as const;
export type Role = keyof typeof ROLES;

export const USER_STATUS = { ACTIVE: "ACTIVE", SUSPENDED: "SUSPENDED" } as const;

export const SELLER_STATUS = {
  PENDING: "PENDING",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  SUSPENDED: "SUSPENDED",
} as const;

export const PRODUCT_STATUS = {
  DRAFT: "DRAFT",
  PENDING: "PENDING",
  ACTIVE: "ACTIVE",
  REJECTED: "REJECTED",
  ARCHIVED: "ARCHIVED",
} as const;

// Ordered lifecycle of an order (backend enforced transitions)
export const ORDER_STATUS = {
  PENDING_PAYMENT: "PENDING_PAYMENT",
  CONFIRMED: "CONFIRMED",
  PROCESSING: "PROCESSING",
  SHIPPED: "SHIPPED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  CANCELLED: "CANCELLED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
} as const;

export const ORDER_STATUS_FLOW: Record<string, string[]> = {
  PENDING_PAYMENT: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["OUT_FOR_DELIVERY", "DELIVERY_FAILED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export const FULFILLMENT_STATUS = {
  CONFIRMED: "CONFIRMED",
  PROCESSING: "PROCESSING",
  PACKED: "PACKED",
  SHIPPED: "SHIPPED",
  OUT_FOR_DELIVERY: "OUT_FOR_DELIVERY",
  DELIVERED: "DELIVERED",
  DELIVERY_FAILED: "DELIVERY_FAILED",
  CANCELLED: "CANCELLED",
} as const;

export const FULFILLMENT_STATUS_FLOW: Record<string, string[]> = {
  CONFIRMED: ["PROCESSING", "PACKED", "CANCELLED"],
  PROCESSING: ["PACKED", "CANCELLED"],
  PACKED: ["SHIPPED"],
  SHIPPED: ["OUT_FOR_DELIVERY"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_FAILED"],
  DELIVERY_FAILED: ["OUT_FOR_DELIVERY", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

export const PAYMENT_STATUS = {
  PENDING: "PENDING",
  PAID: "PAID",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  REFUNDED: "REFUNDED",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
} as const;

export const PAYMENT_METHODS = ["UPI", "CARD", "NETBANKING", "WALLET", "COD"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const RETURN_STATUS = {
  REQUESTED: "REQUESTED",
  UNDER_REVIEW: "UNDER_REVIEW",
  APPROVED: "APPROVED",
  REJECTED: "REJECTED",
  PICKUP_SCHEDULED: "PICKUP_SCHEDULED",
  PICKED_UP: "PICKED_UP",
  INSPECTION_PENDING: "INSPECTION_PENDING",
  REFUND_INITIATED: "REFUND_INITIATED",
  REFUND_COMPLETED: "REFUND_COMPLETED",
  CLOSED: "CLOSED",
  EXCHANGE_SHIPPED: "EXCHANGE_SHIPPED",
} as const;

// Allowed return-status transitions. Sellers act up to PICKED_UP / decisions;
// admin / automated pipeline handles refund progression.
export const RETURN_STATUS_FLOW: Record<string, string[]> = {
  REQUESTED: ["UNDER_REVIEW", "APPROVED", "REJECTED"],
  UNDER_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PICKUP_SCHEDULED", "CLOSED"],
  REJECTED: ["CLOSED"],
  PICKUP_SCHEDULED: ["PICKED_UP"],
  PICKED_UP: ["INSPECTION_PENDING"],
  INSPECTION_PENDING: ["REFUND_INITIATED", "CLOSED"],
  REFUND_INITIATED: ["REFUND_COMPLETED"],
  REFUND_COMPLETED: ["CLOSED"],
  EXCHANGE_SHIPPED: ["CLOSED"],
  CLOSED: [],
};

export const RETURN_REASONS = [
  "DAMAGED_OR_DEFECTIVE",
  "WRONG_ITEM_DELIVERED",
  "SIZE_OR_FIT_ISSUE",
  "NOT_AS_DESCRIBED",
  "CHANGED_MIND",
  "QUALITY_ISSUE",
  "OTHER",
] as const;

export const RETURN_REASON_LABELS: Record<string, string> = {
  DAMAGED_OR_DEFECTIVE: "Damaged or defective",
  WRONG_ITEM_DELIVERED: "Wrong item delivered",
  SIZE_OR_FIT_ISSUE: "Size or fit issue",
  NOT_AS_DESCRIBED: "Item not as described",
  CHANGED_MIND: "Changed my mind",
  QUALITY_ISSUE: "Quality issue",
  OTHER: "Other",
};

// ── Business configuration (defaults; overridable via Settings table) ──
export const SHIPPING_CONFIG = {
  FREE_THRESHOLD_PAISE: 50000, // free delivery above ₹500
  STANDARD_FEE_PAISE: 4000, // ₹40
  COD_FEE_PAISE: 1900, // ₹19 handling fee
  COD_MAX_ORDER_PAISE: 5000000, // COD allowed up to ₹50,000
  DEFAULT_DELIVERY_DAYS: 3,
};

export const RESERVATION_TTL_MINUTES = 20;
export const PENDING_PAYMENT_TTL_HOURS = 6;

export const SESSION_COOKIE = "sk_session";
export const SESSION_TTL_DAYS = 7;

export const PAGE_SIZES = { products: 12, orders: 10, reviews: 10 };

export function canTransition(flow: Record<string, string[]>, from: string, to: string): boolean {
  return (flow[from] ?? []).includes(to);
}
