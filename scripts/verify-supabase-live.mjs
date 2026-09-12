#!/usr/bin/env node
/**
 * Prompt 16 — Live Supabase smoke test (requires real credentials).
 *
 * Usage (never commit .env.local):
 *   1. Create .env.local with VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY
 *   2. node scripts/verify-supabase-live.mjs
 *
 * Does NOT create users or test accounts. Anonymous checks only:
 *   - project reachable over HTTPS
 *   - anon reads see zero rows (RLS hides everything, no error = RLS on)
 *   - anon inserts are rejected (writes blocked without a session)
 *   - private bucket is not publicly listable
 * Exits non-zero on any failure. Prints PASS/FAIL per check.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, "..", "package.json"));

function loadEnvLocal() {
  const file = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(file)) {
    console.error("FAIL: .env.local not found. Create it with VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY (see SUPABASE_SETUP.md).");
    process.exit(2);
  }
  const env = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*(VITE_SUPABASE_URL|VITE_SUPABASE_ANON_KEY)\s*=\s*(.+?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

async function main() {
  const env = loadEnvLocal();
  const url = env.VITE_SUPABASE_URL || "";
  const anon = env.VITE_SUPABASE_ANON_KEY || "";
  let failed = 0;
  const check = (name, pass, detail = "") => {
    console.log(`${pass ? "PASS" : "FAIL"}: ${name}${detail ? ` — ${detail}` : ""}`);
    if (!pass) failed += 1;
  };

  check("env present", url.startsWith("https://") && anon.length > 20, "values redacted");
  if (failed > 0) process.exit(1);

  const { createClient } = require("@supabase/supabase-js");
  const client = createClient(url, anon);

  try {
    const { data, error } = await client.from("cases").select("id").limit(1);
    check("reachable + RLS hides rows from anon", error === null && Array.isArray(data) && data.length === 0, error ? error.message : "0 rows visible");
  } catch (e) {
    check("reachable + RLS hides rows from anon", false, e.message);
  }

  try {
    const { error } = await client.from("cases").insert({ title: "smoke", description: "smoke" });
    check("anon inserts rejected", error !== null, error ? `rejected (${error.code || "no code"})` : "UNEXPECTEDLY ACCEPTED");
  } catch (e) {
    check("anon inserts rejected", true, `rejected (${e.message})`);
  }

  // NOTE: object LIST on an empty bucket returns [] with no error even when
  // RLS is on (no rows to evaluate), so listability proves nothing. The
  // meaningful anonymous checks are bucket metadata (public flag) + write
  // rejection. Object-level isolation is proven in the authenticated matrix.
  try {
    const { data, error } = await client.storage.getBucket("nyayasetu-private");
    if (error) check("private bucket exists", false, error.message);
    else check("private bucket exists + public=false", data && data.public === false, data ? `public=${data.public}` : "no metadata");
  } catch (e) {
    check("private bucket exists", false, e.message);
  }

  if (failed > 0) {
    console.error(`\n${failed} check(s) failed. Do not treat this backend as live.`);
    process.exit(1);
  }
  console.log("\nAll anonymous checks passed. Authenticated checks still need a real user (see SUPABASE_SETUP.md).");
}

main().catch((e) => { console.error("FAIL:", e.message); process.exit(1); });
