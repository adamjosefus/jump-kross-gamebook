# Slovníček příběhu

Slova, kterými se popisuje stavba příběhu. Platí v příběhu, v administraci, v dokumentaci i v kódu; v závorce je název v kódu.

- **Uzel** (`node`): ucelená část příběhu. Může mít víc segmentů, které ale slouží jen k lepšímu členění a postupné gradaci pro čtenáře. Hra začíná ve startovním uzlu (ten s `initialState`) a končí v koncovém (`outroNode`). Před přihlášením vidí každý úvodní uzel (`introNode`).
- **Segment** (`segment`): menší část uzlu, která rozpracuje konkrétní událost nebo situaci. Každý segment může mít jiný vzhled (`theme`) a vlastní obrázek (`svg`). Mezi segmenty jednoho uzlu hráč listuje tlačítkem „Další“; to není akce, tým zůstává ve stejném uzlu.
- **Akce** (`action`): událost, která tým přenese z jednoho uzlu do dalšího. Každá akce může upravit stav týmu (`nextState`). Které akce uzel nabízí, může záviset na stavu: `choices` i `scans` pak zapíše jedna funkce stavu, která vrátí vždy aspoň jednu možnost. Akce je:
  - tlačítko „Další“ bez textu: jediná volba uzlu bez `label`, vypadá jako šipka mezi segmenty,
  - tlačítko s textem: volba s `label`,
  - volba v příběhu: víc tlačítek, ze kterých tým jedno vybere (`choices`),
  - naskenování QR kódu (`scans`).
- **Kapitola** (`chapter`): skupina uzlů, které na sebe navazují; nejmenší kapitola má jeden uzel. Uzel se do ní hlásí polem `chapter`. Hráči kapitoly nevidí, slouží k členění příběhu a k měření času. Kapitola s `counts: false` se do výsledku týmu nepočítá.
- **Stopky** (`timer`): společný čas několika kapitol, třeba souběžných linek, ze kterých tým projde jen jednu. Kapitola bez stopek se měří sama.

Každý tah týmu, tedy akce, zásah organizátora nebo restart, zvýší počítadlo `revision`. Zařízení posílá revizi, ze které tah udělalo, a tah ze starší revize server odmítne, protože tým už mezitím rozhodl jinak. Tahy se zapisují do logu akcí (`action_log`), který administrace ukazuje v panelu „Poslední akce“.
