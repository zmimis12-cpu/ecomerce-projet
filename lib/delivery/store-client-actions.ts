"use server";
/**
 * lib/delivery/store-client-actions.ts
 * Server actions only — no top-level supabaseAdmin import.
 * Safe to import from client components.
 * All heavy imports are lazy (inside functions).
 */

export type { DeliveryStoreRow, StoreFormData } from "./store-actions-types";

export async function createDeliveryStore(
  data: import("./store-actions-types").StoreFormData
): Promise<{ success: boolean; id?: string; error?: string }> {
  const { createDeliveryStore: fn } = await import("./store-actions");
  return fn(data);
}

export async function updateDeliveryStore(
  id: string,
  data: Partial<import("./store-actions-types").StoreFormData> & { clearToken?: boolean }
): Promise<{ success: boolean; error?: string }> {
  const { updateDeliveryStore: fn } = await import("./store-actions");
  return fn(id, data);
}

export async function testStoreConnection(
  id: string
): Promise<{ success: boolean; message: string }> {
  const { testStoreConnection: fn } = await import("./store-actions");
  return fn(id);
}
