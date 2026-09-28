#!/usr/bin/env python3
"""Choose an unassigned frontend port without changing existing assignments."""
import re
import socket
import sys
from pathlib import Path

reserved = {5666}
root = Path(sys.argv[1])
for pattern in ('*/.env*.local', '*/apps/*/.env*.local'):
    for file in root.glob(pattern):
        for match in re.finditer(r'^(?:VITE_PORT|PORT)\s*=\s*[\"\']?(\d+)', file.read_text(), re.M):
            reserved.add(int(match.group(1)))
port = 5667
while True:
    if port not in reserved:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
            try:
                probe.bind(('0.0.0.0', port))
            except OSError:
                pass
            else:
                break
    port += 1
print(port)
