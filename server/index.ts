import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import path from "node:path";

const prisma = new PrismaClient();
const app = express();
app.use(express.json({ limit: "1mb" }));

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
const h = (fn: (req: Request, res: Response) => Promise<unknown>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);
const uid = (res: Response) => res.locals.userId as string;

// ---- Auth seam -------------------------------------------------------------
// Every route reads the user from res.locals.userId and scopes ALL queries by it.
// To add real auth, replace this middleware (session/JWT) — nothing else changes.
let devUserId: string | null = null;
app.use("/api", async (_req, res, next) => {
  try {
    const email = process.env.DEV_USER_EMAIL ?? "dev@notes.local";
    devUserId ??= (await prisma.user.upsert({ where: { email }, update: {}, create: { email, name: "You" } })).id;
    res.locals.userId = devUserId;
    next();
  } catch (e) { next(e); }
});

// ---- Validation ------------------------------------------------------------
const COLORS = ["lavender", "purple", "blue", "cyan", "mint", "peach", "pink", "yellow", "dark"] as const;
const noteBody = z.object({
  title: z.string().trim().max(200).default(""),
  content: z.string().max(100_000).default(""),
  color: z.enum(COLORS).default("lavender"),
  folderId: z.string().nullable().optional(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).optional(),
  isPinned: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
  isArchived: z.boolean().optional(),
});
const noteUpdate = noteBody.partial();

const include = { tags: true, folder: { select: { id: true, name: true } } } satisfies Prisma.NoteInclude;
type NoteRow = Prisma.NoteGetPayload<{ include: typeof include }>;
const dto = (n: NoteRow) => ({ ...n, tags: n.tags.map((t) => t.name) });

const tagOps = (userId: string, names: string[]) =>
  [...new Set(names.map((n) => n.trim()))].map((name) => ({ where: { userId_name: { userId, name } }, create: { userId, name } }));

async function getOwned(id: string, userId: string) {
  const n = await prisma.note.findFirst({ where: { id, userId }, include });
  if (!n) throw new HttpError(404, "Note not found");
  return n;
}
async function assertFolder(folderId: string | null | undefined, userId: string) {
  if (folderId && !(await prisma.folder.findFirst({ where: { id: folderId, userId }, select: { id: true } })))
    throw new HttpError(400, "Folder not found");
}

// ---- Notes -----------------------------------------------------------------
app.get("/api/notes", h(async (req, res) => {
  const userId = uid(res);
  const { view = "all", folderId, tag, q } = req.query as Record<string, string | undefined>;
  const where: Prisma.NoteWhereInput = { userId, isDeleted: view === "trash" };
  if (view === "archived") where.isArchived = true;
  else if (view !== "trash") where.isArchived = false;
  if (view === "favorites") where.isFavorite = true;
  if (view === "pinned") where.isPinned = true;
  if (folderId) where.folderId = folderId;
  if (tag) where.tags = { some: { name: tag } };
  if (q?.trim()) {
    const s = q.trim();
    where.OR = [
      { title: { contains: s, mode: "insensitive" } },
      { content: { contains: s, mode: "insensitive" } },
      { tags: { some: { name: { contains: s, mode: "insensitive" } } } },
      { folder: { name: { contains: s, mode: "insensitive" } } },
    ];
  }
  const notes = await prisma.note.findMany({ where, include, orderBy: [{ isPinned: "desc" }, { updatedAt: "desc" }], take: 500 });
  res.json(notes.map(dto));
}));

app.get("/api/notes/:id", h(async (req, res) => res.json(dto(await getOwned(req.params.id, uid(res))))));

app.post("/api/notes", h(async (req, res) => {
  const userId = uid(res);
  const { tags = [], ...data } = noteBody.parse(req.body);
  await assertFolder(data.folderId, userId);
  const n = await prisma.note.create({ data: { ...data, userId, tags: { connectOrCreate: tagOps(userId, tags) } }, include });
  res.status(201).json(dto(n));
}));

app.put("/api/notes/:id", h(async (req, res) => {
  const userId = uid(res);
  await getOwned(req.params.id, userId);
  const { tags, ...data } = noteUpdate.parse(req.body);
  await assertFolder(data.folderId, userId);
  const n = await prisma.note.update({
    where: { id: req.params.id },
    data: { ...data, ...(tags && { tags: { set: [], connectOrCreate: tagOps(userId, tags) } }) },
    include,
  });
  res.json(dto(n));
}));

for (const [route, field] of [["pin", "isPinned"], ["favorite", "isFavorite"], ["archive", "isArchived"]] as const) {
  app.post(`/api/notes/:id/${route}`, h(async (req, res) => {
    const n = await getOwned(req.params.id, uid(res));
    const data = { [field]: !n[field] } as Prisma.NoteUpdateInput;
    res.json(dto(await prisma.note.update({ where: { id: n.id }, data, include })));
  }));
}

app.post("/api/notes/:id/restore", h(async (req, res) => {
  const n = await getOwned(req.params.id, uid(res));
  res.json(dto(await prisma.note.update({ where: { id: n.id }, data: { isDeleted: false }, include })));
}));

// Soft delete → Trash. `?permanent=true` removes the row for good.
app.delete("/api/notes/:id", h(async (req, res) => {
  const n = await getOwned(req.params.id, uid(res));
  if (req.query.permanent === "true") await prisma.note.delete({ where: { id: n.id } });
  else await prisma.note.update({ where: { id: n.id }, data: { isDeleted: true } });
  res.status(204).end();
}));

// ---- Folders, tags, stats, profile ----------------------------------------
app.get("/api/folders", h(async (_req, res) => {
  res.json(await prisma.folder.findMany({ where: { userId: uid(res) }, orderBy: { name: "asc" }, select: { id: true, name: true } }));
}));
app.post("/api/folders", h(async (req, res) => {
  const { name } = z.object({ name: z.string().trim().min(1, "Folder name is required").max(40) }).parse(req.body);
  res.status(201).json(await prisma.folder.create({ data: { name, userId: uid(res) }, select: { id: true, name: true } }));
}));
app.delete("/api/folders/:id", h(async (req, res) => {
  await prisma.folder.deleteMany({ where: { id: req.params.id, userId: uid(res) } }); // notes survive (folderId → null)
  res.status(204).end();
}));
app.get("/api/tags", h(async (_req, res) => {
  const tags = await prisma.tag.findMany({ where: { userId: uid(res), notes: { some: { isDeleted: false } } }, orderBy: { name: "asc" } });
  res.json(tags.map((t) => t.name));
}));
app.get("/api/stats", h(async (_req, res) => {
  const userId = uid(res);
  const c = (where: Prisma.NoteWhereInput) => prisma.note.count({ where: { userId, ...where } });
  const live = { isDeleted: false, isArchived: false };
  const [all, favorites, pinned, archived, trash] = await Promise.all([
    c(live), c({ ...live, isFavorite: true }), c({ ...live, isPinned: true }), c({ isDeleted: false, isArchived: true }), c({ isDeleted: true }),
  ]);
  res.json({ all, favorites, pinned, archived, trash });
}));
app.get("/api/me", h(async (_req, res) => {
  res.json(await prisma.user.findUniqueOrThrow({ where: { id: uid(res) }, select: { name: true, email: true } }));
}));

// ---- Static (production) + errors -------------------------------------------
if (process.env.NODE_ENV === "production") {
  const dist = path.resolve(process.cwd(), "dist");
  app.use(express.static(dist));
  app.get("*", (_req, res) => res.sendFile(path.join(dist, "index.html")));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError)
    return res.status(400).json({ error: err.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ` : "") + i.message).join("; ") });
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof Prisma.PrismaClientInitializationError)
    return res.status(503).json({ error: "Can't reach the database right now. Please try again shortly." });
  if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002")
    return res.status(409).json({ error: "That name already exists." });
  console.error(err); // details stay in server logs only
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

const port = Number(process.env.PORT ?? 3001);
app.listen(port, "0.0.0.0", () => console.log(`API listening on http://localhost:${port}`));