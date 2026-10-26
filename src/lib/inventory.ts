// Inventory reservation — concurrency-safe stock management.
//
// Strategy (SQLite single-writer, wrapped in transactions):
// - Reservations are rows in InventoryReservation with an expiry (TTL).
// - "available" = Inventory.onHand - Inventory.reserved.
// - Atomic decrement with a conditional raw UPDATE (re-check inside the tx),
//   so two concurrent checkouts can never oversell the same unit.
// - Expired reservations are swept lazily (on cart validation / checkout).

import { Prisma, PrismaClient } from "@prisma/client";
import { db } from "@/lib/db";
import { ApiHttpError } from "@/lib/http";
import { RESERVATION_TTL_MINUTES } from "@/lib/constants";

type Tx = Prisma.TransactionClient | PrismaClient;

export type ReserveInput = { variantId: string; qty: number };

/**
 * Atomically reserve stock. MUST be called inside a transaction.
 * Throws 409 OUT_OF_STOCK if any line cannot be reserved.
 */
export async function reserveItems(
  tx: Tx,
  userId: string,
  lines: ReserveInput[],
  orderId?: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + RESERVATION_TTL_MINUTES * 60 * 1000);
  for (const line of lines) {
    const updated = await tx.$executeRaw`
      UPDATE "Inventory"
      SET "reserved" = "reserved" + ${line.qty}, "updatedAt" = ${new Date().toISOString()}
      WHERE "variantId" = ${line.variantId}
        AND "onHand" - "reserved" >= ${line.qty}`;
    if (updated !== 1) {
      throw new ApiHttpError(409, "OUT_OF_STOCK", "Some items just went out of stock while placing your order. Please review your cart.");
    }
    await tx.inventoryReservation.create({
      data: { userId, variantId: line.variantId, qty: line.qty, orderId: orderId ?? null, status: "ACTIVE", expiresAt },
    });
  }
}

/** Convert ACTIVE reservations to a real stock deduction (order confirmed & paid). */
export async function convertReservations(tx: Tx, orderId: string): Promise<void> {
  const rows = await tx.inventoryReservation.findMany({ where: { orderId, status: "ACTIVE" } });
  for (const r of rows) {
    await tx.$executeRaw`
      UPDATE "Inventory"
      SET "onHand" = "onHand" - ${r.qty}, "reserved" = MAX("reserved" - ${r.qty}, 0), "updatedAt" = ${new Date().toISOString()}
      WHERE "variantId" = ${r.variantId}`;
    await tx.inventoryReservation.update({ where: { id: r.id }, data: { status: "CONVERTED" } });
  }
}

/** Release ACTIVE reservations (order cancelled / payment failed). */
export async function releaseReservations(tx: Tx, opts: { orderId?: string; userId?: string } = {}): Promise<void> {
  const rows = await tx.inventoryReservation.findMany({
    where: { status: "ACTIVE", ...(opts.orderId ? { orderId: opts.orderId } : {}), ...(opts.userId ? { userId: opts.userId } : {}) },
  });
  for (const r of rows) {
    await tx.$executeRaw`
      UPDATE "Inventory"
      SET "reserved" = MAX("reserved" - ${r.qty}, 0), "updatedAt" = ${new Date().toISOString()}
      WHERE "variantId" = ${r.variantId}`;
    await tx.inventoryReservation.update({ where: { id: r.id }, data: { status: "RELEASED" } });
  }
}

/**
 * Sweep expired reservations (lazy cron). Called before cart validation and
 * order placement. Returns the number of swept reservations.
 */
export async function sweepExpiredReservations(): Promise<number> {
  const expired = await db.inventoryReservation.findMany({
    where: { status: "ACTIVE", expiresAt: { lt: new Date() } },
    take: 200,
  });
  for (const r of expired) {
    await db.$transaction(async (tx) => {
      const stillActive = await tx.inventoryReservation.findFirst({ where: { id: r.id, status: "ACTIVE" } });
      if (!stillActive) return;
      await tx.$executeRaw`
        UPDATE "Inventory"
        SET "reserved" = MAX("reserved" - ${r.qty}, 0), "updatedAt" = ${new Date().toISOString()}
        WHERE "variantId" = ${r.variantId}`;
      await tx.inventoryReservation.update({ where: { id: r.id }, data: { status: "EXPIRED" } });
    });
  }
  return expired.length;
}

/** Increase onHand stock (seller inventory update / return restock). */
export async function adjustStock(tx: Tx, variantId: string, deltaOnHand: number): Promise<number> {
  await tx.$executeRaw`
    UPDATE "Inventory"
    SET "onHand" = MAX("onHand" + ${deltaOnHand}, 0), "updatedAt" = ${new Date().toISOString()}
    WHERE "variantId" = ${variantId}`;
  const inv = await tx.inventory.findUnique({ where: { variantId } });
  return inv ? inv.onHand - inv.reserved : 0;
}
