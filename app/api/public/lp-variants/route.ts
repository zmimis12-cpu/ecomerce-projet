/** Carte des pages complètes par avatar — servie en cache (5 min), lue par le middleware. */
import { NextResponse } from "next/server";
import { getLpVariants } from "@/lib/store/lp-design";

export const revalidate = 300;

export async function GET() {
  return NextResponse.json(await getLpVariants(), { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600" } });
}
