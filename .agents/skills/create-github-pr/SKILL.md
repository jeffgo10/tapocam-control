---
name: create-github-pr
description: Analyze branch commits, draft a PR, and open it with gh. Also handles post-merge cleanup and a hotfix merged into master. Use for /create-github-pr, "open PR", "hotfix", or "cleanup".
---

# Create GitHub PR from branch commits

Analyze commits and diffs on the current branch, draft a PR title and description, push if needed, and open a pull request with `gh`. **Cleanup mode** syncs `master` after a merged PR. **Hotfix mode** commits, opens a PR into `master`, approves and merges it, then cleans up.

**Default Behavior:**
When invoked (even with empty trailing text), analyze git state, run local checks, create/switch to a feature branch if on `master`, stage changes (excluding secrets and env files), commit, push, and open the pull request immediately with `gh pr create`.

**Branch strategy:** This repo has one long-lived branch, `master`. Open feature PRs into `master`.

- Never delete `master`.
- Never create or retarget a `main` or `dev` branch. If the user asks for `dev`, a release PR, or `dev` → `master`, stop and say the only long-lived branch is `master`.

This command does not deploy anything. Merging git does not restart Docker or the Next.js server.

## Mode — read trailing user text

| Trailing text | Mode |
|---|---|
| Empty or `now` / `proceed` | **Create** — commit (if dirty), push, and open PR **into `master`** immediately |
| `master`, `to master`, `main`, or `to main` | **Create** — base **`master`** (same as default) |
| `hotfix`, `hotfix promote`, or `emergency` | **Hotfix** — commit, push, PR to `master`, immediately approve and merge, then clean up |
| `cleanup` or `post-merge` | **Cleanup** — sync `master`, switch to it, delete merged feature branch |
| `draft only`, `preview`, or `dry run` | **Draft only** — show proposed title/body; do not push or create PR |
| `draft pr` or `as draft` | **Create draft PR** — `gh pr create --draft` |
| Contains `base:` or `into:` | Override base branch |
| Contains `title:` | Use as title hint |
| Describes scope | Narrow summary to that scope; still list all commits |

**Default base branch:** `master`.

If trailing text is **cleanup**, skip Create — run **Cleanup mode** only.

If trailing text asks to promote through `dev`, stop. Do not create that branch. If the current branch is `dev`, stop. Do not commit, push, or open a PR from it.

### Uncommitted changes (Create into `master`)

When the working tree has changes **outside** ignored local state:

1. Inspect the uncommitted changes and determine an appropriate feature branch name (`feat/...` or `fix/...`).
2. Identify files to stage. Never stage `.env`, `.env.local`, or any `.env*` other than `.env.example`. Never stage credentials or camera passwords.
3. Switch to the feature branch (`git checkout -b <branch>`), stage files, commit, push, and open the PR with `gh pr create`.

---

## Cleanup mode (after PR merged)

**Default:** delete merged local + remote feature branch. Use **keep branch** or **no delete** to skip.

### C1 — Pre-check

```bash
git status
git branch --show-current
git remote -v
```

| Situation | Action |
|---|---|
| Uncommitted changes | **Stop** — ask user to commit, stash, or discard |
| Already on `master` | Skip checkout; still fetch + pull; skip branch delete |
| On a feature branch | Remember name for delete |

### C2 — Sync

```bash
git fetch origin
git checkout master
git pull origin master
```

Never force-pull or `reset --hard` unless the user asks.

### C3 — Remove merged feature branch

Confirm merge (`git branch --merged` or `gh pr list --state merged --head <branch>`). Run `git branch -d <branch>`; `git push origin --delete <branch>` if remote remains. Never delete `master`.

### C4 — Report base, previous branch, deletions, and `git log -3`.

---

## Step 0 — `gh` pre-check (Create only)

```bash
command -v gh && gh auth status
```

If `gh` is missing or unauthed: after push, print `https://github.com/<owner>/<repo>/compare/<base>...<branch>` plus install hint (`brew install gh` → `gh auth login`). Do not fail the flow.

If this workspace is **not a git repo yet**, stop and notify the user — initialize only if requested.

---

## Step 1 — Gather git context

```bash
git status
git branch -vv
git remote -v
git log --oneline -15
git fetch origin master 2>/dev/null || true
git log origin/master..HEAD --oneline
git diff origin/master...HEAD --stat
git diff origin/master...HEAD
```

Use the overridden base instead of `master` when the user set `base:` or `into:`.

Analyze **ALL** commits since diverging from base.

---

## Step 2 — Draft PR title

- One line, **≤ 72 characters** when possible
- **Imperative mood** — "Add …", "Fix …", "Update …"
- Lead with the user-facing or architectural outcome

---

## Step 3 — Draft PR description

```markdown
## Summary
<2–4 sentences>

## Changes

### App
- …

### Stream / PTZ / cast
- …

### Docs / tooling
- …

## Commits
| SHA | Message |
|-----|---------|
| `abc1234` | … |

## Test plan
- [ ] …

## Notes / follow-ups
…
```

Do **not** include secrets, `.env` values, or camera passwords. Do **not** paste huge diffs.

---

## Step 4 — Branch, commit (if dirty), and push

1. Feature branch `feat/` / `fix/` / `chore/` if on `master`.
2. Stage and commit product changes. Never stage `.env*` except `.env.example`.
3. Run local checks once and wait for them to pass:
   ```bash
   npm test
   npm run lint
   ```
   Do not push if either fails.
4. `git push -u origin HEAD` — never force-push to `master`. Push only after the checks are green.

There is no version-bump step in this repo.

---

## Step 5 — Create PR

```bash
gh pr create --base master --title "…" --body "$(cat <<'EOF'
## Summary
…
EOF
)"
```

Add `--draft` when requested. If a PR already exists: `gh pr view --json url,title,baseRefName` and report the URL.

If `.github/workflows` exists, mention that remote checks may still be running. **Immediately report the PR URL** — do not poll in a loop for remote checks to finish.

---

## Hotfix mode (`create-github-pr hotfix`)

When invoked with `hotfix`, `hotfix promote`, or `emergency`, go from the working tree to a merged PR on `master` without pausing for a manual approval:

```
[Local work] → [fix branch] → [PR into master] → [Approve & merge] → [Sync master & delete fix branch]
```

### H1 — Prepare and commit

1. If on `master` with uncommitted changes, create `git checkout -b fix/<short-topic>`.
2. Run local checks. Both must pass before pushing:
   ```bash
   npm test
   npm run lint
   ```
3. Stage changes (never `.env*` except `.env.example`):
   ```bash
   git add <files>
   git commit -m "fix: <summary>"
   ```
4. Push: `git push -u origin HEAD`.

### H2 — Create, approve, and merge into `master`

1. `gh pr create --base master`.
2. Attempt approval (ignore errors if GitHub disallows self-approval):
   ```bash
   gh pr review "$PR_URL" --approve -b "Approved hotfix" 2>/dev/null || true
   ```
3. Merge and delete the remote branch:
   ```bash
   gh pr merge "$PR_URL" --squash --delete-branch --admin || gh pr merge "$PR_URL" --squash --delete-branch
   ```

### H3 — Cleanup and report

```bash
git fetch origin master
git checkout master
git pull origin master
git branch -D fix/<short-topic> 2>/dev/null || true
```

Report the PR URL, branch cleanup, and `git status`.

---

## Guardrails

- When invoked, execute branch creation, staging, commit, push, and `gh pr create` directly unless the user requested `draft only` / `dry run`.
- Immediately return the PR URL, title, and summary once `gh pr create` completes.
- In Hotfix mode: execute H1 through H3 consecutively.
- Never open a PR from `master` into `master` without a feature branch.
- Never create a `dev` or `main` branch.
- Never push or open a PR before `npm test` and `npm run lint` are green.
- Never delete or force-update `master`.
- In Cleanup: do not run `reset --hard` or `branch -D` unless explicitly asked (`branch -D` in hotfix H3 is the exception, and only for the fix branch just merged).
