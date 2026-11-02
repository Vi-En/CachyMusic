import subprocess
import json
import os

devices = [
    ("infinix_note_30", 392, 872),
    ("samsung_note", 412, 915),
    ("iphone_11", 414, 896),
    ("iphone_15", 393, 852),
    ("iphone_6", 375, 667)
]

themes = [
    'default', 'nms', 'solar-eclipse', 'euclid-horizon', 'alien-paradise',
    'abyssal-void', 'dissonance', 'sentinel', 'minimalist-light',
    'minimalist-dark', 'minimalist-warm', 'minimalist-obsidian'
]

views = [
    ('player', 'panel=playerDeck'),
    ('tracks', 'panel=trackListPanel'),
    ('info', 'panel=settingsPanel'),
    ('soulseek', 'workspace=soulseek'),
    ('download', 'workspace=download'),
    ('settings', 'workspace=settings')
]

out_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'screenshots')
os.makedirs(out_dir, exist_ok=True)

print("=== Starting Mobile Layout & Contrast Audit ===")

# Audit 1: Capture all tabs for Infinix Note 30 and iPhone 6 (extrema)
for dev_name, w, h in [devices[0], devices[4]]:
    for v_name, param in views:
        shot = f"{out_dir}/{dev_name}_{v_name}.png"
        cmd = [
            'timeout', '4s', 'brave', '--headless', '--disable-gpu', '--no-sandbox',
            f'--window-size={w},{h}',
            '--virtual-time-budget=1500',
            f'--screenshot={shot}',
            f'http://127.0.0.1:8000/index.html?{param}'
        ]
        subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        print(f"Captured: {dev_name} - {v_name}")

# Audit 2: Capture all 12 themes on mobile
for t in themes:
    shot = f"{out_dir}/theme_{t}_infinix.png"
    cmd = [
        'timeout', '4s', 'brave', '--headless', '--disable-gpu', '--no-sandbox',
        '--window-size=392,872',
        '--virtual-time-budget=1500',
        f'--screenshot={shot}',
        f'http://127.0.0.1:8000/index.html?theme={t}&panel=playerDeck'
    ]
    subprocess.run(cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    print(f"Captured Theme: {t}")

print("=== Visual Captures Finished ===")

