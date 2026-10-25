"""Authorize Renpet's single inline boot-recovery script with an exact CSP hash.

Keep script-src strict ('self' + SHA-256), rather than enabling arbitrary
'unsafe-inline'. The hash is generated from the shipped HTML bytes on each
release, so recovery works in the Cloudflare Worker PWA.
"""
import base64
import hashlib
import re
from pathlib import Path

WEB = Path(__file__).resolve().parents[1] / "web"
html = (WEB / "index.html").read_text(encoding="utf-8")
matches = re.findall(r"<script>([\s\S]*?)</script>", html)
if len(matches) != 1:
    raise SystemExit(f"Expected one inline recovery script, got {len(matches)}")
digest = base64.b64encode(hashlib.sha256(matches[0].encode("utf-8")).digest()).decode("ascii")
header_path = WEB / "_headers"
data = header_path.read_text(encoding="utf-8")
replacement = "script-src 'self' 'sha256-" + digest + "';"
data, count = re.subn(r"script-src 'self'(?: 'sha256-[A-Za-z0-9+/=]+')?;", replacement, data)
if count != 1:
    raise SystemExit(f"Could not update exactly one CSP script-src directive: {count}")
header_path.write_text(data, encoding="utf-8")
print("Renpet CSP permits only the SHA-256 of its exact boot-recovery script")
