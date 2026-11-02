# Tapo cam control — agent guide

Local WebRTC and PTZ controller for the TP-Link Tapo C200. Product behavior is in `README.md`.

The browser does not open RTSP. MediaMTX serves WebRTC (and HLS for Nest cast). Next.js routes send ONVIF pan, tilt, and preset commands. Camera rows live in local MySQL. Do not print camera passwords or `.env` values.

## Skills

The same skills live in `.agents/skills/` and are linked for Claude (`.claude/skills`) and Cursor (`.cursor/skills`).

| Skill | Use when |
|---|---|
| `handoff` | Compact this session into a temp-file handoff |
| `create-github-pr` | Open a PR into `dev`, promote `dev` → `master`, hotfix, or clean up a merged branch |
| `tapocam-explore` | Trace a flow before changing it |
| `tapocam-verifier` | Check a change against the stream, PTZ, and cast constraints |

Before a PR, run `npm test` and `npm run lint`.
