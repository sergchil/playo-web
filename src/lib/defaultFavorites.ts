/**
 * Default favourite venues, shown until the visitor customizes their own list
 * (which then lives in localStorage on their device). Matched by exact Playo
 * venue name (see /api/venues); ids kept for reference.
 */
export interface DefaultFavorite {
  id?: string;
  name: string;
}

export const DEFAULT_FAVORITES: DefaultFavorite[] = [
  { id: "1f882e4e-eae0-45cb-98d9-515c151a2cfb", name: "MSA French School" },
  { id: "d27976fa-69e3-4b07-87ec-e4e75adc0db9", name: "365 Open Sports" },
  { id: "ad2621a6-fd9b-4f77-b719-6a9bf502dd44", name: "Apex Al Barsha sports and Community Center" },
  { id: "8a528367-c5e3-4953-8117-3833f03bffd4", name: "Oasis Community Sports @Hartland International School" },
];
