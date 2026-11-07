# Git a pull requesty

Vše, co jde do gitu a na GitHub (názvy větví, commity, pull requesty), piš anglicky. Česky se píše jen pro hráče a organizátory: texty v aplikaci, příběh, dokumentace a odpovědi v chatu.

## Názvy větví

Větev pojmenuj podle toho, co přináší, ve tvaru `typ/kratky-popis`:

- `typ` je stejný jako typ commitu: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`.
- Popis je anglicky, malými písmeny, slova oddělená pomlčkou, dvě až čtyři slova: `feat/team-login-cookie`, `fix/qr-print-layout`, `refactor/store-sql-client`.
- Do názvu nepatří id úkolu, datum, jméno autora ani náhodný řetězec. Větev vygenerovanou nástrojem (například `main-abc123`) před otevřením pull requestu přejmenuj.
- Jedna větev je jedna změna. Když se v ní sejde víc nesouvisejících oprav, pojmenuj ji podle toho, co je spojuje (`fix/code-review`), ne podle první z nich.

## Commity

Zprávy commitů jsou anglicky ve stylu [Conventional Commits](https://www.conventionalcommits.org/): `type(scope): what is now true`. Podrobnosti a seznam používaných scope jsou v `.claude/skills/git-rewrite-commits/SKILL.md` v části Commit Style.

## Pull requesty

Název i popis pull requestu piš anglicky.

- **Název** má tvar commitu: `type(scope): short description`, malými písmeny, bez tečky na konci. Když PR obsahuje víc commitů, název vystihuje celek.
- **Popis** má tyto části, v tomto pořadí; prázdnou část vynech:
  - `## What changes` – co se mění a proč, z pohledu hráče nebo organizátora; u větších změn odrážky po oblastech.
  - `## Not included` – co s tím souvisí, ale schválně to v PR není, a proč.
  - `## Verification` – jak byla změna ověřena: spuštěné kontroly (`pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build:vercel`) a ruční ověření, kde na něm záleží (tisk, telefon, kamera).
- Popis vysvětluje, nevypočítává soubory: seznam souborů je v diffu.
- Pull request otevírej jako draft a na ready for review ho přepni, až projde CI.
