// Human-readable, collision-resistant business identifiers.

import { randomBytes, randomUUID } from "crypto";

function rand(len: number): string {
  return randomBytes(len).toString("hex").toUpperCase();
}

function datePart(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export const ids = {
  orderNumber: () => `SK-${datePart()}-${rand(4)}`,
  rmaNumber: () => `RMA-${datePart()}-${rand(4)}`,
  trackingNumber: () => `ML${rand(5)}`,
  paymentRef: (prefix = "sbx") => `${prefix}_pay_${randomUUID().replace(/-/g, "").slice(0, 18)}`,
  refundRef: () => `sbx_rfnd_${randomUUID().replace(/-/g, "").slice(0, 18)}`,
  ticketNumber: () => `TKT-${datePart()}-${rand(3)}`,
  idempotencyKey: () => randomUUID(),
};
