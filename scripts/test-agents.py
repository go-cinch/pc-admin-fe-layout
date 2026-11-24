#!/usr/bin/env python3
"""Verify shared-rule generation for every UI using real Scaffold and the real hook."""
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

LAYOUT = Path(__file__).resolve().parents[1]
SCAFFOLD = os.environ.get('SCAFFOLD', 'scaffold')
spec = importlib.util.spec_from_file_location('sync_agents', LAYOUT / 'scripts/sync-agents.py')
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)


def generate(layout, output, name, ui, success=True):
    result = subprocess.run([
        SCAFFOLD, 'new', str(layout), f'--output-dir={output}',
        '--run-hooks=always', '--no-prompt', '--overwrite',
        f'Project={name}', f'ui={ui}',
    ], capture_output=True, text=True)
    assert (result.returncode == 0) == success, result.stdout + result.stderr
    return result


with tempfile.TemporaryDirectory(prefix='frontend-agent-rules-') as temporary:
    base = Path(temporary)
    layout, output = base / 'layout', base / 'demos'
    layout.mkdir()
    for name in ['scaffold.yml', 'AGENTS.md']:
        shutil.copy2(LAYOUT / name, layout / name)
    shutil.copytree(LAYOUT / 'hooks', layout / 'hooks')
    (layout / 'scripts').mkdir()
    shutil.copy2(LAYOUT / 'scripts/sync-agents.py', layout / 'scripts/sync-agents.py')
    templates = layout / '{{ .Project }}'
    templates.mkdir()
    (templates / '.shared-agents.md').symlink_to('../AGENTS.md')
    core = templates / '_mini-core'
    core.mkdir()
    (core / 'core.txt').write_text('Shared mini core fixture\n')
    selectors = sorted(path.name for path in (LAYOUT / '{{ .Project }}').iterdir()
                       if path.is_dir() and not path.name.startswith(('_', '.')))
    expected_selectors = []
    for ui in selectors:
        target = templates / ui
        target.mkdir()
        (target / 'src').mkdir()
        (target / 'src/fixture.txt').write_text('UI fixture\n')
        (target / 'package.json').write_text(json.dumps({'name': ui}))
        original = LAYOUT / '{{ .Project }}' / ui / 'AGENTS.md'
        if original.exists():
            shutil.copy2(original, target / 'AGENTS.md')
        expected_selectors.append(ui)
    rules = (layout / 'AGENTS.md').read_text()
    for ui in expected_selectors:
        generate(layout, output, ui, ui)
        project = output / ui
        source_rules = templates / ui / 'AGENTS.md'
        specific = source_rules.read_text() if source_rules.exists() else ''
        agents = project / 'AGENTS.md'
        assert agents.is_file() and not agents.is_symlink()
        assert agents.read_text() == sync.merge_rules(rules, specific)
        assert not (project / '.shared-agents.md').exists()
        assert not (project / ui).exists()
        print(f'PASS shared rules and project-specific preservation: {ui}', flush=True)

    # Root changes must affect the next generation without editing UI files.
    updated = rules + '\n## New shared rule\n\nA unique root-update sentinel.\n'
    (layout / 'AGENTS.md').write_text(updated)
    generate(layout, output, 'after-root-change', 'vben-antd-vue3')
    assert (output / 'after-root-change/AGENTS.md').read_text().startswith(sync.shared_block(updated))

    # Refresh existing projects and preserve instructions added locally.
    target = output / 'vben-antd-vue3/AGENTS.md'
    target.write_text(target.read_text() + '\n## Local instructions\n\nKeep this local sentinel.\n')
    subprocess.run(['python3', str(layout / 'scripts/sync-agents.py'), '--demos-dir', str(output)], check=True, capture_output=True)
    assert target.read_text().startswith(sync.shared_block(updated))
    assert 'Keep this local sentinel.' in target.read_text()
    before = {ui: (output / ui / 'AGENTS.md').read_bytes() for ui in selectors}
    subprocess.run(['python3', str(layout / 'scripts/sync-agents.py'), '--demos-dir', str(output)], check=True, capture_output=True)
    assert before == {ui: (output / ui / 'AGENTS.md').read_bytes() for ui in selectors}
    print('PASS root updates, existing-project synchronization and idempotence', flush=True)

    # Even UIs with no local AGENTS.md must not overwrite an existing root file.
    conflict = output / 'collision'
    conflict.mkdir()
    (conflict / 'AGENTS.md').write_text('Existing project instructions\n')
    result = generate(layout, output, 'collision', 'ant-design-h5', success=False)
    assert 'destination already exists' in result.stdout + result.stderr
    assert (conflict / 'AGENTS.md').read_text() == 'Existing project instructions\n'
    assert not (conflict / 'package.json').exists()
    print('PASS existing AGENTS.md collision protection', flush=True)
