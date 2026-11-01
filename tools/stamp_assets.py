"""Stamp one release version and per-asset hash into the HTML references.

No manual CSS cache-buster edits. Runs before CSP and SW generation so their
hashes/precache reflect the exact served assets and installed version.
"""
from pathlib import Path
import hashlib, json, re

root = Path(__file__).resolve().parents[1] / "web"
version = json.loads((root / "data.json").read_text(encoding="utf-8"))["version"]
html_path = root / "index.html"
html = html_path.read_text(encoding="utf-8")
assets = ["ui.css", "calendar-layout.css", "season-theme.css", "keyboard.css", "backup.css",
          "time-editor.css", "continuous-ui.css", "app.js"]
for asset in assets:
    data = (root / asset).read_bytes()
    suffix = hashlib.sha256(data).hexdigest()[:12]
    pattern = re.compile(r'(?P<name>(?<![a-zA-Z0-9_-])' + re.escape(asset) + r')\?v=[a-zA-Z0-9._-]+')
    html, n = pattern.subn(lambda m: m.group("name") + "?v=" + version + "-" + suffix, html)
    if n != 1:
        raise SystemExit(f"Expected exactly one versioned HTML URL for {asset}, found {n}")
# App icons are generated before stamping. Their URLs change only when the
# image bytes change, rather than carrying a manually dated cache query.
def stamp_reference(document: str, asset: str) -> str:
    digest = hashlib.sha256((root / asset).read_bytes()).hexdigest()[:12]
    pattern = re.compile(r'(?P<name>(?<![a-zA-Z0-9_-])' + re.escape(asset) + r')\\?v=[a-zA-Z0-9._-]+')
    updated, count = pattern.subn(lambda m: m.group("name") + "?v=" + version + "-" + digest, document)
    if count != 1:
        raise SystemExit(f"Expected one icon/manifest URL for {asset}, found {count}")
    return updated

manifest_path = root / "manifest.webmanifest"
manifest = manifest_path.read_text(encoding="utf-8")
for asset in ("assets/icon-192.png", "assets/icon-512.png", "assets/icon-maskable-512.png"):
    manifest = stamp_reference(manifest, asset)
manifest_path.write_text(manifest, encoding="utf-8")

for asset in ("manifest.webmanifest", "assets/icon-180.png", "assets/shen-rope.svg", "assets/favicon-32.png"):
    html = stamp_reference(html, asset)

html_path.write_text(html, encoding="utf-8")
print(f"Stamped {version} with {len(assets)} content-addressed asset URLs")
