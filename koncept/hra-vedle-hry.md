# Hra vedle hry

Základní pojetí spojující hry JUMP Krossu 2027 (zdroj: [nápady 2026-09-27](../poznamky/2026-09-27-napady.md)).

## Hlavní princip

Vedle jednotlivých disciplín existuje **„hra vedle hry“** — globální hra, která propojuje všechna stanoviště.

- **Běží nepřetržitě**, bez ohledu na to, kde se který klan zrovna nachází.
- **Probíhá sama od sebe** — svět má vlastní vývoj v čase.
- **Klany ji pouze ovlivňují** — výsledky ze stanovišť a rozhodnutí klanů mění její vlastnosti, ale neřídí ji přímo.

Hra tedy neslouží jen k tomu, aby sčítala body ze stanovišť. Je to živý systém, do kterého klany zasahují.

## Tick

Globální hra se vyhodnocuje v pravidelných **tickách** (kolech). V každém ticku se stav světa posune podle pravidel a podle toho, co klany od minulého ticku udělaly.

Varianty technického řešení:

| Varianta | Plusy | Mínusy |
|---|---|---|
| **Aplikace**, ke které mají přístup všichni | stav světa vidí všichni kdykoli a odkudkoli; automatické výpočty | potřeba zařízení a signálu, vývoj, riziko výpadku |
| **Centrální stan se stopkami** — člověk vyhodnocuje hru v každém ticku | robustní, bez techniky, silná atmosféra „velína“ | vyhodnocení je úzké hrdlo; klany vidí stav jen ve stanu |

Obě se dají kombinovat — ručně vedený stan jako „zdroj pravdy“ a jednoduchá obrazovka / hlášení jako výstup.

## Stavební kameny

- [Čísla účastníků](mechaniky/cisla-ucastniku.md) — každý hráč má pevné číslo, stanoviště s nimi pracují.
- [Virtuální posádka](mechaniky/virtualni-posadka.md) — klan má kromě živých hráčů i omezený počet virtuálních postav.
- [Opakovatelnost a kontext](mechaniky/opakovatelnost.md) — disciplíny jde opakovat a znalosti z jiných míst mění výsledek.
- [Moderace](moderace.md) — hlášení, která nesou příběh a oznamují změny ve světě.

## K rozpracování

- Co je „stav světa“? Které veličiny se v každém ticku mění?
- Jak dlouhý je tick (10 min? 30 min? 1 h)?
- Jak se do hry promítá výsledek ze stanoviště?
- Jak hra končí a kdo vyhrává?
- Jaký je příběh / svět? (Inspirace [*Papers, Please*](../kontext/inspirace.md) a *The Last Train Home* naznačují spíš něco drsnějšího, s rozhodováním a omezenými zdroji.)
