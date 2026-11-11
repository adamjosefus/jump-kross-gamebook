# JUMP Kross 2027

[![Vercel deploy](https://github.com/adamjosefus/jump-kross-gamebook/actions/workflows/deploy-status.yml/badge.svg)](https://github.com/adamjosefus/jump-kross-gamebook/actions/workflows/deploy-status.yml)

A web app for a branching gamebook played by several teams at once in the real world.

Each team plays on their phones. They read the story screen by screen, make choices and walk to QR codes placed around, which they scan to continue; scanning one of several codes hung side by side is a choice too. Where a team goes and what it finds depends on its earlier decisions, so every team can take a different path through the story.

Organizers get an admin area with a graph of the whole story, a live view of where each team is, a playtest mode and printable QR codes: a login code for every team and the codes that move teams on.

## Layout

- `packages/core` – the story model, the engine that plays it and the validation of a story.
- `packages/story` – the story itself: teams, QR codes and nodes. It changes only with a deploy.
- `packages/api` – the HTTP API (Effect `HttpApi`) and its stores: Postgres over Neon's HTTP driver, or memory for local development.
- `apps/web` – the player app and the admin area (React, TanStack Query and Router, Tailwind).
- `scripts/build-vercel.ts` – builds the SPA and one Node function for Vercel.
- `docs` – how things behave, in Czech: [the story text on the player's screen](docs/story-text.md) and [how the game time is measured](docs/game-time.md).

## Development

```sh
pnpm install
pnpm dev            # the app with the API at http://localhost:5173
pnpm test           # vitest; the Postgres store runs on an embedded Postgres (PGlite)
pnpm test:story     # only the story: every team can finish it from every reachable state
pnpm typecheck
pnpm lint
pnpm format
pnpm storybook      # the player's components
```

Configuration is read from the environment and from `.env` (see `.env.example`). Locally every variable may stay empty: the API keeps the game in memory (it is gone when the dev server restarts) and uses known fallback secrets.

## Deployment

The app deploys to Vercel with `pnpm build:vercel` (see `vercel.json`). A deployment refuses to start, answering every request with a 503 that names the variable, until these are set in the project:

- `DATABASE_URL` – the Postgres connection string (Neon). Special characters in the password have to be percent-encoded.
- `ADMIN_PASSWORD` – the password of the admin area. Changing it logs every admin out.
- `QR_SECRET` – signs the QR codes. Changing it invalidates every printed code.
- `SESSION_SECRET` – signs the admin cookie.

The database schema is applied by the function itself on its first request. Pick the function's region close to the database's; every query is one HTTPS round trip.

Neon's Vercel integration gives every deployed git branch its own database branch and removes it only when the git branch is deleted; the free plan allows ten branches per project. The workflow `Delete merged branch` therefore deletes the head branch of every merged pull request, so no more than nine pull requests should be open with a preview at once.
