/**
 * Core slot-finding logic, ported from ~/playo-mcp/playo_mcp/server.py.
 *
 * Playo slot `status` = remaining capacity; 0 means booked (verified against
 * the playo.co booking page). Bookable start times require `duration` minutes
 * of consecutive free slots, respecting each court's min/max slot config.
 */
import { AvailabilityData, CourtInfo, SPORT_NAMES, Venue, availability, dubaiVenues } from "./playoClient";
import { parseFormat, parseSetting } from "./parse";

const DUBAI_OFFSET_MIN = 4 * 60; // UTC+4, no DST

function nowInDubai(): Date {
  const utc = Date.now() + new Date().getTimezoneOffset() * 60000;
  return new Date(utc + DUBAI_OFFSET_MIN * 60000);
}

function mins(hhmm: string): number {
  const [h, m] = hhmm.split(":").map((x) => parseInt(x, 10));
  return h * 60 + (m || 0);
}

function hhmm(totalMins: number): string {
  const h = Math.floor(totalMins / 60) % 24;
  const m = totalMins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export interface BookableStart {
  start: string;
  end: string;
  durationMin: number;
  priceAed: number;
  pricePerHourAed: number;
}

/** We only ever book 1–2 hours; never report a longer block than this even if more is free. */
const REPORT_CAP_MIN = 120;
/** Below this, it's "only 30 minutes" — not worth showing. */
const MIN_USEFUL_MIN = 60;

/**
 * For each valid start time, find the MAXIMUM continuous duration bookable
 * from there (respecting the court's minSlots/maxSlots), capped at 2h.
 * Starts that can't reach at least 1 hour are dropped entirely.
 */
function bookableWindows(
  court: CourtInfo,
  slotLen: number,
  date: string,
  tFrom: number,
  tTo: number | null
): BookableStart[] {
  const free = new Map<number, number>();
  for (const s of court.slotInfo || []) {
    if ((s.status || 0) > 0) free.set(mins(s.time), s.price || 0);
  }
  const now = nowInDubai();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  let earliest = 0;
  if (date === todayStr) {
    earliest = now.getHours() * 60 + now.getMinutes() + (court.bookingTimeBuffer || 0);
  }
  const minN = court.slotConfig?.minSlots ?? 1;
  const maxN = court.slotConfig?.maxSlots ?? 10000;
  const capN = Math.max(Math.floor(REPORT_CAP_MIN / slotLen), minN); // never cap below the venue's own minimum
  const starts = Array.from(free.keys()).sort((a, b) => a - b);
  const startSet = new Set(starts);
  const out: BookableStart[] = [];
  for (const start of starts) {
    if (start < tFrom || start < earliest) continue;
    if (tTo !== null && start > tTo) continue;
    // Count consecutive free slots from this start.
    let run = 0;
    while (startSet.has(start + run * slotLen)) run++;
    if (run < minN) continue; // can't even meet the venue's minimum booking length
    const n = Math.min(run, maxN, capN);
    const durationMin = n * slotLen;
    if (durationMin < MIN_USEFUL_MIN) continue; // "only 30 minutes" — drop
    const parts = Array.from({ length: n }, (_, i) => start + i * slotLen);
    const total = parts.reduce((sum, p) => sum + (free.get(p) || 0), 0);
    out.push({
      start: hhmm(start),
      end: hhmm(start + durationMin),
      durationMin,
      priceAed: Math.round(total * 100) / 100,
      pricePerHourAed: Math.round(((total * 60) / durationMin) * 100) / 100,
    });
  }
  // Longest bookable block first (2h, then 1.5h, then 1h), then earliest start.
  out.sort((a, b) => b.durationMin - a.durationMin || a.start.localeCompare(b.start));
  return out;
}

export interface FreeWindow {
  /** First bookable start (HH:MM). */
  from: string;
  /** When the free stretch ends (HH:MM; "00:00" = midnight). */
  to: string;
  durationMin: number;
  pricePerHourAed: number;
}

/**
 * Continuous free stretches on a court, clipped to [tFrom, tTo] and to "now"
 * for today. This is what a person actually needs: "free 20:00 → 00:00",
 * then they pick any start inside it on Playo.
 */
function freeWindows(
  court: CourtInfo,
  slotLen: number,
  date: string,
  tFrom: number,
  tTo: number | null
): FreeWindow[] {
  const free = new Map<number, number>();
  for (const s of court.slotInfo || []) {
    if ((s.status || 0) > 0) free.set(mins(s.time), s.price || 0);
  }
  const now = nowInDubai();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate()
  ).padStart(2, "0")}`;
  const earliest = date === todayStr ? now.getHours() * 60 + now.getMinutes() + (court.bookingTimeBuffer || 0) : 0;
  const minLen = Math.max(MIN_USEFUL_MIN, (court.slotConfig?.minSlots ?? 1) * slotLen);
  const starts = Array.from(free.keys())
    .filter((t) => t >= tFrom && t >= earliest && (tTo === null || t <= tTo))
    .sort((a, b) => a - b);
  const out: FreeWindow[] = [];
  let i = 0;
  while (i < starts.length) {
    let j = i;
    while (j + 1 < starts.length && starts[j + 1] === starts[j] + slotLen) j++;
    const from = starts[i];
    const end = starts[j] + slotLen;
    const durationMin = end - from;
    if (durationMin >= minLen) {
      let total = 0;
      for (let t = from; t < end; t += slotLen) total += free.get(t) || 0;
      out.push({
        from: hhmm(from),
        to: hhmm(end),
        durationMin,
        pricePerHourAed: Math.round((total * 60) / durationMin),
      });
    }
    i = j + 1;
  }
  return out;
}

export interface SlotResult {
  venue: string;
  area: string | null;
  venueId: string;
  sport: string;
  court: string;
  format: string | null;
  formatSource: string;
  setting: string | null;
  settingSource: string;
  slotLengthMin: number;
  available: BookableStart[];
  maxDurationMin: number;
  windows: FreeWindow[];
  /** Longest single booking the venue allows on this court (its maxSlots). */
  maxBookMin: number;
  bookingUrl: string;
}

async function venueSlots(
  v: Venue,
  sportId: string,
  date: string,
  tFrom: number,
  tTo: number | null
): Promise<SlotResult[]> {
  let d: AvailabilityData;
  try {
    d = await availability(v.id, sportId, date);
  } catch {
    return [];
  }
  const slotLen = d.minSlotDuration || 60;
  const rows: SlotResult[] = [];
  for (const court of d.courtInfo || []) {
    const name = court.courtName.replace(/\s+/g, " ").trim();
    const fmt = parseFormat(name, sportId);
    const st = parseSetting(name);
    const starts = bookableWindows(court, slotLen, date, tFrom, tTo);
    if (!starts.length) continue;
    rows.push({
      venue: v.name,
      area: v.area,
      venueId: v.id,
      sport: SPORT_NAMES[sportId],
      court: name,
      format: fmt.format,
      formatSource: fmt.formatSource,
      setting: st.setting,
      settingSource: st.settingSource,
      slotLengthMin: slotLen,
      available: starts,
      maxDurationMin: starts[0].durationMin,
      windows: freeWindows(court, slotLen, date, tFrom, tTo),
      maxBookMin: (court.slotConfig?.maxSlots ?? 10000) * slotLen,
      bookingUrl: v.bookingUrl,
    });
  }
  return rows;
}

export interface FindSlotsParams {
  date: string;
  sport: "futsal" | "football" | "both";
  timeFrom: string;
  timeTo?: string;
  area?: string;
}

export interface FindSlotsResult {
  date: string;
  venuesChecked: number;
  courtsFound: number;
  results: SlotResult[];
}

export async function findSlots(params: FindSlotsParams): Promise<FindSlotsResult> {
  const { date, sport, timeFrom, timeTo, area } = params;
  const tFrom = mins(timeFrom);
  const tTo = timeTo ? mins(timeTo) : null;
  const sportIds = sport === "both" ? ["SP44", "SP2"] : [sport === "futsal" ? "SP44" : "SP2"];

  let checked = 0;
  const jobs: Promise<SlotResult[]>[] = [];
  for (const sportId of sportIds) {
    const venues = await dubaiVenues(sportId);
    for (const v of venues) {
      if (area && !(v.area || "").toLowerCase().includes(area.toLowerCase())) continue;
      checked++;
      jobs.push(venueSlots(v, sportId, date, tFrom, tTo));
    }
  }
  const results = (await Promise.all(jobs)).flat();
  // Courts that can host the longest continuous booking come first (2h, then 1.5h, then 1h),
  // then earliest start time, then cheapest per hour.
  results.sort((a, b) => {
    if (b.maxDurationMin !== a.maxDurationMin) return b.maxDurationMin - a.maxDurationMin;
    const t = a.available[0].start.localeCompare(b.available[0].start);
    if (t !== 0) return t;
    return a.available[0].pricePerHourAed - b.available[0].pricePerHourAed;
  });
  return { date, venuesChecked: checked, courtsFound: results.length, results };
}

export async function listVenues(sport: "futsal" | "football" | "both" = "futsal") {
  const sportIds = sport === "both" ? ["SP44", "SP2"] : [sport === "futsal" ? "SP44" : "SP2"];
  const out = new Map<string, Venue & { sports: string[] }>();
  for (const sportId of sportIds) {
    const venues = await dubaiVenues(sportId);
    for (const v of venues) {
      const existing = out.get(v.id);
      if (existing) {
        existing.sports.push(SPORT_NAMES[sportId]);
      } else {
        out.set(v.id, { ...v, sports: [SPORT_NAMES[sportId]] });
      }
    }
  }
  return Array.from(out.values()).sort((a, b) => (a.area || "").localeCompare(b.area || "") || a.name.localeCompare(b.name));
}

/** Upcoming Friday in Dubai time, as YYYY-MM-DD. If today is Friday, returns today. */
export function upcomingFriday(): string {
  const now = nowInDubai();
  const day = now.getDay(); // 0=Sun..6=Sat, Friday=5
  const diff = (5 - day + 7) % 7;
  const target = new Date(now);
  target.setDate(now.getDate() + diff);
  return `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, "0")}-${String(
    target.getDate()
  ).padStart(2, "0")}`;
}
