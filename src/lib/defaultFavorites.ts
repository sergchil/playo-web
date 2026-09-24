/**
 * Default favourite venues, shown until the visitor customizes their own list
 * (which then lives in localStorage on their device). Sergey: replace this
 * list with your real venues — match by exact Playo venue `id` if you have
 * it (see /api/venues), otherwise by exact name.
 */
export interface DefaultFavorite {
  id?: string;
  name: string;
}

export const DEFAULT_FAVORITES: DefaultFavorite[] = [
  // { id: "1f882e4e-eae0-45cb-98d9-515c151a2cfb", name: "MSA French Academic City" },
];
