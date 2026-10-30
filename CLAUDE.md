# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Co je tohle repo

Hub markdownových dokumentů k přípravě **JUMP Krossu 2027**: jednodenní táborové hry v areálu kláštera v Kostelním Vydří a okolí (léto 2027, cca 10–13 klanů po ~10 hráčích, 2–3 kmotři na klan). Není to softwarový projekt — nic se nebuildí, nelintuje ani netestuje. Práce = psaní, třídění a provazování dokumentů.

Fáze: **sběr nápadů a volba konceptu spojující hry**. Většina dokumentů je ve stavu `nápad` / `rozpracováno`.

## Jak do sebe dokumenty zapadají

- `kontext/zadani.md` je výchozí fakt (schváleno): klany obchází stanoviště s disciplínami s omezenou kapacitou; cílem ročníku je nad nimi jedna spojující hra, která zvyšuje imerzi a je globální mechanikou. Fakta z `kontext/` ber jako platná.
- `koncept/principy.md` — číslovaná kritéria (musí / mělo by / mohlo by), podle kterých se hodnotí návrhy a mechaniky. Nový návrh posuzuj proti nim.
- `koncept/hra-vedle-hry.md` — zvolený základní směr: globální hra běží nepřetržitě sama od sebe, vyhodnocuje se v **tickách** a klany ji jen ovlivňují. Její stavební kameny jsou soubory v `koncept/mechaniky/` (jeden soubor = jedna mechanika); obsahuje i seznam otázek „K rozpracování“.
- `koncept/katalog-mechanik.md` — obecný zásobník herních principů, **ne rozhodnutí**. Adam ho roztřídil na ano / možná / ne. Čísla mechanik (např. 3.2) jsou pevná a odkazuje se na ně — nepřečíslovávej.
- `stanoviste/` — jeden soubor = jedno stanoviště, zakládej kopií `stanoviste/_sablona.md`. Sekce „Vazba na spojující hru“ je místo, kde se stanoviště napojuje na hru vedle hry.
- `neroztridene/` — starší alternativní návrhy spojující hry A–D a další materiál s nejasným zařazením.
- `poznamky/` — volné poznámky `RRRR-MM-DD-tema.md`; po rozpracování do jiných dokumentů zůstávají jako zdroj, na který se odkazuje.
- Průřezově v kořeni: `slovnik.md` (pojmy), `rozhodnuti.md` (datum — co — proč), `otevrene-otazky.md` (checklist nerozhodnutého). Co se rozhodne, přesuň z otázek do rozhodnutí.
- `vystupy/` (hotové podklady pro hráče, kmotry, organizátory) a `archiv/` (zamítnuté/odložené, stav `zamítnuto`) jsou zatím prázdné.

## Konvence

- Česky, s diakritikou. Názvy souborů a složek česky bez diakritiky, malými písmeny, slova oddělená pomlčkou, bez číselných prefixů.
- Terminologie podle `slovnik.md`: **klan** (ne tým), **kmotr** (vedoucí klanu), oficiální název **JUMP Kross** (ne JUMP Cross). Nový ustálený pojem doplň do slovníku abecedně; nejistý označ jako pracovní.
- Každá složka má `README.md` s tabulkou dokumentů a jejich stavem — při přidání, přesunu, smazání nebo změně stavu dokumentu ji aktualizuj (u nové složky i hlavní `README.md`).
- Dokumenty se mezi sebou provazují relativními markdown odkazy; frontmatter `souvisi` uvádí cesty od kořene repa.
- Nejisté údaje (typicky detaily areálu) označ „ověřit“.

Každý dokument kromě `README.md` a `CLAUDE.md` začíná frontmatterem:

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

## Git

Commituj po každém uceleném kroku, zprávy česky a stručně (např. „Nová mechanika: kostky se symboly“). Nepushuj bez vyzvání.
