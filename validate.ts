/**
 * Sentroy App Store — manifest validator (runs in CI on every PR).
 *
 * Validates every `apps/*.sentroy-app.json` (and `examples/*`) against the
 * vendored Zod schema, and enforces that the file name matches `identity.id`
 * (`<id>.sentroy-app.json`). Exits non-zero on any failure so the PR check
 * fails. Run: `bun run validate` (or `npx tsx validate.ts`).
 */
import { readdirSync, readFileSync, existsSync } from "node:fs"
import { join } from "node:path"
import { parseManifest } from "./schema"

const DIRS = ["apps", "examples"]
const SUFFIX = ".sentroy-app.json"

let failures = 0
let checked = 0

for (const dir of DIRS) {
  if (!existsSync(dir)) continue
  const files = readdirSync(dir).filter((f) => f.endsWith(SUFFIX))
  for (const file of files) {
    checked++
    const path = join(dir, file)
    let json: unknown
    try {
      json = JSON.parse(readFileSync(path, "utf8"))
    } catch (e) {
      failures++
      console.error(`✗ ${path}: invalid JSON — ${(e as Error).message}`)
      continue
    }

    const res = parseManifest(json)
    if (!res.ok) {
      failures++
      console.error(`✗ ${path}:`)
      for (const issue of res.issues) console.error(`    ${issue.path || "(root)"}: ${issue.message}`)
      continue
    }

    // File name must be `<identity.id>.sentroy-app.json` — one app per file,
    // discoverable by id, and prevents two files claiming the same app.
    const expected = `${res.manifest.identity.id}${SUFFIX}`
    if (file !== expected) {
      failures++
      console.error(`✗ ${path}: file must be named "${expected}" (matches identity.id)`)
      continue
    }

    console.log(`✓ ${path} — ${res.manifest.identity.name} v${res.manifest.identity.version}`)
  }
}

if (checked === 0) {
  console.log("No manifests to validate.")
}

if (failures > 0) {
  console.error(`\n${failures} manifest(s) failed validation.`)
  process.exit(1)
}

console.log(`\nAll ${checked} manifest(s) valid.`)
