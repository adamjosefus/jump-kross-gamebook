---
paths:
  - "**/*.{ts,tsx}"
---

# Psaní kódu

## Immutabilní typy

Nové a upravované typy piš jako neměnné:

- Vlastnosti rozhraní a objektových typů označ `readonly`.
- Pole piš jako `readonly T[]`, mapy a množiny jako `ReadonlyMap` a `ReadonlySet`, záznamy jako `Readonly<Record<K, V>>`.
- Parametry funkcí typuj jako neměnné, i když je funkce nemění.
- Pevné hodnoty označ `as const`.

## Názvy proměnných

Nepoužívej jednopísmenné názvy proměnných, parametrů ani položek při destrukturování. Platí to i pro krátké callbacky a cykly: piš `(team) => team.id`, ne `(t) => t.id`, a `(first, second) => first.at - second.at`, ne `(a, b) => a.at - b.at`.

Typových parametrů, například `<A, E>`, se to netýká.

## Existující kód

Pravidla platí pro kód, který píšeš nebo měníš. Starší kód mimo rozsah úkolu kvůli nim nepřepisuj.
