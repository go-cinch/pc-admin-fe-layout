# Go-Cinch PC Admin Layout

Generate a PC admin frontend integrated with `chi-auth-layout` using Scaffold.
The repository follows the backend layout: `scaffold.yml` defines generation
parameters, `{{ .Project }}/<ui>` contains each UI template, and the Makefile
provides generation and validation commands.

The default UI is **`vben-antd-vue3`**: Vben Admin, Vue 3, and Ant Design Vue 4.
`vben` is an alias that generates the same project. Other UI values are currently
rejected.

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

`VITE_GLOB_API_URL` and `VITE_GLOB_AUTH_API_URL` configure the generated
`.env.production`. Both default to `https://entry.go-cinch.top/api/auth` and can
be overridden independently through Scaffold or the matching Make variables.

```bash
cd ../my-admin
pnpm install --frozen-lockfile
AUTH_PROXY_TARGET=http://127.0.0.1:8080 pnpm dev
pnpm check:type
pnpm build
```

Set `AUTH_PROXY_TARGET` to your backend service URL. You can also define it in
`apps/web-antd/.env.development.local`. When unset, Vite does not enable the auth
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

Run pnpm commands from `my-admin/`. The shared post-generation hook uses the
selected UI name, so future UI templates follow the same output structure.

The template was copied from the local `vben-admin` working tree. It includes
login, captchas, registration, token refresh, password reset, profile settings,
and system management pages, together with the shared package changes required
by these features.

It retains Vben's pnpm monorepo structure and generates only the
`apps/web-antd` UI application. Other UI applications, backend-mock, playground,
the documentation site, node_modules, build artifacts, and Git history are
excluded. Vben's original MIT notice is retained as `LICENSE_VBEN`.

Commit dependency manifests and lockfiles, but do not include downloaded
packages such as `node_modules`, package manager caches, or build outputs.
Both `.gitignore` and Scaffold exclusion rules cover these artifacts. Users
install dependencies after generation with `pnpm install --frozen-lockfile`.

The root commands `pnpm dev`, `pnpm build`, `pnpm preview`, and `pnpm check:type`
target `@vben/web-antd` by default. The project package name and browser cache
namespace are derived from the generated project name. The store encryption key
is randomly initialized for each generated project.

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
