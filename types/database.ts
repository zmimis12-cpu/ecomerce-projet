/**
 * Database type stubs — replace with generated types after migrations are applied.
 *
 * Generate full types:
 *   npx supabase gen types typescript --project-id <ref> > types/database.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole =
  | "super_admin"
  | "admin"
  | "manager"
  | "call_center_agent"
  | "scanner_agent"
  | "finance"
  | "viewer"
  // Legacy values — kept for backward compat
  | "agent"
  | "accountant"
  | "warehouse"
  | "readonly";

export interface Database {
  public: {
    Tables: {
      users: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          phone: string | null;
          role: UserRole;
          is_active: boolean;
          avatar_url: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["users"]["Row"],
          "created_at" | "updated_at"
        >;
        Update: Partial<
          Database["public"]["Tables"]["users"]["Insert"]
        >;
      };
      shops: {
        Row: {
          id: string;
          name: string;
          code: string;
          city: string | null;
          address: string | null;
          phone: string | null;
          email: string | null;
          is_active: boolean;
          is_default: boolean;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: Omit<
          Database["public"]["Tables"]["shops"]["Row"],
          "created_at" | "updated_at"
        >;
        Update: Partial<Database["public"]["Tables"]["shops"]["Insert"]>;
      };
    };
    Views: Record<string, never>;
    Functions: {
      /** Auto-creates a public.users row for an auth user if missing */
      get_or_create_profile: {
        Args: { p_user_id: string };
        Returns: Database["public"]["Tables"]["users"]["Row"];
      };
      /** Promotes a user to super_admin by email */
      promote_to_super_admin: {
        Args: { p_email: string };
        Returns: string;
      };
    };
    Enums: {
      user_role: UserRole;
    };
  };
}

/** Full public.users row */
export type AppUser = Database["public"]["Tables"]["users"]["Row"];

/** Shape returned by getSession() / requireUser() */
export interface SessionUser {
  authId: string;
  authEmail: string;
  profile: AppUser | null;
  role: UserRole;
  displayName: string;
  hasProfile: boolean;
}
