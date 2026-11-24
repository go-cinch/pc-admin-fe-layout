# Go-Cinch PC Admin Layout

Generate PC and H5 admin frontends integrated with `chi-auth-layout` using Scaffold.
The repository follows the backend layout: `scaffold.yml` defines generation
parameters, `{{ .Project }}/<ui>` contains each UI template, and the Makefile
provides generation and validation commands.

The default UI is **`vben-antd-vue3`**: Vben Admin, Vue 3, and Ant Design Vue 4.
The additional **`tail-react`** option uses TailAdmin, React 19, Vite, and
Tailwind CSS 4. **`art-eleplus-vue3`** uses Art Design Pro, Vue 3, and
Element Plus. **`shadcn-react`** uses Next.js 16, React 19, and shadcn/ui.
`vben`, `tail`, `art`, and `shadcn` are aliases for those options.
**`tdesign-vue3-h5`** (alias **`tdesign-h5`**) implements the Moonwhite
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
# Generate the TDesign H5 option
make full PROJECT=my-admin UI=tdesign-vue3-h5 OUTPUT_DIR=/path/to/projects
# Supported alias
make full PROJECT=my-admin UI=vben
# Override production API URLs
make full PROJECT=my-admin \
  VITE_GLOB_API_URL=https://api.example.com \
  VITE_GLOB_AUTH_API_URL=https://auth.example.com
```

## Vben Branding

Use one brand name for both this Vben generator and `chi-auth-layout`:

```bash
make full PROJECT=project-admin UI=vben BRAND_NAME="this is my project"
# Generate the title "Go Cinch Admin"
make full PROJECT=my-admin UI=vben HIDE_UI_SUFFIX=true
# Optional: copy a local logo and use your actual GitHub repository URL
make full PROJECT=acme-admin UI=vben BRAND_NAME=acme \
  LOGO_PATH="/absolute/path/my logo.png" \
  GITHUB_URL=https://github.com/acme/admin
```

| Make variable | Scaffold argument | Default |
| --- | --- | --- |
| `BRAND_NAME` | `brand_name` | `go cinch` |
| `HIDE_UI_SUFFIX` | `hide_ui_suffix` | `false` (show `by <UI>`) |
| `GITHUB_URL` | `github_url` | `https://github.com/<brand-slug>/demos` |
| `LOGO_PATH` | `logo_path` | Bundled light/dark logos |

`HIDE_UI_SUFFIX=true` generates `<Brand> Admin` for the browser title, loading
screen, and wide login header. The narrower login headers use `<Brand> Admin`
and `<Brand>`. Direct Scaffold commands accept `hide_ui_suffix=true`. Additional UI templates
can read `.Computed.hide_ui_suffix` when rendering their own title suffix.

`this is my project` becomes `This Is My Project` in titles and login copy,
`this is my project` in lowercase copy, and `this-is-my-project` in asset names,
copyright names, and identifiers. `acme` becomes `Acme` / `acme` / `acme`.
Names must start with an English letter and contain only English letters, digits,
spaces, hyphens, or underscores; surrounding spaces and repeated separators are
normalized. Project/package names remain controlled by `PROJECT`.

This covers all three responsive login titles, HTML metadata, bundled locales,
copyright, about/dashboard text, browser draft keys, logo references, and default
test snapshots. GitHub links share `GITHUB_URL`; upstream Vben dependency metadata
and licenses retain their attribution. Generated GitHub links are naming defaults;
the generator does not create a repository.

Legacy browser-storage migrations still recognize historical `cinch-*` keys
so upgrades can recover existing data.

`LOGO_PATH` must be an absolute path to a readable, non-empty SVG, PNG, JPG, JPEG,
WebP, GIF, or ICO file. The post-generation hook copies its original bytes to
`<brand-slug>.<ext>`, `<brand-slug>-white.<ext>` and `<brand-slug>-favicon.<ext>`;
a single supplied image is used for both themes and the favicon without recoloring.
Supplying an ICO also replaces `/favicon.ico`. Other formats use the linked
brand favicon and omit the bundled ICO.
The original absolute path is not stored in the generated application. Direct
Scaffold generation must use `--run-hooks=always` for copying and flattening.

With a custom brand, omitted production API URLs default to `/api/auth` so the
generated app uses your reverse proxy. The default `go cinch` brand retains the
demo API URL. Explicit `VITE_GLOB_API_URL` and `VITE_GLOB_AUTH_API_URL` always win.
Branding and local-logo customization currently apply to Vben only.

`make local` preserves an existing Vben `.env`, including its title; use `make full`
for a new branded project, or update an existing local `.env` deliberately. Auth's
existing database dictionaries also require a separate update; changing generation
parameters does not rewrite live data.

Run `make test-branding` for real generation tests of names, links, copied SVG/PNG
assets, invalid inputs, and old-brand residue. It does not modify local demos.
