// lib/delivery/providers/document-sync-types.ts
// Types only — no server imports. Safe to import from client components.

export type DocSyncResult = {
  available: boolean;
  success:   boolean;
  synced:    number;
  message:   string;
};

export type FullSyncResult = {
  storeName:    string;
  providerSlug: string;
  statuses:     DocSyncResult;
  bl:           DocSyncResult;
  invoices:     DocSyncResult;
  refunds:      DocSyncResult;
  br:           DocSyncResult;
  reconciled:   boolean;
  totalSynced:  number;
  fatalError?:  string;
};
