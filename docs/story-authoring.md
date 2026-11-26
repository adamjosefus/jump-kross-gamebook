# Pro autora příběhu

Příběh je TypeScriptový soubor `packages/story/src/story.ts`. Mění se jen s novým nasazením aplikace; v administraci se upravit nedá. Ukázkový příběh v tom souboru předvádí všechno, co je tu popsané.

## Kostra

```ts
export const story = defineStory<State>()({
  teams: { 1: 'Klan I', 2: 'Klan II' },
  codes: { 1: 'Pekárna', 2: 'Park' },
  chapters: { home: { name: 'Doma', counts: false }, shopping: 'Nákup' },
  introNode: 'INTRO',
  outroNode: 'OUTRO',
  nodes: {
    INTRO: { blocks: ['…'] },
    START: { chapter: 'home', initialState: { coins: 0 }, blocks: ['…'], choices: [/* … */] },
    // …
    OUTRO: { blocks: (state, team) => [`Konec, ${team.name}.`] },
  },
});
```

- **`State`** je typ stavu týmu: ploché hodnoty (text, číslo, ano/ne), které volby a skeny mění, třeba počet mincí.
- **`teams`:** číslo → název. Každý tým dostane vstupní QR kód se svým číslem.
- **`codes`:** číslo → název herního QR kódu. Název se tiskne na kartu a vidí ho i hráči, proto říká, kde kód visí, ne kam vede.
- **`chapters`:** pojmenované části příběhu (viz Kapitoly níže).
- **`introNode`:** úvod, který vidí kdokoli před přihlášením; nemá tým ani stav. Po něm hráči naskenují kód klanu.
- **`outroNode`:** cíl. Příchodem do něj tým hru dokončí a čas se zastaví.

## Uzly

Každý uzel je jeden krok příběhu.

- **`blocks`:** obrazovky textu v Markdownu, jedna obrazovka za blok. Může to být i funkce stavu a týmu, `(state, team) => [...]`, a blok `false` se vynechá, takže jde psát `podmínka && blok`.
- Blok jako objekt `{ theme, content, svg, next }` určí **motiv** obrazovky (`default`, `intro`, `green`, `red`, `letter`, `description`), obrázek nad textem (jeden prvek `<svg>`, `currentColor` přebírá barvu textu) a text tlačítka na další obrazovku.
- **`initialState`** má právě jeden uzel: start, kde každý tým začíná.
- **`chapter`:** id kapitoly, do které uzel patří.

Uzel pokračuje buď **volbami**, nebo **skeny**, nikdy obojím:

- **`choices`:** tlačítka `{ label, goto, when, nextState }`. `when` volbu ukáže jen při splněné podmínce, `nextState` vrátí změny stavu.
- **`scans`:** `{ code, goto, when, nextState }`. Tým uvidí jen skener; kam který kód vede, neví. Víc kódů vedle sebe je volba. `scanTitle` a `scanText` nastaví nadpis a text skeneru.

Úvod může mít `loginMessages`: texty hlášek kolem přihlášení (přihlášen, už hrajete, cizí kód, přepnutí týmu…). Co chybí, doplní se výchozím textem.

## Kapitoly a čas

Kapitola je skupina uzlů, jejichž čas se měří dohromady.

```ts
chapters: {
  home: { name: 'Doma', counts: false }, // úvod, nepočítá se do výsledku
  shopping: 'Nákup',                      // počítá se
},
```

- Uzel se ke kapitole přidá vlastností `chapter: 'shopping'`.
- Kapitola s `counts: false` se do **výsledného času** týmu nepočítá; v telefonu po celou dobu svítí kapsle „čas stojí“. Hodí se pro úvod nebo pauzu.
- Uzly bez kapitoly jsou **mezi kapitolami**. Jejich čas se měří zvlášť pro každou dvojici kapitol (třeba cesta mezi „Nákup“ a „Večeře“) a do výsledku se počítá.
- Id kapitoly smí mít jen písmena bez diakritiky a číslice a začíná písmenem (`wayHome`); nesmí to být `start` ani `end`. Pojmenovává totiž sloupce ve výsledcích.

Jak se čas počítá a kde se ukazuje, popisuje [Měření času hry](game-time.md).

## Kontrola příběhu

```sh
pnpm test:story
```

Kontrola projde příběh za každý tým ze všech dosažitelných stavů a ohlásí mimo jiné:

- uzel, kam nic nevede, a volbu, která vede do neexistujícího uzlu,
- slepou uličku (uzel bez dostupné volby) a tým, který nemůže dojít do cíle,
- kód, který nikde nepoužíváte, a sken neznámého kódu,
- prázdnou obrazovku, chybu ve funkci bloku nebo volby a neplatnou hodnotu ve stavu,
- neznámou kapitolu, kapitolu bez uzlů a neplatné id kapitoly.

Hlášky jsou česky a říkají, který uzel a stav se to týká. Překlepy v typech (volba do neexistujícího uzlu, sken neznámého kódu) najde už editor.

## Text

Jak se text na telefonu zobrazuje, popisuje [Text příběhu na obrazovce hráče](story-text.md). Při psaní dodržujte českou typografii: nedělitelné mezery po jednopísmenných předložkách a spojkách, mezi číslem a jednotkou, proti osamoceným krátkým slovům na konci odstavce, a výpustku jedním znakem `…`.

## Po úpravě

Ověřte příběh na stránce Test v administraci a v grafu na stránce Příběh. Změna se do hry dostane s novým nasazením aplikace. Vytištěné QR kódy zůstanou platné; když ale přečíslujete nebo přejmenujete kód, karty přetiskněte, ať nápis odpovídá.
