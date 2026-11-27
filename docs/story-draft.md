# Koncept příběhu z editoru

Editor v administraci slouží k rychlému psaní příběhu. Autor v něm napíše uzly, rozdělí jejich text na segmenty, vytáhne z uzlu volby a pojmenuje je. Výsledkem je **koncept**: jeden JSON soubor s textem a tvarem příběhu, bez jeho logiky. Hra koncept nečte. Do skriptu `packages/story/src/story.ts` se převádí ručně nebo přes LLM, podle tohoto dokumentu.

Slova jako uzel, segment a akce jsou ve [slovníčku](story-glossary.md), skript popisuje [psaní příběhu](story-authoring.md).

## Editor

Editor je v administraci pod „Editor“, ale jen při `pnpm dev`. Koncept ukládá vývojový server do souboru `packages/story/draft/story-draft.json` v repozitáři. Nasazená administrace editor nemá a soubor nečte. Když soubor neexistuje, editor začne s jedním prázdným uzlem a soubor vytvoří při první změně.

- **Graf** se rozkládá sám, shora dolů. Při oddálení je na kartách vidět jen shrnutí. Každý uzel bez voleb je konec a má pod sebou vlastní kroužek konce; konců může být víc. Pod kroužkem je, kolik uzlů a znaků textu segmentů vede od začátku do tohoto konce: nejkratší a nejdelší cesta, každý uzel na cestě nejvýš jednou.
- **Klik** na uzel ho vycentruje a otevře k psaní: id, shrnutí, poznámku, segmenty a volby. **Dvojklik** ho i přiblíží. Klik do prázdna psaní ukončí a graf se znovu rozloží.
- **Segmenty** se píší jako jeden text: řádek `===` (s tématem `=== red`) a Enter je oddělí, `/` na začátku řádku nabídne příkazy a řádek `//` je poznámka.
- **Volby:** očíslovaná tečka na spodní hraně karty patří k volbě se stejným číslem. Tažením tečky na jiný uzel vede volba tam, tažením do prázdna vznikne nový uzel. Tečka „+“ (při najetí na kartu) nebo „+ volba“ přidá novou volbu.
- **Id** nového uzlu se odvozuje ze shrnutí, dokud pole shrnutí poprvé neopustíte. Pak už se mění jen ručně v poli id. Volby, které do uzlu vedou, se přejmenují s ním.
- **Zpět a Znovu** jsou v liště nahoře, nebo ⌘Z a ⇧⌘Z mimo textová pole. V textu platí jeho vlastní Zpět.
- **Režim soustředění** otevře ikona v rohu karty a zavře ho Esc.

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
