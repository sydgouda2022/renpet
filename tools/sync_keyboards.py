#!/usr/bin/env python3
"""Verify and explicitly update two immutable, independent headless keyboard APIs.

Release bytes and executable JS are locked separately. No writes during --verify.
Renpet owns the UI, appointments, preferences and Coptic offline installation.
Coptic upstream deliberately publishes no PWA, browser storage or installer.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
LOCK = ROOT / "keyboard-lock.json"
DEPENDENCIES = {
    "coptic-keyboard": {
        "language": "cop",
        "release_dir": "web/coptic-lexicon",
        "modules": {
            "core.mjs": "web/keyboards/cop/core.mjs",
            "editor.mjs": "web/keyboards/cop/editor.mjs",
            "lexicon.mjs": "web/keyboards/cop/lexicon.mjs",
            "index.mjs": "web/keyboards/cop/index.mjs",
        },
    },
    "hieroglyphic-keyboard": {
        "language": "egy",
        "release_dir": "web/lexicon",
        "modules": {
            "keyboard_api.mjs": "web/keyboards/egy/keyboard_api.mjs",
            "keyboard_search.mjs": "web/keyboards/egy/keyboard_search.mjs",
            "keyboard_catalog.js": "web/keyboards/egy/keyboard_catalog.js",
            "lexicon_install.mjs": "web/keyboards/egy/lexicon_install.mjs",
        },
    },
}
HEADERS = {"User-Agent": "renpet-headless-keyboard-api-pin"}


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def blob_sha1(data):
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def fetch(url):
    with urllib.request.urlopen(urllib.request.Request(url, headers=HEADERS), timeout=90) as resp:
        if resp.status != 200:
            raise ValueError(f"HTTP {resp.status}: {url}")
        return resp.read()


def load_lock():
    data = json.loads(LOCK.read_text(encoding="utf-8"))
    if data.get("format") != "keyboard-dependencies-v2":
        raise ValueError("Unsupported keyboard lock schema")
    if set(data.get("dependencies", {})) != set(DEPENDENCIES):
        raise ValueError("Expected exactly the two standalone keyboard dependencies")
    for name, entry in data["dependencies"].items():
        if entry.get("upstream_repository") != f"sydgouda2022/{name}":
            raise ValueError("Unexpected keyboard upstream repository")
        if not isinstance(entry.get("source_commit"), str) or len(entry["source_commit"]) != 40:
            raise ValueError("Unpinned keyboard source")
        expected = set(DEPENDENCIES[name]["modules"].values())
        if set(entry.get("api_files", {})) != expected:
            raise ValueError("Missing or obsolete API files for " + name)
    return data


def verify():
    locked = load_lock()
    for name, dependency in DEPENDENCIES.items():
        entry = locked["dependencies"][name]
        directory = ROOT / dependency["release_dir"]
        raw_manifest = (directory / "manifest.json").read_bytes()
        raw_catalog = (directory / "lexicon.json").read_bytes()
        manifest = json.loads(raw_manifest)
        if manifest["language"] != dependency["language"]:
            raise ValueError("Wrong release language: " + name)
        if (manifest["sha256"] != sha256(raw_catalog)
            or manifest["bytes"] != len(raw_catalog)
            or manifest["spelling_records"] != len(json.loads(raw_catalog)["rows" if dependency["language"] == "cop" else "entries"])):
            raise ValueError("Corrupt lexicon release: " + name)
        if (sha256(raw_manifest) != entry["manifest_sha256"]
            or sha256(raw_catalog) != entry["lexicon_sha256"]):
            raise ValueError("Untracked release bytes: " + name)
        for path, expected_blob in entry["api_files"].items():
            if blob_sha1((ROOT / path).read_bytes()) != expected_blob:
                raise ValueError("API module differs from locked upstream file: " + path)
    print("Verified both independent keyboard APIs and their lexicon releases.")


def update():
    lock = load_lock()
    staged = {}
    changed = []
    for name, dependency in DEPENDENCIES.items():
        entry = lock["dependencies"][name]
        repo = entry["upstream_repository"]
        main = json.loads(fetch(f"https://api.github.com/repos/{repo}/commits/main"))["sha"]
        if main == entry["source_commit"]:
            continue
        def get(path):
            return fetch(f"https://raw.githubusercontent.com/{repo}/{main}/{path}")
        raw_manifest = get("release/manifest.json")
        manifest = json.loads(raw_manifest)
        raw_lexicon = get("release/lexicon.json")
        if (manifest["language"] != dependency["language"]
            or sha256(raw_lexicon) != manifest["sha256"]
            or len(raw_lexicon) != manifest["bytes"]
            or manifest["spelling_records"] != len(json.loads(raw_lexicon)["rows" if dependency["language"] == "cop" else "entries"])):
            raise ValueError("Upstream keyboard data integrity failed: " + name)
        if manifest["spelling_records"] < (20000 if dependency["language"] == "cop" else 40000):
            raise ValueError("Unexpected upstream vocabulary regression: " + name)
        sub = dependency["release_dir"]
        staged.update({
            f"{sub}/manifest.json": raw_manifest,
            f"{sub}/lexicon.json": raw_lexicon,
            f"{sub}/coverage.json": get("release/coverage.json"),
        })
        hashes = {}
        for source, destination in dependency["modules"].items():
            data = get("src/" + source)
            staged[destination] = data
            hashes[destination] = blob_sha1(data)
        entry.update({
            "source_commit": main,
            "version": manifest["release"],
            "manifest_sha256": sha256(raw_manifest),
            "lexicon_sha256": sha256(raw_lexicon),
            "api_files": hashes,
        })
        changed.append(name)
    if not changed:
        verify()
        print("No upstream change.")
        return
    staged["keyboard-lock.json"] = (json.dumps(lock, indent=2, ensure_ascii=False) + "\n").encode()
    with tempfile.TemporaryDirectory(prefix="renpet-keyboard-") as scratch:
        temp = Path(scratch)
        for path, raw in staged.items():
            target = temp / path
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(raw)
        for path in staged:
            destination = ROOT / path
            destination.parent.mkdir(parents=True, exist_ok=True)
            os.replace(temp / path, destination)
    verify()
    print("Updated pinned APIs:", ", ".join(changed))


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--verify", action="store_true")
    args = parser.parse_args()
    if args.verify:
        verify()
    else:
        update()
