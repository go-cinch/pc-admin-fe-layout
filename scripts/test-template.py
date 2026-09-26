#!/usr/bin/env python3
"""Exercise every Scaffold UI's real flattened output and binary assets."""
import json
import os
import shutil
from pathlib import Path
import subprocess
import tempfile

LAYOUT = Path(__file__).resolve().parents[1]
VBEN_TEMPLATE = LAYOUT / '{{ .Project }}' / 'vben-antd-vue3'
TAIL_TEMPLATE = LAYOUT / '{{ .Project }}' / 'tail-react'
ART_TEMPLATE = LAYOUT / '{{ .Project }}' / 'art-eleplus-vue3'
SHADCN_TEMPLATE = LAYOUT / '{{ .Project }}' / 'shadcn-react'
SCAFFOLD = os.environ.get('SCAFFOLD', 'scaffold')
DEFAULT_PRODUCTION_API_URL = 'https://entry.go-cinch.top/api/auth'
ARTIFACT_NAMES = {
    '.cache', '.git', '.next', '.nitro', '.output', '.pnpm-store', '.stylelintcache',
    '.turbo', '.vite', '.yarn', '__pycache__', 'coverage', 'dist',
    'build', 'node_modules', 'out',
}


def run(args, success=True):
    result = subprocess.run(args, cwd=LAYOUT, text=True, capture_output=True)
    if (result.returncode == 0) != success:
        raise AssertionError(f'{args}\n{result.stdout}\n{result.stderr}')
    return result


def assert_artifacts_excluded(project):
    for path in project.rglob('*'):
        assert path.name not in ARTIFACT_NAMES | {'.DS_Store'}
        assert not path.name.endswith(('.log', '.local'))


def assert_template_integrity(template, project):
    for source in template.rglob('*'):
        if not source.is_file():
            continue
        relative = source.relative_to(template)
        if any(part in ARTIFACT_NAMES for part in relative.parts):
            continue
        if relative.name == '.DS_Store' or relative.name.endswith(('.log', '.local')):
            continue
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


def validate_vben(project_root, production_api_url=DEFAULT_PRODUCTION_API_URL,
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
    assert_artifacts_excluded(project)
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
    assert_template_integrity(VBEN_TEMPLATE, project)
    return key


def validate_tail(project, production_api_url=DEFAULT_PRODUCTION_API_URL,
                  production_auth_api_url=DEFAULT_PRODUCTION_API_URL):
    assert not (project / 'tail-react').exists()
    assert not (project / 'vben-antd-vue3').exists()
    assert (project / 'LICENSE_TAIL').is_file()
    assert (project / 'src/App.tsx').is_file()
    assert (project / 'src/api/jwe.ts').is_file()
    assert (project / 'src/pages/System/SystemManagement.tsx').is_file()
    assert not (project / 'apps').exists()
    package = json.loads((project / 'package.json').read_text())
    lock = json.loads((project / 'package-lock.json').read_text())
    assert package['name'] == project.name
    assert lock['name'] == project.name
    assert lock['packages']['']['name'] == project.name
    assert not any((project / x).exists() for x in ['node_modules', '.git', 'dist'])
    assert_artifacts_excluded(project)
    vite = (project / 'vite.config.ts').read_text()
    assert 'AUTH_PROXY_TARGET' in vite and 'VITE_PORT' in vite
    assert 'VITE_API_PROXY_URL' not in vite
    assert 'http://127.0.0.1' not in vite
    production_env = (project / '.env.production').read_text()
    assert f'VITE_GLOB_API_URL={production_api_url}\n' in production_env
    assert f'VITE_GLOB_AUTH_API_URL={production_auth_api_url}\n' in production_env
    client = (project / 'src/api/client.ts').read_text()
    assert 'VITE_GLOB_AUTH_API_URL' in client and '"/api/auth"' in client
    assert 'VITE_AUTH_API_URL' not in client and '"Accept-Language"' in client
    assert_template_integrity(TAIL_TEMPLATE, project)


def validate_art(project, production_api_url=DEFAULT_PRODUCTION_API_URL,
                 production_auth_api_url=DEFAULT_PRODUCTION_API_URL):
    assert not (project / 'art-eleplus-vue3').exists()
    assert not (project / 'vben-antd-vue3').exists()
    assert (project / 'LICENSE').is_file()
    assert (project / 'src/App.vue').is_file()
    assert (project / 'src/api/auth-service.ts').is_file()
    assert (project / 'src/views/system/components/ManagementPage.vue').is_file()
    assert not (project / 'apps').exists()
    package = json.loads((project / 'package.json').read_text())
    assert package['name'] == project.name
    assert (project / 'pnpm-lock.yaml').is_file()
    assert not any((project / x).exists() for x in ['node_modules', '.git', 'dist'])
    assert_artifacts_excluded(project)
    vite = (project / 'vite.config.ts').read_text()
    assert 'AUTH_PROXY_TARGET' in vite and 'VITE_PORT' in vite
    assert 'VITE_API_PROXY_URL' not in vite
    assert 'http://127.0.0.1' not in vite
    production_env = (project / '.env.production').read_text()
    assert f'VITE_GLOB_API_URL={production_api_url}\n' in production_env
    assert f'VITE_GLOB_AUTH_API_URL={production_auth_api_url}\n' in production_env
    client = (project / 'src/api/auth-service.ts').read_text()
    assert 'VITE_GLOB_AUTH_API_URL' in client and "'/api/auth'" in client
    assert "'Accept-Language'" in client
    assert 'RSA-OAEP-256' in client and 'A256GCM' in client
    assert 'VITE_API_URL' not in ''.join(
        path.read_text() for path in project.rglob('*')
        if path.is_file() and path.suffix in {'.ts', '.vue'}
    )
    assert_template_integrity(ART_TEMPLATE, project)


def validate_shadcn(project, production_api_url=DEFAULT_PRODUCTION_API_URL,
                    production_auth_api_url=DEFAULT_PRODUCTION_API_URL):
    assert not (project / 'shadcn-react').exists()
    assert not (project / 'vben-antd-vue3').exists()
    assert (project / 'LICENSE_SHADCN').is_file()
    assert (project / 'src/app/auth/login/page.tsx').is_file()
    assert (project / 'src/app/system/[resource]/page.tsx').is_file()
    assert (project / 'src/features/auth/api.ts').is_file()
    assert (project / 'src/features/system/components/management-page.tsx').is_file()
    assert not (project / 'apps').exists()
    package = json.loads((project / 'package.json').read_text())
    assert package['name'] == project.name
    assert (project / 'bun.lock').is_file()
    assert not any((project / x).exists() for x in ['node_modules', '.git', '.next'])
    assert_artifacts_excluded(project)
    production_env = (project / '.env.production').read_text()
    assert f'VITE_GLOB_API_URL={production_api_url}\n' in production_env
    assert f'VITE_GLOB_AUTH_API_URL={production_auth_api_url}\n' in production_env
    config = (project / 'next.config.ts').read_text()
    assert 'AUTH_PROXY_TARGET' in config and 'VITE_GLOB_AUTH_API_URL' in config
    assert "source: '/api/auth/:path*'" in config
    client = (project / 'src/features/auth/api.ts').read_text()
    assert "const API_BASE = '/api/auth'" in client
    assert "'Accept-Language'" in client
    assert 'RSA-OAEP-256' in client and 'A256GCM' in client
    assert_template_integrity(SHADCN_TEMPLATE, project)


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
        keys.append(validate_vben(output / name))
        print(f'PASS {name}', flush=True)
    assert len(set(keys)) == len(keys), 'store keys must differ between projects'
    custom_api_url = 'https://api.example.com/main'
    custom_auth_api_url = 'https://api.example.com/auth'
    run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}',
         '--run-hooks=always', '--no-prompt', 'Project=custom-production-urls',
         f'VITE_GLOB_API_URL={custom_api_url}',
         f'VITE_GLOB_AUTH_API_URL={custom_auth_api_url}'])
    validate_vben(output / 'custom-production-urls', custom_api_url, custom_auth_api_url)
    print('PASS custom production API URLs', flush=True)
    run(['make', 'full', 'PROJECT=make-ui', 'UI=vben', f'OUTPUT_DIR={output}', f'SCAFFOLD={SCAFFOLD}'])
    validate_vben(output / 'make-ui')
    run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}', '--run-hooks=always',
         '--no-prompt', 'Project=hooks-ui'])
    validate_vben(output / 'hooks-ui')
    tail_cases = {
        'tail-explicit': ['ui=tail-react'],
        'tail-alias': ['ui=tail'],
        'tail-preset': ['--preset=tail-react'],
    }
    for name, options in tail_cases.items():
        run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}',
             '--run-hooks=always', '--no-prompt', f'Project={name}', *options])
        validate_tail(output / name)
        print(f'PASS {name}', flush=True)
    run(['make', 'full', 'PROJECT=make-tail', 'UI=tail-react',
         f'OUTPUT_DIR={output}', f'SCAFFOLD={SCAFFOLD}'])
    validate_tail(output / 'make-tail')
    run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}',
         '--run-hooks=always', '--no-prompt', 'Project=tail-production-urls', 'ui=tail-react',
         f'VITE_GLOB_API_URL={custom_api_url}',
         f'VITE_GLOB_AUTH_API_URL={custom_auth_api_url}'])
    validate_tail(output / 'tail-production-urls', custom_api_url, custom_auth_api_url)
    art_cases = {
        'art-explicit': ['ui=art-eleplus-vue3'],
        'art-alias': ['ui=art'],
        'art-preset': ['--preset=art-eleplus-vue3'],
    }
    for name, options in art_cases.items():
        run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}',
             '--run-hooks=always', '--no-prompt', f'Project={name}', *options])
        validate_art(output / name)
        print(f'PASS {name}', flush=True)
    run(['make', 'full', 'PROJECT=make-art', 'UI=art-eleplus-vue3',
         f'OUTPUT_DIR={output}', f'SCAFFOLD={SCAFFOLD}'])
    validate_art(output / 'make-art')
    run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}',
         '--run-hooks=always', '--no-prompt', 'Project=art-production-urls',
         'ui=art-eleplus-vue3', f'VITE_GLOB_API_URL={custom_api_url}',
         f'VITE_GLOB_AUTH_API_URL={custom_auth_api_url}'])
    validate_art(output / 'art-production-urls', custom_api_url, custom_auth_api_url)
    shadcn_cases = {
        'shadcn-explicit': ['ui=shadcn-react'],
        'shadcn-alias': ['ui=shadcn'],
        'shadcn-preset': ['--preset=shadcn-react'],
    }
    for name, options in shadcn_cases.items():
        run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}',
             '--run-hooks=always', '--no-prompt', f'Project={name}', *options])
        validate_shadcn(output / name)
        print(f'PASS {name}', flush=True)
    run(['make', 'full', 'PROJECT=make-shadcn', 'UI=shadcn-react',
         f'OUTPUT_DIR={output}', f'SCAFFOLD={SCAFFOLD}'])
    validate_shadcn(output / 'make-shadcn')
    run([SCAFFOLD, 'new', str(LAYOUT), f'--output-dir={output}',
         '--run-hooks=always', '--no-prompt', 'Project=shadcn-production-urls',
         'ui=shadcn-react', f'VITE_GLOB_API_URL={custom_api_url}',
         f'VITE_GLOB_AUTH_API_URL={custom_auth_api_url}'])
    validate_shadcn(output / 'shadcn-production-urls', custom_api_url, custom_auth_api_url)
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
    validate_vben(output / 'isolated-ui')
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
