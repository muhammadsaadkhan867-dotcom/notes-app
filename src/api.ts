export const COLORS = {
  lavender: "#A78BFA", purple: "#8B5CF6", blue: "#60A5FA", cyan: "#22D3EE", mint: "#34D399",
  peach: "#FDBA74", pink: "#F472B6", yellow: "#FACC15", dark: "#475569",
} as const;
export type ColorName = keyof typeof COLORS;

export interface Note {
  id: string; title: string; content: string; color: ColorName;
  isPinned: boolean; isFavorite: boolean; isArchived: boolean; isDeleted: boolean;
  updatedAt: string; folderId: string | null; folder: { id: string; name: string } | null; tags: string[];
}
export interface Folder { id: string; name: string }
export interface Stats { all: number; favorites: number; pinned: number; archived: number; trash: number }

async function req<T>(method: string, url: string, body?: unknown): Promise<T> {
  let r: Response;
  try {
    r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch {
    throw new Error("Network error. Check your connection and try again.");
  }
  if (!r.ok) {
    const j = await r.json().catch(() => ({}));
    throw new Error(j.error || "Something went wrong. Please try again.");
  }
  return r.status === 204 ? (undefined as T) : r.json();
}

export const api = {
  get: <T,>(u: string) => req<T>("GET", u),
  post: <T,>(u: string, b?: unknown) => req<T>("POST", u, b ?? {}),
  put: <T,>(u: string, b: unknown) => req<T>("PUT", u, b),
  del: (u: string) => req<void>("DELETE", u),
};
