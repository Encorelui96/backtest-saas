/**
 * Light or dark theme. The choice ("light", "dark", or nothing to follow the
 * device) is kept in localStorage; THEME_SCRIPT runs in <head> before the first
 * paint and marks <html data-theme>, so a light page never flashes dark. It
 * also follows the device when it switches (evening dark mode) and the choice
 * is "system". globals.css holds the two palettes.
 */
export const THEME_KEY = "backtest-lab:theme";
export type ThemeChoice = "system" | "light" | "dark";

/** Sent on window when the theme showing changes. */
export const THEME_EVENT = "backtest-lab:theme";

export const THEME_SCRIPT = `(function(){var k=${JSON.stringify(THEME_KEY)},m=matchMedia("(prefers-color-scheme: light)");function a(){var c;try{c=localStorage.getItem(k)}catch(e){}var t=c==="light"||c==="dark"?c:m.matches?"light":"dark",r=document.documentElement;if(r.dataset.theme!==t){r.dataset.theme=t;dispatchEvent(new Event(${JSON.stringify(THEME_EVENT)}))}}a();m.addEventListener("change",a)})()`;
