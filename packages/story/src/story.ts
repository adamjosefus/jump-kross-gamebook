import { defineStory } from '@gamebook/core';

type State = {};

/**
 * The gamebook. Every node is one step of the story: `blocks` are its screens (markdown, one
 * screen each, optionally with a `theme`). A node leads on either by `choices` (buttons) or by
 * `scans`: the team scans the QR code of a location and goes where that location leads. The team
 * does not see which locations a node accepts, so the screens have to say where to go.
 *
 * `teams` are the teams of the game and `locations` the places with QR codes; the admin prints
 * their codes from here. `intro` is what anyone sees before scanning a team's code; then the team
 * continues where it is, or at START when it has not started yet.
 *
 * Demo: an intro, a letter, a description, a fork decided by which place the team walks to
 * (locations 1 and 2), a choice that appears only with enough coins, and two endings.
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
  intro: [
    {
      theme: 'intro',
      svg: `<svg width="230" height="70" viewBox="0 0 230 70">
        <path d="M16.6973 50H26.6973V10H36.6973V60H16.6973V50ZM46.6973 10H56.6973V50H66.6973V10H76.6973V60H46.6973V10ZM86.6973 12.6L97.0973 8.6L125.097 39L149.897 11.6C150.664 10.8333 151.547 10.25 152.547 9.85C153.547 9.41667 154.597 9.2 155.697 9.2C157.064 9.2 158.331 9.55 159.497 10.25C160.664 10.9167 161.581 11.8333 162.247 13C162.947 14.1667 163.297 15.4333 163.297 16.8V55.8C163.297 57.2 162.814 58.3833 161.847 59.35C160.881 60.3167 159.697 60.8 158.297 60.8C156.897 60.8 155.714 60.3167 154.747 59.35C153.781 58.3833 153.297 57.2 153.297 55.8V22.8L127.497 51C126.797 51.7333 125.964 52.1 124.997 52.1C124.031 52.1 123.197 51.7333 122.497 51L96.6973 22.8V60H86.6973V12.6ZM173.297 30C173.297 26 174.281 22.3167 176.247 18.95C178.247 15.55 180.947 12.85 184.347 10.85C187.747 8.85 191.464 7.83333 195.497 7.8C199.497 7.83333 203.181 8.85 206.547 10.85C209.947 12.85 212.631 15.55 214.597 18.95C216.564 22.3167 217.531 26 217.497 30C217.531 34 216.564 37.7 214.597 41.1C212.631 44.4667 209.947 47.15 206.547 49.15C203.181 51.15 199.497 52.1667 195.497 52.2C191.031 52.1 186.964 50.9 183.297 48.6V55.8C183.297 57.2 182.814 58.3833 181.847 59.35C180.881 60.3167 179.697 60.8 178.297 60.8C176.897 60.8 175.714 60.3167 174.747 59.35C173.781 58.3833 173.297 57.2 173.297 55.8V30ZM183.297 30C183.297 32.2 183.831 34.2333 184.897 36.1C185.997 37.9333 187.481 39.4 189.347 40.5C191.214 41.6 193.264 42.1667 195.497 42.2C197.697 42.1667 199.714 41.6 201.547 40.5C203.414 39.4 204.881 37.9333 205.947 36.1C207.014 34.2333 207.531 32.2 207.497 30C207.531 27.8 207.014 25.7833 205.947 23.95C204.881 22.0833 203.414 20.6 201.547 19.5C199.714 18.4 197.697 17.8333 195.497 17.8C193.264 17.8333 191.214 18.4 189.347 19.5C187.481 20.6 185.997 22.0833 184.897 23.95C183.831 25.7833 183.297 27.8 183.297 30Z" fill="currentColor" />
      </svg>`,
      content: ``,
    },
    {
      theme: 'intro',
      content: `Držíte v ruce zařízení, kterým se stane nástrojem pro hraní Hry.`,
    },
    {
      theme: 'intro',
      content: `
Pravděpodobně ho drží jeden z vás.

A ostatní se na něj dívají. A možná i poslouchají.`,
    },
    {
      theme: 'intro',
      content: `
Raději si najděte klidné a tiché místo.

Není třeba spěchat. Vaše hra ještě nezačala.
      `,
      next: 'Už jsme na klidném místě',
    },
    {
      theme: 'intro',
      content: `
V následující hře budete rozhodnovat o svém příběhu.

Vybrání možnosti na displeji je ale pouze technikálie.

Zkutečné rozhodnutí musíte dělat vy. Musíte se shodnout mezi sebou.
      `,
    },
    {
      theme: 'intro',
      content: `
Čeká vás Hra doposud nevídaná.
Příběh, který čeká, až ho prožijete.
      `,
    },
    {
      theme: 'intro',
      content: `
Než se ale společně ponoříme jeho hlubil…

…pojďmme se navzájem představit.

***Jsem váš vypravěč.***`,
    },
  ],
  introScanTitle: 'Představte se prosím',
  introScanText: 'Naskenujte kód svého klanu.',
  locations: {},
  nodes: {
    START: {
      initialState: { coins: 30, hasMap: false, courage: 0 },
      blocks: (_state, team) => [
        {
          theme: 'description',
          content: `
## ${team.name}?
Potěšení je na mé straně.
        `,
        },
        {
          theme: 'description',
          content: `
Bude to fungovat takto:
- Budete prozkoumávat svět kolem sebe.
- Na různých místech budete naskenovávat QR kódy.
- Vaše rozhodnutí a odvaha ovlivní, kam se příběh ubírá.
          `,
        },
      ],
      choices: [{ label: 'Vyrazit na cestu', goto: 'START' }],
    },
    // MARKET: {
    //   blocks: (state) => [
    //     `Na tržišti prodává stará kořenářka mapu okolí. Máte u sebe **${state.coins} mincí**.`,
    //     { theme: 'letter', content: '„Mapa za dvacet. A k ní rada zdarma: v lese nespěchejte.“' },
    //   ],
    //   choices: [
    //     {
    //       label: 'Koupit mapu',
    //       goto: 'FOREST',
    //       when: (state) => state.coins >= 20,
    //       nextState: (state) => ({ coins: state.coins - 20, hasMap: true }),
    //     },
    //     { label: 'Jít bez mapy', goto: 'FOREST' },
    //   ],
    // },
    // // The team picks the path by walking: the code it scans decides the next node.
    // FOREST: {
    //   blocks: (state) => [
    //     state.hasMap
    //       ? 'Podle mapy vidíte, že se pěšina dělí: jedna vede ke **studánce**, druhá rovnou ke **mlýnu**.'
    //       : 'Bez mapy bloudíte, až dojdete k rozcestí. Jedna cesta voní vodou, druhá vede z kopce.',
    //     'Vydejte se jednou z cest a naskenujte QR kód tam, kam dojdete.',
    //   ],
    //   scanTitle: 'Kam jste došli?',
    //   scanText: 'Naskenujte QR kód na místě, kam vás cesta zavedla.',
    //   scans: [
    //     { location: 1, goto: 'WELL' },
    //     { location: 2, goto: 'MILL' },
    //   ],
    // },
    // WELL: {
    //   blocks: [
    //     {
    //       theme: 'description',
    //       content: 'U studánky se setmělo. Za ní slyšíte šumění vody. Mlýn musí být blízko.',
    //     },
    //   ],
    //   choices: [
    //     {
    //       label: 'Jít potmě dál',
    //       goto: 'TO_MILL',
    //       nextState: (state) => ({ courage: state.courage + 1 }),
    //     },
    //     { label: 'Počkat na ráno', goto: 'TO_MILL' },
    //   ],
    // },
    // TO_MILL: {
    //   blocks: ['Najděte **starý mlýn** a naskenujte QR kód u kola.'],
    //   scanTitle: 'Jste u mlýna?',
    //   scanText: 'QR kód najdete u kola.',
    //   scans: [{ location: 2, goto: 'MILL' }],
    // },
    // MILL: {
    //   blocks: (state) => [
    //     'Mlýnské kolo je zarostlé mechem. Pod ním je kamenná deska.',
    //     state.courage > 0 && {
    //       theme: 'description',
    //       content: 'Ve tmě si všimnete slabého světla pod deskou.',
    //     },
    //   ],
    //   choices: [
    //     {
    //       label: 'Zvednout desku',
    //       goto: 'TREASURE',
    //       when: (state) => state.courage > 0 || state.hasMap,
    //     },
    //     { label: 'Vrátit se domů', goto: 'HOME' },
    //   ],
    // },
    // TREASURE: {
    //   end: true,
    //   blocks: [
    //     { theme: 'green', content: '# Poklad je váš!\n\nPod deskou leží truhla plná mincí.' },
    //   ],
    // },
    // HOME: {
    //   end: true,
    //   blocks: [
    //     { theme: 'red', content: 'Vracíte se domů s prázdnou. Poklad na vás ve mlýně počká.' },
    //   ],
    // },
  },
});
