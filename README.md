# Go-Cinch PC Admin Layout

Generate a PC admin frontend integrated with `chi-auth-layout` using Scaffold.
The repository follows the backend layout: `scaffold.yml` defines generation
parameters, `{{ .Project }}/<ui>` contains each UI template, and the Makefile
provides generation and validation commands.

The default UI is **`vben-antd-vue3`**: Vben Admin, Vue 3, and Ant Design Vue 4.
The additional **`tail-react`** option uses TailAdmin, React 19, Vite, and
Tailwind CSS 4. **`art-eleplus-vue3`** uses Art Design Pro, Vue 3, and
Element Plus. **`shadcn-react`** uses Next.js 16, React 19, and shadcn/ui.
`vben`, `tail`, `art`, and `shadcn` are aliases for those options.
**`tdesign-vue3-mobile`** (alias **`tdesign-mobile`**) implements the Moonwhite
mobile-admin prototype with Vue 3 and Tencent TDesign Mobile Vue. Its standalone
application uses pnpm 10.2.0 and a committed lockfile.

## Generate a Project

Requires Scaffold (validated with 0.13.1). Installing and running a generated
project requires Node.js `^22.18.0 || ^24.12.0` and pnpm `11.16.0`, matching the
source project.

```bash
git clone https://github.com/go-cinch/pc-admin-fe-layout.git
cd pc-admin-fe-layout
make full PROJECT=my-admin
# Equivalent explicit UI selection with a custom output directory
make full PROJECT=my-admin UI=vben-antd-vue3 OUTPUT_DIR=/path/to/projects
# Generate the React option (npm lockfile retained)
make full PROJECT=my-admin UI=tail-react OUTPUT_DIR=/path/to/projects
# Generate the Art Design Pro option (pnpm lockfile retained)
make full PROJECT=my-admin UI=art-eleplus-vue3 OUTPUT_DIR=/path/to/projects
# Generate the shadcn/ui option (Bun lockfile retained)
make full PROJECT=my-admin UI=shadcn-react OUTPUT_DIR=/path/to/projects
# Generate the mobile TDesign option
make full PROJECT=my-admin UI=tdesign-vue3-mobile OUTPUT_DIR=/path/to/projects
# Supported alias
make full PROJECT=my-admin UI=vben
# Override production API URLs
make full PROJECT=my-admin \
  VITE_GLOB_API_URL=https://api.example.com \
  VITE_GLOB_AUTH_API_URL=https://auth.example.com
```

By default, projects are generated in the parent directory of this repository.
Use a fresh destination for each generation.

You can also invoke Scaffold directly. Omitting `ui` defaults to
`vben-antd-vue3`:

```bash
scaffold new https://github.com/go-cinch/pc-admin-fe-layout \
  --output-dir=/path/to/projects --run-hooks=always --no-prompt \
  Project=my-admin ui=vben-antd-vue3 \
  VITE_GLOB_API_URL=https://api.example.com \
  VITE_GLOB_AUTH_API_URL=https://auth.example.com
```

Local template generation requires no network access and does not install
dependencies. Keep `--run-hooks=always`: the post-generation hook moves the
selected UI's contents into the project root and removes the empty UI directory.
`make full` enables this automatically. Disabling hooks leaves the intermediate
UI directory in place.

Every UI uses the same `VITE_GLOB_API_URL` and `VITE_GLOB_AUTH_API_URL` names in
its generated `.env.production`. Both default to
`https://entry.go-cinch.top/api/auth` and can be overridden independently
through Scaffold or the matching Make variables.

```bash
cd ../my-admin
# Vben
pnpm install --frozen-lockfile && pnpm check:type && pnpm build
# Tail React
npm ci && npm run lint && npm run build
# Art Design Pro
pnpm install --frozen-lockfile && pnpm lint && pnpm build
# shadcn/ui
bun install --frozen-lockfile && bun run lint && bun run typecheck && bun run build
# TDesign Mobile Vue (pnpm 10.2.0 via Corepack)
pnpm install --frozen-lockfile && pnpm lint && pnpm check:type && pnpm test && pnpm build
```

Set `AUTH_PROXY_TARGET` to your backend service URL. For Vben, define it in
`apps/web-antd/.env.development.local`; for the other UIs, use the root
`.env.development.local`. When unset, the Vite-based UIs do not enable the auth
proxy, allowing an external gateway to serve `/api/auth`.

## Template Contents

Each UI has its own directory, including its dependency manifests and lockfile:

```text
{{ .Project }}/
  vben-antd-vue3/
    apps/web-antd/
    internal/
    packages/
    scripts/
    package.json
    pnpm-workspace.yaml
    pnpm-lock.yaml
  tail-react/
    src/
    public/
    package.json
    package-lock.json
  art-eleplus-vue3/
    src/
    public/
    package.json
    pnpm-lock.yaml
  shadcn-react/
    src/
    public/
    package.json
    bun.lock
```

UI directories organize the template repository only. Selecting `vben-antd-vue3`
or its `vben` alias generates a single application workspace directly in
`my-admin/`, with no UI subdirectory:

```text
my-admin/
  apps/web-antd/
  internal/
  packages/
  scripts/
  package.json
  pnpm-workspace.yaml
  pnpm-lock.yaml
```

Run the selected package manager from `my-admin/`. The shared post-generation
hook uses the selected UI name, so every option has the same flat output shape.

The maintained templates include
login, captchas, registration, token refresh, password reset, profile settings,
and system management pages. Their original license and framework-native visual
systems are retained.

All six frontends use the Go Cinch blue logo on light surfaces and the white
logo on dark surfaces. Browser favicons follow the application's resolved
light/dark theme, including saved preferences and system mode. Before the app
initializes, Vite apps use `public/favicon.svg` with the browser color scheme.
Only one SVG favicon is declared at runtime so a fixed-color ICO cannot
override the selected theme. ICO assets remain available for manual use;
Next.js keeps its ICO at `public/go-cinch-fallback.ico` to avoid automatic
metadata injection and adds the themed SVG after hydration.

All six frontends use a searchable local account history on the login page.
Only successful login account names are saved, with the ten most recent unique
accounts scoped to the current hostname. Users can select, remove, or clear
history. Successful registration passes the new account and password to the login
form once in memory; refreshing or leaving the login page clears that password.
Other login visits start with an empty password. Remember-me controls and
application password saving are removed, and legacy saved credentials are deleted
at startup.

It retains Vben's pnpm monorepo structure and generates only the
`apps/web-antd` UI application. Other UI applications, backend-mock, playground,
the documentation site, node_modules, build artifacts, and Git history are
excluded. Vben's original MIT notice is retained as `LICENSE_VBEN`.

Commit dependency manifests and lockfiles, but do not include downloaded
packages such as `node_modules`, package manager caches, or build outputs.
Both `.gitignore` and Scaffold exclusion rules cover these artifacts. Users
install dependencies after generation with `pnpm install --frozen-lockfile`.

Vben uses pnpm and retains its monorepo commands. Tail React uses npm and the
`dev`, `lint`, `build`, and `preview` scripts in its generated `package.json`.
Art Design Pro uses pnpm and its native Vue/Vite scripts. shadcn-react uses Bun
and its native Next.js scripts. Generated package
names are derived from the project name.

## Auth URLs and Reverse Proxy

Development and analyze modes use **`/api/auth`**. Production values come from the
`VITE_GLOB_API_URL` and `VITE_GLOB_AUTH_API_URL` Scaffold parameters, which both
default to `https://entry.go-cinch.top/api/auth`. The development proxy has no
hardcoded local backend URL.

Here, `/api/auth` is the **gateway prefix for the entire auth service**, including
resources such as users and roles. The proxy removes this outer prefix while
preserving the backend's own module paths:

| Browser request | Request forwarded to the backend |
| --- | --- |
| `/api/auth/auth/pub/login` | `/auth/pub/login` |
| `/api/auth/user` | `/user` |
| `/api/auth/role` | `/role` |

For production, see `scripts/deploy/nginx.conf`: `location /api/auth/` uses
`proxy_pass http://auth-service:8080/;`. The trailing `/` removes the gateway
prefix. Replace `auth-service:8080` with your actual upstream address or service
name. Docker builds package `apps/web-antd/dist` by default.

Mock services are disabled. The integration uses frontend routes and backend
permissions. Switching to Vben's backend menu mode requires implementing a menu
endpoint; `chi-auth-layout` currently does not provide Vben's example
`/menu/all` endpoint.

## Validation

```bash
make test
```

The tests cover default parameters, explicit UI selection, the `vben` alias,
presets, the Make entry point, and rejection of invalid UI values. They also
check Vue interpolation, binary assets, hidden files, application code,
workspace dependency completeness, the auth prefix, UI directory isolation,
exclusion of installed dependencies and local artifacts, and flattening the
selected UI into the project root without overwriting existing files.

Generation tests require only Scaffold and Python 3; they do not install npm
dependencies.

## Adding More UI Templates

`ui` selects the template at generation time. To add another UI, update:

1. `questions.ui`, `computed.ui_final`, presets, and features in `scaffold.yml`.
2. Add a sibling directory at `{{ .Project }}/<new-ui>/` containing that UI's
   application, shared source packages, package.json, workspace configuration,
   and lockfile. Add a feature matching `**/<new-ui>/**` whose value checks
   `computed.ui_final`. Keep each UI's files inside its own directory so only
   the selected UI is generated.
3. UI validation in the Makefile and the generation matrix in
   `scripts/test-template.py`.

File contents use `[[scaffold ... scaffold]]` as Scaffold delimiters to avoid
conflicts with Vue's `{{ ... }}` syntax. Paths continue to use Scaffold's default
`{{ .Project }}` syntax.

### Ant Design Mobile · 绛钛

`make local DEMO=ant-design-mobile` generates the React mobile implementation of `mobile-admin/index2.html` into `demos/ant-design-mobile`. Select `ui=ant-design-mobile` (alias `antd-mobile`) or the corresponding preset. It preserves the garnet light/dark prototype styling and uses the same real auth and management APIs as Vben. The local port allocator selects the first unassigned port above 5666 and preserves `.env.development.local`; this demo currently uses 5671.

See [`{{ .Project }}/ant-design-mobile/README.md`](<{{ .Project }}/ant-design-mobile/README.md>) for development and validation commands.

## Mini-program UI templates

The three mini-program selectors preserve the mobile prototype directions and share
one platform-independent auth/management implementation:

| Selector | UI runtime | Target | Design |
| --- | --- | --- | --- |
| `ant-design-mini` | Ant Design Mini 3.4.3, native WXML/TypeScript | WeChat mini-program | Soft garnet, grouped lists, floating dock |
| `tdesign-mini` | TDesign MiniProgram 1.17.0, native WXML/TypeScript | WeChat mini-program | Blue overview, clear application rows |
| `wot-ui-mini` | Wot UI 2.3.2, uni-app, Vue 3 | WeChat mini-program; H5 preview | Indigo cards, compact mobile controls |

```bash
make local DEMO=ant-design-mini
make local DEMO=tdesign-mini
make local DEMO=wot-ui-mini
# Or generate a standalone project:
make full PROJECT=my-mini UI=tdesign-mini OUTPUT_DIR=/path/to/projects
```

In each generated project run `pnpm install --frozen-lockfile`, `pnpm check:type`,
`pnpm test`, and `pnpm build`. Native projects generate `dist/`; import the
project root into WeChat DevTools. Wot generates `dist/build/mp-weixin/`; import
that directory. `pnpm dev` rebuilds for development. Wot also supports
`pnpm dev:h5` and `pnpm build:h5`.

`make local` preserves ignored `mini.config.local`, `.env.development.local`,
and `project.private.config.json`. `mini.config.local` contains the developer's
WeChat `appid` and an absolute development `apiBase`. The default `touristappid`
is for simulator inspection only; use your own AppID and a registered HTTPS
request domain for device previews and release. Production builds use
`VITE_GLOB_AUTH_API_URL` from `.env.production`, never the local development API.
The H5 development proxy still uses `AUTH_PROXY_TARGET` and its assigned port.

The generation hook merges `{{ .Project }}/_mini-core` into the selected
project's `src/core`. Edit shared business logic there. The native adapters and
Wot components live in the individual template directories. The screen markup
and native adapter generation sources are under `scripts/mini`; after changing
them run `python3 scripts/mini/render.py`. Generation does not need Python and
uses the committed rendered files.

All templates use the real backend contract: one-time JWE credentials,
server-verified slider/point captcha, rotating refresh sessions, first-login
password reset, permission-filtered menus/actions, six management modules,
messages, per-field validation, and Chinese/English labels. Access tokens stay
in memory; only refresh tokens, preferences, and recent usernames are persisted.
The login page provides a full interface settings screen (appearance, language,
timezone, footer and copyright), accessible without authentication. Account
history supports individual removal and clearing; selecting an account clears
the password. No remember-account toggle or custom top-right overflow is shown. Passwords, JWE credentials, and captcha proofs are never persisted.
No sample users, fake sessions, fixed captcha proof, or production mock mode is
included. UI permissions supplement backend authorization; they do not replace it.

Native builds bundle only the referenced component dependency graph, including
WXML/WXSS/WXS dependencies; no manual “build npm” step is needed. Unit tests
independently decrypt the mini-program JWE with JOSE, verify tamper rejection,
exercise refresh races and credential transport, and check route/permission
contracts. WeChat device verification still requires a developer AppID and
normal platform login, permissions, HTTPS domain configuration, and packaging.
