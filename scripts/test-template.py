#!/usr/bin/env python3
"""Exercise Scaffold's real output, including literal Vue syntax and binary assets."""
import json
import os
import shutil
from pathlib import Path
import subprocess
import tempfile

LAYOUT = Path(__file__).resolve().parents[1]
TEMPLATE = LAYOUT / '{{ .Project }}' / 'vben-antd-vue3'
SCAFFOLD = os.environ.get('SCAFFOLD', 'scaffold')
DEFAULT_PRODUCTION_API_URL = 'https://entry.go-cinch.top/api/auth'


def run(args, success=True):
    result = subprocess.run(args, cwd=LAYOUT, text=True, capture_output=True)
    if (result.returncode == 0) != success:
        raise AssertionError(f'{args}\n{result.stdout}\n{result.stderr}')
    return result


def validate(project_root, production_api_url=DEFAULT_PRODUCTION_API_URL,
             production_auth_api_url=DEFAULT_PRODUCTION_API_URL):
    project = project_root
    assert not (project / 'vben-antd-vue3').exists()
    assert not (project / 'vben').exists()
    assert not (project / 'other-ui').exists()
    assert (project / 'LICENSE_VBEN').is_file()
    package = json.loads((project / 'package.json').read_text())
    assert package['name'] == project_root.name
    assert sorted(p.name for p in (project / 'apps').iterdir()) == ['web-antd']
    assert not any((project / x).exists() for x in ['node_modules', '.git', 'docs', 'playground'])
    for path in project.rglob('*'):
        assert path.name not in {'node_modules', '.pnpm-store', '.yarn', 'dist',
                                 '.turbo', '.cache', '.vite', '.nitro', '.output',
                                 'coverage', '__pycache__', '.git', '.DS_Store'}
        assert not path.name.endswith(('.log', '.local'))
    env = (project / 'apps/web-antd/.env').read_text()
    assert f'VITE_APP_NAMESPACE={project_root.name}\n' in env
    key = env.split('VITE_APP_STORE_SECURE_KEY=')[1].splitlines()[0]
    assert len(key) == 32 and key.isalnum()
    manifests = [project / 'package.json', *project.glob('**/package.json')]
    names = {json.loads(p.read_text())['name'] for p in manifests}
    for manifest in manifests:
        data = json.loads(manifest.read_text())
        for group in ['dependencies', 'devDependencies', 'optionalDependencies']:
            for name, version in data.get(group, {}).items():
                if version.startswith('workspace:'):
                    assert name in names, (manifest, name)
    for mode in ['development', 'production', 'analyze']:
        content = (project / f'apps/web-antd/.env.{mode}').read_text()
        api_url = production_api_url if mode == 'production' else '/api/auth'
        auth_api_url = production_auth_api_url if mode == 'production' else '/api/auth'
        assert f'VITE_GLOB_API_URL={api_url}\n' in content
        assert f'VITE_GLOB_AUTH_API_URL={auth_api_url}\n' in content
    for path in project.rglob('*'):
        is_text = path.suffix in {'.env', '.md', '.ts', '.vue'} or '.env.' in path.name
        if path.is_file() and is_text:
            content = path.read_text().lower().replace('oauth2', '')
            assert 'auth2' not in content, path
    request = (project / 'apps/web-antd/src/api/request.ts').read_text()
    assert "|| '/api/auth'" in request
    config = (project / 'apps/web-antd/vite.config.ts').read_text()
    assert 'AUTH_PROXY_TARGET' in config and 'http://127.0.0.1' not in config
    assert 'nitroMock: false' in config
    # Every unparameterized file must survive byte-for-byte (Vue, PNG, ICO, etc.).
    for source in TEMPLATE.rglob('*'):
        if not source.is_file():
            continue
        relative = source.relative_to(TEMPLATE)
        output = project / relative
        data = source.read_bytes()
        # Scaffold intentionally drops truly empty source files.
        if not data:
            continue
        assert output.is_file(), relative
        if b'[[scaffold' not in data:
            assert output.read_bytes() == data, relative
        else:
            assert b'[[scaffold' not in output.read_bytes(), relative
    return key


with tempfile.TemporaryDirectory(prefix='pc-admin-layout-test-') as temp:
    output = Path(temp)
    keys = []
    cases = {
        'default-ui': [],
        'explicit-ui': ['ui=vben-antd-vue3'],
        'alias-ui': ['ui=vben'],
        'full-preset': ['--preset=full'],
        'vben-preset': ['--preset=vben'],
        'antd-preset': ['--preset=vben-antd-vue3'],
    }
    for name, options in cases.items():
        run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}',
             '--run-hooks=always', '--no-prompt', f'Project={name}', *options])
        keys.append(validate(output / name))
        print(f'PASS {name}', flush=True)
    assert len(set(keys)) == len(keys), 'store keys must differ between projects'
    custom_api_url = 'https://api.example.com/main'
    custom_auth_api_url = 'https://api.example.com/auth'
    run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}',
         '--run-hooks=always', '--no-prompt', 'Project=custom-production-urls',
         f'VITE_GLOB_API_URL={custom_api_url}',
         f'VITE_GLOB_AUTH_API_URL={custom_auth_api_url}'])
    validate(output / 'custom-production-urls', custom_api_url, custom_auth_api_url)
    print('PASS custom production API URLs', flush=True)
    run(['make', 'full', 'PROJECT=make-ui', 'UI=vben', f'OUTPUT_DIR={output}', f'SCAFFOLD={SCAFFOLD}'])
    validate(output / 'make-ui')
    run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}', '--run-hooks=always',
         '--no-prompt', 'Project=hooks-ui'])
    validate(output / 'hooks-ui')
    for invalid in ['antd', 'element-plus', 'invalid']:
        name = f'invalid-{invalid}'
        run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}', '--run-hooks=always',
             '--no-prompt', f'Project={name}', f'ui={invalid}'], success=False)
        assert not (output / name).exists(), 'invalid selector wrote project files'
    run(['make', 'full', 'UI=invalid', f'OUTPUT_DIR={output}'], success=False)
    # Use an isolated copy to simulate a future UI and locally installed artifacts.
    staged = output / 'staged-layout'
    shutil.copytree(LAYOUT, staged, ignore=shutil.ignore_patterns(
        '.git', 'node_modules', '.pnpm-store', '__pycache__'))
    staged_ui = staged / '{{ .Project }}' / 'vben-antd-vue3'
    for relative in ['node_modules/fake/index.js',
                     'apps/web-antd/node_modules/fake/index.js',
                     '.pnpm-store/cache.json', 'apps/web-antd/dist/index.html',
                     'apps/web-antd/.env.development.local',
                     '.turbo/cache.json', 'install.log', 'dist.zip']:
        artifact = staged_ui / relative
        artifact.parent.mkdir(parents=True, exist_ok=True)
        artifact.write_text('[[scaffold invalid template scaffold]]')
    other = staged / '{{ .Project }}' / 'other-ui' / 'package.json'
    other.parent.mkdir(parents=True)
    other.write_text('[[scaffold invalid template scaffold]]')
    config = staged / 'scaffold.yml'
    config.write_text(config.read_text().replace('features:\n',
        "features:\n  - value: '{{ eq .Computed.ui_final \"other-ui\" }}'\n"
        "    globs: ['**/other-ui/**']\n"))
    run([SCAFFOLD, 'new', str(staged), f'--output-dir={output}',
         '--run-hooks=always', '--no-prompt', 'Project=isolated-ui'])
    validate(output / 'isolated-ui')
    print('PASS Make entry, hooks, invalid selectors, asset integrity, workspace closure', flush=True)
    # Existing root files must not be overwritten while flattening the UI.
    conflict = output / 'conflict-ui'
    conflict.mkdir()
    (conflict / 'package.json').write_text('existing project')
    result = run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}',
                  '--run-hooks=always', '--no-prompt', '--overwrite', 'Project=conflict-ui'], success=False)
    assert (conflict / 'package.json').read_text() == 'existing project'
    assert not (conflict / 'apps').exists(), 'hook moved files before conflict check'
    assert 'destination already exists' in result.stdout + result.stderr, result.stdout + result.stderr
    print('PASS UI selection, flat output, artifact exclusion, and collision protection', flush=True)
