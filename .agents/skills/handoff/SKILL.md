---
name: handoff
description: Compact the current agent session into a structured handoff document for the next session (skills, git, env, ports), saved to the OS temp directory. Use when the user says handoff, create handoff, or /handoff.
---

# Handoff — compact session for the next agent

Summarize the current chat into a **handoff document** a fresh agent can use to continue without re-discovering context. Save the file **outside the repo** (OS temp directory), not in the workspace.

Works the same in Claude, Cursor, and Antigravity.

## Mode — read trailing user text

| Trailing text | Mode |
|---|---|
| Empty | **Full handoff** — goal, progress, blockers, env, suggested next steps |
| Describes next focus (e.g. "finish cast mosaic", "open PR only") | **Tailored** — same structure, prioritize that focus |
| "minimal" or "short" | **Minimal** — Goal, Current state, Next 3 steps, Critical paths only |
| "with transcript" | **Full + transcript ref** — include path to this session's agent transcript |

If ambiguous, default to **Full handoff**.

---

## Step 1 — Gather context

1. **User intent** — what was asked; what evolved mid-session.
2. **Trailing text** — next-session focus from the mode table.
3. **Git** (when a repo exists):
   ```bash
   git branch --show-current
   git status --short
   git log -5 --oneline
   ```
4. **Changed files** — list paths; do not paste full diffs.
5. **Terminals & services** — if they matter, note Next.js (3000), MySQL (3306, localhost only), MediaMTX API (9997), HLS (8888), WebRTC (8889), ICE (8189/udp). Camera RTSP is 554 and ONVIF is 2020 on the camera, not this machine.
6. **Agent artifacts** — `.agents/skills/`, `.cursor/commands/`, `.cursor/agents/`, `CLAUDE.md`, `GEMINI.md`.
7. **External refs** — PRs or docs — path or URL only.

**Do not duplicate** the README or diffs. **Reference by path.** **Redact** secrets, camera passwords, and `.env` values. Env var **names** are fine.

---

## Step 2 — Write the handoff file

| OS | Directory |
|---|---|
| macOS / Linux | `$TMPDIR` or `/tmp` |
| Windows | `%TEMP%` |

**Filename:** `tapocam-handoff-<YYYYMMDD-HHMM>.md`
Example: `/tmp/tapocam-handoff-20261101-2247.md`

Tell the user the **full absolute path** when done.

### Document template

```markdown
# Agent handoff — <short title>

**Generated:** <ISO date/time>
**Repo:** <absolute workspace path>
**Branch:** <branch> (<clean | dirty | no git>)
**Next session focus:** <from user trailing text or "continue current task">

## Goal
<1–3 sentences>

## Current state
<Bullets: done / in progress / unverified>

## Key decisions & constraints
<Non-obvious choices>

## Files & artifacts (reference only)
| Path | Relevance |
|---|---|
| `path/to/file` | <one line> |

## Environment & dev notes
<Ports, env var names only>

## Blockers & open questions
…

## Suggested next steps
1. …

## Agent continuation guide

### Read first
- `README.md` — how the app is split (MediaMTX, ONVIF, web UI)
- `AGENTS.md` — Next.js version warning

### Suggested skills
| Skill | When |
|---|---|
| `create-github-pr` | Commit, push, CI, and open a PR |
| `tapocam-verifier` | QA changes against the camera constraints |
| `tapocam-explore` | Trace a flow before implementation |

### Recommended mode
<Implement | Debug | Review>
```

---

## Step 3 — Quality bar

- [ ] Next agent can act in **≤2 minutes** without re-reading the whole conversation.
- [ ] Every file mention is a **path**, not a pasted blob.
- [ ] **Next steps** are actionable (verb + target).
- [ ] No secrets, camera passwords, or `.env` values in the saved file.
- [ ] Output provides the user with the **absolute path**.

Do **not** commit the handoff file unless the user explicitly requests it.
