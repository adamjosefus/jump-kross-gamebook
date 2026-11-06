"""
Cuts the story fonts down to what a Czech text needs, so phones do not download whole latin-ext
files (up to 330 kB each) for a dozen letters with a caron.

  apps/web/src/fonts/*-czech-*.woff2       Czech and Slovak letters outside Latin-1 (č, ř, ů, ľ…)
  apps/web/src/fonts/*-condensed-*.woff2   Noto Serif fixed at its narrowest width, for headings

The basic Latin files come straight from Fontsource; index.css pairs them with these by
unicode-range. Run again after updating @fontsource-variable/noto-serif or /inter:

  pip install fonttools brotli
  python3 scripts/subset-fonts.py
"""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / "apps/web/node_modules/@fontsource-variable"
TARGET = ROOT / "apps/web/src/fonts"

# Č č Ď ď Ě ě Ĺ ĺ Ľ ľ Ň ň Ŕ ŕ Ř ř Š š Ť ť Ů ů Ž ž. Must match the Czech unicode-range in index.css.
CZECH = [
    *range(0x010C, 0x0110),
    0x011A, 0x011B, 0x0139, 0x013A, 0x013D, 0x013E, 0x0147, 0x0148,
    0x0154, 0x0155, 0x0158, 0x0159, 0x0160, 0x0161, 0x0164, 0x0165,
    0x016E, 0x016F, 0x017D, 0x017E,
]

# Narrowest width of Noto Serif, the `font-stretch: 62.5%` the headings use.
CONDENSED = {"wdth": 62.5}


def write(font: TTFont, name: str, unicodes: list[int] | None) -> None:
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes or font.getBestCmap().keys())
    subsetter.subset(font)
    path = TARGET / name
    font.flavor = "woff2"
    font.save(path)
    print(f"{path.stat().st_size / 1024:6.1f} kB  {path.relative_to(ROOT)}")


def condensed(path: Path) -> TTFont:
    # Saved and read back, because the subsetter trips over the instancer's half-loaded tables.
    buffer = BytesIO()
    instantiateVariableFont(TTFont(path), CONDENSED).save(buffer)
    buffer.seek(0)
    return TTFont(buffer)


TARGET.mkdir(exist_ok=True)
serif = SOURCE / "noto-serif/files"
inter = SOURCE / "inter/files"

write(TTFont(serif / "noto-serif-latin-ext-wght-normal.woff2"), "noto-serif-czech-wght-normal.woff2", CZECH)
write(TTFont(serif / "noto-serif-latin-ext-wght-italic.woff2"), "noto-serif-czech-wght-italic.woff2", CZECH)
write(condensed(serif / "noto-serif-latin-standard-normal.woff2"), "noto-serif-condensed-latin-wght-normal.woff2", None)
write(condensed(serif / "noto-serif-latin-ext-standard-normal.woff2"), "noto-serif-condensed-czech-wght-normal.woff2", CZECH)
write(TTFont(inter / "inter-latin-ext-wght-normal.woff2"), "inter-czech-wght-normal.woff2", CZECH)
