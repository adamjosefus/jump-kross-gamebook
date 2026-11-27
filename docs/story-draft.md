# Koncept příběhu z editoru

Editor v administraci slouží k rychlému psaní příběhu. Autor v něm napíše uzly, rozdělí jejich text na segmenty, vytáhne z uzlu volby a pojmenuje je. Výsledkem je **koncept**: jeden JSON soubor s textem a tvarem příběhu, bez jeho logiky. Hra koncept nečte. Do skriptu `packages/story/src/story.ts` se převádí ručně nebo přes LLM, podle tohoto dokumentu.

Slova jako uzel, segment a akce jsou ve [slovníčku](story-glossary.md), skript popisuje [psaní příběhu](story-authoring.md).

## Editor

Editor je v administraci pod „Editor“, ale jen při `pnpm dev`. Koncept ukládá vývojový server do souboru `packages/story/draft/story-draft.json` v repozitáři. Nasazená administrace editor nemá a soubor nečte. Když soubor neexistuje, editor začne s jedním prázdným uzlem a soubor vytvoří při první změně.

- **Graf** se rozkládá sám, shora dolů. Při oddálení je na kartách vidět jen shrnutí. Tečky voleb, kolečka pro tažení, popisky šipek a náhled nového uzlu mají na obrazovce stejnou velikost při každém přiblížení, stejně jako tloušťka čar. Každý uzel bez voleb je konec a má pod sebou vlastní kroužek konce; konců může být víc. Pod kroužkem je, kolik uzlů vede od začátku do tohoto konce (nejkratší a nejdelší cesta, každý uzel na cestě nejvýš jednou), a o kolik znaků textu segmentů je cesta sem delší nebo kratší než průměrná cesta do všech konců, např. „+35“ nebo „−1,2 k“.
- **Psaní** je jen v detailu: id, shrnutí, poznámka, segmenty s tématy i texty voleb. Karta na plátně ukazuje id, shrnutí, poznámku a segmenty, volby ne; mění se na ní jen velikost karty. **Klik** na uzel ho vybere a vycentruje, **dvojklik** ho otevře v detailu. Když karta vyroste, graf se hned přeskládá, aby nic nezakrývala, a pohled ji při tom drží na místě. Při oddálení je karta jen shrnutím.
- **Výběr:** klik vybere jeden uzel nebo jednu šipku. Se Shiftem klik uzel nebo šipku do výběru přidá, nebo z něj odebere; vybrat jde uzly i šipky najednou.
- **Segmenty** se v detailu píší jako jeden text: řádek `===` (s tématem `=== red`) a Enter je oddělí, `/` na začátku řádku nabídne příkazy a řádek `//` je poznámka. Na kartě je mezi segmenty jen čára.
- **Velikost karty** se mění tažením za pravý okraj, spodní okraj nebo pravý dolní roh; uloží se do konceptu jako `size`. Dvojklik na úchyt vrátí rozměry, které úchyt mění, zpět podle obsahu. Tlačítko „Velikost podle obsahu“ v liště to udělá se všemi kartami najednou.
- **Mazání:** ⌘⌫ nebo Delete smaže všechno vybrané, uzly i šipky. Vybraná šipka zežloutne a zesílí; smazáním šipky se smaže volba. Mazání se nejdřív zeptá v dialogu s tlačítkem „Smazat“ v popředí, takže Enter potvrdí a Esc zruší. Uzel, do kterého pak nic nevede, zůstane viset bez šipky; je to problém, ale editor ho unese. V detailu má uzel koš v hlavičce a každá volba křížek; oba se nejdřív zeptají.
- **Začátek** je tečka nad grafem. Její šipku jde táhnout na uzel, kde příběh začíná, a jako každou šipku ji jde vybrat a smazat. Správně je šipka jedna; žádná nebo víc jsou problém, ale editor je unese.
- **Problémy:** když koncept nějaké má, ukazatel v liště nahoře říká kolik a klik na něj ukáže první uzel s problémem. Koncept v pořádku nic neukazuje. Problém je, když má uzel víc voleb se stejným textem (v detailu volby zčervenají), když do uzlu nic nevede a není to začátek (karta má červený štítek „nic sem nevede“), když začátek vede do víc uzlů, nebo když příběh začátek nemá. Karta uzlu s problémem má červený okraj.
- **Barvy:** id uzlu je barevný štítek; barvy se střídají po devíti podle pořadí uzlů. Tečka volby má barvu uzlu, do kterého volba vede.
- **Volby** karta nevypisuje: jsou to očíslované barevné tečky na spodní hraně, ze kterých vycházejí šipky s textem volby. Číslo je pořadí volby, barva patří uzlu, kam volba vede. Volby do stejného uzlu jsou vedle sebe v jedné pilulce. Pořadí voleb se mění v detailu šipkami nahoru a dolů; tečky na hraně ho nedodržují, leží v pořadí, ve kterém leží jejich cílové uzly, aby šipky byly krátké a co nejméně se křížily. Novou šipku jde táhnout jen z malých plných koleček s tečkou v rozích karty (při najetí na kartu); chytit se dají i kousek kolem. Kolečko v pravém dolním rohu přidá volbu tohoto uzlu: kliknutím do nového uzlu, tažením do uzlu, na který ji pustíte, tažením do prázdna do nového uzlu. Kolečko v levém horním rohu přidá volbu opačným směrem, do tohoto uzlu: kliknutím z nového uzlu, tažením z uzlu, na který ji pustíte. Při tažení z kolečka mimo kartu je šipka modrá a její konec ukazuje modrý čárkovaný čtverec „Nový uzel“ s ikonou plus: puštěním tam vznikne nový uzel. Do uzlu, ze kterého vychází, volba vést nemůže. Esc nebo pravé tlačítko myši tažení zruší; připomíná to štítek pod ukazatelem.
- **Id** nového uzlu se v detailu odvozuje ze shrnutí, dokud pole shrnutí poprvé neopustíte. Pak už se mění jen ručně v poli id v hlavičce detailu. Volby, které do uzlu vedou, se přejmenují s ním.
- **Zpět a Znovu** jsou v liště nahoře, nebo ⌘Z a ⇧⌘Z mimo textová pole. V textu platí jeho vlastní Zpět.
- **Lišta:** přepínač **Rozestupy** (malé, větší, největší) a přepínač **Šipky** (kolmo po trase, nebo plynulé Bézierovy křivky z tečky rovnou do cílové karty, s popiskem uprostřed) se rozbalí kliknutím. Obě volby i přiblížení a poloha grafu se pamatují v prohlížeči, ne v konceptu. Tlačítko **Mermaid** zkopíruje tvar příběhu jako diagram Mermaid: začátek, uzly se shrnutím a volby s texty, bez segmentů.
- **Detail** uzlu otevře dvojklik na kartu, Enter nebo mezerník na vybraném uzlu, nebo ikona v rohu karty, jako velký dialog nad grafem: vlevo odkud se do uzlu přijde, uprostřed pole s popisky a rámečkem pro shrnutí, poznámku a text segmentů s tématy (prázdný segment ukáže nápovědu) a volby, vpravo kam vede. U voleb i sousedů je barevný štítek s id uzlu. V detailu se dá upravit všechno, i pořadí voleb. Tlačítko „Přidat následující uzel“ přidá volbu do nového uzlu a rovnou ho otevře. Klik na souseda ho otevře; šipky v hlavičce, nebo ⌘[ a ⌘], vedou zpět a vpřed po cestě, kterou jste prošli. Esc dialog zavře.

## Tvar konceptu

Typy jsou v `apps/web/src/features/editor/draft.ts`, ukázka v `sample-draft.ts` vedle něj.

```json
{
  "version": 1,
  "starts": ["nakup_v_pekarne"],
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
- `size`: velikost karty nastavená v editoru (`width`, `height`), jen pro editor; do skriptu se nepřevádí.

Začátek si koncept pamatuje v `starts`: id uzlů, kam vede šipka začátku. Správně je v něm jedno id. Koncept bez `starts` (z doby, kdy ho editor neměl) začíná prvním uzlem v pořadí `nodes`, do kterého nevede žádná volba z jiného uzlu, a editor ho při načtení do `starts` zapíše. Uzel, do kterého nic nevede a není začátek, visí ve vzduchu; editor ho ukazuje jako problém a do délky cest ho nepočítá. Konec si koncept nepamatuje: uzel bez voleb je konec.

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
