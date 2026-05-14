import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Lightweight endpoint — only returns availability + last_seen_at
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin
      .from("users")
      .select("id, availability_status, last_seen_at")
      .eq("role", "call_center_agent")
      .eq("is_active", true);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data ?? []);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
