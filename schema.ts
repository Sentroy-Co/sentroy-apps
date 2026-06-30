import { z } from "zod"

/**
 * Sentroy App Store manifest schema — `<id>.sentroy-app.json`.
 *
 * ⚠ MIRROR of the monorepo's `@workspace/app-manifest` (packages/app-manifest/
 * src/schema.ts). Keep the two in sync — this is the public, vendored copy the
 * PR-validation CI runs against (no private dependency). It has ZERO deps
 * beyond `zod`.
 */

/** Schema-contract version (do NOT confuse with `identity.version`, the app release). */
export const MANIFEST_VERSION = 1 as const

/** Params the OS may inject into the embed iframe URL. */
export const INJECTABLE_PARAMS = ["lang", "fallbackLang", "theme", "companySlug", "token"] as const
export type InjectableParam = (typeof INJECTABLE_PARAMS)[number]

/** Sentroy platform languages (10) — supportedLangs is a subset of these. */
export const SUPPORTED_LANGS = ["en", "tr", "de", "fr", "es", "pt", "ru", "hi", "id", "ar"] as const
export type ManifestLang = (typeof SUPPORTED_LANGS)[number]

/** OAuth scopes — mirrored from the OAuth provider. */
export const OAUTH_SCOPES = ["openid", "profile", "email", "offline_access"] as const
export type ManifestScope = (typeof OAUTH_SCOPES)[number]

/** Store categories. */
export const APP_CATEGORIES = [
  "developer-tools",
  "productivity",
  "analytics",
  "communication",
  "marketing",
  "finance",
  "design",
  "other",
] as const

/** Reserved ids/slugs — prevent collision with first-party apps + impersonation. */
export const RESERVED_IDS = [
  "sentroy",
  "core",
  "mail",
  "storage",
  "auth",
  "status",
  "studio",
  "whatsapp",
  "tools",
  "downloader",
  "admin",
  "app-store",
  "store",
] as const

const ID_RE = /^[a-z][a-z0-9-]{2,38}$/
const HEX_COLOR_RE = /^#([0-9a-fA-F]{6})$/
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/
const IP_HOST_RE = /^(\d{1,3}(\.\d{1,3}){3}|\[.*\])$/

const httpsUrl = z
  .string()
  .url()
  .superRefine((val, ctx) => {
    let u: URL
    try {
      u = new URL(val)
    } catch {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "invalid URL" })
      return
    }
    if (u.protocol !== "https:") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "must be https" })
    }
    if (IP_HOST_RE.test(u.hostname) || u.hostname === "localhost") {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: "IP/localhost host not allowed" })
    }
  })

function originOf(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

const identitySchema = z.object({
  id: z.string().regex(ID_RE, "id: ^[a-z][a-z0-9-]{2,38}$").refine((v) => !RESERVED_IDS.includes(v as never), "id is reserved"),
  slug: z.string().regex(ID_RE).optional(),
  name: z.string().min(1).max(40),
  version: z.string().regex(SEMVER_RE, "strict semver required"),
  tagline: z.string().max(80).optional(),
})

const screenshotSchema = z.object({
  url: httpsUrl,
  alt: z.string().max(120).optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
})

const appearanceSchema = z.object({
  logoUrl: httpsUrl,
  color: z.string().regex(HEX_COLOR_RE, "hex color like #0f0f0f"),
  category: z.enum(APP_CATEGORIES),
  screenshots: z.array(screenshotSchema).max(6).optional(),
})

const embedSchema = z.object({
  url: httpsUrl,
  injectedParams: z.array(z.enum(INJECTABLE_PARAMS)).default([]),
  sandbox: z
    .object({
      allowForms: z.boolean().optional(),
      allowPopups: z.boolean().optional(),
      allowDownloads: z.boolean().optional(),
    })
    .strict()
    .optional(),
  minHeight: z.number().int().min(120).max(4000).optional(),
})

const authSchema = z.object({
  mode: z.enum(["none", "token", "oauth"]),
  jwksAudience: httpsUrl.optional(),
  requiredScopes: z.array(z.enum(OAUTH_SCOPES)).optional(),
  // Never trusted from a PR — Sentroy fills this on approval. Must be null/absent in the manifest.
  oauthClientId: z.null().optional(),
})

const i18nSchema = z.object({
  supportedLangs: z.array(z.enum(SUPPORTED_LANGS)).min(1),
  fallbackLang: z.enum(SUPPORTED_LANGS),
})

const storeSchema = z.object({
  description: z.string().min(1).max(280),
  longDescription: z.string().max(8000).optional(),
  supportUrl: httpsUrl.optional(),
  privacyUrl: httpsUrl,
  termsUrl: httpsUrl.optional(),
})

const developerSchema = z.object({
  companySlug: z.string().regex(/^[a-z0-9][a-z0-9-]{1,62}$/, "company slug"),
})

const pricingSchema = z.discriminatedUnion("model", [
  z.object({ model: z.literal("free") }),
  z.object({
    model: z.literal("paid"),
    polar: z.object({
      mode: z.enum(["sandbox", "production"]),
      productIds: z.array(z.string().min(1)).min(1),
      kind: z.enum(["subscription", "one_time"]),
    }),
  }),
])

const capabilitiesSchema = z
  .object({
    requestsUserIdentity: z.boolean(),
  })
  .strict() // v1: only requestsUserIdentity — forward-guard

const baseSchema = z.object({
  manifestVersion: z.number().int().min(1).max(MANIFEST_VERSION),
  identity: identitySchema,
  appearance: appearanceSchema,
  embed: embedSchema,
  auth: authSchema,
  i18n: i18nSchema,
  store: storeSchema,
  developer: developerSchema,
  pricing: pricingSchema,
  capabilities: capabilitiesSchema,
})

/**
 * Cross-field invariants (load-bearing — security critical):
 * - auth.mode=token ⇒ jwksAudience present AND its origin === embed.url origin
 * - injectedParams includes "token" ⇒ auth.mode ≠ none
 * - i18n.fallbackLang ∈ supportedLangs
 */
export const sentroyAppManifestSchema = baseSchema.superRefine((m, ctx) => {
  if (m.auth.mode === "token") {
    if (!m.auth.jwksAudience) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["auth", "jwksAudience"], message: "required when auth.mode is 'token'" })
    } else {
      const aud = originOf(m.auth.jwksAudience)
      const embed = originOf(m.embed.url)
      if (aud && embed && aud !== embed) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["auth", "jwksAudience"],
          message: "jwksAudience origin must equal embed.url origin",
        })
      }
    }
  }

  if (m.embed.injectedParams.includes("token") && m.auth.mode === "none") {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["embed", "injectedParams"],
      message: "'token' param requires auth.mode 'token' or 'oauth'",
    })
  }

  if (!m.i18n.supportedLangs.includes(m.i18n.fallbackLang)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["i18n", "fallbackLang"], message: "fallbackLang must be in supportedLangs" })
  }

  if (m.identity.slug && RESERVED_IDS.includes(m.identity.slug as never)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["identity", "slug"], message: "slug is reserved" })
  }
})

export type SentroyAppManifest = z.infer<typeof sentroyAppManifestSchema>

export interface ParseIssue {
  path: string
  message: string
}

export type ParseResult =
  | { ok: true; manifest: SentroyAppManifest }
  | { ok: false; issues: ParseIssue[] }

export function parseManifest(input: unknown): ParseResult {
  const res = sentroyAppManifestSchema.safeParse(input)
  if (res.success) return { ok: true, manifest: res.data }
  return { ok: false, issues: res.error.issues.map((i) => ({ path: i.path.join("."), message: i.message })) }
}
