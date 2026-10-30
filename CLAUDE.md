# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Pokyny pro práci v tomto repu

- Repo je hub markdownových dokumentů k JUMP Krossu 2027, ne softwarový projekt. Nic se nebuildí ani netestuje.

## O projektu v kostce

- JUMP Kross = jednodenní táborová hra v areálu kláštera v Kostelním Vydří a okolí (léto 2027). Cca 10–13 klanů po ~10 hráčích, 2–3 kmotři na klan. Klany obchází stanoviště s disciplínami s omezenou kapacitou. Podrobně `kontext/zadani.md`.
- Cíl ročníku: nad disciplínami jedna spojující hra, která zvyšuje imerzi a je globální mechanikou.
- Aktuální fáze: sběr nápadů a volba konceptu. Základní směr je „hra vedle hry“ (`koncept/hra-vedle-hry.md`) — nepřetržitě běžící globální hra, kterou klany ovlivňují; skládá se z mechanik v `koncept/mechaniky/`.
- `koncept/katalog-mechanik.md` je obecný zásobník principů (ne rozhodnutí), roztříděný podle Adamova hodnocení ano / možná / ne. Čísla mechanik (např. 3.2) jsou pevná a slouží k odkazování — neměň je ani nepřečíslovávej.
- Piš česky, s diakritikou. Názvy souborů a složek česky bez diakritiky, malými písmeny, slova oddělená pomlčkou, bez číselných prefixů.
- Používej pojmy ze `slovnik.md` (klan, ne tým; kmotr = vedoucí klanu; oficiální název JUMP Kross). Nový ustálený pojem do slovníku doplň (abecedně; nejisté pojmy jako „pracovní pojem“).

## Struktura

- V kořeni: `README.md` (hlavní rozcestník), průřezové dokumenty `slovnik.md`, `otevrene-otazky.md`, `rozhodnuti.md`.
- Složky podle typu obsahu: `kontext/`, `koncept/` (+ `koncept/mechaniky/`), `stanoviste/`, `poznamky/`, `vystupy/`, `neroztridene/`, `archiv/`.
- Každá složka má `README.md` s tabulkou dokumentů a jejich stavem. Při přidání, přesunu, smazání nebo změně stavu dokumentu aktualizuj README složky (a hlavní README, jde-li o novou složku).
- Nové stanoviště zakládej kopií `stanoviste/_sablona.md`. Novou mechaniku jako soubor v `koncept/mechaniky/`.
- Volné poznámky do `poznamky/` s datem v názvu (`RRRR-MM-DD-tema.md`).
- Rozhodnutí zapisuj do `rozhodnuti.md` (datum, co, proč). Nerozhodnuté věci patří do `otevrene-otazky.md`.
- Nejasné zařazení → `neroztridene/`. Zamítnuté / odložené → `archiv/` a stav `zamítnuto`.

## Frontmatter

Každý dokument kromě `README.md` a `CLAUDE.md` začíná:

```yaml
---
stav: nápad            # nápad | rozpracováno | schváleno | zamítnuto
aktualizovano: RRRR-MM-DD
stitky: [..]
souvisi:               # cesty od kořene repa
  - ..
---
```

Při věcné úpravě aktualizuj `aktualizovano`. Stav `schváleno` nastavuj jen na pokyn Adama.

## Obecně

- Fakta z `kontext/` ber jako platná; když si něčím nejsi jistý (např. detaily o areálu), označ to „ověřit“.
- Změny průběžně commituj (po každém uceleném kroku), zprávy česky. Nepushuj bez vyzvání.
