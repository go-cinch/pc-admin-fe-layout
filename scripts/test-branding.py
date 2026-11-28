#!/usr/bin/env python3
"""Exercise Vben's real Scaffold renderer, Make entry and logo-copy hook."""
import base64
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tempfile

LAYOUT = Path(__file__).resolve().parents[1]
SCAFFOLD = os.environ.get('SCAFFOLD', 'scaffold')

# Older deployments used these exact browser storage keys. Their migration
# code and fixtures must keep recognizing them after a brand change.
LEGACY_STORAGE_KEYS = {
    'security/email-code.ts': ['cinch-email-browser-uuid'],
    'security/email-code.test.ts': ['cinch-email-browser-uuid'],
    'security/totp-enrollment-context.ts': ['cinch-totp-enrollment-source'],
    'security/totp-enrollment.test.ts': ['cinch-totp-enrollment-source'],
    'security/email-binding-form.vue': ['cinch-email-binding-context'],
    'store/preference-drafts.ts': ['cinch-preference-drafts:v2:guest', 'cinch-preference-drafts:v2:'],
    'store/system-properties.test.ts': ['cinch-system-properties:/api/auth'],
    'store/timezone-preference.test.ts': [
        'cinch-pending-language', 'cinch-pending-ui-preferences:vben_pc', 'cinch-pending-timezone',
    ],
    'views/_core/authentication/bind-email.test.ts': ['cinch-email-binding-context'],
    'views/_core/authentication/login.vue': ['cinch-email-login-context'],
}


def run(arguments, cwd=None, success=True):
    result = subprocess.run(arguments, cwd=cwd, capture_output=True, text=True)
    assert (result.returncode == 0) == success, result.stdout + result.stderr
    return result


def validate(project, title, lower, slug, extension='.svg', logo=None, github=None, *, hide_suffix=False):
    app = project / 'apps/web-antd'
    app_title = f'{title} Admin' if hide_suffix else f'{title} Admin by vben'
    assert f'VITE_APP_TITLE={app_title}\n' in (app / '.env').read_text()
    assert f'VITE_APP_NAMESPACE={project.name}\n' in (app / '.env').read_text()
    login = (project / 'packages/effects/layouts/src/authentication/authentication.vue').read_text()
    assert f"const shortTitle = '{title}'" in login
    assert re.search(r'<span\b[^>]*min-\[360px\]:hidden[^>]*>\s*\{\{\s*shortTitle\s*\}\}\s*</span\s*>', login)
    assert re.search(r'>\s*' + re.escape(f'{title} Admin') + r'\s*</span\s*>', login)
    preferences = (app / 'src/preferences.ts').read_text()
    assert f"companyName: '{slug}'" in preferences
    assert (github or f'https://github.com/{slug}/demos') in preferences
    assert f'content="{lower}"' in (app / 'index.html').read_text()
    assert f'{slug}-favicon{extension}' in (app / 'index.html').read_text()
    for suffix in ['', '-white', '-favicon']:
        target = app / f'public/{slug}{suffix}{extension}'
        assert target.is_file(), target
        if logo:
            assert target.read_bytes() == logo.read_bytes()
        if extension != '.svg':
            assert not (app / f'public/{slug}{suffix}.svg').exists()
    fallback_icon = app / 'public/favicon.ico'
    if logo and extension == '.ico':
        assert fallback_icon.read_bytes() == logo.read_bytes()
    elif logo:
        assert not fallback_icon.exists()
    else:
        assert fallback_icon.is_file()
    assert f'{slug}-white{extension}' in (app / 'src/app.vue').read_text()
    assert f'{slug}{extension}' in preferences
    assert 'VITE_GLOB_AUTH_API_URL=/api/auth\n' in (app / '.env.production').read_text()
    for path in project.rglob('*'):
        assert '{{' not in str(path.relative_to(project)), path
        relative = str(path.relative_to(project))
        assert not re.search(r'(?<!go[ _-])cinch', relative, re.I), path
        if not path.is_file():
            continue
        try:
            content = path.read_text()
        except UnicodeError:
            continue
        assert '[[scaffold' not in content, path
        brand_text = content
        if path.is_relative_to(app / 'src'):
            for key in LEGACY_STORAGE_KEYS.get(str(path.relative_to(app / 'src')), []):
                brand_text = brand_text.replace(f"'{key}'", "''")
        assert not re.search(r'(?<!go[ _-])cinch', brand_text, re.I), path
        if slug != 'go-cinch':
            assert not re.search(r'cinch', brand_text + relative, re.I), path
        if logo:
            assert str(logo) not in content, path
        if path.suffix == '.json':
            json.loads(content)
    english = json.loads((app / 'src/locales/langs/en-US/app.json').read_text())
    chinese = json.loads((app / 'src/locales/langs/zh-CN/app.json').read_text())
    assert english['journey']['description'] == f'Sign in to {title} Admin and pick up where you left off'
    assert chinese['journey']['description'] == f'进入 {title} Admin，继续今天的工作'
    assert f'description="{title} Admin"' in (app / 'src/layouts/basic.vue').read_text()
    about = (project / 'packages/effects/common-ui/src/ui/about/about.vue').read_text()
    assert f"name: '{title} Admin'" in about
    assert ':href="projectGithubUrl"' in about


with tempfile.TemporaryDirectory(prefix='vben-branding-') as temporary:
    output = Path(temporary)
    # Isolate the selected UI to avoid scanning unrelated UIs' installed dependencies.
    staged = output / 'layout'
    staged.mkdir()
    for name in ['Makefile', 'scaffold.yml', 'AGENTS.md']:
        shutil.copy2(LAYOUT / name, staged / name)
    shutil.copytree(LAYOUT / 'hooks', staged / 'hooks')
    shutil.copytree(
        LAYOUT / '{{ .Project }}/vben-antd-vue3',
        staged / '{{ .Project }}/vben-antd-vue3',
        ignore=shutil.ignore_patterns('node_modules', '.git', 'dist', '.turbo', '.DS_Store'),
    )

    (staged / '{{ .Project }}/.shared-agents.md').symlink_to('../AGENTS.md')

    def generate(name, *arguments, success=True):
        return run([
            SCAFFOLD, 'new', str(staged), f'--output-dir={output}',
            '--run-hooks=always', '--no-prompt', f'Project={name}', *arguments,
        ], success=success)

    for name, brand, title, lower, slug in [
        ('default-admin', '', 'Go Cinch', 'go cinch', 'go-cinch'),
        ('acme-admin', 'acme', 'Acme', 'acme', 'acme'),
        ('project-admin', 'this is my project', 'This Is My Project', 'this is my project', 'this-is-my-project'),
        ('mixed-admin', '  THIS__is--MY   project  ', 'This Is My Project', 'this is my project', 'this-is-my-project'),
        ('boolean-admin', 'true', 'True', 'true', 'true'),
    ]:
        generate(name, f'brand_name={brand}')
        validate(output / name, title, lower, slug)
        print(f'PASS Vben brand {brand or "default"!r}', flush=True)

    generate('plain-admin', 'ui=vben', 'hide_ui_suffix=true')
    validate(output / 'plain-admin', 'Go Cinch', 'go cinch', 'go-cinch', hide_suffix=True)
    print('PASS Go Cinch Admin without the Vben suffix', flush=True)

    # Apostrophes/spaces and literal shell syntax must survive hook interpolation.
    svg = output / "owner's logo $(touch should-not-exist).SVG"
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>')
    github = 'https://github.com/example/admin'
    generate('svg-admin', 'brand_name=acme', 'hide_ui_suffix=false', f'logo_path={svg}', f'github_url={github}')
    validate(output / 'svg-admin', 'Acme', 'acme', 'acme', logo=svg, github=github)
    assert not list(output.rglob('should-not-exist'))
    print('PASS custom GitHub URL and exact SVG copy with quoted path', flush=True)

    png = output / "owner's logo.png"
    png.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='))
    run(['make', 'full', 'UI=vben', 'PROJECT=make-admin',
         'BRAND_NAME=this is my project', 'HIDE_UI_SUFFIX=true', f'LOGO_PATH={png}', f'GITHUB_URL={github}',
         f'OUTPUT_DIR={output}', f'SCAFFOLD={SCAFFOLD}'], cwd=staged)
    validate(output / 'make-admin', 'This Is My Project', 'this is my project',
             'this-is-my-project', '.png', png, github, hide_suffix=True)
    print('PASS Make parameters and PNG logo/favicon references', flush=True)

    # An ICO directory with one embedded 1x1 PNG.
    ico = output / 'brand.ico'
    ico.write_bytes(bytes.fromhex('0000010001000101000001002000')
                    + png.stat().st_size.to_bytes(4, 'little') + (22).to_bytes(4, 'little') + png.read_bytes())
    generate('ico-admin', 'brand_name=acme', f'logo_path={ico}')
    validate(output / 'ico-admin', 'Acme', 'acme', 'acme', '.ico', ico)
    print('PASS custom ICO replaces the fallback favicon', flush=True)

    generate('api-admin', 'brand_name=acme', 'VITE_GLOB_API_URL=https://api.example.com',
             'VITE_GLOB_AUTH_API_URL=https://auth.example.com')
    env = (output / 'api-admin/apps/web-antd/.env.production').read_text()
    assert 'VITE_GLOB_API_URL=https://api.example.com\n' in env
    assert 'VITE_GLOB_AUTH_API_URL=https://auth.example.com\n' in env

    for index, argument in enumerate([
        "brand_name=O'Reilly", 'brand_name=---', 'brand_name=acme\nother',
        'logo_path=relative.svg', 'logo_path=/tmp/unsupported.pdf',
        'github_url=javascript:alert(1)', 'hide_ui_suffix=maybe',
    ]):
        name = f'invalid-{index}'
        generate(name, argument, success=False)
        assert not (output / name).exists(), 'invalid parameter wrote project files'
    missing = generate('missing-logo', f'logo_path={output}/missing.svg', success=False)
    assert 'Logo must be a readable, non-empty file' in missing.stdout + missing.stderr
    assert not (output / 'missing-logo/apps').exists(), 'invalid logo flattened the project'
    print('PASS API overrides and invalid input rejection', flush=True)
