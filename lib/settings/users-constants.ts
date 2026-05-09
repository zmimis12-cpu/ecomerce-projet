/**
 * lib/settings/users-constants.ts
 * Pure constants — no server code, safe to import anywhere.
 */

export type AppRole =
  | "super_admin" | "admin" | "manager" | "finance"
  | "scanner_agent" | "call_center_agent" | "media_buyer" | "viewer";

export const ROLE_LABELS: Record<AppRole, string> = {
  super_admin:       "Super Admin",
  admin:             "Admin",
  manager:           "Manager",
  finance:           "Finance",
  scanner_agent:     "Scanner",
  call_center_agent: "Call Center",
  media_buyer:       "Media Buyer",
  viewer:            "Viewer",
};

export const ROLE_COLORS: Record<AppRole, string> = {
  super_admin:       "bg-red-100 text-red-800",
  admin:             "bg-purple-100 text-purple-800",
  manager:           "bg-blue-100 text-blue-800",
  finance:           "bg-green-100 text-green-800",
  scanner_agent:     "bg-amber-100 text-amber-800",
  call_center_agent: "bg-orange-100 text-orange-800",
  media_buyer:       "bg-pink-100 text-pink-800",
  viewer:            "bg-gray-100 text-gray-600",
};

export const ROLE_MODULES: Record<AppRole, string[]> = {
  super_admin:       ["dashboard","orders","stock","scanner","returns","finance","ads","call_center","digylog","settings","users","audit_logs"],
  admin:             ["dashboard","orders","stock","scanner","returns","finance","call_center","digylog","settings","users","audit_logs"],
  manager:           ["dashboard","orders","stock","scanner","returns","finance","call_center","digylog"],
  finance:           ["dashboard","finance","orders","digylog"],
  scanner_agent:     ["scanner","returns"],
  call_center_agent: ["call_center","orders"],
  media_buyer:       ["dashboard","ads","finance"],
  viewer:            ["dashboard","orders"],
};

export const ALL_ROLES: AppRole[] = [
  "super_admin","admin","manager","finance",
  "scanner_agent","call_center_agent","media_buyer","viewer",
];

export const ALL_MODULES = [
  "dashboard","orders","stock","scanner","returns",
  "finance","ads","call_center","digylog","settings","users","audit_logs",
];

export type UserRow = {
  id:         string;
  email:      string;
  full_name:  string;
  role:       AppRole;
  is_active:  boolean;
  created_at: string;
};
