"""Build Unicode sign pages for the MDWNFR-style three-tab keyboard.

MIT source: https://github.com/MichalPaszkiewicz/hieroglyph
The upstream data classifies phonograms by their sounds. Python's Unicode
names provide the Gardiner ID -> Unicode codepoint mapping. No transliteration
is shown to Renpet users; sound values are internal metadata only.
"""
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / 'tools/keyboard-signs-source.json'
TARGET = ROOT / 'web/assets/dictionaries/signs.json'

def gardiner_to_unicode(gardiner: str) -> str | None:
    output = ''
    for piece in gardiner.split():
        match = re.fullmatch(r'([A-Za-z]+)(\d+)([a-zA-Z]?)', piece)
        if not match:
            return None
        category, number, suffix = match.groups()
        # Unicode names use an uppercase AA prefix and zero-padded numbers
        name = f'EGYPTIAN HIEROGLYPH {category.upper()}{int(number):03d}{suffix.upper()}'
        try:
            output += unicodedata.lookup(name)
        except KeyError:
            return None
    return output

def main():
    source = json.loads(SOURCE.read_text(encoding='utf-8'))
    groups = {}
    for key in ['uni', 'bi', 'tri']:
        seen = set()
        rows = []
        for gardiner, sound in source[key]:
            text = gardiner_to_unicode(gardiner)
            if not text or gardiner in seen:
                continue
            seen.add(gardiner)
            rows.append([text, gardiner])
        groups[key] = rows
        if len(rows) < {'uni':20,'bi':70,'tri':45}[key]:
            raise RuntimeError(f'Phonogram page {key} unexpectedly sparse: {len(rows)}')
    payload = dict(schema=1, source=source['source'], pages=groups)
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    TARGET.write_text(json.dumps(payload, ensure_ascii=False, separators=(',',':')),encoding='utf-8')
    print('Keyboard sign pages:', {k:len(v) for k,v in groups.items()})

if __name__ == '__main__':
    main()
