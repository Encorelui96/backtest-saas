/**
 * The phone app shows the site itself, with this mark added to its browser's user agent.
 * Stores refuse selling outside their own payment there, and Google refuses its sign-in
 * inside an app's browser: elements with .web-only stay out of the app (globals.css).
 */
const APP_MARK = "BacktestLabApp";

export const isPhoneApp = (userAgent: string | null | undefined) => Boolean(userAgent?.includes(APP_MARK));

/** Runs before the first paint, so hidden elements never flash on screen. Pages are static: the server can't do it. */
export const APP_MODE_SCRIPT = `if(navigator.userAgent.includes("${APP_MARK}"))document.documentElement.dataset.app="1"`;
