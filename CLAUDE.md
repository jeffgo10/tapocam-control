# Tapo cam control

Local WebRTC and PTZ controller for the TP-Link Tapo C200. Read `README.md` before changing stream, PTZ, or cast behavior.

The browser does not open RTSP. MediaMTX serves WebRTC and the Nest HLS cast. Next.js routes send ONVIF commands. Cameras are stored in local MySQL. Never print camera passwords or `.env` values.

## Skills

Project skills are in `.agents/skills/` (linked here as `.claude/skills/`):

| Skill | Use when |
|---|---|
| `handoff` | Compact this session into a temp-file handoff |
| `create-github-pr` | Open a PR into `dev`, promote `dev` → `master`, hotfix, or clean up a merged branch |
| `tapocam-explore` | Trace a flow before changing it |
| `tapocam-verifier` | Check a change against the stream, PTZ, and cast constraints |

Before a PR, run `npm test` and `npm run lint`.

This Next.js version may differ from training data. Read `AGENTS.md` and the guides in `node_modules/next/dist/docs/` before writing framework code.
