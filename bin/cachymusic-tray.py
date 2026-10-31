#!/usr/bin/env python3
"""
CachyMusic - Native Linux System Tray Indicator
Integrates CachyMusic with the desktop system tray via AyatanaAppIndicator / AppIndicator3.
"""
import sys
import os
import signal
import subprocess
import argparse
import urllib.request
import json
import gi

try:
    try:
        gi.require_version('AyatanaAppIndicator3', '0.1')
        from gi.repository import AyatanaAppIndicator3 as AppIndicator
    except (ValueError, ImportError):
        gi.require_version('AppIndicator3', '0.1')
        from gi.repository import AppIndicator3 as AppIndicator

    gi.require_version('Gtk', '3.0')
    from gi.repository import Gtk, GLib
except Exception as e:
    print(f"[Tray] AppIndicator libraries not available: {e}")
    sys.exit(0)

APP_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ICON_PATH = os.path.join(APP_DIR, "resources", "images", "icon-192.png")
if not os.path.exists(ICON_PATH):
    ICON_PATH = "audio-player"

class CachyMusicTray:
    def __init__(self, port=8000):
        self.port = port
        self.base_url = f"http://127.0.0.1:{self.port}"
        
        self.indicator = AppIndicator.Indicator.new(
            "cachymusic-tray",
            ICON_PATH,
            AppIndicator.IndicatorCategory.APPLICATION_STATUS
        )
        self.indicator.set_status(AppIndicator.IndicatorStatus.ACTIVE)
        self.indicator.set_menu(self.build_menu())

    def send_command(self, cmd):
        try:
            req = urllib.request.Request(
                f"{self.base_url}/php/api/mpris_state.php?action=send_command",
                data=json.dumps({"command": cmd}).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=0.8):
                pass
        except Exception:
            pass

    def open_ui(self, _):
        launcher = os.path.join(APP_DIR, "bin", "cachymusic")
        subprocess.Popen([launcher])

    def on_play_pause(self, _):
        self.send_command("PlayPause")

    def on_next(self, _):
        self.send_command("Next")

    def on_previous(self, _):
        self.send_command("Previous")

    def on_quit(self, _):
        launcher = os.path.join(APP_DIR, "bin", "cachymusic")
        subprocess.run([launcher, "--stop"])
        Gtk.main_quit()

    def build_menu(self):
        menu = Gtk.Menu()

        item_open = Gtk.MenuItem(label="Open CachyMusic")
        item_open.connect("activate", self.open_ui)
        menu.append(item_open)

        menu.append(Gtk.SeparatorMenuItem())

        item_play = Gtk.MenuItem(label="Play / Pause")
        item_play.connect("activate", self.on_play_pause)
        menu.append(item_play)

        item_next = Gtk.MenuItem(label="Next Track")
        item_next.connect("activate", self.on_next)
        menu.append(item_next)

        item_prev = Gtk.MenuItem(label="Previous Track")
        item_prev.connect("activate", self.on_previous)
        menu.append(item_prev)

        menu.append(Gtk.SeparatorMenuItem())

        item_quit = Gtk.MenuItem(label="Quit CachyMusic")
        item_quit.connect("activate", self.on_quit)
        menu.append(item_quit)

        menu.show_all()
        return menu

def main():
    parser = argparse.ArgumentParser(description="CachyMusic System Tray Runner")
    parser.add_argument("--port", type=int, default=8000, help="Local CachyMusic port")
    args = parser.parse_args()

    signal.signal(signal.SIGINT, signal.SIG_DFL)
    _tray = CachyMusicTray(port=args.port)
    Gtk.main()

if __name__ == "__main__":
    main()
