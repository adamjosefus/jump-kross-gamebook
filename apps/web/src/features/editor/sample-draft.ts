import type { Draft } from './draft';

/**
 * The bakery line of the demo story written as a draft: a branch with a merge, a node with a QR
 * code noted instead of buttons, several themes and notes, the plain arrow „Další“ and the end.
 */
export const SAMPLE_DRAFT = {
  version: 1,
  starts: ['patek_odpoledne_doma'],
  nodes: [
    {
      id: 'patek_odpoledne_doma',
      summary: 'Pátek odpoledne doma, tým si bere peníze na nákup',
      note: 'Začátek, stav coins: 0. Volby nastaví coins na 20, nebo 30.',
      segments: [
        { theme: 'description', text: '## Vítejte v ukázce' },
        {
          theme: 'intro',
          text: 'Tohle je krátké demo toho, co hra umí: rozhodnutí na displeji, skenování QR kódů, úkoly v obchodech a stav, který se podle toho mění.\n\nVáš stav je jediné číslo: **mince**.',
          note: 'Počet mincí vypsat podle stavu.',
        },
        {
          theme: 'intro',
          text: 'Je pátek odpoledne. Lednice je prázdná a peněženka taky.\n\nNa stole leží obálka s výplatou. Kolik si vezmete s sebou na nákup?',
        },
      ],
      choices: [
        { label: 'Vzít si 20 mincí', to: 'cestou_na_nakup' },
        { label: 'Vzít si 30 mincí, dnes se to hodí', to: 'cestou_na_nakup' },
      ],
    },
    {
      id: 'cestou_na_nakup',
      summary: 'Cestou na nákup, tým vybírá obchod',
      note: 'QR: 1 Pekárna, 2 Zelinářství. Kódy visí na dveřích obchodů.',
      segments: [
        {
          text: 'Cestou míjíte dva obchody: pekárnu a zelináře. Do každého stihnete zajít jen jednou.\n\nDohodněte se, kam půjdete, a u vchodu naskenujte kód toho obchodu.',
        },
      ],
      choices: [
        { label: 'Pekárna', to: 'pekarka_chce_hadanku' },
        { label: 'Zelinářství', to: 'zelinar_potrebuje_pomoc' },
      ],
    },
    {
      id: 'pekarka_chce_hadanku',
      summary: 'Pekařka prodá, až tým uhodne počet druhů pečiva',
      note: 'QR: 6 Pekařka, dá ho za správnou odpověď.',
      segments: [
        {
          text: 'Voní to tu čerstvým chlebem. Pekařka se usměje: **„Prodám vám, až uhodnete, kolik druhů pečiva mám ve vitríně.“**',
        },
        {
          theme: 'letter',
          text: 'Spočítejte to a řekněte jí výsledek. Za správnou odpověď vám dá kód.',
        },
      ],
      choices: [{ label: '', to: 'nakup_v_pekarne' }],
    },
    {
      id: 'nakup_v_pekarne',
      summary: 'Nákup v pekárně',
      note: 'Chleba stojí 3 mince, chleba a koláče 8.',
      segments: [{ text: 'Uhodli jste. Za pultem čeká pekařka.\n\nCo si koupíte?' }],
      choices: [
        { label: 'Chleba za 3 mince', to: 'cesta_domu' },
        { label: 'Chleba a koláče za 8 mincí', to: 'cesta_domu' },
      ],
    },
    {
      id: 'zelinar_potrebuje_pomoc',
      summary: 'Zelinář prodá, až mu tým pomůže',
      note: 'QR: 7 Zelinář.',
      segments: [
        {
          text: 'Bedýnky s bramborami, cibulí a mrkví. Zelinář má plné ruce práce: „Prodám vám, až mi pomůžete. Vyjmenujte pět druhů zeleniny, které tu nemám.“',
        },
        { theme: 'green', text: '_Domluvte se a řekněte mu je._' },
      ],
      choices: [{ label: 'Brambory a cibuli za 5 mincí', to: 'cesta_domu' }],
    },
    {
      id: 'cesta_domu',
      summary: 'Cesta domů autobusem, nebo parkem',
      note: 'QR: 4 Autobusová zastávka (jen s aspoň 2 mincemi, ubere 2), 5 Park (přidá 1 minci).',
      segments: [
        {
          text: 'S nákupem v tašce stojíte na ulici.\n\nAutobus stojí 2 mince a jste doma hned. Parkem je to zadarmo a déle, ale prý se tam občas najde i mince.',
        },
      ],
      choices: [
        { label: 'Autobus', to: 'vecere' },
        { label: 'Park', to: 'vecere' },
      ],
    },
    {
      id: 'vecere',
      summary: 'Doma, co bude k večeři',
      segments: [{ text: 'Jste doma s nákupem.' }, { theme: 'red', text: 'Co bude k večeři?' }],
      choices: [
        { label: 'Topinky s česnekem', to: 'konec_hry' },
        { label: 'Doběhnout do večerky pro sýr', to: 'sousede_klepou' },
      ],
    },
    {
      id: 'sousede_klepou',
      summary: 'Sousedé klepou a chtějí ochutnat',
      note: 'Jen s aspoň 5 mincemi, sýr ubere 5.',
      segments: [{ text: 'Než sýr rozbalíte, ozve se zaklepání.' }],
      choices: [{ label: '', to: 'konec_hry' }],
    },
    {
      id: 'konec_hry',
      summary: 'Konec hry, večeře na stole',
      segments: [
        { theme: 'description', text: '## Dobrou chuť' },
        { text: 'Hra skončila. Organizátoři vám řeknou, jak jste dopadli.' },
      ],
      choices: [],
    },
  ],
} as const satisfies Draft;
