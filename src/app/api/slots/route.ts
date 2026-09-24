import { NextRequest, NextResponse } from "next/server";
import { findSlots, upcomingFriday } from "@/lib/findSlots";

export const revalidate = 0;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date") || upcomingFriday();
  const sport = (sp.get("sport") as "futsal" | "football" | "both") || "both";
  const timeFrom = sp.get("timeFrom") || "20:00";
  const timeTo = sp.get("timeTo") || undefined;
  const area = sp.get("area") || undefined;

  try {
    const result = await findSlots({ date, sport, timeFrom, timeTo, area });
    return NextResponse.json(result, {
      headers: { "Cache-Control": "s-maxage=60, stale-while-revalidate=120" },
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 502 });
  }
}
