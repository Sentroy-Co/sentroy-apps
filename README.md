# Sentroy App Store — public catalog

Submit your app to the **Sentroy App Store** by opening a pull request that adds a
single manifest file under [`apps/`](apps/):

```
apps/<your-app-id>.sentroy-app.json
```

Your app runs **on your own servers** and is embedded inside Sentroy OS as a
sandboxed iframe. Sentroy never sees your source code. Users sign in to your app
with a short-lived signed identity token (or full OAuth) — the Sentroy session
cookie is never shared with your domain.

> There are two ways to submit: this repository (transparent, PR-reviewed), or the
> **Submit an app** form in your Sentroy company dashboard. Both land in the same
> review queue. Personal/unlisted apps you only want for yourself are uploaded
> privately in the dashboard and never appear in the public store.

## 1. Write your manifest

Create `apps/<id>.sentroy-app.json`. The file name **must** match `identity.id`.

```jsonc
{
  "manifestVersion": 1,
  "identity": {
    "id": "resend",                 // ^[a-z][a-z0-9-]{2,38}$, globally unique, immutable
    "name": "Resend",
    "version": "1.0.0",             // strict semver, must increase on each update
    "tagline": "Email for developers"
  },
  "appearance": {
    "logoUrl": "https://…/logo.png", // https only
    "color": "#0f0f0f",
    "category": "developer-tools",   // see categories below
    "screenshots": [{ "url": "https://…", "alt": "Dashboard", "width": 1280, "height": 800 }]
  },
  "embed": {
    "url": "https://app.example.com/sentroy",   // the iframe entry (https)
    "injectedParams": ["lang", "fallbackLang", "theme", "companySlug", "token"],
    "sandbox": { "allowForms": true, "allowPopups": false },
    "minHeight": 480
  },
  "auth": {
    "mode": "token",                            // none | token | oauth
    "jwksAudience": "https://app.example.com"   // required for token mode; must equal embed.url origin
  },
  "i18n": { "supportedLangs": ["en", "tr"], "fallbackLang": "en" },
  "store": {
    "description": "Short pitch (≤280 chars).",
    "longDescription": "Markdown supported (≤8000 chars).",
    "privacyUrl": "https://…/privacy",          // required
    "supportUrl": "https://…/support",
    "termsUrl": "https://…/terms"
  },
  "developer": { "companySlug": "your-company" }, // your Sentroy company slug
  "pricing": { "model": "free" },                 // or { "model": "paid", "polar": { … } }
  "capabilities": { "requestsUserIdentity": true }
}
```

A complete, valid sample lives in [`examples/resend.sentroy-app.json`](examples/resend.sentroy-app.json).

### Categories
`developer-tools` · `productivity` · `analytics` · `communication` · `marketing` · `finance` · `design` · `other`

### Auth modes
- **`none`** — no identity is passed; your app is fully anonymous in the frame.
- **`token`** — Sentroy injects a short-lived (≤60s) RS256 JWT into the iframe URL
  (`?token=…`). Verify it against Sentroy's JWKS; the `aud` claim equals your
  `embed.url` origin (set `jwksAudience` to the same). Strip the token from the
  URL after reading it.
- **`oauth`** — full OAuth 2.0 / OIDC authorization-code flow for account linking.
  An OAuth client is created for you on approval. Request only the scopes you need.

## 2. Open a pull request

Push your branch and open a PR. The **Validate manifests** check runs automatically
([`.github/workflows/validate.yml`](.github/workflows/validate.yml)) against the
schema in [`schema.ts`](schema.ts). Fix any reported issues until it's green.

## 3. Review & verification

After merge, Sentroy reviews your submission. Before it goes live we verify you
control the embed origin: serve a file at

```
https://<your-embed-origin>/.well-known/sentroy-app-verification.txt
```

containing the token shown in your dashboard. Your app must also belong to a real
Sentroy company (`developer.companySlug`) that you own or administer — this binds
every store app to a verified identity and blocks name/logo impersonation.

You'll receive email at each step (submission received → approved / changes requested).

## Validate locally

```bash
bun install
bun run validate
```

## Versioning

- `manifestVersion` is the **schema** contract (currently `1`). Don't bump it.
- `identity.version` is your **app release** (semver). Increase it on every update;
  the store keeps a version history.

## Security model (summary)

- Your app is sandboxed (`allow-scripts allow-same-origin allow-forms`; never
  top-navigation or modals) and your origin is added to Sentroy's CSP allow-list.
- The only credential that crosses into your iframe is the short-lived embed token —
  never the Sentroy session cookie.
- All security-relevant values (sandbox flags, granted scopes, origin) are computed
  server-side from your reviewed manifest; the raw file is not trusted at runtime.

Questions? Open an issue.
