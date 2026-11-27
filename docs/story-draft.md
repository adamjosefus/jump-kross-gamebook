# Koncept příběhu z editoru

Editor v administraci slouží k rychlému psaní příběhu. Autor v něm napíše uzly, rozdělí jejich text na segmenty, vytáhne z uzlu volby a pojmenuje je. Výsledkem je **koncept**: jeden JSON soubor s textem a tvarem příběhu, bez jeho logiky. Hra koncept nečte. Do skriptu `packages/story/src/story.ts` se převádí ručně nebo přes LLM, podle tohoto dokumentu.

Slova jako uzel, segment a akce jsou ve [slovníčku](story-glossary.md), skript popisuje [psaní příběhu](story-authoring.md).

## Tvar konceptu

Typy jsou v `apps/web/src/features/editor/draft.ts`, ukázka v `sample-draft.ts` vedle něj.

```json
{
  "version": 1,
  "nodes": [
    {
      "id": "nakup_v_pekarne",
      "summary": "Nákup v pekárně",
      "note": "Chleba stojí 3 mince, chleba a koláče 8.",
      "segments": [
        { "text": "Uhodli jste. Za pultem čeká pekařka." },
        { "theme": "red", "text": "Co si koupíte?", "note": "Vypsat počet mincí." }
      ],
      "choices": [
        { "label": "Chleba za 3 mince", "to": "cesta_domu" },
        { "label": "Chleba a koláče za 8 mincí", "to": "cesta_domu" }
      ]
    }
  ]
}
```

Uzel (`nodes[]`) má tyto části:

- `id`: klíč uzlu. Editor ho odvodí ze shrnutí: bez diakritiky, malými písmeny, slova spojená podtržítkem, nejvýš 24 znaků celými slovy. Při kolizi přidá číslo (`pekarna_2`). Po prvním opuštění pole shrnutí se id už samo nemění a dá se jen přepsat ručně.
- `summary`: jedna věta o tom, co se v uzlu děje. Při odzoomovaném grafu je to jediný vidět text.
- `note`: všechno, pro co editor nemá pole. Patří sem podmínky, změny stavu, kapitola a to, že se jde dál QR kódem místo tlačítek.
- `segments`: aspoň jeden segment, každý s `text` (markdown), volitelným `theme` (bez něj výchozí vzhled) a volitelnou `note` pro autora.
- `choices`: volby v pořadí tlačítek. `label` je text tlačítka, prázdný znamená šipku „Další“. `to` je `id` cílového uzlu.

Začátek a konec si koncept nepamatuje, plynou z grafu. Uzel, do kterého nevede žádná volba z jiného uzlu, je začátek. Uzel bez voleb je konec.

## Převod do skriptu

1. **Uzly:** každý uzel konceptu je jeden uzel v `nodes`. Klíč je `id` velkými písmeny (`NAKUP_V_PEKARNE`) a reference v `goto` se převedou stejně.
2. **Segmenty:** segment bez tématu je řetězec, segment s tématem `{ theme, content }`. `note` segmentu se do skriptu nepíše, jen říká, co v textu doplnit, třeba hodnotu ze stavu. Pak se `segments` píšou funkcí stavu.
3. **Volby:** každá volba je `{ label, goto }`, volba s prázdným `label` je `{ goto }` bez `label`.
4. **QR kódy:** když poznámka uzlu říká, že se jde dál kódem, stávají se z voleb `scans`. Čísla kódů a jejich názvy jsou v poznámce a patří do `codes` příběhu. Uzel pak nemá `choices` a `label` voleb poslouží jen pro orientaci (text skeneru je ve `scanTitle` a `scanText`).
5. **Logika z poznámek:**
   - změna stavu je `nextState`;
   - volba dostupná jen za podmínky znamená, že se `choices` nebo `scans` zapíšou jednou funkcí stavu, která vrátí vždy aspoň jednu možnost;
   - kapitola je `chapter`.
6. **Začátek a konec:** začátek dostane `initialState` (ze své poznámky). Příběh má jeden konec, `outroNode`. Když jich koncept má víc, buď se sloučí, nebo všechny vedou do společného konce.
7. **Úvod:** `introNode`, tedy co vidí kdokoli před naskenováním kódu týmu, koncept nezná. Když ho poznámka nezmiňuje, zůstane úvod ze skriptu.

Po převodu musí projít `pnpm typecheck` a `pnpm test:story`. Validace příběhu najde volby do neexistujících uzlů, nedosažitelné uzly a nepoužité kódy.
