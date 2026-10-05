/** POST /api/public/lp-view — compte une vue de landing page (appelé par le navigateur). */
import { NextResponse, type NextRequest } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: NextRequest) {
  try {
    const { slug } = JSON.parse(await req.text()) as { slug?: string };
    if (slug && /^[a-z0-9-]{1,80}$/i.test(slug)) {
      await supabaseAdmin.rpc("increment_lp_views" as never, { p_slug: slug } as never);
    }
  } catch { /* ignore */ }
  return new NextResponse(null, { status: 204 });
}
