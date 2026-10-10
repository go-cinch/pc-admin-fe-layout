#!/usr/bin/env python3
"""Optional validation with locally installed official WeChat WXML/WXSS compilers."""
import argparse
from pathlib import Path
import subprocess
parser=argparse.ArgumentParser()
parser.add_argument('output',type=Path)
parser.add_argument('--compiler-dir',type=Path,default=Path('/Applications/wechatwebdevtools.app/Contents/Resources/package.nw/node_modules/wcc-exec'))
args=parser.parse_args()
root=args.output.resolve()
for name,extensions in [('wcc',{'.wxml','.wxs'}),('wcsc',{'.wxss'})]:
    binary=args.compiler_dir/name
    if not binary.is_file():
        parser.error(f'Official compiler not installed: {binary}')
    files=[str(p.relative_to(root)) for p in root.rglob('*') if p.suffix in extensions]
    if not files:
        parser.error(f'No {extensions} files under {root}')
    subprocess.run([str(binary),*files],cwd=root,stdout=subprocess.DEVNULL,check=True)
    print(f'PASS {name}: {len(files)} files in {root}')
