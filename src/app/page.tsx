"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FindSlotsResult, SlotResult } from "@/lib/findSlots";
import { useFavorites } from "@/lib/useFavorites";

type Sport = "both" | "football" | "futsal";

function upcomingFridayLocal(): string {
  const now = new Date();
  const day = now.getDay();
  const diff = (5 - day + 7) % 7;
  const target = new Date(now);
  target.setDate(now.getDate() + diff);
  return target.toISOString().slice(0, 10);
}

const PAGE_SIZE = 15;

export default function Home() {
  const [date, setDate] = useState(upcomingFridayLocal());
  const [sport, setSport] = useState<Sport>("both");
  const [timeFrom, setTimeFrom] = useState("20:00");
  const [area, setArea] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<FindSlotsResult | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { favorites, isFavorite, toggle, loaded } = useFavorites();

  const fetchSlots = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ date, sport, timeFrom, duration: "60" });
      if (area.trim()) qs.set("area", area.trim());
      const res = await fetch(`/api/slots?${qs.toString()}`);
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const json: FindSlotsResult = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [date, sport, timeFrom, area]);

  useEffect(() => {
    fetchSlots();
  }, [fetchSlots]);

  // Reset pagination/expansion whenever the filters change.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
    setExpanded(new Set());
  }, [date, sport, timeFrom, area, favoritesOnly]);

  const results = useMemo(() => {
    if (!data) return [];
    if (!favoritesOnly) return data.results;
    return data.results.filter((r) => favorites.includes(r.venue));
  }, [data, favoritesOnly, favorites]);

  const grouped = useMemo(() => {
    const map = new Map<string, SlotResult[]>();
    for (const r of results) {
      const key = r.venue;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(r);
    }
    // favourites float to top
    return Array.from(map.entries()).sort((a, b) => {
      const favA = isFavorite(a[0]) ? 0 : 1;
      const favB = isFavorite(b[0]) ? 0 : 1;
      if (favA !== favB) return favA - favB;
      return a[0].localeCompare(b[0]);
    });
  }, [results, isFavorite]);

  return (
    <main className="flex-1 flex flex-col max-w-2xl w-full mx-auto px-4 pb-24 pt-4 sm:px-6">
      <header className="mb-4">
        <h1 className="text-xl font-semibold tracking-tight">⚽ Playo Slots — Dubai</h1>
        <p className="text-sm text-slate-400 mt-1">
          Live availability & prices. No login, no booking here — tap through to Playo to book.
        </p>
      </header>

      <section className="sticky top-0 z-10 bg-slate-950/95 backdrop-blur -mx-4 px-4 py-3 sm:-mx-6 sm:px-6 border-b border-slate-800">
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col text-xs text-slate-400 gap-1">
            Date
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100"
            />
          </label>
          <label className="flex flex-col text-xs text-slate-400 gap-1">
            After
            <input
              type="time"
              value={timeFrom}
              onChange={(e) => setTimeFrom(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-2 text-sm text-slate-100"
            />
          </label>
        </div>

        <div className="flex gap-2 mt-2">
          {(["both", "football", "futsal"] as Sport[]).map((s) => (
            <button
              key={s}
              onClick={() => setSport(s)}
              className={`flex-1 capitalize text-sm rounded-lg px-3 py-2 border ${
                sport === s
                  ? "bg-emerald-600 border-emerald-500 text-white"
                  : "bg-slate-900 border-slate-700 text-slate-300"
              }`}
            >
              {s === "both" ? "All sports" : s}
            </button>
          ))}
        </div>

        <div className="flex gap-2 mt-2">
          <input
            type="text"
            placeholder="Filter by area (e.g. Al Quoz, Barsha)"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500"
          />
          <button
            onClick={() => setFavoritesOnly((v) => !v)}
            className={`shrink-0 text-sm rounded-lg px-3 py-2 border ${
              favoritesOnly
                ? "bg-amber-500 border-amber-400 text-slate-950"
                : "bg-slate-900 border-slate-700 text-slate-300"
            }`}
          >
            ★ Favorites{favoritesOnly ? "" : " only"}
          </button>
        </div>
      </section>

      <section className="mt-4 flex-1">
        {loading && <p className="text-sm text-slate-400 py-8 text-center">Checking Playo…</p>}
        {error && (
          <p className="text-sm text-red-400 py-4 text-center">
            Couldn&apos;t load availability: {error}
          </p>
        )}
        {!loading && !error && loaded && grouped.length === 0 && (
          <p className="text-sm text-slate-400 py-8 text-center">
            No free slots match your filters. Try an earlier time or a different date.
          </p>
        )}

        <ul className="flex flex-col gap-3">
          {grouped.slice(0, visibleCount).map(([venue, courts]) => {
            const isOpen = expanded.has(venue);
            const earliestPerCourt = courts.map((c) => c.available[0]);
            const cheapest = [...earliestPerCourt].sort((a, b) => a.pricePerHourAed - b.pricePerHourAed)[0];
            return (
              <li key={venue} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                <button
                  className="w-full flex items-start justify-between gap-2 text-left"
                  onClick={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      next.has(venue) ? next.delete(venue) : next.add(venue);
                      return next;
                    })
                  }
                >
                  <div className="min-w-0">
                    <h2 className="font-medium text-slate-100 truncate">{venue}</h2>
                    <p className="text-xs text-slate-500">
                      {courts[0].area} · {courts[0].sport}
                      {!isOpen && (
                        <>
                          {" "}
                          · from {cheapest.start} · AED {cheapest.pricePerHourAed}/hr
                        </>
                      )}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggle(venue);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.stopPropagation();
                          toggle(venue);
                        }
                      }}
                      aria-label="Toggle favorite"
                      className={`text-xl leading-none ${isFavorite(venue) ? "text-amber-400" : "text-slate-600"}`}
                    >
                      {isFavorite(venue) ? "★" : "☆"}
                    </span>
                    <span className="text-slate-500 text-xs">{isOpen ? "▲" : "▼"}</span>
                  </div>
                </button>

                {isOpen && (
                  <div className="flex flex-col gap-2 mt-2">
                    {courts.map((c) => (
                      <div key={c.court} className="border-t border-slate-800 pt-2 first:border-t-0 first:pt-0">
                        <p className="text-xs text-slate-400 mb-1">
                          {c.court}
                          {c.format ? ` · ${c.format}` : ""}
                          {c.setting ? ` · ${c.setting}` : ""}
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {c.available.map((slot) => (
                            <a
                              key={slot.start}
                              href={c.bookingUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs bg-slate-800 hover:bg-slate-700 rounded-full px-2.5 py-1 text-slate-200"
                            >
                              {slot.start} · AED {slot.priceAed}
                            </a>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        {grouped.length > visibleCount && (
          <button
            onClick={() => setVisibleCount((v) => v + PAGE_SIZE)}
            className="w-full mt-3 text-sm text-slate-300 bg-slate-900 border border-slate-800 rounded-lg py-2"
          >
            Show more ({grouped.length - visibleCount} left)
          </button>
        )}
      </section>

      <footer className="text-center text-[11px] text-slate-600 pt-6 pb-2">
        Unofficial Playo data, personal use. Prices/availability can change on Playo before you book.
      </footer>
    </main>
  );
}
