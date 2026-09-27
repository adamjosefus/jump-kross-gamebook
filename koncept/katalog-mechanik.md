---
stav: rozpracováno
aktualizovano: 2026-09-27
stitky: [mechaniky, katalog, reference]
souvisi:
  - koncept/hra-vedle-hry.md
  - koncept/principy.md
  - koncept/mechaniky/kostky.md
  - koncept/mechaniky/virtualni-posadka.md
---

# Katalog herních mechanik

Obecný zásobník herních principů, ze kterých se dá skládat [hra vedle hry](hra-vedle-hry.md). Nejde o rozhodnutí. Konkrétní mechaniky pro JUMP Kross vznikají jako samostatné soubory v [`mechaniky/`](mechaniky/README.md).

Adam katalog prošel 2026-09-27 a u každé mechaniky rozhodl „ano“, „možná“, nebo „ne“. Čísla (např. **3.2**) jsou pevná, aby se na mechaniky dalo odkazovat.

**Vyřazeno („ne“):** 1.3 Stavění balíčku, 2.2 Rondel, 4.1 Tržní stupnice, 5.1 Časová stupnice, 6.2 Přetahovaná, 8.5 Dohánění, 9.3 Prahy a spouštěče.

---

## Ano

### 1.1 Stavění sady kostek
Klan začíná s malou základní sadou kostek a během hry ji rozšiřuje nebo vylepšuje. Kostky nejsou jen generátor náhody, ale „profil“ klanu. Pravděpodobnost výsledku se ladí složením sady:
- kolik stěn nese daný symbol (stejný symbol vícekrát znamená vyšší šanci),
- kolik kostek se hází najednou,
- jestli jde stěnu přepsat nebo přelepit (vylepšení kostky),
- strop, kolik kostek smí klan použít v jednom hodu.

Díky tomu si každý klan skládá vlastní strategii a náhoda je ovlivnitelná rozhodnutím. Vazba: [kostky](mechaniky/kostky.md).

> *Pseudo:* Základní kostka má `[A, A, B, C, prázdno, prázdno]`. Klan získá kostku `[A, A, A, A, B, B]` a v dalším hodu má mnohem vyšší šanci na A. Později si na základní kostce přelepí „prázdno“ na B.

### 1.4 Riskuj, nebo přestaň
Klan opakovaně hází nebo tahá a po každém kroku se rozhoduje, jestli pokračovat, nebo si nasbírané vzít. Když padne „krach“, přijde o všechno nebo o část nasbíraného v tomto kole. Páky jsou:
- co je krach (jeden symbol, dva stejné, součet nad hranici),
- kolik se při krachu ztratí (vše, polovina, jen poslední krok),
- jestli jde průběžně „uložit“ část zisku,
- jestli se riziko postupně zvyšuje.

Vytváří silné emoce a rozhodnutí celého klanu, přitom je extrémně jednoduchá na vysvětlení.

> *Pseudo:* Klan hází kostkou, na každé stěně je zisk +1 až +3, jen jedna stěna je lebka. Po každém hodu se rozhodne: „bereme“, nebo „házíme dál“. Když padne lebka, zisk z tohoto kola je nula.

### 1.5 Úprava výsledku
Po hodu nebo tahu může klan výsledek dodatečně změnit. Náhoda tím zůstává, ale klan má nad ní částečnou kontrolu a jeho zdroje (posádka, dovednosti, žetony) mají jasné využití. Typy úprav jsou:
- přehod jedné nebo všech kostek,
- posun kostky o ±1 nebo otočení na sousední stěnu,
- zamknutí kostky (neháže se znovu),
- platba za změnu (zdroj, čas),
- jednorázová úprava versus trvalá schopnost.

> *Pseudo:* Klan hodí `[B, C, prázdno]`. Utratí 1 žeton na přehození „prázdna“ a padne A. Kmotrova postava umí jednou za tick otočit jednu kostku na libovolnou stěnu.

### 3.2 Investice do produkce
Klan se rozhoduje mezi okamžitým ziskem a investicí, která zvýší jeho příjem v každém dalším ticku. Brzy investovat se vyplatí hodně, pozdě už málo. Hlavní dilema tedy zní: „kdy přestat stavět a začít sklízet“. Hodí se k tickům hry vedle hry, protože produkce se vyplácí automaticky.

> *Pseudo:* Za výhru na stanovišti si klan vybere buď 3 body hned, nebo „dílnu“, která mu dává 1 bod každý tick. Do konce hry zbývá 8 ticků, takže se dílna vyplatí. Když zbývají 2 ticky, už ne.

### 3.3 Kombinace a synergie
Vlastnosti, předměty nebo schopnosti se navzájem posilují. Jejich společný efekt je větší než součet jednotlivých. Odměňuje to specializaci a plánování („sbíráme věci, které spolu fungují“) a každý klan si může najít vlastní kombinaci. Pozor na kombinace, které jsou nepřiměřeně silné.

> *Pseudo:* Předmět X dává +1 ke každému symbolu A. Předmět Y dovoluje počítat B jako A. Klan, který má oba, promění každé B na A a každé A navíc posílí o +1.

### 5.3 Plánované události
Hra má předem připravené zvraty. Spustí je čas (v ticku N) nebo stav světa (když něco dosáhne hranice). Dávají dni dramatický oblouk (polední zlom) a mění pravidla, ceny nebo cíle. Páky jsou:
- jestli klany vědí, kdy událost přijde (veřejný harmonogram, nebo jen náznaky),
- jestli ji můžou ovlivnit nebo na ni připravit,
- jestli postihne všechny stejně, nebo podle stavu klanu.

> *Pseudo:* V ticku 6 přijde událost: „Od teď se symbol C počítá dvojnásob.“ Klany, které si ho šetřily, získají výhodu. Nebo: když hrozba dosáhne 10, všechna stanoviště typu X se na 2 ticky zavřou.

### 6.4 Závod o práh
Na stupnici nebo v některé veličině jsou vyznačené hranice. První klan, který hranici dosáhne, dostane velkou odměnu, druhý menší a další nic. Vzniká tím přímé soupeření bez nutnosti se potkat a tempo („stihneme to dřív než oni?“). Stav závodu musí být veřejně vidět.

> *Pseudo:* Kdo první nasbírá 5× symbol A, dostane novou kostku. Druhý klan dostane 2 body, ostatní nic. Na tabuli ve štábu se odškrtává, kdo už hranici získal.

### 7.4 Neúplná informace o ostatních
Klan vidí jen část stavu ostatních klanů. Ví třeba, kolik mají kostek, ale ne jaké. Nebo vidí jejich pozici, ale ne zásoby. Vzniká odhadování, blafování a hodnota informace (dá se získat průzkumem, obchodem nebo špehováním). Veřejná tabule ve štábu ukazuje jen část a zbytek zná jen daný klan a štáb.

> *Pseudo:* Na tabuli je u každého klanu vidět počet kostek a úroveň. Konkrétní symboly a zásoby zná jen klan sám. Za 1 žeton si klan může ve štábu „nahlédnout“ na plný stav jednoho soupeře.

### 8.2 Sady
Body nerostou lineárně, ale podle velikosti nebo úplnosti sady. Každý další kus v sadě má vyšší hodnotu než předchozí. Motivuje to sbírat cíleně a rozhodovat se, jestli dotáhnout jednu sadu, nebo rozdělit úsilí. Druhou variantou je sada různých kusů, tedy jeden od každého druhu.

> *Pseudo:* Stejné symboly: 1 kus = 1 bod, 2 kusy = 3 body, 3 kusy = 6 bodů, 4 kusy = 10 bodů. Nebo: sada 4 různých symbolů dává 8 bodů.

### 8.6 Více cest k vítězství
Existuje několik způsobů, jak dosáhnout úspěchu, a jsou vzájemně vyvážené. Klan si volí vlastní strategii, mezi klany je méně přímých kolizí a klan, který v jedné oblasti prohrává, může přejít jinam. Výsledek se převádí na společnou metriku, nebo se vyhlašuje více vítězů podle kategorií.

> *Pseudo:* Na konci se počítají body za 3 oblasti: produkce, sady a závody o práh. Každá oblast umožňuje dosáhnout zhruba stejného maxima. Klan, který nesbírá sady, může vyhrát na produkci.

### 9.1 Pravidla šíření
Svět je rozdělený na políčka nebo oblasti. Každé má stav a ten se v každém ticku mění podle jednoduchých pravidel a podle stavu sousedů (šíření, růst, zánik). Svět tak žije sám a klany ho jen ovlivňují zásahy do jednotlivých políček. Přesně odpovídá principu [hry vedle hry](hra-vedle-hry.md). Pravidla musí být tak jednoduchá, aby je štáb zvládl vyhodnotit ručně.

> *Pseudo:* Políčko má stav 0–3. Každý tick políčko se sousedem ve stavu 3 stoupne o 1. Klan může za výhru na stanovišti snížit jedno políčko o 2. Když se nikdo nestará, stav 3 se rozšíří po celé mapě.

### 9.2 Zpětné vazby
Způsob, jak ladit dynamiku celé hry:
- **Kladná smyčka** zesiluje: kdo má víc, získá ještě víc. Vede k rozhodnutí a dynamice, ale vedoucí klan může utéct.
- **Záporná smyčka** tlumí: kdo má víc, tomu přibývá méně nebo platí víc. Drží hru vyrovnanou.

Dobrá hra obě smyčky kombinuje, například kladnou pro pocit růstu a zápornou jako brzdu na vrcholu.

> *Pseudo:* Kladná: každá dílna zvýší produkci, z produkce se staví další dílny. Záporná: každá další dílna stojí o 1 víc než předchozí.

---

## Možná

### 1.2 Stavění pytlíku
Klan má pytlík žetonů a tahá z něj naslepo. Během hry do něj přidává silnější žetony nebo z něj vyhazuje slabé. Na rozdíl od kostek jde přesně řídit poměr dobrých a špatných výsledků a vytažené žetony se nemusí vracet, takže se pravděpodobnost mění během tahání. Páky jsou:
- kolik žetonů se táhne,
- jestli se vytažené vrací,
- „čištění“ pytlíku,
- špatné žetony, které přibývají za chyby.

> *Pseudo:* V pytlíku je 5× bílý (+1) a 3× černý (nic). Klan táhne 3 žetony. Za výhru přidá zlatý (+3) a za prohru dostane černý navíc.

### 1.6 Rozdělování hozených kostek
Nejdřív se hodí všemi kostkami a pak klan rozhoduje, kterou kostku přiřadí ke které akci. Náhoda určuje, jaké možnosti klan má, a rozhodnutí určuje, co s nimi udělá. Akce můžou vyžadovat konkrétní symbol, minimální hodnotu, součet nebo kombinaci (dvojice, postupka).

> *Pseudo:* Padne `[A, A, B, C]`. Akce „stavba“ chce dvě A, akce „průzkum“ chce B nebo C. Klan dá dvě A na stavbu, B na průzkum a C mu propadne.

### 2.1 Umisťování dělníků
Klan má omezený počet figurek, například hráčů nebo postav z [virtuální posádky](mechaniky/virtualni-posadka.md). Každé místo pojme jen omezený počet figurek a kdo ho obsadí první, blokuje ostatní. Přímo odpovídá kapacitě stanovišť a může ji sám regulovat. Páky jsou:
- počet figurek klanu a jak získat další,
- kapacita každého místa,
- jestli jde obsazené místo „přeplatit“.

> *Pseudo:* Klan má 3 postavy. V ticku je pošle na 3 místa ve štábu. Místo „trh“ má 1 slot, takže kdo ho zabere první, ostatní tento tick na trh nemůžou.

### 2.3 Akční body
Klan dostane v každém ticku pevný rozpočet akčních bodů a sám ho rozdělí mezi akce s různou cenou. Nutí to k prioritám a dá se tím regulovat, kolik toho klan za tick zvládne. Páky: rozpočet, ceny akcí, přenesení nevyčerpaných bodů do dalšího ticku.

> *Pseudo:* Klan má 4 body za tick. Přesun stojí 1, výroba 2, útok 3. Buď 1× výroba a 2× přesun, nebo útok a přesun.

### 2.4 Programování akcí
Klany si na tick naplánují akce skrytě (na lísteček), všechny se odhalí najednou a provedou se v daném pořadí. Plánuje se bez znalosti tahů ostatních, takže vzniká odhadování a překvapení. Hodí se pro asynchronní hru: klan odevzdá plán ve štábu a může jít dál.

> *Pseudo:* Klan odevzdá lístek „1. jdi do oblasti X, 2. těž“. Jiný klan napsal to samé. Při vyhodnocení se v oblasti X dělí o výnos.

### 2.5 Draft
Z nabídky položek si klany postupně berou po jedné. Rozhoduje pořadí, výběr pro sebe a „přebírání“, tedy vzít něco jen proto, aby to nedostal soupeř. Asynchronně funguje i tak, že každý klan si vybírá z toho, co v nabídce zbylo po předchozích.

> *Pseudo:* Po disciplíně leží na stole 4 odměny. Vítěz si vybere první, druhý klan druhou atd. Poslední klan dostane, co zbude.

### 3.1 Řetězce přeměn
Zdroje se přeměňují postupně: A na B, B na C. Každý krok zvyšuje hodnotu, ale stojí čas, další zdroje nebo nese riziko. Vytváří to hloubku ekonomiky a rozhodnutí, na kterém kroku přestat.

> *Pseudo:* 2× A = 1× B, 2× B = 1× C. A má hodnotu 1, B 3 a C 8. Každá přeměna ale zabere jeden tick.

### 3.4 Klesající výnosy
Každá další investice do stejné věci dává méně než předchozí. Brání to jednostranné strategii a tlačí klany k rozložení úsilí. Je to přirozená brzda proti „rozjetí“.

> *Pseudo:* První kostka daného typu dává +3, druhá +2, třetí +1, další už nic.

### 4.2 Kazení a údržba
Zdroje ztrácejí hodnotu nebo zanikají s časem, případně jejich držení každý tick něco stojí. Nutí to zdroje používat, ne hromadit, a udržuje to ekonomiku v pohybu.

> *Pseudo:* Surovina A zanikne po 3 ticcích. Každá postava posádky stojí 1 jídlo za tick, jinak na tick „usne“.

### 4.3 Převodní kurzy
Pevný, ale nevýhodný kurz, kterým jde cokoli vyměnit za cokoli. Zaručuje, že klan nikdy nezůstane úplně zaseknutý. Specializace nebo předměty můžou kurz zlepšit.

> *Pseudo:* Kdykoli ve štábu 3× cokoli = 1× cokoli. Klan s dovedností „obchodník“ má kurz 2:1.

### 4.4 Omezená zásoba
Celkové množství zdroje nebo odměny ve hře je konečné. Co si vezme jeden klan, nemají ostatní. Vzniká tím tempo, soupeření a přirozené rozptýlení klanů na méně vytížená místa.

> *Pseudo:* Stanoviště má 10 žetonů odměny na celý den. Kdo přijde dřív, bere víc. Když dojdou, stanoviště dává jen náhradní odměnu.

### 5.2 Cooldown
Silná schopnost jde použít jen jednou za několik ticků. Omezuje opakování nejsilnější akce a nutí plánovat načasování.

> *Pseudo:* Postava „léčitel“ může zrušit krach při riskování (1.4), ale pak je 3 ticky nepoužitelná (kartička otočená lícem dolů).

### 5.4 Eskalace
Něco ve hře v každém ticku roste (hrozba, ceny, obtížnost, odměny). Hra tak sama tlačí ke konci, zvyšuje napětí a nedovolí čekat.

> *Pseudo:* Hrozba začíná na 0 a každý tick stoupne o 1. Klany ji můžou srazit. Když dosáhne 15, spustí se finále.

### 6.1 Většina v oblasti
V každé oblasti se porovnává, kdo tam má nejvíc vlivu. Nejsilnější klan dostane hlavní odměnu, druhý menší a ostatní nic. Vzniká soupeření o oblasti bez přímého střetu.

> *Pseudo:* V oblasti X má klan 1 čtyři žetony vlivu, klan 2 tři a klan 3 jeden. Každý tick dostane klan 1 tři body, klan 2 jeden bod a klan 3 nic.

### 6.3 Dražby
Vzácná položka se neprodává za pevnou cenu, ale draží. Varianty:
- **otevřená:** klany přihazují veřejně,
- **obálková:** každý klan dá jednu skrytou nabídku,
- **holandská:** cena postupně klesá a kdo první řekne „beru“, získá,
- **všichni platí:** zaplatí všichni, i ti, kdo nevyhráli.

Hodnotu určují hráči, ne pravidla.

> *Pseudo:* Obálková dražba o zlatou kostku. Klan 1 nabídne 4, klan 2 nabídne 6. Klan 2 kostku získá a zaplatí 6.

### 6.5 Poloviční spolupráce
Existuje společná podmínka prohry, a když selže, prohrají všichni. Vyhrát ale může jen jeden klan. Každý klan řeší, kolik přispěje společné věci a kolik si nechá pro sebe. Vzniká napětí, vyjednávání a „černí pasažéři“.

> *Pseudo:* Když hrozba dosáhne 20, prohrají všichni. Snížit hrozbu stojí zdroje, které by jinak šly na vlastní body. Kdo nepřispívá, má víc bodů, ale riskuje společnou prohru.

### 7.1 Skrytý cíl
Každý klan dostane tajnou podmínku, za kterou získá body navíc. Ostatní ji neznají a můžou ji jen odhadovat z chování klanu. Přidává to různorodost strategií a dedukci.

> *Pseudo:* Klan si na startu vylosuje kartu „na konci měj nejvíc symbolů C: +10 bodů“. Ostatní vidí, že sbírá C, ale nevědí proč.

### 7.2 Dedukce
Pravda (místo, osoba, kombinace) je skrytá a klany ji odhalují vylučovací metodou ze získaných střípků. Na tip mají omezený počet pokusů. Dobře to spojuje stanoviště (zdroj střípků) s globální hrou.

> *Pseudo:* Hledá se 1 ze 6 možností. Každé stanoviště vyloučí jednu. Klan může tipovat nejvýše dvakrát a špatný tip stojí body.

### 7.3 Závazek naslepo
Klany se rozhodnou současně a skrytě a výsledek se odhalí až potom. Odstraňuje výhodu toho, kdo hraje poslední, a přidává psychologii („co udělají oni?“).

> *Pseudo:* Každý klan tajně napíše, do které ze 3 oblastí pošle svůj vliv. Po odhalení se oblast dělí mezi ty, kdo ji zvolili.

### 8.1 Nejslabší článek
Klan sbírá hodnoty ve více kategoriích, ale do výsledku se počítá jen ta nejnižší. Nutí to k vyváženému rozvoji a trestá jednostranné strategie.

> *Pseudo:* Kategorie A = 8, B = 5, C = 2. Výsledek klanu je 2. Vyplatí se zvednout C, ne dál A.

### 8.3 Násobení kategorií
Výsledek je součin dvou nebo více kategorií. Nula v jedné kategorii znamená celkovou nulu, a vyplatí se tedy rozvíjet všechny. Je to mírnější varianta nejslabšího článku.

> *Pseudo:* Body = počet kostek × úroveň klanu. 4 × 3 = 12, zatímco 6 × 1 = 6.

### 8.4 Strop
Pevné maximum pro hodnotu, pro využití za jeden hod nebo tick, nebo pro počet předmětů. Brzdí utíkání vedoucího klanu a udržuje hru čitelnou.

> *Pseudo:* Klan může mít kostek, kolik chce, ale v jednom hodu smí použít nejvýše 5.
