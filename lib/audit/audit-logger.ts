/**
 * lib/audit/audit-logger.ts
 * Reusable audit logging helper.
 * Always async — never blocks main actions.
 *
 * Usage:
 *   import { createAuditLog } from "@/lib/audit/audit-logger";
 *   createAuditLog({ userId, actionType: "STATUS_CHANGE", entityType: "order", ... });
 */
import { supabaseAdmin } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────
export type AuditActionType =
  | "CREATE" | "UPDATE" | "DELETE" | "STATUS_CHANGE"
  | "STOCK_MOVEMENT" | "IMPORT" | "SYNC"
  | "LOGIN" | "LOGOUT" | "FAILED_ACTION"
  | "DUPLICATE_BLOCKED" | "SCAN" | "RECONCILE";

export type AuditEntityType =
  | "order" | "stock" | "product" | "delivery_batch"
  | "digylog_document" | "scanner_event" | "finance_invoice"
  | "user" | "settings" | "return" | "webhook";

export interface AuditLogParams {
  userId:       string | null;
  userLabel?:   string;               // snapshot of name/email
  actionType:   AuditActionType;
  entityType:   AuditEntityType;
  entityId?:    string | null;
  entityLabel?: string;               // e.g. "HC-01086", "FOAM CLEANER"
  oldData?:     Record<string, unknown> | null;
  newData?:     Record<string, unknown> | null;
  changedFields?: string[];
  sourceModule: string;               // e.g. "scanner", "webhook", "sheet-sync"
  ipAddress?:   string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main helper — fire and forget, never throws
// ─────────────────────────────────────────────────────────────────────────────
export function createAuditLog(params: AuditLogParams): void {
  // Compute changed_fields if not provided but old+new data given
  let changedFields = params.changedFields;
  if (!changedFields && params.oldData && params.newData) {
    const allKeys = new Set([
      ...Object.keys(params.oldData),
      ...Object.keys(params.newData),
    ]);
    changedFields = [...allKeys].filter(
      (k) => JSON.stringify(params.oldData![k]) !== JSON.stringify(params.newData![k])
    );
  }

  // Fire and forget — never await, never block
  supabaseAdmin.from("audit_logs").insert({
    user_id:            params.userId,
    user_name_snapshot: params.userLabel ?? null,
    action:             params.actionType,
    action_type:        params.actionType,
    entity_type:        params.entityType,
    entity_id:          params.entityId ?? null,
    entity_label:       params.entityLabel ?? null,
    table_name:         params.entityType,
    record_id:          params.entityId ?? null,
    old_data:           params.oldData ?? null,
    new_data:           params.newData ?? null,
    changed_fields:     changedFields ?? null,
    source_module:      params.sourceModule,
    ip_address:         params.ipAddress ?? null,
  } as never).then(() => {}, (err) => {
    console.error("[audit] Insert failed:", err?.message);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrappers
// ─────────────────────────────────────────────────────────────────────────────
export function auditStatusChange(params: {
  userId: string | null;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  oldStatus: string;
  newStatus: string;
  sourceModule: string;
}) {
  createAuditLog({
    userId:       params.userId,
    actionType:   "STATUS_CHANGE",
    entityType:   params.entityType,
    entityId:     params.entityId,
    entityLabel:  params.entityLabel,
    oldData:      { status: params.oldStatus },
    newData:      { status: params.newStatus },
    changedFields:["status"],
    sourceModule: params.sourceModule,
  });
}

export function auditStockMovement(params: {
  userId: string | null;
  productId: string;
  productName: string;
  movementType: string;
  qtyBefore: number;
  qtyAfter: number;
  sourceModule: string;
  orderId?: string;
}) {
  createAuditLog({
    userId:       params.userId,
    actionType:   "STOCK_MOVEMENT",
    entityType:   "stock",
    entityId:     params.productId,
    entityLabel:  params.productName,
    oldData:      { quantity: params.qtyBefore },
    newData:      { quantity: params.qtyAfter, movement_type: params.movementType },
    changedFields:["quantity"],
    sourceModule: params.sourceModule,
  });
}

export function auditImport(params: {
  userId: string | null;
  entityType: AuditEntityType;
  entityId: string;
  entityLabel: string;
  sourceModule: string;
  count?: number;
}) {
  createAuditLog({
    userId:       params.userId,
    actionType:   "IMPORT",
    entityType:   params.entityType,
    entityId:     params.entityId,
    entityLabel:  params.entityLabel,
    newData:      { imported_count: params.count ?? 1 },
    sourceModule: params.sourceModule,
  });
}

export function auditWebhook(params: {
  tracking: string;
  orderId: string | null;
  oldStatus: string;
  newStatus: string;
  source: string;
}) {
  createAuditLog({
    userId:       null,
    actionType:   "STATUS_CHANGE",
    entityType:   "webhook",
    entityId:     params.orderId ?? params.tracking,
    entityLabel:  params.tracking,
    oldData:      { status: params.oldStatus },
    newData:      { status: params.newStatus },
    changedFields:["status"],
    sourceModule: params.source,
  });
}

export function auditScanEvent(params: {
  userId: string;
  tracking: string;
  orderId: string | null;
  scanType: string;
  status: "success" | "duplicate" | "error" | "blocked";
  sourceModule: string;
}) {
  createAuditLog({
    userId:       params.userId,
    actionType:   params.status === "duplicate" ? "DUPLICATE_BLOCKED" : "SCAN",
    entityType:   "scanner_event",
    entityId:     params.orderId ?? params.tracking,
    entityLabel:  params.tracking,
    newData:      { scan_type: params.scanType, status: params.status },
    sourceModule: params.sourceModule,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Query for admin UI
// ─────────────────────────────────────────────────────────────────────────────
export async function getAuditLogs(filters?: {
  userId?:      string;
  actionType?:  string;
  entityType?:  string;
  sourceModule?: string;
  from?:        string;
  to?:          string;
  search?:      string;
  limit?:       number;
  offset?:      number;
}) {
  let q = supabaseAdmin
    .from("audit_logs")
    .select("id,user_id,user_name_snapshot,action,action_type,entity_type,entity_id,entity_label,changed_fields,source_module,created_at,old_data,new_data", { count: "exact" })
    .order("created_at", { ascending: false });

  if (filters?.userId)       q = q.eq("user_id", filters.userId);
  if (filters?.actionType)   q = q.eq("action_type", filters.actionType);
  if (filters?.entityType)   q = q.eq("entity_type", filters.entityType);
  if (filters?.sourceModule) q = q.eq("source_module", filters.sourceModule);
  if (filters?.from)         q = q.gte("created_at", filters.from);
  if (filters?.to)           q = q.lte("created_at", filters.to);
  if (filters?.search) {
    q = q.or(`entity_label.ilike.%${filters.search}%,entity_id.ilike.%${filters.search}%,user_name_snapshot.ilike.%${filters.search}%`);
  }

  q = q.range(filters?.offset ?? 0, (filters?.offset ?? 0) + (filters?.limit ?? 50) - 1);

  const { data, count } = await q;
  return { logs: (data ?? []) as AuditLogRow[], total: count ?? 0 };
}

export type AuditLogRow = {
  id: string;
  user_id: string | null;
  user_name_snapshot: string | null;
  action: string;
  action_type: string | null;
  entity_type: string | null;
  entity_id: string | null;
  entity_label: string | null;
  changed_fields: string[] | null;
  source_module: string | null;
  created_at: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};
