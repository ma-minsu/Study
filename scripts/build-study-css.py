#!/usr/bin/env python3
"""Build the ordered, cache-versioned Study stylesheet from editable sources."""
from hashlib import sha256
from pathlib import Path
import argparse
import re

ROOT = Path(__file__).resolve().parent.parent
SOURCES = [
    'style-20261030ab.css', 'ministry-ui-20261031b.css',
    'couple-loading-speed-20261031.css', 'family-20261103j.css',
    'pin-20261106c.css', 'ministry-extra-20261106.css', 'visits-20261106h.css',
    'floating-back-20261120.css', 'personal-study-20261119.css',
    'personal-study-management-20261120n.css', 'personal-study-add-20261121h.css',
    'responsive-foundation-20261125.css', 'personal-study-wide-20261125.css',
    'research-editor-wide-20261125.css', 'ministry-wide-20261125.css',
    'routine-family-wide-20261125.css',
]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true', help='verify the bundle and HTML without changing files')
    args = parser.parse_args()
    parts = []
    for name in SOURCES:
        source = (ROOT / name).read_text(encoding='utf-8')
        if re.search(r'@(?:import|charset)\b', source, re.IGNORECASE):
            raise SystemExit(f'{name}: @import and @charset require special handling')
        parts.append(f'\n/* Source: {name} */\n{source.rstrip()}\n')
    content = ''.join(parts).encode('utf-8')
    name = f'study-bundle-{sha256(content).hexdigest()[:12]}.css'
    target = ROOT / name
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    if args.check:
        if not target.exists() or target.read_bytes() != content or f'href="{name}"' not in html:
            raise SystemExit('Study CSS bundle or its HTML reference is out of date')
    else:
        individual = ''.join(f'<link rel="stylesheet" href="{source}">' for source in SOURCES)
        if individual in html:
            html = html.replace(individual, f'<link rel="stylesheet" href="{name}">', 1)
        else:
            html, count = re.subn(r'<link rel="stylesheet" href="study-bundle-[0-9a-f]{12}\.css">',
                                  f'<link rel="stylesheet" href="{name}">', html, count=1)
            if count != 1:
                raise SystemExit('Could not locate the Study stylesheet links in index.html')
        target.write_bytes(content)
        (ROOT / 'index.html').write_text(html, encoding='utf-8')
        print(name)


if __name__ == '__main__':
    main()
