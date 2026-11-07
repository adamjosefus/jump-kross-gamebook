---
name: independent-code-review
description: Review a change with fresh eyes by handing it to a separate reviewer agent that knows nothing about how the change was written, then verify its findings before reporting them. Use when the user asks for an independent, unbiased, second-opinion or fresh-eyes code review ("nezávislé code review", "udělej nezávislé review", "ať se na to podívá někdo jiný") of a pull request, a branch, a commit range or uncommitted changes.
---

# Independent Code Review

An independent review is worth something only when the reviewer is not anchored on the author's reasoning. Whoever wrote the change, often you in this same conversation, already believes it is right and will read the code through that belief. So the review is done by a fresh agent that gets the code and the project's rules, never the author's explanation, and you act as the verifier of what it finds.

## Rules

- **The reviewer starts fresh.** Use the Agent tool with `subagent_type: "general-purpose"`, never `"fork"`, because a fork inherits this conversation and with it your view of the change.
- **Give it the code, not your conclusion.** The brief names the target and how to read it. It never says what the change is supposed to do beyond the PR description, what you already checked, what you think is fine, or what you suspect. Do not write "the rename is mechanical" or "check whether X is broken". Those are hypotheses the reviewer would then confirm.
- **The reviewer only reads.** It must not edit, stage, commit, stash, switch branches or push. Other sessions may share the working folder, so touching it can destroy someone's work.
- **You do not defend the change.** Treat each finding as possibly right until the code shows otherwise. Reject one only with a concrete reason you can point to in the code.
- **Nothing is fixed or published without the user.** The review ends with a report. Fixing the findings, commenting on the PR or posting the review on GitHub each need the user's go-ahead.

## Step 1: Pin down the target

Work out exactly what is reviewed before briefing anyone:

- a pull request: its number, head branch and base (`gh pr view <n> --json number,headRefName,baseRefName,title,body`),
- a branch: `git diff <base>...<branch>`,
- a commit range: `git diff <from>..<to>`,
- uncommitted changes: `git diff HEAD`, plus any new untracked files.

Run `git status --short`. When the working tree has changes that are not part of the target, for example someone else's work in progress, the reviewer must read the target from git (`git diff`, `git show <ref>:<path>`) and not from the files on disk. Note that in the brief. If it needs to run checks on a clean tree, let it create a temporary `git worktree` in the scratchpad directory and remove it afterwards.

## Step 2: Brief the reviewer

Write the brief in English. It is the reviewer's only context, so it has to be complete. Include:

1. **Role.** It is doing an independent review, with no context from the author, and must form its own view.
2. **The project in two sentences** and where things live. Read the root `README.md` for this.
3. **The target and the exact commands** that show it, from Step 1, plus `gh pr view <n>` for the PR description when there is one.
4. **The working-tree caveat** from Step 1, if any, and the read-only rule.
5. **The project rules** to check against: `CLAUDE.md` and every file in `.claude/rules/`. Name the paths and let the reviewer read them, don't paraphrase them.
6. **What to look for, in order:**
   1. correctness bugs and regressions, behaviour that changed unintentionally, broken contracts between packages (`packages/api` ↔ `apps/web`, `packages/core` ↔ `packages/story`),
   2. leftovers the change missed, searched for across the whole repository: code, tests, Storybook stories, scripts, docs, comments and Czech texts for players and organizers,
   3. compatibility: printed QR codes, data already stored in the database, phones still running the previous build during a deploy,
   4. violations of the project rules,
   5. naming and clarity problems worth fixing.
7. **Allowed checks:** `pnpm typecheck`, `pnpm lint`, `pnpm format:check`, `pnpm test`, `pnpm build:vercel`.
8. **Evidence:** every finding needs a `file:line`, a concrete failure scenario (input or state → wrong result) and a suggested fix. Anything it cannot back with a scenario it drops.
9. **Output in Czech:** findings ranked by severity, then a short list of what it checked and found fine. If nothing serious turned up, it says so plainly.

Run the reviewer in the background (`run_in_background: true`) and do other work, or wait for it. Do not review the same code yourself in the meantime. Two parallel reviews by the same author defeat the purpose.

For a large change, split by area (for example core and API in one, web and admin in another) and send one fresh reviewer per area in a single message, so they run at the same time. Each brief still gets the whole list above.

## Step 3: Verify every finding

For each finding, open the code it points to and decide:

- **Potvrzeno:** you reproduced the problem or followed it in the code to the wrong result.
- **Pravděpodobné:** the reasoning holds but you could not confirm it all the way, for example it depends on production data.
- **Zamítnuto:** the code shows it is not a problem. Write down why, in one sentence pointing at the code.

Where a finding is cheap to confirm by running something, run it: a failing test, a typecheck, a grep for the leftover.

## Step 4: Report to the user

Write in Czech:

1. One line on what was reviewed (PR number or branch, base) and that it was done by an independent agent.
2. The confirmed and probable findings, most severe first. For each give the `file:line` as a link, what is wrong, the scenario and the suggested fix.
3. Rejected findings, briefly, each with its reason. The user should see what was considered, not only what survived.
4. What the reviewer checked and found fine, in a sentence or two.

Then ask whether to fix the confirmed findings. Fix them only after the user agrees, in the branch under review, and run the checks again afterwards.
