// Asks App Store Connect for the app's identifier with the API key, so a wrong key or team
// stops the run with a clear reason before the build. Prints no secret.
import { sign } from "node:crypto";

const { APPLE_TEAM_ID, ASC_ISSUER_ID, ASC_KEY_ID, ASC_PRIVATE_KEY } = process.env;
const BUNDLE_ID = "fr.backtestlab.app";

const stop = (reason) => {
  console.error(`::error::${reason}`);
  process.exit(1);
};

if (!/^[A-Z0-9]{10}$/.test(APPLE_TEAM_ID)) stop("APPLE_TEAM_ID must be 10 capitals or digits, nothing else.");
if (!/^[A-Z0-9]{10}$/.test(ASC_KEY_ID)) stop("ASC_KEY_ID must be 10 capitals or digits, nothing else.");
if (!/^[0-9a-f-]{36}$/.test(ASC_ISSUER_ID)) stop("ASC_ISSUER_ID must be a 36-character UUID, nothing else.");

const encode = (data) => Buffer.from(data).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const header = encode(JSON.stringify({ alg: "ES256", kid: ASC_KEY_ID, typ: "JWT" }));
const claims = encode(
  JSON.stringify({ iss: ASC_ISSUER_ID, iat: now, exp: now + 300, aud: "appstoreconnect-v1" }),
);
const signature = sign("sha256", Buffer.from(`${header}.${claims}`), {
  key: ASC_PRIVATE_KEY,
  dsaEncoding: "ieee-p1363",
});

const url = new URL("https://api.appstoreconnect.apple.com/v1/bundleIds");
url.searchParams.set("filter[identifier]", BUNDLE_ID);
const response = await fetch(url, {
  headers: { Authorization: `Bearer ${header}.${claims}.${encode(signature)}` },
});
const body = await response.json();
console.log(`App Store Connect answered ${response.status}.`);

if (!response.ok) {
  for (const { code, title, detail } of body.errors ?? []) console.log(`${code}: ${title}. ${detail}`);
  stop("App Store Connect refused the API key.");
}

const app = body.data.find((item) => item.attributes.identifier === BUNDLE_ID);
if (!app) stop(`The key works, but ${BUNDLE_ID} isn't registered for its team.`);
if (app.attributes.seedId !== APPLE_TEAM_ID) stop("The key works, but APPLE_TEAM_ID isn't this key's team.");
console.log("The key, the team and the identifier match.");
