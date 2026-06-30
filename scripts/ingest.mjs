/**
 * Sentroy App Store — manifest ingest (runs in CI on push to main, i.e. after a
 * PR merges). For each changed `apps/*.sentroy-app.json` it POSTs the raw file
 * to Sentroy's ingest endpoint, HMAC-SHA256-signed with APP_STORE_INGEST_SECRET.
 * Sentroy validates + upserts a pending app (source=github); a human still
 * reviews/approves it in the admin queue.
 *
 * The signature MUST be the HMAC of the exact bytes sent as the body — the
 * server recomputes it over `await req.text()` and compares (timing-safe).
 *
 * Usage: node scripts/ingest.mjs <file> [<file> …]
 * Env:   APP_STORE_INGEST_SECRET (required), INGEST_URL (optional override)
 */
import { readFileSync } from "node:fs"
import { createHmac } from "node:crypto"

// trim: secret'ın sonundaki gizli newline/boşluk HMAC'i bozmasın (core de trim'ler).
const SECRET = process.env.APP_STORE_INGEST_SECRET?.trim()
const URL = process.env.INGEST_URL || "https://sentroy.com/api/app-store/ingest"

if (!SECRET) {
  console.error("APP_STORE_INGEST_SECRET is not set — cannot ingest.")
  process.exit(1)
}

const files = process.argv.slice(2).filter(Boolean)
if (files.length === 0) {
  console.log("No changed manifests to ingest.")
  process.exit(0)
}

let failures = 0

for (const file of files) {
  let body
  try {
    body = readFileSync(file, "utf8")
  } catch (e) {
    failures++
    console.error(`✗ ${file}: cannot read — ${e.message}`)
    continue
  }

  const signature = createHmac("sha256", SECRET).update(body).digest("hex")

  try {
    const res = await fetch(URL, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sentroy-signature": signature },
      body,
    })
    const text = await res.text()
    if (!res.ok) {
      failures++
      console.error(`✗ ${file}: ingest returned ${res.status} — ${text.slice(0, 300)}`)
      continue
    }
    console.log(`✓ ${file}: ${text.slice(0, 200)}`)
  } catch (e) {
    failures++
    console.error(`✗ ${file}: request failed — ${e.message}`)
  }
}

if (failures > 0) {
  console.error(`\n${failures} manifest(s) failed to ingest.`)
  process.exit(1)
}
console.log(`\nIngested ${files.length} manifest(s).`)
