import { NextRequest, NextResponse } from "next/server";
import { listVenues } from "@/lib/findSlots";

export const revalidate = 3600;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const sport = (sp.get("sport") as "futsal" | "football" | "both") || "both";
  try {
    const venues = await listVenues(sport);
    return NextResponse.json({ venues });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
