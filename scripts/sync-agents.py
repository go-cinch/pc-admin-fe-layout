#!/usr/bin/env python3
"""Refresh shared instructions in existing demos without touching application files."""
import argparse
from pathlib import Path

BEGIN = '<!-- BEGIN SHARED FRONTEND RULES -->'
END = '<!-- END SHARED FRONTEND RULES -->'


def shared_block(rules):
    return f'{BEGIN}\n\n{rules}\n{END}\n'


def merge_rules(rules, existing):
    if BEGIN not in existing and END not in existing:
        return shared_block(rules) + ('\n' + existing if existing else '')
    if existing.count(BEGIN) != 1 or existing.count(END) != 1:
        raise ValueError('Expected exactly one shared-rules block')
    before, rest = existing.split(BEGIN, 1)
    _, after = rest.split(END, 1)
    return before + shared_block(rules).rstrip('\n') + after


def main():
    layout = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--demos-dir', type=Path, default=layout.parent / 'demos')
    args = parser.parse_args()
    rules = (layout / 'AGENTS.md').read_text()
    updates = []
    # Derive selectors from the template directories so future UIs inherit rules.
    for template in sorted((layout / '{{ .Project }}').iterdir()):
        if not template.is_dir() or template.name.startswith(('_', '.')):
            continue
        demo = args.demos_dir / template.name
        if not demo.is_dir():
            continue
        target = demo / 'AGENTS.md'
        if demo.is_symlink() or target.is_symlink():
            raise ValueError(f'Refusing to replace symlink: {target}')
        local_rules = template / 'AGENTS.md'
        existing = target.read_text() if target.exists() else (local_rules.read_text() if local_rules.exists() else '')
        rendered = merge_rules(rules, existing)
        if not target.exists() or existing != rendered:
            updates.append((target, rendered))
    # Validate every destination before writing any of them.
    for target, rendered in updates:
        target.write_text(rendered)
        print(f'Updated {target.parent.name}/AGENTS.md')
    print(f'Synchronized shared rules in {len(updates)} existing projects')


if __name__ == '__main__':
    main()
