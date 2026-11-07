---
name: git-rewrite-commits
description: Safely rewrite, reorder, squash, split, or recommit commits on main into logical commits in this project's English Conventional Commits style. Use when the user asks to rewrite commits, split commits, squash commits, recommit work, rebase, reorder commits, or combine commits.
---

# Rewrite Commits Workflow

Use this skill when the user explicitly asks to rewrite existing commits into a cleaner, reviewable history.

The goal is to preserve the final tree exactly while replacing the commit sequence with logical commits written in the project's style (see [Commit Style](#commit-style)). Always create a backup branch first and verify the rewritten history against that backup before reporting success.

Work lands on `main` either directly or through a branch and a pull request (see `.claude/rules/git.md` for branch and PR conventions). Rewriting therefore means rewriting `main` itself, or the branch the user names.

## Safety Rules

- Never rewrite history unless the user explicitly asked for it.
- Never update git config.
- Never push under any circumstances. Rewriting stops after local verification; the user pushes manually.
- Never stage or commit secrets such as `.env`, credentials, tokens, private keys, or downloaded production data.
- Create a backup branch before the first `rebase`, `reset`, `commit --amend`, or other history-changing command.
- The backup branch must always start with `rewrite-commits-backup/`, e.g. `rewrite-commits-backup/main-<timestamp>`.
- Never delete the backup branch automatically.
- If uncommitted changes exist, stop and ask whether they should be included, committed separately, or handled another way. Do not stash, discard, or fold them into rewritten commits without explicit approval.
- Commits already on `origin/main` are shared and deployed. Rewrite them only when the user explicitly names how far back to go, and say up front that publishing the result needs a force push.

## Phase 1: Inspect State

Read and understand the current state before changing anything:

```bash
git fetch origin
git status --porcelain
git branch --show-current
git log --oneline --decorate -20
git diff
git diff --cached
```

If the working tree is dirty, follow the dirty-tree safety rule above before continuing.

Determine the rewrite base:

- By default, rewrite only commits not yet pushed: the base is `origin/main`.
- If the user wants to rewrite pushed commits, they name the base (a commit, or "the last N commits"). If it is unclear, ask before continuing.
- The range must not contain merge commits. If it does, stop and ask.

Useful inspection commands:

```bash
git log --oneline --decorate <base>..HEAD
git diff --stat <base> HEAD
git log --merges --oneline <base>..HEAD
```

## Phase 2: Create Backup Branch

Create the backup from the exact current `HEAD` before rewriting history:

```bash
current_branch="$(git branch --show-current)"
backup_ref="rewrite-commits-backup/${current_branch}-$(date +%Y%m%d-%H%M%S)"
git branch "$backup_ref" HEAD
git rev-parse --verify "$backup_ref"
```

Do not continue if the backup branch cannot be created and verified. Keep the `backup_ref` value available for final verification.

## Phase 3: Plan Logical Commits

Plan commits by logical review units:

- Keep a feature implementation with its tests and required generated files.
- Put unrelated documentation, rules, skills, or process changes in their own commit.
- Put generic tooling or infrastructure before the feature that uses it when that makes review easier.
- Put unrelated fixes discovered during validation in their own commit.
- Avoid tiny mechanical commits that only move constants, rename locals, or satisfy formatting.

If a file contains changes for multiple logical commits, split by hunk or reconstruct the intermediate file state. Do not use broad staging such as `git add -A`; stage explicit paths or hunks for each commit.

Show the user the planned commit list (subjects and which files go where) before rewriting when the plan changes the number or grouping of commits.

## Commit Style

Messages are in English and follow [Conventional Commits](https://www.conventionalcommits.org/), matching the existing history (`git log --format=%B -20` shows examples):

- **Subject:** `type(scope): description`. Types: `feat`, `fix`, `refactor`, `perf`, `test`, `docs`, `build`, `ci`, `chore`. `style` is only for code formatting, never for visual or CSS changes (those are `feat` or `fix`).
- The scope is optional, short, lowercase and reused from history when it fits: `core`, `app`, `story`, `graph`, `player`, `scanner`, `playtest`, `live`, `qr`, `blocks`, `buttons`, `dev-server`, `skills`. Introduce a new scope only when none fits.
- The description is imperative or says what is now true, lowercase, no trailing period, ideally under 72 characters: `feat(icons): favicon, home screen icon and manifest icons`.
- Mark breaking changes with `!` after the scope and a `BREAKING CHANGE:` footer.
- **Body** (optional, after a blank line): plain English prose wrapped at about 80 columns explaining what changed and why; no bullet lists unless the change is a list of independent items.
- Keep the `Co-Authored-By:` trailers of the original commits on the commits that contain that work. For commits you create, end with the trailer the current session prescribes.

## Phase 4: Rewrite History

Use the safest non-interactive approach available. For agent-driven work, prefer reconstructing commits from the backed-up tree (e.g. `git reset --soft <base>` or `git reset <base>`, then staging explicit paths or hunks) over interactive editor flows.

Before running destructive history commands such as `git reset`, confirm that:

- the backup branch exists and points at the original `HEAD`
- the rewrite base is known
- the intended commit plan is clear
- the user has approved the rewrite if there is any ambiguity
- no push will be run as part of the rewrite, even after successful verification

Always pass commit messages via heredoc:

```bash
git commit -m "$(cat <<'EOF'
type(scope): short description of what is now true

Optional explanation of what changed and why, wrapped at about 80 columns.

Co-Authored-By: …
EOF
)"
```

After each commit:

```bash
git status --porcelain
```

If intermediate commits are intended to be bisectable, run the relevant focused checks after each meaningful commit. At minimum, run the final checks before reporting completion:

```bash
pnpm format:check
pnpm lint
pnpm typecheck
pnpm test
```

## Phase 5: Verify Final Tree Matches Backup

The rewritten history must end with the same file tree as the backup branch.

```bash
git diff --exit-code "$backup_ref" HEAD
git status --porcelain
```

If the diff is not empty, stop and fix the rewrite. Do not claim success, delete the backup branch, or push.

If verification passes, report:

- a clear sentence saying the rewrite completed successfully
- backup branch name
- rewritten commit list
- final diff verification command and result
- checks run and their result
- whether anything remains uncommitted
- the push command the user runs manually: `git push origin main` when only unpushed commits changed, or `git push --force-with-lease origin main` when pushed commits were rewritten (warn that this rewrites the shared `main`)
- a copyable command to delete the backup branch, e.g. `git branch -D <backup-ref>`

Never run the push or the backup deletion yourself. Only print them after successful final-tree verification.

## Output Format

Report in Czech:

````markdown
## Přepis hotový

Přepis proběhl v pořádku: výsledný strom odpovídá zálohové větvi a pracovní strom je čistý.

Zálohová větev: `rewrite-commits-backup/main-<timestamp>`

Commity:
- `<sha>` `type(scope): description`

Ověření:
- `git diff --exit-code <backup-ref> HEAD`: OK
- `git status --porcelain`: čisto

Kontroly:
- `<příkaz>`: OK

Push (spusť ručně):
```bash
git push --force-with-lease origin main
```

Smazání zálohy (až nebude potřeba):
```bash
git branch -D rewrite-commits-backup/main-<timestamp>
```
````
