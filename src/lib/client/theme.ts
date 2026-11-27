"use client";

import { useSyncExternalStore } from "react";
import { THEME_EVENT, THEME_KEY, type ThemeChoice } from "../theme";

/**
 * Light or dark: "system" follows the phone or computer, the other two force
 * it. Kept in this browser only, like the beginner/expert level. The script in
 * lib/theme.ts applies it before the first paint and follows the device; this
 * changes it from the button.
 */

const listeners = new Set<() => void>();

function read(): ThemeChoice {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

const systemLight = () => window.matchMedia("(prefers-color-scheme: light)").matches;

/** Puts the theme the choice leads to on <html>, where the colours (globals.css) and the charts read it. */
function apply(choice: ThemeChoice) {
  const theme = choice === "system" ? (systemLight() ? "light" : "dark") : choice;
  const root = document.documentElement;
  if (root.dataset.theme !== theme) {
    root.dataset.theme = theme;
    window.dispatchEvent(new Event(THEME_CHANGED));
  }
}

/** Sent on window when the page changes theme: the charts redraw with the new colours. */
export const THEME_CHANGED = THEME_EVENT;

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key !== THEME_KEY) return;
    apply(read());
    fn();
  };
  // The device switching between light and dark is followed by THEME_SCRIPT itself.
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(fn);
    window.removeEventListener("storage", onStorage);
  };
}

export function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, choice);
  } catch {
    // Private browsing: the choice only lasts for this page.
  }
  apply(choice);
  listeners.forEach((fn) => fn());
}

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(subscribe, read, () => "system");
}

/** The theme showing now: what the charts need. */
export function currentTheme(): "light" | "dark" {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

const themeSubscribe = (fn: () => void) => {
  window.addEventListener(THEME_CHANGED, fn);
  return () => window.removeEventListener(THEME_CHANGED, fn);
};

/** The theme showing now, kept up to date; dark on the server. */
export function useTheme(): "light" | "dark" {
  return useSyncExternalStore(themeSubscribe, currentTheme, () => "dark");
}
