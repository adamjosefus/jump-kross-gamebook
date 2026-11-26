# Pro organizátory

Jak připravit a řídit hru v administraci. Administrace je na adrese `/admin` a chrání ji heslo organizátorů. Obsah příběhu (texty, volby, QR kódy, kapitoly) se v administraci nemění; mění ho autor příběhu a projeví se s novým nasazením aplikace (viz [Pro autora příběhu](story-authoring.md)).

## Stránky administrace

| Stránka      | K čemu slouží                                                                                 |
| ------------ | --------------------------------------------------------------------------------------------- |
| **Příběh**   | Graf celého příběhu: uzly, volby a skeny, kapitoly v rámečcích. Klik na uzel ukáže jeho text. |
| **Test**     | Projití příběhu tak, jak ho vidí tým, bez ukládání a bez vlivu na hru.                        |
| **Hra**      | Spuštění, pozastavení a smazání hry, seznam týmů a kódů v příběhu.                            |
| **Živě**     | Graf s týmy na jejich uzlech, panel „Klany“, panel „Poslední kroky“, zásahy do hry.           |
| **Časy**     | Tabulka časů týmů po kapitolách a mezi nimi.                                                  |
| **Zařízení** | Telefony přihlášené k týmům; odhlášení a blokování zařízení.                                  |
| **QR kódy**  | Kódy k tisku: vstupní kód každého týmu a herní kódy příběhu.                                  |

Na telefonu se plovoucí panely stránky Živě otevírají jako samostatné podstránky.

## Před hrou

1. **Projděte příběh** na stránce Test. Začíná úvodem a přihlášením; QR kódy můžete naskenovat, napsat, nebo sken přeskočit z lišty. Postup je v adrese stránky, takže po obnovení pokračujete tam, kde jste byli.
2. **Vytiskněte QR kódy** na stránce QR kódy. Vstupní kód týmu (karta „Vstup do hry“) dostane každý tým; herní kódy rozmístěte podle jejich názvů, název říká, kam kód patří. Kód jde vyhledat podle názvu i textu kódu a přes tlačítko u karty exportovat jako SVG (s volbou podoby a okraje).
3. **Spusťte hru** na stránce Hra tlačítkem „Spustit hru“. Dokud hra neběží, týmy se nepřihlásí a na telefonu vidí, že hra ještě nezačala.

Vytištěné kódy jsou podepsané tajným klíčem aplikace. Dokud se klíč nezmění, platí i po úpravách příběhu.

## Během hry

- **Panel „Klany“** na stránce Živě ukazuje u každého klanu, kde v příběhu je, jeho stav, počet aktivních zařízení a kdy naposledy hrál. Štítek říká, v jaké kapitole tým je (nebo „Mezi kapitolami“) a jak dlouho; pod ním je celkový čas a výsledek. Klany jde řadit podle pořadí, názvu, výsledného a celkového času nebo hodnoty stavu.
- **Panel „Poslední kroky“** ukazuje posledních 50 kroků všech týmů: volby, skeny (s názvem kódu), restarty a zásahy organizátorů.
- **Graf** ukazuje týmy jako barevná kolečka na uzlech, kde stojí, a kolikrát klany do uzlu dorazily.
- **Pozastavení:** „Pozastavit“ na stránce Hra zastaví hru všem týmům najednou; telefony ukážou čekací obrazovku. Po pokračování týmy navážou tam, kde skončily. Čas jim během pauzy běží dál.

### Zásahy do hry

Tlačítko s tužkou u klanu otevře dialog **Zásah do živé hry**:

- **Přesun a úprava stavu:** tým lze přesunout na jiný uzel a změnit mu stav. Změna se hned projeví na všech telefonech týmu a nejde vrátit, proto je potřeba opsat název týmu. Když se tým mezitím posunul, dialog na to upozorní.
- **Restartovat hru:** pošle tým na start a vynuluje mu čas i postup.
- **Vynulovat čas:** vynuluje jen čas, postup zůstane. U týmu v cíli to nejde.

Po restartu i vynulování se telefony týmu odhlásí a čas se rozběhne, až tým znovu naskenuje svůj kód.

### Zařízení

Stránka Zařízení ukazuje telefony přihlášené k týmům (aktivní je ten, který se ozval v posledních dvou minutách). Zařízení jde **odhlásit**, nebo **zablokovat**; zablokované se nepřihlásí k žádnému týmu, dokud ho neodblokujete. Přihlášení samo vyprší po dvou dnech.

## Čas a výsledky

Čas týmu běží od jeho prvního přihlášení po spuštění hry do příchodu do cíle. Měří se po kapitolách příběhu a mezi nimi; kapitoly, které se nepočítají (třeba úvod), se z **výsledného času** odečtou. Podrobně v [Měření času hry](game-time.md).

- **Stránka Časy** ukazuje pro každý tým výsledek, celkový čas a čas každé kapitoly a mezery. Nejrychlejší a nejpomalejší tým v cíli je zvýrazněný.
- **Kopírovat výsledky** (panel „Klany“) zkopíruje výsledky jako CSV (pro Excel, oddělené středníkem) nebo JSON, s časy po kapitolách a hodnotami stavu.

## Po hře a nová hra

„Smazat postup“ na stránce Hra pošle všechny týmy na start, vynuluje jim čas, odhlásí telefony a hru zastaví. Před další hrou ji znovu spusťte. Předtím si zkopírujte výsledky, smazáním se ztratí.
