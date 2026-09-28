// DEMO DATA ONLY. Run manually with `npm run db:seed`. Refuses to run in production.
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed demo data in production");
const prisma = new PrismaClient();

const email = process.env.DEV_USER_EMAIL ?? "dev@notes.local";
const demo = [
  { title: "Website Ideas", content: "Build a modern AI-powered website builder that allows users to describe a business and get a full site draft in minutes.", color: "purple", folder: "Ideas", tags: ["AI", "Business", "Ideas"], isPinned: true, isFavorite: true },
  { title: "Study Plan", content: "Mon: algorithms. Tue: databases. Wed: system design. Thu: practice problems. Fri: review and rest.", color: "blue", folder: "Study", tags: ["Study"] },
  { title: "Business Ideas", content: "Subscription for local artisans, print-on-demand calligraphy, a booking tool for small clinics.", color: "mint", folder: "Ideas", tags: ["Business"], isFavorite: true },
  { title: "Project Notes", content: "Sprint goals: ship auth, polish editor, write docs. Blockers: waiting on design review.", color: "cyan", folder: "Projects", tags: ["Work"], isPinned: true },
  { title: "Things I Need To Do", content: "Renew passport, call the bank, book dentist, reply to emails, plan weekend.", color: "peach", folder: "Personal", tags: ["Personal"] },
];

async function main() {
  const user = await prisma.user.upsert({ where: { email }, update: {}, create: { email, name: "You" } });
  if ((await prisma.note.count({ where: { userId: user.id } })) > 0) return console.log("User already has notes; skipping seed.");
  for (const name of ["Personal", "Work", "Ideas", "Study", "Projects"])
    await prisma.folder.upsert({ where: { userId_name: { userId: user.id, name } }, update: {}, create: { name, userId: user.id } });
  for (const { folder, tags, ...n } of demo) {
    const f = await prisma.folder.findUniqueOrThrow({ where: { userId_name: { userId: user.id, name: folder } } });
    await prisma.note.create({
      data: { ...n, userId: user.id, folderId: f.id, tags: { connectOrCreate: tags.map((name) => ({ where: { userId_name: { userId: user.id, name } }, create: { name, userId: user.id } })) } },
    });
  }
  console.log("Seeded demo notes for", email);
}
main().finally(() => prisma.$disconnect());
