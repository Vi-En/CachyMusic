#!/usr/bin/env python3
"""
CachyMusic - Native Linux MPRIS2 D-Bus Interface Bridge
Exposes media keys, Waybar, Polybar, KDE Plasma, and GNOME Shell controls for CachyMusic.
Conforms to the MPRIS v2.2 specification (org.mpris.MediaPlayer2.Player).
"""
import sys
import os
import time
import json
import argparse
import urllib.request
import urllib.error

# Ensure D-Bus and GLib are present
try:
    import dbus
    import dbus.service
    from dbus.mainloop.glib import DBusGMainLoop
    from gi.repository import GLib
except ImportError as err:
    print(f"[MPRIS] D-Bus / GLib dependencies not met ({err}). MPRIS bridge disabled.")
    sys.exit(0)

MPRIS_BUS_NAME = "org.mpris.MediaPlayer2.cachymusic"
MPRIS_OBJECT_PATH = "/org/mpris/MediaPlayer2"

class MprisPlayer(dbus.service.Object):
    def __init__(self, bus, port=8000):
        super().__init__(bus, MPRIS_OBJECT_PATH)
        self.bus = bus
        self.port = port
        self.base_url = f"http://127.0.0.1:{self.port}"
        
        # State cache
        self.status = "Stopped"
        self.position_sec = 0.0
        self.duration_sec = 0.0
        self.title = "CachyMusic"
        self.artist = "CachyOS"
        self.album = ""
        self.art_url = ""
        self.volume_level = 0.8
        self.is_shuffle = False
        self.loop_status = "None"
        self.last_update_ts = 0
        self.last_poll_wall_ts = time.monotonic()

    @staticmethod
    def map_loop_status(repeat_mode):
        val = (repeat_mode or "off").lower()
        if val == "one":
            return "Track"
        if val == "all":
            return "Playlist"
        return "None"

    def send_player_command(self, cmd, extra=None):
        payload = {"command": cmd}
        if extra:
            payload.update(extra)
        try:
            req = urllib.request.Request(
                f"{self.base_url}/php/api/mpris_state.php?action=send_command",
                data=json.dumps(payload).encode("utf-8"),
                headers={"Content-Type": "application/json"}
            )
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                pass
        except Exception:
            pass

    def poll_web_state(self):
        try:
            req = urllib.request.Request(f"{self.base_url}/php/api/mpris_state.php?action=get_state")
            with urllib.request.urlopen(req, timeout=0.8) as resp:
                data = json.loads(resp.read().decode("utf-8"))

                new_status = data.get("status", "Stopped")
                new_title = data.get("title", "") or "CachyMusic"
                new_artist = data.get("artist", "") or "CachyOS"
                new_album = data.get("album", "") or ""
                new_art = data.get("artFileUrl") or data.get("artUrl") or ""
                new_pos = float(data.get("position", 0.0))
                new_dur = float(data.get("duration", 0.0))
                new_vol = float(data.get("volume", 0.8))
                new_shuffle = bool(data.get("shuffle", False))
                new_loop = self.map_loop_status(data.get("loopStatus") or data.get("repeat"))

                now_wall = time.monotonic()
                dt_wall = max(0.0, now_wall - self.last_poll_wall_ts)
                self.last_poll_wall_ts = now_wall

                changed_props = {}
                track_changed = (
                    new_title != self.title or new_artist != self.artist or
                    new_album != self.album or new_art != self.art_url or abs(new_dur - self.duration_sec) > 1.0
                )

                if new_status != self.status:
                    self.status = new_status
                    changed_props["PlaybackStatus"] = dbus.String(self.status)

                if track_changed:
                    self.title = new_title
                    self.artist = new_artist
                    self.album = new_album
                    self.art_url = new_art
                    self.duration_sec = new_dur
                    changed_props["Metadata"] = self.Get("org.mpris.MediaPlayer2.Player", "Metadata")

                if abs(new_vol - self.volume_level) > 0.02:
                    self.volume_level = new_vol
                    changed_props["Volume"] = dbus.Double(self.volume_level)

                if new_shuffle != self.is_shuffle:
                    self.is_shuffle = new_shuffle
                    changed_props["Shuffle"] = dbus.Boolean(self.is_shuffle)

                if new_loop != self.loop_status:
                    self.loop_status = new_loop
                    changed_props["LoopStatus"] = dbus.String(self.loop_status)

                expected_pos = self.position_sec + (dt_wall if self.status == "Playing" else 0.0)
                if not track_changed and abs(new_pos - expected_pos) > 1.5:
                    self.Seeked(dbus.Int64(max(0, int(new_pos * 1000000))))

                self.position_sec = new_pos

                if changed_props:
                    self.PropertiesChanged("org.mpris.MediaPlayer2.Player", changed_props, [])
        except Exception:
            pass
        return True  # Keep GLib timeout alive

    # =========================================================================
    # org.mpris.MediaPlayer2 Interface
    # =========================================================================
    @dbus.service.method("org.mpris.MediaPlayer2")
    def Raise(self):
        pass

    @dbus.service.method("org.mpris.MediaPlayer2")
    def Quit(self):
        self.send_player_command("Stop")
        sys.exit(0)

    # =========================================================================
    # org.mpris.MediaPlayer2.Player Interface Methods
    # =========================================================================
    @dbus.service.method("org.mpris.MediaPlayer2.Player")
    def Next(self):
        self.send_player_command("Next")

    @dbus.service.method("org.mpris.MediaPlayer2.Player")
    def Previous(self):
        self.send_player_command("Previous")

    @dbus.service.method("org.mpris.MediaPlayer2.Player")
    def Pause(self):
        self.send_player_command("Pause")

    @dbus.service.method("org.mpris.MediaPlayer2.Player")
    def PlayPause(self):
        self.send_player_command("PlayPause")

    @dbus.service.method("org.mpris.MediaPlayer2.Player")
    def Stop(self):
        self.send_player_command("Stop")

    @dbus.service.method("org.mpris.MediaPlayer2.Player")
    def Play(self):
        self.send_player_command("Play")

    @dbus.service.method("org.mpris.MediaPlayer2.Player", in_signature="x")
    def Seek(self, offset_microseconds):
        offset_sec = float(offset_microseconds) / 1000000.0
        self.send_player_command("Seek", {"offset": offset_sec})

    @dbus.service.method("org.mpris.MediaPlayer2.Player", in_signature="ox")
    def SetPosition(self, track_id, position_microseconds):
        pos_sec = float(position_microseconds) / 1000000.0
        self.send_player_command("SeekTo", {"position": pos_sec})

    @dbus.service.signal("org.mpris.MediaPlayer2.Player", signature="x")
    def Seeked(self, position_microseconds):
        pass

    # =========================================================================
    # org.freedesktop.DBus.Properties Interface
    # =========================================================================
    @dbus.service.method(dbus.PROPERTIES_IFACE, in_signature="ss", out_signature="v")
    def Get(self, interface, prop):
        if interface == "org.mpris.MediaPlayer2":
            if prop == "CanQuit": return dbus.Boolean(True)
            if prop == "CanRaise": return dbus.Boolean(False)
            if prop == "HasTrackList": return dbus.Boolean(False)
            if prop == "Identity": return dbus.String("CachyMusic")
            if prop == "SupportedUriSchemes": return dbus.Array(["file", "http"], signature="s")
            if prop == "SupportedMimeTypes": return dbus.Array(["audio/mpeg", "audio/flac", "audio/ogg", "audio/wav"], signature="s")
        elif interface == "org.mpris.MediaPlayer2.Player":
            if prop == "PlaybackStatus": return dbus.String(self.status)
            if prop == "LoopStatus": return dbus.String(self.loop_status)
            if prop == "Rate": return dbus.Double(1.0)
            if prop == "Shuffle": return dbus.Boolean(self.is_shuffle)
            if prop == "Volume": return dbus.Double(self.volume_level)
            if prop == "Position": return dbus.Int64(int(self.position_sec * 1000000))
            if prop == "MinimumRate": return dbus.Double(1.0)
            if prop == "MaximumRate": return dbus.Double(1.0)
            if prop == "CanGoNext": return dbus.Boolean(True)
            if prop == "CanGoPrevious": return dbus.Boolean(True)
            if prop == "CanPlay": return dbus.Boolean(True)
            if prop == "CanPause": return dbus.Boolean(True)
            if prop == "CanSeek": return dbus.Boolean(True)
            if prop == "CanControl": return dbus.Boolean(True)
            if prop == "Metadata":
                meta = {
                    "mpris:trackid": dbus.ObjectPath("/org/mpris/MediaPlayer2/CurrentTrack"),
                    "xesam:title": dbus.String(self.title),
                    "xesam:artist": dbus.Array([self.artist], signature="s"),
                    "xesam:album": dbus.String(self.album),
                    "mpris:length": dbus.Int64(int(self.duration_sec * 1000000))
                }
                if self.art_url:
                    meta["mpris:artUrl"] = dbus.String(self.art_url)
                return dbus.Dictionary(meta, signature="sv")
        raise dbus.exceptions.DBusException(f"Property {prop} not found on interface {interface}")

    @dbus.service.method(dbus.PROPERTIES_IFACE, in_signature="s", out_signature="a{sv}")
    def GetAll(self, interface):
        props = {}
        if interface == "org.mpris.MediaPlayer2":
            for p in ["CanQuit", "CanRaise", "HasTrackList", "Identity", "SupportedUriSchemes", "SupportedMimeTypes"]:
                props[p] = self.Get(interface, p)
        elif interface == "org.mpris.MediaPlayer2.Player":
            for p in ["PlaybackStatus", "LoopStatus", "Rate", "Shuffle", "Volume", "Position", 
                      "MinimumRate", "MaximumRate", "CanGoNext", "CanGoPrevious", "CanPlay", 
                      "CanPause", "CanSeek", "CanControl", "Metadata"]:
                props[p] = self.Get(interface, p)
        return props

    @dbus.service.method(dbus.PROPERTIES_IFACE, in_signature="ssv")
    def Set(self, interface, prop, value):
        if interface == "org.mpris.MediaPlayer2.Player":
            if prop == "Volume":
                self.volume_level = float(value)
                self.send_player_command("SetVolume", {"volume": self.volume_level})
            elif prop == "Shuffle":
                self.is_shuffle = bool(value)
                self.send_player_command("SetShuffle", {"shuffle": self.is_shuffle})
            elif prop == "LoopStatus":
                loop_str = str(value)
                if loop_str in ("None", "Track", "Playlist"):
                    self.loop_status = loop_str
                    self.send_player_command("SetLoopStatus", {"loopStatus": loop_str})

    @dbus.service.signal(dbus.PROPERTIES_IFACE, signature="sa{sv}as")
    def PropertiesChanged(self, interface, changed_properties, invalidated_properties):
        pass

def main():
    parser = argparse.ArgumentParser(description="CachyMusic MPRIS2 Desktop Bridge")
    parser.add_argument("--port", type=int, default=8000, help="CachyMusic local port")
    args = parser.parse_args()

    DBusGMainLoop(set_as_default=True)
    try:
        session_bus = dbus.SessionBus()
    except Exception as e:
        print(f"[MPRIS] Cannot connect to D-Bus SessionBus: {e}")
        sys.exit(0)

    try:
        bus_name = dbus.service.BusName(MPRIS_BUS_NAME, session_bus)
    except Exception as e:
        print(f"[MPRIS] Could not acquire bus name {MPRIS_BUS_NAME}: {e}")
        sys.exit(0)

    player = MprisPlayer(session_bus, port=args.port)
    
    # Poll player status every 350ms for low latency media-key reactions
    GLib.timeout_add(350, player.poll_web_state)
    
    loop = GLib.MainLoop()
    try:
        loop.run()
    except KeyboardInterrupt:
        pass

if __name__ == "__main__":
    main()

