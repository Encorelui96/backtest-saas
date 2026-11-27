"use client";

import { useT } from "@/lib/client/i18n";
import { setThemeChoice, useThemeChoice } from "@/lib/client/theme";
import type { ThemeChoice } from "@/lib/theme";

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: "light", light: "dark", dark: "system" };

const ICONS: Record<ThemeChoice, string> = {
  // A screen: follows the device.
  system: "M4 5h16v11H4zM9 20h6M12 16v4",
  light: "M12 4V2M12 22v-2M4 12H2M22 12h-2M5.6 5.6 4.2 4.2M19.8 19.8l-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10z",
  dark: "M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z",
};

const LABELS: Record<ThemeChoice, string> = {
  system: "Thème : suit l'appareil",
  light: "Thème : clair",
  dark: "Thème : sombre",
};

/** One button: follows the device, then light, then dark, then back to the device. */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const tl = useT();
  const choice = useThemeChoice();
  const label = tl(LABELS[choice]);
  return (
    <button
      type="button"
      onClick={() => setThemeChoice(NEXT[choice])}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-panel-2 hover:text-fg ${className}`}
      title={`${label}. ${tl("Changer")}`}
      aria-label={`${label}. ${tl("Changer")}`}
    >
      <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d={ICONS[choice]} />
      </svg>
    </button>
  );
}
