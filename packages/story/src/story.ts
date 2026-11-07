import { defineStory } from '@gamebook/core';

/** What a team carries through the story: the start sets it, choices and scans change it. */
type State = {
  readonly coins: number;
};

/** The number of coins with the Czech word for "coins" in the right form, e.g. „5 mincí“. */
const coinsText = (count: number): string => {
  const word = count === 1 ? 'mince' : count >= 2 && count <= 4 ? 'mince' : 'mincí';
  return `${count} ${word}`;
};

/**
 * A short demo of what the gamebook can do: three parallel lines (the shop a team picks), choices
 * on the screen, QR scans that are choices too, and one number in the state, `coins`, which both
 * choices and scans change.
 *
 * Every node is one step of the story: `blocks` are its screens (markdown, one screen each,
 * optionally with a `theme`). A node leads on either by `choices` (buttons) or by `scans`: the team
 * scans one of the QR codes and goes where that code leads. Several codes can hang side by side, so
 * the team decides by which one it scans. The team does not see which codes a node accepts, so the
 * screens have to say where to go and which code to scan.
 *
 * `teams` are the teams of the game and `codes` the QR codes that move teams on; the admin prints
 * their codes from here. `introNode` is what anyone sees before scanning a team's code; then the
 * team continues where it is, or at START when it has not started yet. `outroNode` is where the
 * game ends.
 */
export const story = defineStory<State>()({
  teams: {
    1: 'Klan I',
    2: 'Klan II',
    3: 'Klan III',
    4: 'Klan IV',
    5: 'Klan V',
    6: 'Klan VI',
    7: 'Klan VII',
    8: 'Klan VIII',
    9: 'Klan IX',
    10: 'Klan X',
    11: 'Klan XI',
    12: 'Klan XII',
    13: 'Klan XIII',
    14: 'Klan XIV',
    15: 'Klan XV',
  },
  introNode: 'INTRO',
  outroNode: 'OUTRO',
  // The names are printed on the cards, so they say where a code hangs, not where it leads.
  codes: {
    1: 'Pekárna',
    2: 'Zelinář',
    3: 'Řeznictví',
    4: 'Autobusová zastávka',
    5: 'Park',
  },
  nodes: {
    INTRO: {
      scanTitle: 'Představte se prosím',
      scanText: 'Naskenujte kód svého klanu.',
      // Notifications around the login; a text left out falls back to the player's default one.
      loginMessages: {
        loggedIn: (team) => `Jste tým ${team.name}`,
        sameTeam: (team) => `Už hrajete za tým ${team.name}.`,
        foreignCode: 'Tento QR kód nepatří ke hře.',
        notTeamCode: 'Nejdřív naskenujte přihlašovací kód týmu.',
        unknownTeam: 'Tento tým už ve hře není.',
        switchTitle: 'Přepnout na jiný tým?',
        switchText: (team) =>
          `Naskenovali jste přihlašovací kód jiného týmu. Když přepnete, bude tento telefon hrát za něj místo za tým ${team.name}.`,
        switchConfirm: 'Přepnout tým',
        switchCancel: (team) => `Zůstat v týmu ${team.name}`,
      },
      blocks: [
        {
          theme: 'intro',
          svg: `<svg width="230" height="70" viewBox="0 0 230 70">
        <path d="M16.6973 50H26.6973V10H36.6973V60H16.6973V50ZM46.6973 10H56.6973V50H66.6973V10H76.6973V60H46.6973V10ZM86.6973 12.6L97.0973 8.6L125.097 39L149.897 11.6C150.664 10.8333 151.547 10.25 152.547 9.85C153.547 9.41667 154.597 9.2 155.697 9.2C157.064 9.2 158.331 9.55 159.497 10.25C160.664 10.9167 161.581 11.8333 162.247 13C162.947 14.1667 163.297 15.4333 163.297 16.8V55.8C163.297 57.2 162.814 58.3833 161.847 59.35C160.881 60.3167 159.697 60.8 158.297 60.8C156.897 60.8 155.714 60.3167 154.747 59.35C153.781 58.3833 153.297 57.2 153.297 55.8V22.8L127.497 51C126.797 51.7333 125.964 52.1 124.997 52.1C124.031 52.1 123.197 51.7333 122.497 51L96.6973 22.8V60H86.6973V12.6ZM173.297 30C173.297 26 174.281 22.3167 176.247 18.95C178.247 15.55 180.947 12.85 184.347 10.85C187.747 8.85 191.464 7.83333 195.497 7.8C199.497 7.83333 203.181 8.85 206.547 10.85C209.947 12.85 212.631 15.55 214.597 18.95C216.564 22.3167 217.531 26 217.497 30C217.531 34 216.564 37.7 214.597 41.1C212.631 44.4667 209.947 47.15 206.547 49.15C203.181 51.15 199.497 52.1667 195.497 52.2C191.031 52.1 186.964 50.9 183.297 48.6V55.8C183.297 57.2 182.814 58.3833 181.847 59.35C180.881 60.3167 179.697 60.8 178.297 60.8C176.897 60.8 175.714 60.3167 174.747 59.35C173.781 58.3833 173.297 57.2 173.297 55.8V30ZM183.297 30C183.297 32.2 183.831 34.2333 184.897 36.1C185.997 37.9333 187.481 39.4 189.347 40.5C191.214 41.6 193.264 42.1667 195.497 42.2C197.697 42.1667 199.714 41.6 201.547 40.5C203.414 39.4 204.881 37.9333 205.947 36.1C207.014 34.2333 207.531 32.2 207.497 30C207.531 27.8 207.014 25.7833 205.947 23.95C204.881 22.0833 203.414 20.6 201.547 19.5C199.714 18.4 197.697 17.8333 195.497 17.8C193.264 17.8333 191.214 18.4 189.347 19.5C187.481 20.6 185.997 22.0833 184.897 23.95C183.831 25.7833 183.297 27.8 183.297 30Z" fill="currentColor" />
      </svg>`,
          content: `Kross 2027`,
        },
      ],
    },
    START: {
      initialState: { coins: 0 },
      blocks: (state, team) => [
        {
          theme: 'description',
          content: `
## ${team.name}
Vítejte v ukázce.
        `,
        },
        {
          theme: 'intro',
          content: `
Tohle je krátké demo toho, co hra umí: rozhodnutí na displeji, skenování QR kódů a stav, který se podle toho mění.

Váš stav je jediné číslo: **mince**. Teď máte ${coinsText(state.coins)}.
      `,
        },
        {
          theme: 'intro',
          content: `
Je pátek odpoledne. Lednice je prázdná a peněženka taky.

Na stole leží obálka s výplatou. Kolik si vezmete s sebou na nákup?
      `,
        },
      ],
      // Both buttons lead to the same node; they differ only in what they do to the state.
      choices: [
        { goto: 'NAKUP', label: 'Vzít si 20 mincí', nextState: () => ({ coins: 20 }) },
        {
          goto: 'NAKUP',
          label: 'Vzít si 30 mincí, dnes se to hodí',
          nextState: () => ({ coins: 30 }),
        },
      ],
    },
    // The team picks one of three shops by scanning its code: the three parallel lines of the story.
    NAKUP: {
      scanTitle: 'Kam na nákup?',
      scanText: 'Naskenujte kód obchodu, do kterého jdete.',
      blocks: (state) => [
        `
V peněžence máte ${coinsText(state.coins)}.

Cestou míjíte tři obchody: pekárnu, zelináře a řeznictví. Do každého stihnete zajít jen jednou.

Dohodněte se, kam půjdete, a naskenujte kód toho obchodu.
      `,
      ],
      scans: [
        { code: 1, goto: 'PEKARNA' },
        { code: 2, goto: 'ZELINAR' },
        { code: 3, goto: 'REZNICTVI' },
      ],
    },

    // Line 1: the bakery.
    PEKARNA: {
      blocks: (state) => [
        `
Voní to tu čerstvým chlebem. Za pultem čeká pekařka a vy máte ${coinsText(state.coins)}.

Co si koupíte?
      `,
      ],
      choices: [
        {
          goto: 'PEKARNA_CESTA',
          label: 'Chleba za 3 mince',
          nextState: (state) => ({ coins: state.coins - 3 }),
        },
        {
          goto: 'PEKARNA_CESTA',
          label: 'Chleba a koláče za 8 mincí',
          nextState: (state) => ({ coins: state.coins - 8 }),
        },
      ],
    },
    PEKARNA_CESTA: {
      scanTitle: 'Jak domů?',
      scanText: 'Naskenujte kód autobusové zastávky nebo parku.',
      blocks: (state) => [
        `
S chlebem v tašce stojíte před pekárnou. Zbývá vám ${coinsText(state.coins)}.

Autobus stojí 2 mince a jste doma hned. Parkem je to zadarmo a déle, ale prý se tam občas najde i mince.
      `,
      ],
      // The bus is a scan only a team with the fare can take; the park pays the finder a coin.
      scans: [
        {
          code: 4,
          goto: 'PEKARNA_VARENI',
          when: (state) => state.coins >= 2,
          nextState: (state) => ({ coins: state.coins - 2 }),
        },
        { code: 5, goto: 'PEKARNA_VARENI', nextState: (state) => ({ coins: state.coins + 1 }) },
      ],
    },
    PEKARNA_VARENI: {
      blocks: (state) => [
        `
Jste doma s nákupem z pekárny a ${coinsText(state.coins)} v peněžence.

Co bude k večeři?
      `,
      ],
      choices: [
        { goto: 'OUTRO', label: 'Topinky s česnekem' },
        {
          goto: 'OUTRO',
          label: 'Doběhnout do večerky pro sýr za 5 mincí',
          when: (state) => state.coins >= 5,
          nextState: (state) => ({ coins: state.coins - 5 }),
        },
      ],
    },

    // Line 2: the greengrocer.
    ZELINAR: {
      blocks: (state) => [
        `
Bedýnky s bramborami, cibulí a mrkví. Zelinář vás vítá a vy máte ${coinsText(state.coins)}.

Co si koupíte?
      `,
      ],
      choices: [
        {
          goto: 'ZELINAR_CESTA',
          label: 'Brambory a cibuli za 5 mincí',
          nextState: (state) => ({ coins: state.coins - 5 }),
        },
        {
          goto: 'ZELINAR_CESTA',
          label: 'Plný košík zeleniny za 12 mincí',
          nextState: (state) => ({ coins: state.coins - 12 }),
        },
      ],
    },
    ZELINAR_CESTA: {
      scanTitle: 'Jak domů?',
      scanText: 'Naskenujte kód autobusové zastávky nebo parku.',
      blocks: (state) => [
        `
Taška je těžká a v peněžence zbývá ${coinsText(state.coins)}.

Autobus stojí 2 mince a jste doma hned. Parkem je to zadarmo a déle, ale prý se tam občas najde i mince.
      `,
      ],
      scans: [
        {
          code: 4,
          goto: 'ZELINAR_VARENI',
          when: (state) => state.coins >= 2,
          nextState: (state) => ({ coins: state.coins - 2 }),
        },
        { code: 5, goto: 'ZELINAR_VARENI', nextState: (state) => ({ coins: state.coins + 1 }) },
      ],
    },
    ZELINAR_VARENI: {
      blocks: (state) => [
        `
Jste doma, zelenina leží na lince a v peněžence máte ${coinsText(state.coins)}.

Co bude k večeři?
      `,
      ],
      // The soup for the whole floor earns coins: a choice can add to the state, not only take.
      choices: [
        { goto: 'OUTRO', label: 'Bramboračka' },
        {
          goto: 'OUTRO',
          label: 'Zeleninové kari, koření ještě za 4 mince',
          when: (state) => state.coins >= 4,
          nextState: (state) => ({ coins: state.coins - 4 }),
        },
        {
          goto: 'OUTRO',
          label: 'Polévka pro celou chodbu, sousedé se složí',
          nextState: (state) => ({ coins: state.coins + 3 }),
        },
      ],
    },

    // Line 3: the butcher.
    REZNICTVI: {
      blocks: (state) => [
        `
Za sklem leží maso a řezník si brousí nůž. V peněžence máte ${coinsText(state.coins)}.

Co si koupíte?
      `,
      ],
      choices: [
        {
          goto: 'REZNICTVI_CESTA',
          label: 'Kuřecí za 10 mincí',
          nextState: (state) => ({ coins: state.coins - 10 }),
        },
        {
          goto: 'REZNICTVI_CESTA',
          label: 'Hovězí na guláš za 15 mincí',
          nextState: (state) => ({ coins: state.coins - 15 }),
        },
      ],
    },
    REZNICTVI_CESTA: {
      scanTitle: 'Jak domů?',
      scanText: 'Naskenujte kód autobusové zastávky nebo parku.',
      blocks: (state) => [
        `
Maso je zabalené a v peněžence zbývá ${coinsText(state.coins)}.

Autobus stojí 2 mince a jste doma hned. Parkem je to zadarmo a déle, ale prý se tam občas najde i mince.
      `,
      ],
      scans: [
        {
          code: 4,
          goto: 'REZNICTVI_VARENI',
          when: (state) => state.coins >= 2,
          nextState: (state) => ({ coins: state.coins - 2 }),
        },
        { code: 5, goto: 'REZNICTVI_VARENI', nextState: (state) => ({ coins: state.coins + 1 }) },
      ],
    },
    REZNICTVI_VARENI: {
      blocks: (state) => [
        `
Jste doma, maso je v lednici a v peněžence máte ${coinsText(state.coins)}.

Co bude k večeři?
      `,
      ],
      choices: [
        { goto: 'OUTRO', label: 'Kuře na paprice' },
        {
          goto: 'OUTRO',
          label: 'Guláš a k němu pivo za 6 mincí',
          when: (state) => state.coins >= 6,
          nextState: (state) => ({ coins: state.coins - 6 }),
        },
      ],
    },

    OUTRO: {
      blocks: (state, team) => [
        `
## Dobrou chuť, ${team.name}!

Konec ukázky. V peněžence vám zbylo ${coinsText(state.coins)}.

Tři cesty, pár rozhodnutí, pár skenů a jeden stav, který se s nimi měnil.
      `,
      ],
    },
  },
});
