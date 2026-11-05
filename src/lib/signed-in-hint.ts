/**
 * Whether this browser was signed in last time. The session takes a moment to load:
 * visitors see the page at once, and only a browser known to be signed in waits for it.
 */
const KEY = "backtest-lab:signed-in";

/** Runs before the first paint, so the wrong page never flashes. Pages are static: the server can't do it. */
export const SIGNED_IN_SCRIPT = `try{if(localStorage.getItem("${KEY}"))document.documentElement.dataset.signedIn="1"}catch(e){}`;

export const signedInHint = () => document.documentElement.dataset.signedIn === "1";

export function setSignedInHint(signedIn: boolean) {
  try {
    if (signedIn) localStorage.setItem(KEY, "1");
    else localStorage.removeItem(KEY);
  } catch {}
}
