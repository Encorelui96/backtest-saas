"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useT } from "@/lib/client/i18n";
import { MAX_IMAGES_PER_ITEM } from "@/lib/journal";
import { Alert } from "./ui";

/** An image shrunk in the browser and turned into JPEG: a phone photo of several MB comes to about 200 KB. */
export async function shrinkImage(file: Blob, maxSide = 1600, quality = 0.85): Promise<string> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d")!;
  // A transparent PNG would turn black in JPEG.
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", quality));
  if (!blob) throw new Error("image");
  const url = await new Promise<string>((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });
  return url.slice(url.indexOf(",") + 1);
}

/** Where a kept image is read: the journal's own route, for its owner only. */
export const imageUrl = (id: string) => `/api/journal/images/${id}`;

/** An image chosen and not saved yet: its JPEG, and what the page shows meanwhile. */
export interface PendingImage {
  key: string;
  data: string;
}

export const pendingUrl = (p: PendingImage) => `data:image/jpeg;base64,${p.data}`;

/** The image at full size, over the page. */
export function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  const tl = useT();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-2" role="dialog" aria-modal="true" aria-label={tl("Graphique")} onClick={onClose}>
      {/* eslint-disable-next-line @next/next/no-img-element -- the journal's own route, behind the sign-in: next/image would add nothing */}
      <img src={src} alt={tl("Graphique")} className="max-h-full max-w-full object-contain" />
      <button onClick={onClose} className="absolute top-3 right-3 rounded-full bg-black/60 px-3 py-1 text-lg text-white" aria-label={tl("Fermer")}>
        ✕
      </button>
    </div>
  );
}

/**
 * The charts of a trade or a note: thumbnails, a button to add some, a cross to remove one. Kept
 * images come from the journal; pending ones wait for the trade to be saved.
 */
export function ImageStrip({
  kept,
  pending = [],
  onPick,
  onRemoveKept,
  onRemovePending,
  quota,
  busy,
  actions,
}: {
  kept: string[];
  pending?: PendingImage[];
  /** New images chosen, already shrunk. */
  onPick: (images: string[]) => void;
  onRemoveKept: (id: string) => void;
  onRemovePending?: (key: string) => void;
  quota: { used: number; limit: number };
  busy?: boolean;
  /** Under each image, e.g. "Analyse with the AI". */
  actions?: (image: { id?: string; pending?: PendingImage }) => ReactNode;
}) {
  const tl = useT();
  const input = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);
  const count = kept.length + pending.length;
  const full = count >= MAX_IMAGES_PER_ITEM;
  const spent = quota.used + pending.length >= quota.limit;

  const pick = async (files: File[]) => {
    setError(null);
    const room = Math.min(MAX_IMAGES_PER_ITEM - count, quota.limit - quota.used - pending.length);
    if (room <= 0) return;
    setReading(true);
    try {
      const shrunk: string[] = [];
      for (const f of files.filter((f) => f.type.startsWith("image/")).slice(0, room)) shrunk.push(await shrinkImage(f));
      if (shrunk.length) onPick(shrunk);
    } catch {
      setError(tl("Cette image ne s'ouvre pas. Essaie une capture d'écran en PNG ou JPEG."));
    } finally {
      setReading(false);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        {kept.map((id) => (
          <figure key={id} className="flex w-24 flex-col gap-1">
            <div className="relative">
              <button type="button" onClick={() => setOpen(imageUrl(id))} className="block h-16 w-24 overflow-hidden rounded border border-line" aria-label={tl("Agrandir le graphique")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- see Lightbox */}
                <img src={imageUrl(id)} alt="" className="h-full w-full object-cover" loading="lazy" />
              </button>
              <button
                type="button"
                onClick={() => onRemoveKept(id)}
                disabled={busy}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-panel text-xs leading-5 text-muted shadow ring-1 ring-line hover:text-down"
                aria-label={tl("Supprimer l'image")}
              >
                ✕
              </button>
            </div>
            {actions?.({ id })}
          </figure>
        ))}
        {pending.map((p) => (
          <figure key={p.key} className="flex w-24 flex-col gap-1">
            <div className="relative">
              <button type="button" onClick={() => setOpen(pendingUrl(p))} className="block h-16 w-24 overflow-hidden rounded border border-dashed border-accent/60" aria-label={tl("Agrandir le graphique")}>
                {/* eslint-disable-next-line @next/next/no-img-element -- an image not saved yet, shown from the page's memory */}
                <img src={pendingUrl(p)} alt="" className="h-full w-full object-cover" />
              </button>
              <button
                type="button"
                onClick={() => onRemovePending?.(p.key)}
                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-panel text-xs leading-5 text-muted shadow ring-1 ring-line hover:text-down"
                aria-label={tl("Retirer l'image")}
              >
                ✕
              </button>
            </div>
            {actions?.({ pending: p })}
          </figure>
        ))}
        {!full && (
          <button
            type="button"
            onClick={() => input.current?.click()}
            disabled={busy || reading || spent}
            className="flex h-16 w-24 flex-col items-center justify-center rounded border border-dashed border-line text-xs text-muted hover:border-accent hover:text-fg disabled:opacity-50"
          >
            <span className="text-lg leading-none">+</span>
            {reading ? tl("Lecture…") : tl("Graphique")}
          </button>
        )}
      </div>
      <span className="text-[11px] text-muted">
        {spent
          ? tl("Ton journal a ses {0} images : supprime-en ou passe à une offre au-dessus.", [quota.limit])
          : tl("{0} images au plus par trade. {1} sur {2} gardées dans ton journal.", [MAX_IMAGES_PER_ITEM, quota.used, quota.limit])}
      </span>
      <input
        ref={input}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => {
          const files = [...(e.target.files ?? [])];
          e.target.value = "";
          pick(files);
        }}
      />
      {error && <Alert tone="error">{error}</Alert>}
      {open && <Lightbox src={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
