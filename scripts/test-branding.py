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


def run(arguments, cwd=None, success=True):
    result = subprocess.run(arguments, cwd=cwd, capture_output=True, text=True)
    assert (result.returncode == 0) == success, result.stdout + result.stderr
    return result


def validate(project, title, lower, slug, extension='.svg', logo=None, github=None):
    app = project / 'apps/web-antd'
    assert f'VITE_APP_TITLE={title} Admin by vben\n' in (app / '.env').read_text()
    assert f'VITE_APP_NAMESPACE={project.name}\n' in (app / '.env').read_text()
    login = (project / 'packages/effects/layouts/src/authentication/authentication.vue').read_text()
    assert f'>{title}</span>' in login and f'{title} Admin\n' in login
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
    assert f'{slug}-white{extension}' in (app / 'src/app.vue').read_text()
    assert f'{slug}{extension}' in preferences
    expected_api = 'https://entry.go-cinch.top/api/auth' if slug == 'go-cinch' else '/api/auth'
    assert f'VITE_GLOB_AUTH_API_URL={expected_api}\n' in (app / '.env.production').read_text()
    for path in project.rglob('*'):
        assert '{{' not in str(path.relative_to(project)), path
        if not path.is_file():
            continue
        try:
            content = path.read_text()
        except UnicodeError:
            continue
        assert '[[scaffold' not in content, path
        if slug != 'go-cinch':
            assert not re.search(r'go[ _-]*cinch', content, re.I), path
        if logo:
            assert str(logo) not in content, path
        if path.suffix == '.json':
            json.loads(content)
    english = json.loads((app / 'src/locales/langs/en-US/app.json').read_text())
    chinese = json.loads((app / 'src/locales/langs/zh-CN/app.json').read_text())
    assert f'Sign in to {title}' in json.dumps(english, ensure_ascii=False)
    assert f'进入 {title}' in json.dumps(chinese, ensure_ascii=False)


with tempfile.TemporaryDirectory(prefix='vben-branding-') as temporary:
    output = Path(temporary)
    # Isolate the selected UI to avoid scanning unrelated UIs' installed dependencies.
    staged = output / 'layout'
    staged.mkdir()
    for name in ['Makefile', 'scaffold.yml']:
        shutil.copy2(LAYOUT / name, staged / name)
    shutil.copytree(LAYOUT / 'hooks', staged / 'hooks')
    shutil.copytree(
        LAYOUT / '{{ .Project }}/vben-antd-vue3',
        staged / '{{ .Project }}/vben-antd-vue3',
        ignore=shutil.ignore_patterns('node_modules', '.git', 'dist', '.turbo', '.DS_Store'),
    )

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

    # Apostrophes/spaces and literal shell syntax must survive hook interpolation.
    svg = output / "owner's logo $(touch should-not-exist).SVG"
    svg.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><path d="M0 0h1v1H0z"/></svg>')
    github = 'https://github.com/example/admin'
    generate('svg-admin', 'brand_name=acme', f'logo_path={svg}', f'github_url={github}')
    validate(output / 'svg-admin', 'Acme', 'acme', 'acme', logo=svg, github=github)
    assert not list(output.rglob('should-not-exist'))
    print('PASS custom GitHub URL and exact SVG copy with quoted path', flush=True)

    png = output / "owner's logo.png"
    png.write_bytes(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJ1sAAAAASUVORK5CYII='))
    run(['make', 'full', 'UI=vben', 'PROJECT=make-admin',
         'BRAND_NAME=this is my project', f'LOGO_PATH={png}', f'GITHUB_URL={github}',
         f'OUTPUT_DIR={output}', f'SCAFFOLD={SCAFFOLD}'], cwd=staged)
    validate(output / 'make-admin', 'This Is My Project', 'this is my project',
             'this-is-my-project', '.png', png, github)
    print('PASS Make parameters and PNG logo/favicon references', flush=True)

    generate('api-admin', 'brand_name=acme', 'VITE_GLOB_API_URL=https://api.example.com',
             'VITE_GLOB_AUTH_API_URL=https://auth.example.com')
    env = (output / 'api-admin/apps/web-antd/.env.production').read_text()
    assert 'VITE_GLOB_API_URL=https://api.example.com\n' in env
    assert 'VITE_GLOB_AUTH_API_URL=https://auth.example.com\n' in env

    for index, argument in enumerate([
        "brand_name=O'Reilly", 'brand_name=---', 'brand_name=acme\nother',
        'logo_path=relative.svg', 'logo_path=/tmp/unsupported.pdf',
        'github_url=javascript:alert(1)',
    ]):
        name = f'invalid-{index}'
        generate(name, argument, success=False)
        assert not (output / name).exists(), 'invalid parameter wrote project files'
    missing = generate('missing-logo', f'logo_path={output}/missing.svg', success=False)
    assert 'Logo must be a readable, non-empty file' in missing.stdout + missing.stderr
    assert not (output / 'missing-logo/apps').exists(), 'invalid logo flattened the project'
    print('PASS API overrides and invalid input rejection', flush=True)
