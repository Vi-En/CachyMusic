#!/usr/bin/env bash
# ==============================================================================
# CachyMusic - Nicotine+ REST Plugin Setup Script
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLUGIN_SOURCE="$SCRIPT_DIR/nicotine-plugin"

echo "========================================================"
echo "  CachyMusic Workstation - Nicotine+ Setup"
echo "========================================================"

# 1. Check if nicotine is installed
if ! command -v nicotine &>/dev/null; then
    echo "⚠️  Nicotine+ is not installed on this machine."
    echo "   Please install Nicotine+ first:"
    echo "   - Arch Linux:   sudo pacman -S nicotine+"
    echo "   - Ubuntu/Debian: sudo apt install nicotine-plus"
    echo "   - Fedora:       sudo dnf install nicotine-plus"
    echo "   - Flatpak:      flatpak install org.nicotine_plus.Nicotine"
    echo "   - Windows:      Download from https://nicotine-plus.org"
    echo ""
    read -p "Press Enter to continue installing the plugin anyway, or Ctrl+C to abort..."
fi

# 2. Determine target plugins directory
XDG_DATA_HOME="${XDG_DATA_HOME:-$HOME/.local/share}"
TARGET_DIR="$XDG_DATA_HOME/nicotine/plugins/api-nicotine-plus"

echo "📦 Installing api-nicotine-plus plugin to:"
echo "   $TARGET_DIR"

mkdir -p "$XDG_DATA_HOME/nicotine/plugins"
rm -rf "$TARGET_DIR"
cp -r "$PLUGIN_SOURCE" "$TARGET_DIR"
echo "✓ Plugin files copied."

# 3. Enable in ~/.config/nicotine/config if config exists
CONFIG_FILE="$HOME/.config/nicotine/config"
if [ -f "$CONFIG_FILE" ]; then
    echo "⚙️  Updating Nicotine+ configuration ($CONFIG_FILE)..."
    python3 -c "
import re

config_path = '$CONFIG_FILE'
try:
    with open(config_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Ensure [plugins] enable = True
    content = re.sub(r'(\[plugins\][^\[]*?enable\s*=\s*)(False)', r'\g<1>True', content, flags=re.DOTALL)

    # Ensure Nicotine client is disconnected by default on startup
    if re.search(r'auto_connect_startup\s*=', content):
        content = re.sub(r'auto_connect_startup\s*=\s*True', 'auto_connect_startup = False', content)
    else:
        content = re.sub(r'(\[server\])', r'\1\nauto_connect_startup = False', content)

    # Check if api-nicotine-plus is in enabled list
    match = re.search(r'enabled\s*=\s*\[(.*?)\]', content)
    if match:
        existing = match.group(1)
        if 'api-nicotine-plus' not in existing:
            new_list = existing.strip()
            if new_list:
                new_list = new_list + \", 'api-nicotine-plus'\"
            else:
                new_list = \"'api-nicotine-plus'\"
            content = content[:match.start(1)] + new_list + content[match.end(1):]
    else:
        content += \"\n[plugins]\nenable = True\nenabled = ['api-nicotine-plus']\n\"

    with open(config_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print('✓ Enabled api-nicotine-plus in configuration.')
except Exception as e:
    print(f'Note: Could not automatically edit config ({e}). You can enable it in Nicotine+ GUI > Preferences > Plugins.')
"
else
    echo "ℹ️  No existing Nicotine+ config found. When you launch Nicotine+ for the first time,"
    echo "   go to Preferences > Plugins and check 'API Nicotine Plus'."
fi

echo ""
echo "🎉 Setup complete! You can now start Nicotine+:"
echo "   - Normal mode:   nicotine"
echo "   - Headless mode: nicotine --headless"
echo "   - Or click '▶ START DAEMON' directly inside CachyMusic!"
echo "========================================================"
