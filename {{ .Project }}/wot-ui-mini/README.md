# wot-ui-mini

Go Cinch mobile administration using the wot-ui-mini UI template.

## Generate and run

Generate from pc-admin-fe-layout with `make local DEMO=wot-ui-mini`. Then:

```bash
pnpm install --frozen-lockfile
pnpm check:type
pnpm test
pnpm build
pnpm dev
```

Native Ant/TDesign: import this project root into WeChat DevTools after building.
Wot: import `dist/build/mp-weixin` after building (`dist/dev/mp-weixin` during watch).
Wot additionally supports `pnpm dev:h5` and `pnpm build:h5`.

Use `mini.config.local` for your AppID and absolute development API base:

```json
{"appid":"your-wechat-appid","apiBase":"http://127.0.0.1:8081"}
```

The local loopback URL is for the developer-tool simulator only. A phone must
use a reachable HTTPS API domain registered for that AppID. Production builds
read `VITE_GLOB_AUTH_API_URL` in `.env.production`. Keep real AppIDs and local
endpoints in ignored local files. Never enable backend E2E captcha switches for
production. Tourist AppID is a build/inspection placeholder, not a publishable app.

## Behavior

Overview, applications, users, roles, groups, actions, dictionaries, allowlist,
inbox, message management, profile, login/register, required password reset,
password change, local preferences, themes, and languages use real backend APIs.
Each canonical web route maps to `pages/<route>/index` without changing its
business meaning. Passwords are JWE-encrypted with a one-time server challenge;
no plaintext password is sent or stored. The build uses the platform secure
random generator and fails closed when that capability is unavailable.

The screen layouts follow the 2026-10-10 Go Cinch mini-program prototypes.
The source of the shared business layer is `{{ .Project }}/_mini-core` in the
layout repository; the generator copies it into `src/core`. Modify templates,
then regenerate with `make local`; do not make demo-only fixes.

## Verification

`pnpm test` checks JWE interoperability, tamper detection, secure randomness,
refresh rotation/races, token persistence boundaries, permission namespaces,
route mapping, form fields, and stale captcha responses. Always verify actual
login, captcha gestures, API domain access, keyboard behavior, and platform
components in WeChat DevTools and on your target devices before publishing.
