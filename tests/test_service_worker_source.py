"""Static checks for Renpet's offline startup contract."""
from pathlib import Path
import json
root = Path(__file__).resolve().parents[1] / "web"
s = (root / "sw.js").read_text(encoding="utf-8")
html = (root / "index.html").read_text(encoding="utf-8")
version = json.loads((root / "data.json").read_text(encoding="utf-8"))["version"]
assert f"renpet-{version}-" in s, "Wrong installed cache version"
assert f"app.js?v={version}" in html, "Wrong module version"
assert "cache.match(event.request, {ignoreSearch: true})" in s, "Versioned JS/CSS must work offline"
assert "await cache.match(SHELL)" in s, "Offline navigation requires the cached shell"
assert "return shell ? navigationHtml(shell) : Response.error()" in s, "Cached navigations must be normalized before Safari receives them"
assert "return navigationHtml(response)" in s, "Online navigations must not leak followed redirect history"
assert "headers.delete('Content-Encoding')" in s and "headers.delete('Content-Length')" in s, "Normalized HTML must not retain stale wire encoding"
assert "await cache.addAll(ASSETS.filter(asset => asset !== SHELL))" in s, "Offline boot graph needs an atomic install"
assert "await cache.put(SHELL, navigationHtml(shell))" in s, "Cached HTML must be a clean non-redirected Response"
for asset in ["calendar-presentation.mjs", "season-theme.css", "assets/seasons/akhet.webp", "assets/seasons/peret.webp", "assets/seasons/shemu.webp"]:
    assert '"./' + asset + '"' in s, "Seasonal asset must be installed atomically: " + asset
assert f"season-theme.css?v={version}-" in html, "Seasonal CSS must use its current content hash"
assert "url.pathname.endsWith('/festival-sources.json')" not in s, 'Static catalogs should be part of the immutable release cache'
assert "serviceWorker.addEventListener('controllerchange'" in html, "Existing installed PWAs must reload after an update"
assert "registration.update()" in html, "Installed PWAs must proactively check for updates"
assert "document.addEventListener('visibilitychange'" in html, "Resumed iOS PWAs must check for new versions"
assert "if (event.persisted) checkForUpdates();" in html, "Back-forward restored app must refresh update status"
assert "document.querySelector('#event-editor')" in html, "An in-progress appointment must not be discarded"
registry = json.loads((root / "festival-sources.json").read_text(encoding="utf-8"))
ids = [source["id"] for source in registry["sources"]]
assert ids == ["amun-theban", "national-egypt", "esna-khnum", "isis-philae"], "Retired festival catalogs were shipped"
assert not (root / "festival-packs/christian-coptic.json").exists()
assert not (root / "festival-packs/muslim-egypt.json").exists()

assets = json.loads(__import__('re').search(r'const ASSETS = (\[[^;]+\]);',s).group(1))
assert len(assets) < 120, 'Offline install still eagerly downloads hundreds of SVGs'
assert './assets/numerals/6400.svg' not in assets
assert './assets/numerals/30.svg' in assets
assert "RenpetBoot" in html and "renpet-startup-failed" in html, "Startup watchdog/retry absent"
assert "getRegistration(appScope)" in html, "Scoped service-worker repair unavailable"
assert "actualScript && new URL(actualScript).href === expectedScript" in html, "Repair must verify the Renpet worker identity"
assert "getRegistrations()" not in html, "Repair must never unregister every same-origin service worker"
assert "localStorage.clear" not in html and "caches.delete" not in html, "Startup repair must preserve user data"
import base64, hashlib, re
inline = re.findall(r"<script>([\s\S]*?)</script>", html)
assert len(inline) == 1
digest = base64.b64encode(hashlib.sha256(inline[0].encode('utf-8')).digest()).decode('ascii')
headers = (root / '_headers').read_text(encoding='utf-8')
assert "script-src 'self' 'sha256-" + digest + "';" in headers, "CSP would block startup watchdog"
assert "script-src 'self' 'unsafe-inline'" not in headers, "Do not weaken script CSP"
print("Renpet offline boot, privacy and single-release caching verified")

