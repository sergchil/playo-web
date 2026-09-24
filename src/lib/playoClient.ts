/**
 * Thin server-side client for Playo's public (no-login) web API at api.playo.io.
 *
 * Reverse-engineered from playo.co's own frontend calls; not an official API.
 * Read-only: venue list, venue search, per-day court availability.
 * Ported from ~/playo-mcp/playo_mcp/client.py.
 */

const API = "https://api.playo.io";
// Public token shipped in playo.co's frontend bundle (not tied to any user).
const HEADERS: Record<string, string> = {
  authorization: "5534898698eb3426d00168b6ed447d23d000026552ed6200",
  devicetype: "99",
  accept: "application/json",
  "content-type": "application/json",
  "user-agent": "Mozilla/5.0 (playo-web availability checker)",
};

export const SPORTS: Record<string, string> = { futsal: "SP44", football: "SP2" };
export const SPORT_NAMES: Record<string, string> = Object.fromEntries(
  Object.entries(SPORTS).map(([k, v]) => [v, k])
);
const DUBAI: [number, number] = [25.2048, 55.2708];
const CITY = "Dubai";

export interface Venue {
  id: string;
  name: string;
  area: string | null;
  city: string | null;
  lat: number | null;
  lng: number | null;
  rating: number;
  sports: string[];
  url: string | null;
  bookingUrl: string;
  /** Venue photos (Gumlet CDN; append ?w=…&format=auto to resize). */
  images: string[];
  amenities: string[];
}

async function req(method: string, path: string, body?: unknown, params?: Record<string, string | number>) {
  let url = `${API}${path}`;
  if (params) {
    const qs = new URLSearchParams(
      Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)]))
    );
    url += `?${qs.toString()}`;
  }
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        method,
        headers: HEADERS,
        body: body ? JSON.stringify(body) : undefined,
        // Playo responses are small; no special caching needed here, callers cache.
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
    }
  }
  throw new Error(`Playo API failed for ${path}: ${lastErr}`);
}

function slimVenue(v: Record<string, unknown>): Venue {
  const geo = (v.geoLocation as { coordinates?: [number, number] } | undefined)?.coordinates || [null, null];
  const keywords = (v.keywords as { key: string; active?: boolean }[] | undefined) || [];
  const keys = keywords.filter((k) => k.active).map((k) => k.key);
  const id = v.id as string;
  return {
    id,
    name: (v.name as string).trim(),
    area: (v.area as string) ?? null,
    city: (v.city as string) ?? null,
    lat: geo[1] as number | null,
    lng: geo[0] as number | null,
    rating: Math.round(((v.avgRating as number) || 0) * 10) / 10,
    sports: (v.sports as string[]) || [],
    url: keys[0] ? `https://playo.co/venues/dubai/${keys[0]}` : null,
    bookingUrl: `https://playo.co/booking?venueId=${id}`,
    images: [v.coverImage as string, ...(((v.images as { url?: string }[]) || []).map((i) => i.url as string))]
      .filter((u): u is string => typeof u === "string" && u.startsWith("http"))
      .filter((u, i, a) => a.indexOf(u) === i)
      .slice(0, 8),
    amenities: ((v.amenities as string[]) || []).slice(0, 6),
  };
}

// In-memory cache per serverless instance (best-effort; each cold start refetches).
const venueCache = new Map<string, { at: number; venues: Venue[] }>();
const VENUE_TTL_MS = 12 * 3600 * 1000;

export async function dubaiVenues(sportId: string): Promise<Venue[]> {
  const cached = venueCache.get(sportId);
  if (cached && Date.now() - cached.at < VENUE_TTL_MS) return cached.venues;

  const raw = new Map<string, Record<string, unknown>>();
  for (let page = 0; page < 60; page++) {
    const d = await req("POST", "/venue-public/v2/list", {
      lat: DUBAI[0],
      lng: DUBAI[1],
      sportId: [sportId],
      page,
    });
    const data = d.data || {};
    const batch: Record<string, unknown>[] = data.venueList || [];
    for (const v of batch) raw.set(v.id as string, v);
    if (!batch.length || data.nextPage === -1 || data.nextPage == null) break;
  }
  const venues = Array.from(raw.values())
    .filter(
      (v) =>
        v.city === CITY &&
        v.isBookable &&
        ((v.sports as string[]) || []).includes(sportId)
    )
    .map(slimVenue);
  venueCache.set(sportId, { at: Date.now(), venues });
  return venues;
}

export async function searchVenues(query: string): Promise<Venue[]> {
  const d = await req("GET", "/venue-public/v2/search", undefined, {
    lat: DUBAI[0],
    lng: DUBAI[1],
    searchQuery: query,
    category: "venue",
  });
  const out: Venue[] = [];
  for (const v of (d.data || {}).venueList || []) {
    if (v.city !== CITY) continue;
    const id = v.oldPlayoId || v.id;
    out.push(slimVenue({ ...v, id }));
  }
  return out;
}

export interface SlotInfo {
  status: number;
  price: number;
  time: string;
}
export interface CourtInfo {
  courtName: string;
  courtId: number;
  slotInfo: SlotInfo[];
  slotConfig?: { minSlots?: number; maxSlots?: number };
  bookingTimeBuffer?: number;
}
export interface AvailabilityData {
  minSlotDuration?: number;
  courtInfo?: CourtInfo[];
  currency?: string;
  timezone?: string;
}

export async function availability(venueId: string, sportId: string, date: string): Promise<AvailabilityData> {
  const d = await req("GET", `/booking-lab-public/availability/v1/${venueId}/${sportId}/${date}`);
  return d.data || {};
}
