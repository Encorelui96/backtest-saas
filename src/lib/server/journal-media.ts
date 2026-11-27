import "server-only";
import { z } from "zod";
import { MAX_IMAGES_PER_ITEM } from "../journal";
import type { SessionUser } from "./auth";
import { newId, query, queryOne } from "./db";
import { UserError } from "./errors";
import { QuotaError, planOf, withUserLock } from "./quotas";

/**
 * The journal's day notes and chart images. Every query carries the user's id: an id or a day of
 * another account reads as "not found". Images are JPEGs shrunk by the page, kept in the database.
 */

export const Day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "jour attendu (AAAA-MM-JJ)").refine((d) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)), "jour inconnu");

export const NoteInput = z.object({ text: z.string().max(10_000) });

/** Writes the day's note; an empty note without images is removed. */
export async function saveNote(userId: string, day: string, text: string) {
  const clean = text.trim();
  if (!clean) {
    const kept = await queryOne("SELECT 1 FROM journal_images WHERE user_id = $1 AND note_day = $2 LIMIT 1", [userId, day]);
    if (!kept) {
      await query("DELETE FROM journal_notes WHERE user_id = $1 AND day = $2", [userId, day]);
      return null;
    }
  }
  const r = await queryOne<{ day: string; text: string; updated_at: Date }>(
    `INSERT INTO journal_notes (user_id, day, text) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, day) DO UPDATE SET text = EXCLUDED.text, updated_at = now()
     RETURNING to_char(day, 'YYYY-MM-DD') AS day, text, updated_at`,
    [userId, day, clean],
  );
  return { day: r!.day, text: r!.text, updatedAt: r!.updated_at.getTime() };
}

/** Removes the day's note and its images. */
export async function deleteNote(userId: string, day: string) {
  await query("DELETE FROM journal_notes WHERE user_id = $1 AND day = $2", [userId, day]);
}

// ---------- Images ----------

/** About 1.5 MB once decoded: the page sends about 200 KB, this leaves room for a sharp chart. */
export const ImageInput = z
  .object({
    image: z
      .string()
      .max(2_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "base64 attendu"),
    tradeId: z.string().max(64).optional(),
    day: Day.optional(),
  })
  .refine((x) => Boolean(x.tradeId) !== Boolean(x.day), "une image va avec un trade ou une note");

/** Images kept and the plan's limit. */
export async function imageUsage(user: SessionUser): Promise<{ used: number; limit: number }> {
  const [plan, row] = await Promise.all([planOf(user), queryOne<{ n: string }>("SELECT count(*) AS n FROM journal_images WHERE user_id = $1", [user.id])]);
  return { used: Number(row?.n ?? 0), limit: plan.journalImages };
}

export async function addImage(user: SessionUser, input: z.infer<typeof ImageInput>): Promise<string> {
  const data = Buffer.from(input.image, "base64");
  if (data[0] !== 0xff || data[1] !== 0xd8) throw new UserError("Ce fichier n'est pas une image JPEG.");
  return withUserLock(user, async (run) => {
    const plan = await planOf(user);
    const [all] = await run<{ n: string }>("SELECT count(*) AS n FROM journal_images WHERE user_id = $1", [user.id]);
    if (Number(all.n) >= plan.journalImages) {
      throw new QuotaError("Ton journal garde {0} images avec l'offre {1:t} : supprime-en ou passe à une offre au-dessus pour en ajouter.", [plan.journalImages, plan.label]);
    }
    if (input.tradeId) {
      const [t] = await run<{ id: string }>("SELECT id FROM journal_trades WHERE id = $1 AND user_id = $2", [input.tradeId, user.id]);
      if (!t) throw new UserError("Trade introuvable");
    } else {
      // A note can start with an image: it is created empty.
      await run("INSERT INTO journal_notes (user_id, day) VALUES ($1, $2) ON CONFLICT DO NOTHING", [user.id, input.day]);
    }
    const [mine] = await run<{ n: string }>(
      input.tradeId ? "SELECT count(*) AS n FROM journal_images WHERE user_id = $1 AND trade_id = $2" : "SELECT count(*) AS n FROM journal_images WHERE user_id = $1 AND note_day = $2",
      [user.id, input.tradeId ?? input.day],
    );
    if (Number(mine.n) >= MAX_IMAGES_PER_ITEM) throw new UserError("{0} images au plus par trade ou par note.", [MAX_IMAGES_PER_ITEM]);
    const id = newId();
    await run("INSERT INTO journal_images (id, user_id, trade_id, note_day, mime, bytes, data) VALUES ($1, $2, $3, $4, 'image/jpeg', $5, $6)", [
      id,
      user.id,
      input.tradeId ?? null,
      input.day ?? null,
      data.length,
      data,
    ]);
    return id;
  });
}

export async function readImage(userId: string, id: string): Promise<{ mime: string; data: Buffer } | null> {
  return queryOne<{ mime: string; data: Buffer }>("SELECT mime, data FROM journal_images WHERE id = $1 AND user_id = $2", [id, userId]);
}

export async function deleteImage(userId: string, id: string) {
  await query("DELETE FROM journal_images WHERE id = $1 AND user_id = $2", [id, userId]);
}
