#!/usr/bin/env python3
"""
CachyMusic Module Assembler
Assembles scripts/homepage.js from the modular sub-systems in scripts/modules/
Zero-dependency, native standard build utility.
"""

import os
import sys
import re

MODULES_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts/modules'))
HOMEPAGE_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '../scripts/homepage.js'))

MODULE_ORDER = [
    'utils.js',
    'state.js',
    'ui-elements.js',
    'library.js',
    'audio-engine.js',
    'player-core.js',
    'lyrics.js',
    'visualizer-themes-1.js',
    'visualizer-themes-2.js',
    'visualizer.js',
    'themes.js',
    'settings.js',
    'p2p.js',
    'app.js'
]

print("Assembling CachyMusic from modules:")
bundle = [
    "// CachyMusic Workstation Audio Engine v4.0 - Modular Unified Bundle\n",
    "(function() {\n",
    "    'use strict';\n\n"
]

total_lines = 0
for mod in MODULE_ORDER:
    path = os.path.join(MODULES_DIR, mod)
    if not os.path.isfile(path):
        print(f"Error: Module {mod} not found at {path}")
        sys.exit(1)
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Strip ES module import and export blocks for the classic IIFE bundle
    content_stripped = re.sub(r'^\s*import\b.*?[\'"][^\'"]+[\'"];?\s*$', '', content, flags=re.MULTILINE)
    content_stripped = re.sub(r'^\s*export\s*\{[^}]*\}\s*;?', '', content_stripped, flags=re.MULTILINE)

    lines_count = len(content_stripped.splitlines())
    total_lines += lines_count
    print(f"  + {mod:25s} ({lines_count:5d} lines)")
    bundle.append(f"\n    // --- Sub-Module: {mod} ---\n")
    bundle.append(content_stripped)
    bundle.append("\n")

bundle.append("\n})();\n")

bundle_text = "".join(bundle)
with open(HOMEPAGE_PATH, 'w', encoding='utf-8') as f:
    f.write(bundle_text)

print(f"\nSuccessfully built {HOMEPAGE_PATH} ({len(bundle_text.splitlines())} total lines).")
