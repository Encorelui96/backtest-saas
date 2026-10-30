import fs from "node:fs";
import path from "node:path";
import { getMigrations } from "better-auth/db/migration";
import { auth } from "../src/lib/server/auth";
import { pool } from "../src/lib/server/db";

/** Creates or updates every table: better-auth's first, then the app's (which reference "user"). */
async function main() {
  const { runMigrations, toBeCreated, toBeAdded } = await getMigrations(auth.options);
  if (toBeCreated.length || toBeAdded.length) {
    console.log(`Tables de connexion : ${toBeCreated.map((t) => t.table).join(", ") || "colonnes ajoutées"}`);
    await runMigrations();
  }
  const sql = fs.readFileSync(path.join(process.cwd(), "db", "schema.sql"), "utf8");
  await pool().query(sql);
  console.log("Base de données à jour.");
  await pool().end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
