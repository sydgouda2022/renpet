#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
python tools/sync_keyboards.py --verify
python tools/build_app_icons.py
mkdir -p web/assets/fonts
curl -fLsS --retry 3 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansegyptianhieroglyphs/NotoSansEgyptianHieroglyphs-Regular.ttf' -o web/assets/fonts/NotoSansEgyptianHieroglyphs-Regular.ttf
curl -fLsS --retry 3 'https://raw.githubusercontent.com/google/fonts/main/ofl/notosansegyptianhieroglyphs/OFL.txt' -o web/assets/fonts/OFL-NotoEgyptian.txt
curl -fLsS --retry 3 'https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/Cairo%5Bslnt%2Cwght%5D.ttf' -o web/assets/fonts/Cairo-VF.ttf
curl -fLsS --retry 3 'https://raw.githubusercontent.com/google/fonts/main/ofl/cairo/OFL.txt' -o web/assets/fonts/OFL-Cairo.txt
python tools/make_numerals.py
python tools/stamp_assets.py
python tools/build_csp.py
python tools/build_service_worker.py
