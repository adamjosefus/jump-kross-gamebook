# JUMP Kross 2027

Hub dokumentů k přípravě JUMP Krossu 2027 — jednodenní táborové hry v areálu kláštera v Kostelním Vydří a okolí.

Fáze: **sběr nápadů a volba konceptu spojující hry.**
Základní směr: [hra vedle hry](koncept/hra-vedle-hry.md) — nepřetržitě běžící hra, kterou klany ovlivňují.

## Průřezové dokumenty

- [Slovník](slovnik.md) — pojmy (klan, kmotr, …)
- [Otevřené otázky](otevrene-otazky.md)
- [Rozhodnutí](rozhodnuti.md)

## Složky

| Složka | Co tam patří |
|---|---|
| [kontext/](kontext/) | Fakta a vstupy: zadání, areál, lidé, inspirace |
| [koncept/](koncept/) | Spojující hra — principy, hra vedle hry, [mechaniky](koncept/mechaniky/) |
| [stanoviste/](stanoviste/) | Stanoviště a disciplíny (jeden soubor = jedno stanoviště) |
| [poznamky/](poznamky/) | Volné poznámky, pojmenované `RRRR-MM-DD-tema.md` |
| [vystupy/](vystupy/) | Hotové výstupy: pravidla, podklady pro kmotry a organizátory, tiskoviny |
| [neroztridene/](neroztridene/) | Materiál, u kterého ještě není jasné, kam patří a jestli se použije |
| [archiv/](archiv/) | Odložené a zamítnuté dokumenty |

Každá složka má vlastní `README.md` s přehledem dokumentů a jejich stavem.

## Metadata dokumentů

Každý dokument (kromě `README.md` a `CLAUDE.md`) začíná frontmatterem:

```yaml
---
stav: nápad            # nápad | rozpracováno | schváleno | zamítnuto
aktualizovano: 2026-09-27
stitky: [mechanika, kostky]
souvisi:               # cesty od kořene repa
  - koncept/hra-vedle-hry.md
---
```
