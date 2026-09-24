"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import maplibregl, { type StyleSpecification } from "maplibre-gl";
import { useEffect, useRef, useState } from "react";

export interface MapVenue {
  name: string;
  lat: number;
  lng: number;
  /** "fav" = saved + free, "free" = free, "none" = nothing matching. */
  tone: "fav" | "free" | "none";
  label?: string;
}

const DUBAI: [number, number] = [55.3, 25.16];
// OpenFreeMap: free vector tiles, no API key.
const STYLE_URL = "https://tiles.openfreemap.org/styles/positron";
// Noise we don't need for finding a pitch.
const HIDE = [
  /^building/,
  /^railway/,
  /^aeroway/,
  /^airport/,
  /^highway-shield/,
  /^road_shield/,
  /^highway-name-(path|minor)/,
  /^highway_path/,
  /^waterway/,
  /^water_name_line/,
  /^label_(other|village)/,
  /^boundary/,
  /^landcover/,
  /^landuse/,
];

async function loadStyle(): Promise<StyleSpecification> {
  const s = (await (await fetch(STYLE_URL)).json()) as StyleSpecification;
  s.layers = s.layers.filter((l) => !HIDE.some((re) => re.test(l.id)));
  for (const l of s.layers) {
    const paint = (l as { paint?: Record<string, unknown> }).paint;
    if (!paint) continue;
    // Calm, cool-grey palette to sit under black/green markers.
    if (l.id === "background") paint["background-color"] = "#f4f4f2";
    if (l.id === "water") paint["fill-color"] = "#dfe6ea";
    if (l.id === "park") paint["fill-color"] = "#e9eee6";
    if (l.type === "symbol") {
      paint["text-color"] = "#8a8a8a";
      paint["text-halo-color"] = "#f4f4f2";
    }
  }
  return s;
}

function markerHtml(v: MapVenue, selected: boolean, showLabel: boolean) {
  if (v.tone === "none") {
    return `<div class="pm pm-none${selected ? " pm-sel" : ""}"></div>`;
  }
  const text = showLabel || selected ? v.label ?? "" : "";
  const star = v.tone === "fav" ? `<span class="pm-star">★</span>` : `<span class="pm-dot"></span>`;
  return `<div class="pm pm-${v.tone}${text ? "" : " pm-compact"}${selected ? " pm-sel" : ""}">${star}${text ? `<span>${text}</span>` : ""}</div>`;
}

export default function VenueMap({
  venues,
  selected,
  onSelect,
}: {
  venues: MapVenue[];
  selected: string | null;
  onSelect: (name: string | null) => void;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const markers = useRef<maplibregl.Marker[]>([]);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(10.6);
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    let cancelled = false;
    loadStyle().then((style) => {
      if (cancelled || !el.current) return;
      const m = new maplibregl.Map({
        container: el.current,
        style,
        center: DUBAI,
        zoom: 10.6,
        attributionControl: { compact: true },
        dragRotate: false,
        pitchWithRotate: false,
      });
      m.touchZoomRotate.disableRotation();
      m.on("click", () => onSelectRef.current(null));
      m.on("zoomend", () => setZoom(m.getZoom()));
      // "My location" button (blue dot + accuracy circle). Only asks permission when tapped;
      // if already granted before, show the dot straight away.
      const geo = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showAccuracyCircle: true,
        fitBoundsOptions: { maxZoom: 13 },
      });
      m.addControl(geo, "top-right");
      m.on("load", () => {
        setReady(true);
        navigator.permissions
          ?.query({ name: "geolocation" as PermissionName })
          .then((p) => {
            if (p.state === "granted") geo.trigger();
          })
          .catch(() => {});
      });
      map.current = m;
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  useEffect(() => {
    const m = map.current;
    if (!m || !ready) return;
    markers.current.forEach((mk) => mk.remove());
    const order = { none: 0, free: 1, fav: 2 } as const;
    const showLabel = zoom >= 12.5;
    markers.current = [...venues]
      .sort((a, b) => order[a.tone] - order[b.tone])
      .map((v) => {
        const node = document.createElement("button");
        node.type = "button";
        node.setAttribute("aria-label", v.name);
        node.className = "pm-wrap";
        node.style.zIndex = String(v.name === selected ? 1000 : order[v.tone] * 10);
        node.innerHTML = markerHtml(v, v.name === selected, showLabel);
        node.addEventListener("click", (e) => {
          e.stopPropagation();
          onSelectRef.current(v.name);
        });
        return new maplibregl.Marker({ element: node, anchor: "center" }).setLngLat([v.lng, v.lat]).addTo(m);
      });
  }, [venues, selected, ready, zoom]);

  // Keep the selected venue visible beside the details panel. Also runs once the map finishes
  // loading, so a venue picked in the list is centred when you switch to the map.
  const venuesRef = useRef(venues);
  useEffect(() => {
    venuesRef.current = venues;
  }, [venues]);
  useEffect(() => {
    const m = map.current;
    const v = venuesRef.current.find((x) => x.name === selected);
    if (!m || !ready || !v) return;
    // Mobile: lift above the bottom sheet. Desktop: shift right of the 400px side panel.
    const desktop = window.matchMedia("(min-width: 768px)").matches;
    m.easeTo({
      center: [v.lng, v.lat],
      zoom: Math.max(m.getZoom(), 13),
      offset: desktop ? [200, 0] : [0, -Math.round(window.innerHeight * 0.25)],
      duration: 450,
    });
  }, [selected, ready]);

  return <div ref={el} className="h-full w-full" />;
}
