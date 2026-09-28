import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent } from "react";
import { api, COLORS, type ColorName, type Folder, type Note, type Stats } from "./api";

type View = "dashboard" | "all" | "favorites" | "pinned" | "archived" | "trash";
type Toast = { id: number; msg: string; err?: boolean };

const P: Record<string, string> = {
  home: "M3 11l9-8 9 8M5 10v10h14V10", notes: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
  pin: "M9 3h6l-1 6 3 3v2H7v-2l3-3zM12 14v7", archive: "M3 4h18v4H3zM5 8v12h14V8M10 12h4",
  trash: "M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13", folder: "M3 6h6l2 2h10v11H3z", plus: "M12 5v14M5 12h14",
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zM20 20l-4-4", menu: "M4 6h16M4 12h16M4 18h16", dots: "M5 12h.01M12 12h.01M19 12h.01",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  moon: "M20 14A8 8 0 0110 4a8 8 0 1010 10z", x: "M6 6l12 12M18 6L6 18", user: "M12 4a4 4 0 100 8 4 4 0 000-8zM4 21a8 8 0 0116 0",
  sliders: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M14 4v4M8 10v4M16 16v4", restore: "M4 5v5h5M5 10a8 8 0 112 6",
};
const Icon = ({ n, fill }: { n: string; fill?: boolean }) => (
  <svg className="ic" viewBox="0 0 24 24" fill={fill ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={P[n]} /></svg>
);

const NAV: { id: View; label: string; icon: string; stat?: keyof Stats }[] = [
  { id: "dashboard", label: "Dashboard", icon: "home" }, { id: "all", label: "All Notes", icon: "notes", stat: "all" },
  { id: "favorites", label: "Favorites", icon: "star", stat: "favorites" }, { id: "pinned", label: "Pinned", icon: "pin", stat: "pinned" },
  { id: "archived", label: "Archived", icon: "archive", stat: "archived" }, { id: "trash", label: "Trash", icon: "trash", stat: "trash" },
];

const fmtDate = (iso: string) => {
  const d = new Date(iso), days = Math.floor((Date.now() - d.getTime()) / 864e5);
  if (days < 1 && d.getDate() === new Date().getDate()) return "Today";
  return days < 2 ? "Yesterday" : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: days > 300 ? "numeric" : undefined });
};

function useCount(target: number) {
  const [v, setV] = useState(0);
  useEffect(() => {
    let raf = 0; const t0 = performance.now(), from = v;
    const step = (t: number) => { const p = Math.min(1, (t - t0) / 600); setV(Math.round(from + (target - from) * (1 - (1 - p) ** 3))); if (p < 1) raf = requestAnimationFrame(step); };
    raf = requestAnimationFrame(step); return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);
  return v;
}

function StatCard({ label, value, onClick, i }: { label: string; value: number; onClick: () => void; i: number }) {
  const n = useCount(value);
  return (
    <button className="stat" onClick={onClick} style={{ "--i": i } as CSSProperties}>
      <strong>{n}</strong><span>{label}</span>
    </button>
  );
}

function NoteCard({ n, i, leaving, onOpen, onToggle, onDelete, onRestore }: {
  n: Note; i: number; leaving: boolean; onOpen: () => void; onToggle: (k: "pin" | "favorite" | "archive") => void; onDelete: () => void; onRestore: () => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState(false);
  useEffect(() => { if (!menu) return; const c = () => setMenu(false); addEventListener("click", c); return () => removeEventListener("click", c); }, [menu]);
  const move = (e: React.MouseEvent) => {
    const el = ref.current!, r = el.getBoundingClientRect();
    el.style.setProperty("--ry", `${((e.clientX - r.left) / r.width - 0.5) * 7}deg`);
    el.style.setProperty("--rx", `${-((e.clientY - r.top) / r.height - 0.5) * 7}deg`);
  };
  const reset = () => { ref.current?.style.setProperty("--rx", "0deg"); ref.current?.style.setProperty("--ry", "0deg"); };
  const trash = n.isDeleted;
  return (
    <article ref={ref} className={"card" + (leaving ? " leaving" : "")} style={{ "--accent": COLORS[n.color], "--i": Math.min(i, 12) } as CSSProperties} onMouseMove={move} onMouseLeave={reset}>
      <div className="card-head">
        <button className="card-title" onClick={trash ? undefined : onOpen} disabled={trash}>{n.title || "Untitled"}</button>
        <div className="card-actions">
          {!trash && <>
            <button className={"icon-btn" + (n.isPinned ? " on" : "")} onClick={() => onToggle("pin")} aria-pressed={n.isPinned} aria-label={n.isPinned ? "Unpin note" : "Pin note"}><Icon n="pin" fill={n.isPinned} /></button>
            <button className={"icon-btn" + (n.isFavorite ? " on" : "")} onClick={() => onToggle("favorite")} aria-pressed={n.isFavorite} aria-label={n.isFavorite ? "Remove from favorites" : "Add to favorites"}><Icon n="star" fill={n.isFavorite} /></button>
          </>}
          <div className="menu-wrap">
            <button className="icon-btn" aria-label="More options" aria-haspopup="menu" aria-expanded={menu} onClick={(e) => { e.stopPropagation(); setMenu((m) => !m); }}><Icon n="dots" /></button>
            {menu && (
              <div className="menu glass" role="menu">
                {trash ? <>
                  <button role="menuitem" onClick={onRestore}>Restore</button>
                  <button role="menuitem" className="danger" onClick={onDelete}>Delete permanently</button>
                </> : <>
                  <button role="menuitem" onClick={onOpen}>Edit</button>
                  <button role="menuitem" onClick={() => onToggle("archive")}>{n.isArchived ? "Unarchive" : "Archive"}</button>
                  <button role="menuitem" className="danger" onClick={onDelete}>Move to trash</button>
                </>}
              </div>
            )}
          </div>
        </div>
      </div>
      <p className="preview">{n.content.slice(0, 150) || "No content yet"}</p>
      <div className="tags">{n.tags.slice(0, 4).map((t) => <span key={t} className="chip">{t}</span>)}</div>
      <footer><span>Updated: {fmtDate(n.updatedAt)}</span>{n.folder && <span className="folder-tag"><Icon n="folder" />{n.folder.name}</span>}</footer>
    </article>
  );
}

function Modal({ label, onClose, children, wide }: { label: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  useEffect(() => { const k = (e: KeyboardEvent) => e.key === "Escape" && onClose(); addEventListener("keydown", k); return () => removeEventListener("keydown", k); }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal glass" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={label}>{children}</div>
    </div>
  );
}

type Draft = { title: string; content: string; color: ColorName; folderId: string; tags: string[]; isPinned: boolean; isFavorite: boolean; isArchived: boolean };

function Editor({ note, folders, allTags, onClose, onChanged, toast }: {
  note: Note | null; folders: Folder[]; allTags: string[]; onClose: () => void; onChanged: () => void; toast: (m: string, err?: boolean) => void;
}) {
  const [d, setD] = useState<Draft>({
    title: note?.title ?? "", content: note?.content ?? "", color: note?.color ?? "lavender", folderId: note?.folderId ?? "",
    tags: note?.tags ?? [], isPinned: note?.isPinned ?? false, isFavorite: note?.isFavorite ?? false, isArchived: note?.isArchived ?? false,
  });
  const [status, setStatus] = useState<"saved" | "saving" | "unsaved">("saved");
  const [tagIn, setTagIn] = useState("");
  const id = useRef<string | null>(note?.id ?? null);
  const dRef = useRef(d); dRef.current = d;
  const cb = useRef({ toast, onChanged }); cb.current = { toast, onChanged };
  const ver = useRef(0), savedVer = useRef(0), first = useRef(true);

  const save = useCallback(async (manual = false): Promise<boolean> => {
    const v = dRef.current, at = ver.current;
    if (!id.current && !v.title.trim() && !v.content.trim()) { if (manual) cb.current.toast("Add a title or some content first", true); setStatus("saved"); return !manual; }
    setStatus("saving");
    try {
      const body = { ...v, folderId: v.folderId || null };
      const s = id.current ? await api.put<Note>(`/api/notes/${id.current}`, body) : await api.post<Note>("/api/notes", body);
      id.current = s.id; savedVer.current = at;
      setStatus(ver.current === at ? "saved" : "unsaved");
      if (manual) cb.current.toast("Note saved successfully");
      cb.current.onChanged(); return true;
    } catch (e) { setStatus("unsaved"); cb.current.toast((e as Error).message, true); return false; }
  }, []);

  useEffect(() => {
    if (first.current) { first.current = false; return; }
    ver.current++; setStatus("unsaved");
    const t = setTimeout(() => save(), 900); return () => clearTimeout(t);
  }, [d, save]);

  const close = async () => { if (ver.current === savedVer.current || (await save())) onClose(); };
  const remove = async () => {
    try { if (id.current) { await api.del(`/api/notes/${id.current}`); cb.current.toast("Note moved to trash"); cb.current.onChanged(); } onClose(); }
    catch (e) { toast((e as Error).message, true); }
  };
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((p) => ({ ...p, [k]: v }));
  const addTag = (raw: string) => { const t = raw.trim().replace(/^#/, ""); if (t && !d.tags.some((x) => x.toLowerCase() === t.toLowerCase()) && d.tags.length < 10) set("tags", [...d.tags, t]); setTagIn(""); };

  return (
    <Modal label={note ? "Edit note" : "New note"} onClose={close} wide>
      <div className="ed" style={{ "--accent": COLORS[d.color] } as CSSProperties}>
        <div className="ed-top">
          <span className={"status " + status} role="status" aria-live="polite">{status === "saved" ? "Saved" : status === "saving" ? "Saving..." : "Unsaved changes"}</span>
          <div className="ed-tools">
            <button className={"icon-btn" + (d.isPinned ? " on" : "")} aria-pressed={d.isPinned} aria-label={d.isPinned ? "Unpin" : "Pin"} onClick={() => set("isPinned", !d.isPinned)}><Icon n="pin" fill={d.isPinned} /></button>
            <button className={"icon-btn" + (d.isFavorite ? " on" : "")} aria-pressed={d.isFavorite} aria-label={d.isFavorite ? "Unfavorite" : "Favorite"} onClick={() => set("isFavorite", !d.isFavorite)}><Icon n="star" fill={d.isFavorite} /></button>
            <button className={"icon-btn" + (d.isArchived ? " on" : "")} aria-pressed={d.isArchived} aria-label={d.isArchived ? "Unarchive" : "Archive"} onClick={() => set("isArchived", !d.isArchived)}><Icon n="archive" /></button>
            <button className="icon-btn danger" aria-label="Move to trash" onClick={remove}><Icon n="trash" /></button>
            <button className="icon-btn" aria-label="Close editor" onClick={close}><Icon n="x" /></button>
          </div>
        </div>
        <input className="ed-title" autoFocus placeholder="Title" aria-label="Title" maxLength={200} value={d.title} onChange={(e) => set("title", e.target.value)} />
        <textarea className="ed-body" placeholder="Start writing…" aria-label="Content" value={d.content} onChange={(e) => set("content", e.target.value)} />
        <div className="ed-meta">
          <label>Folder
            <select value={d.folderId} onChange={(e) => set("folderId", e.target.value)}>
              <option value="">No folder</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </label>
          <label className="grow">Tags
            <div className="taginput">
              {d.tags.map((t) => <span key={t} className="chip">{t}<button aria-label={`Remove tag ${t}`} onClick={() => set("tags", d.tags.filter((x) => x !== t))}>×</button></span>)}
              <input list="tag-options" value={tagIn} placeholder="Add tag, press Enter" maxLength={30} onChange={(e) => setTagIn(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(tagIn); } else if (e.key === "Backspace" && !tagIn && d.tags.length) set("tags", d.tags.slice(0, -1)); }}
                onBlur={() => addTag(tagIn)} />
              <datalist id="tag-options">{allTags.map((t) => <option key={t} value={t} />)}</datalist>
            </div>
          </label>
        </div>
        <div className="ed-foot">
          <div className="swatches" role="radiogroup" aria-label="Note color">
            {(Object.keys(COLORS) as ColorName[]).map((c) => (
              <button key={c} role="radio" aria-checked={d.color === c} aria-label={c} title={c} className={"sw" + (d.color === c ? " sel" : "")} style={{ background: COLORS[c] }} onClick={() => set("color", c)} />
            ))}
          </div>
          <button className="btn" onClick={() => save(true)}>Save</button>
        </div>
      </div>
    </Modal>
  );
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => (localStorage.getItem("theme") as "light" | "dark") || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [lite, setLite] = useState(() => localStorage.getItem("lite") === "1");
  const [view, setView] = useState<View>("dashboard");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [notes, setNotes] = useState<Note[] | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [stats, setStats] = useState<Stats>({ all: 0, favorites: 0, pinned: 0, archived: 0, trash: 0 });
  const [editing, setEditing] = useState<Note | "new" | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [panel, setPanel] = useState<"settings" | "profile" | null>(null);
  const [me, setMe] = useState<{ name: string | null; email: string } | null>(null);
  const [confirm, setConfirm] = useState<Note | null>(null);
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const [leaving, setLeaving] = useState<Set<string>>(new Set());
  const [toasts, setToasts] = useState<Toast[]>([]);
  const searchRef = useRef<HTMLInputElement>(null);

  const toast = useCallback((msg: string, err?: boolean) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, msg, err }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3200);
  }, []);
  const fail = useCallback((e: unknown) => toast((e as Error).message || "Something went wrong. Please try again.", true), [toast]);

  const loadNotes = useCallback(async () => {
    try {
      const p = new URLSearchParams({ view: view === "dashboard" ? "all" : view });
      if (folderId) p.set("folderId", folderId); if (tag) p.set("tag", tag); if (q.trim()) p.set("q", q.trim());
      setNotes(await api.get<Note[]>("/api/notes?" + p));
    } catch (e) { fail(e); setNotes((n) => n ?? []); }
  }, [view, folderId, tag, q, fail]);
  const loadMeta = useCallback(async () => {
    try {
      const [f, t, s] = await Promise.all([api.get<Folder[]>("/api/folders"), api.get<string[]>("/api/tags"), api.get<Stats>("/api/stats")]);
      setFolders(f); setTags(t); setStats(s);
    } catch (e) { fail(e); }
  }, [fail]);
  const refresh = useCallback(() => { loadNotes(); loadMeta(); }, [loadNotes, loadMeta]);

  useEffect(() => { const t = setTimeout(loadNotes, q ? 200 : 0); return () => clearTimeout(t); }, [loadNotes, q]);
  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { if (panel === "profile" && !me) api.get<{ name: string | null; email: string }>("/api/me").then(setMe).catch(fail); }, [panel, me, fail]);

  useEffect(() => {
    const r = document.documentElement; r.classList.add("theming"); r.dataset.theme = theme; localStorage.setItem("theme", theme);
    const t = setTimeout(() => r.classList.remove("theming"), 500); return () => clearTimeout(t);
  }, [theme]);
  useEffect(() => { document.documentElement.dataset.fx = lite ? "lite" : "full"; localStorage.setItem("lite", lite ? "1" : "0"); }, [lite]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchRef.current?.focus(); } };
    addEventListener("keydown", k); return () => removeEventListener("keydown", k);
  }, []);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce), (pointer: coarse)").matches) return;
    let raf = 0;
    const on = (e: MouseEvent) => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => { const s = document.documentElement.style; s.setProperty("--px", String((e.clientX / innerWidth - 0.5) * 2)); s.setProperty("--py", String((e.clientY / innerHeight - 0.5) * 2)); }); };
    addEventListener("mousemove", on); return () => { removeEventListener("mousemove", on); cancelAnimationFrame(raf); };
  }, []);

  const go = (v: View) => { setView(v); setFolderId(null); setTag(null); setQ(""); setNavOpen(false); };
  const act = async (fn: () => Promise<unknown>, ok?: string) => { try { await fn(); if (ok) toast(ok); refresh(); } catch (e) { fail(e); } };
  const toggle = (n: Note, k: "pin" | "favorite" | "archive") => {
    const msg = { pin: n.isPinned ? "Note unpinned" : "Note pinned", favorite: n.isFavorite ? "Removed from favorites" : "Added to favorites", archive: n.isArchived ? "Note unarchived" : "Note archived" }[k];
    if (k === "archive") return animateOut(n, () => api.post(`/api/notes/${n.id}/${k}`), msg);
    act(() => api.post(`/api/notes/${n.id}/${k}`), msg);
  };
  const animateOut = (n: Note, fn: () => Promise<unknown>, ok: string) => {
    setLeaving((s) => new Set(s).add(n.id));
    setTimeout(async () => { await act(fn, ok); setLeaving((s) => { const x = new Set(s); x.delete(n.id); return x; }); }, 220);
  };
  const createFolder = async (e: FormEvent) => {
    e.preventDefault(); if (!newFolder?.trim()) return setNewFolder(null);
    try { await api.post("/api/folders", { name: newFolder }); toast("Folder created"); setNewFolder(null); loadMeta(); } catch (er) { fail(er); }
  };
  const deleteFolder = () => act(async () => { await api.del(`/api/folders/${folderId}`); setFolderId(null); }, "Folder deleted");

  const showDash = view === "dashboard" && !q && !folderId && !tag;
  const label = q ? `Results for “${q}”` : tag ? `#${tag}` : folderId ? folders.find((f) => f.id === folderId)?.name ?? "Folder" : NAV.find((n) => n.id === view)!.label;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const list = useMemo(() => (showDash ? (notes ?? []).slice(0, 9) : notes ?? []), [notes, showDash]);
  const emptyFresh = notes?.length === 0 && !q && !tag && !folderId && (view === "dashboard" || view === "all");

  return (
    <>
      <div className="bg" aria-hidden="true">
        <i className="blob b1" /><i className="blob b2" /><i className="blob b3" />
        <i className="orb o1" /><i className="orb o2" /><i className="shape s1" /><i className="shape s2" />
      </div>
      <div className="app">
        <aside className={"side glass" + (navOpen ? " open" : "")} aria-label="Sidebar">
          <div className="brand"><span className="logo">N</span>Noted</div>
          <nav aria-label="Main">
            {NAV.map((n) => (
              <button key={n.id} className={"nav" + (view === n.id && !folderId && !tag ? " active" : "")} aria-current={view === n.id && !folderId && !tag ? "page" : undefined} onClick={() => go(n.id)}>
                <Icon n={n.icon} />{n.label}{n.stat && <em>{stats[n.stat]}</em>}
              </button>
            ))}
          </nav>
          <div className="sec"><span>Folders</span><button className="icon-btn sm" aria-label="New folder" onClick={() => setNewFolder("")}><Icon n="plus" /></button></div>
          <div className="scroll">
            {newFolder !== null && <form onSubmit={createFolder} className="folder-form"><input autoFocus aria-label="Folder name" placeholder="Folder name" maxLength={40} value={newFolder} onChange={(e) => setNewFolder(e.target.value)} onBlur={() => !newFolder && setNewFolder(null)} onKeyDown={(e) => e.key === "Escape" && setNewFolder(null)} /></form>}
            {folders.map((f) => (
              <button key={f.id} className={"nav" + (folderId === f.id ? " active" : "")} onClick={() => { setView("all"); setFolderId(f.id); setTag(null); setQ(""); setNavOpen(false); }}><Icon n="folder" />{f.name}</button>
            ))}
            {!folders.length && newFolder === null && <p className="hint">No folders yet</p>}
            {tags.length > 0 && <><div className="sec"><span>Tags</span></div><div className="tagcloud">{tags.map((t) => <button key={t} className={"chip" + (tag === t ? " sel" : "")} onClick={() => { setView("all"); setTag(tag === t ? null : t); setFolderId(null); setQ(""); setNavOpen(false); }}>{t}</button>)}</div></>}
          </div>
          <div className="side-foot">
            <button className="nav" onClick={() => { setPanel("settings"); setNavOpen(false); }}><Icon n="sliders" />Settings</button>
            <button className="nav" onClick={() => { setPanel("profile"); setNavOpen(false); }}><Icon n="user" />Profile</button>
          </div>
        </aside>
        {navOpen && <div className="scrim" onClick={() => setNavOpen(false)} />}

        <main>
          <header className="top">
            <button className="icon-btn menu-btn" aria-label="Open navigation" onClick={() => setNavOpen(true)}><Icon n="menu" /></button>
            <label className="search glass">
              <Icon n="search" /><span className="sr">Search notes</span>
              <input ref={searchRef} type="search" placeholder="Search titles, content, tags, folders" value={q} onChange={(e) => setQ(e.target.value)} />
              <kbd>Ctrl K</kbd>
            </label>
            <button className="icon-btn theme" aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`} onClick={() => setTheme(theme === "dark" ? "light" : "dark")}><Icon n={theme === "dark" ? "sun" : "moon"} /></button>
            <button className="btn" onClick={() => setEditing("new")}><Icon n="plus" /><span>New Note</span></button>
          </header>

          {showDash ? (
            <section className="hero">
              <h1>{greeting} 👋</h1>
              <p>Capture your ideas. Organize your thoughts.</p>
              <div className="stats">
                <StatCard i={0} label="Notes" value={stats.all} onClick={() => go("all")} />
                <StatCard i={1} label="Favorites" value={stats.favorites} onClick={() => go("favorites")} />
                <StatCard i={2} label="Pinned" value={stats.pinned} onClick={() => go("pinned")} />
                <StatCard i={3} label="Archived" value={stats.archived} onClick={() => go("archived")} />
              </div>
              {!emptyFresh && <h2>Recent notes</h2>}
            </section>
          ) : (
            <section className="hero compact">
              <h1>{label}</h1>
              {view === "trash" && <p>Restore notes, or delete them permanently.</p>}
              {folderId && !q && <button className="link" onClick={deleteFolder}>Delete folder (notes are kept)</button>}
            </section>
          )}

          {notes === null ? <div className="grid" aria-busy="true">{[0, 1, 2].map((i) => <div key={i} className="card skeleton" />)}</div>
            : emptyFresh ? (
              <div className="empty">
                <div className="empty-art" aria-hidden="true"><i /><i /><i /></div>
                <h2>Your thoughts deserve a place.</h2>
                <p>Create your first note and start organizing your ideas.</p>
                <button className="btn" onClick={() => setEditing("new")}><Icon n="plus" />Create Your First Note</button>
              </div>
            ) : list.length === 0 ? <div className="empty small"><p>{q ? "No notes match your search." : "Nothing here yet."}</p></div>
            : (
              <div className="grid" key={view + folderId + tag}>
                {list.map((n, i) => (
                  <NoteCard key={n.id} n={n} i={i} leaving={leaving.has(n.id)} onOpen={() => setEditing(n)} onToggle={(k) => toggle(n, k)}
                    onRestore={() => animateOut(n, () => api.post(`/api/notes/${n.id}/restore`), "Note restored")}
                    onDelete={() => (n.isDeleted ? setConfirm(n) : animateOut(n, () => api.del(`/api/notes/${n.id}`), "Note moved to trash"))} />
                ))}
              </div>
            )}
        </main>
      </div>

      {editing && <Editor note={editing === "new" ? null : editing} folders={folders} allTags={tags} toast={toast} onChanged={refresh} onClose={() => { setEditing(null); refresh(); }} />}
      {confirm && (
        <Modal label="Confirm permanent deletion" onClose={() => setConfirm(null)}>
          <h2>Delete permanently?</h2>
          <p className="muted">“{confirm.title || "Untitled"}” will be gone for good. This can’t be undone.</p>
          <div className="row"><button className="btn ghost" onClick={() => setConfirm(null)}>Cancel</button>
            <button className="btn danger" onClick={() => { const n = confirm; setConfirm(null); animateOut(n, () => api.del(`/api/notes/${n.id}?permanent=true`), "Note deleted permanently"); }}>Delete permanently</button></div>
        </Modal>
      )}
      {panel === "settings" && (
        <Modal label="Settings" onClose={() => setPanel(null)}>
          <h2>Settings</h2>
          <div className="setting"><span>Dark mode</span><button className="switch" role="switch" aria-checked={theme === "dark"} onClick={() => setTheme(theme === "dark" ? "light" : "dark")} /></div>
          <div className="setting"><span>Lighter 3D effects<small>Turns off tilt, blur and floating shapes</small></span><button className="switch" role="switch" aria-checked={lite} onClick={() => setLite(!lite)} /></div>
          <div className="row"><button className="btn" onClick={() => setPanel(null)}>Done</button></div>
        </Modal>
      )}
      {panel === "profile" && (
        <Modal label="Profile" onClose={() => setPanel(null)}>
          <h2>Profile</h2>
          {me ? <div className="profile"><span className="logo big">{(me.name || me.email)[0].toUpperCase()}</span><div><strong>{me.name || "You"}</strong><div className="muted">{me.email}</div></div></div> : <p className="muted">Loading…</p>}
          <p className="muted small">Sign-in isn’t enabled yet; notes are scoped to this account on the server.</p>
          <div className="row"><button className="btn" onClick={() => setPanel(null)}>Close</button></div>
        </Modal>
      )}
      <div className="toasts" aria-live="polite">{toasts.map((t) => <div key={t.id} className={"toast glass" + (t.err ? " err" : "")}>{t.msg}</div>)}</div>
    </>
  );
}
