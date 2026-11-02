<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Skills

Shared by Claude, Cursor, and Antigravity. Source of truth is `.agents/skills/` (linked from `.claude/skills` and `.cursor/skills`). Cursor slash commands are `.cursor/commands/`. Read-only subagents are `.cursor/agents/`.

| Skill | Use when |
|---|---|
| `handoff` | Compact this session into a temp-file handoff |
| `create-github-pr` | Open a PR into `dev`, promote `dev` → `master`, hotfix, or clean up a merged branch |
| `tapocam-explore` | Trace cameras, WebRTC, PTZ, presets, or cast before editing |
| `tapocam-verifier` | Check a change against `README.md` stream, PTZ, and cast constraints |

Product behavior is in `README.md`. Do not print camera passwords or `.env` values.
