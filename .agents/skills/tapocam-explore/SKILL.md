---
name: tapocam-explore
description: Read-only codebase archaeology for the Tapo C200 controller. Use before implementation when tracing cameras, WebRTC, PTZ, presets, casting, or MediaMTX.
---

# Tapo cam explorer

Map **how things work today** so a later change can use accurate file paths. Stay read-only during exploration — do not implement unless explicitly asked.

If an expected path does not exist, say so. Product behavior is in `README.md`.

## Context anchors

| Area | Start here |
|---|---|
| Product split | `README.md` — browser WebRTC via MediaMTX, ONVIF via Next routes, cameras in MySQL |
| UI | `app/page.tsx`, `components/controller.tsx`, `components/camera-stage.tsx`, `components/stream-player.tsx` |
| Camera CRUD | `app/api/cameras/`, `lib/cameras.ts`, `components/camera-form.tsx`, `components/camera-library.tsx` |
| Live view | `app/api/cameras/[id]/stream/route.ts`, `lib/mediamtx.ts`, `lib/rtsp.ts`, `lib/paths.ts`, `mediamtx/mediamtx.yml` |
| PTZ & presets | `app/api/cameras/[id]/ptz/route.ts`, `app/api/cameras/[id]/presets/route.ts`, `lib/ptz.ts`, `lib/presets.ts`, `lib/onvif-client.ts` |
| Cast to Nest | `app/api/cast/route.ts`, `lib/cast-media.ts`, `lib/cast-mosaic.ts`, `components/cast-control.tsx`, `components/cast-sdk.ts` |
| Local stack | `docker-compose.yml`, `.env.example` |

Legacy single-camera routes also exist: `app/api/camera/route.ts`, `app/api/ptz/route.ts`, `app/api/presets/route.ts`. Say which path the UI actually calls.

## Exploration workflow

1. **Restate the question.**
2. **Search** — symbols, route handlers, MediaMTX path names.
3. **Trace** — UI component → `components/api.ts` → Next route → `lib/` → MediaMTX, ONVIF (camera port 2020), or MySQL. Note which work stays in the browser (PTZ while casting) and which stops (browser video while the display plays).
4. **Document** — files with one-line roles, gaps, and surprising dependencies.

Do not print camera passwords, RTSP credentials, or `.env` values. Name the env vars only.

## Report format

```markdown
## Tapo cam exploration — <topic>

### Question
…

### Entry points
| File | Role |
|---|---|
| `path/…` | … |

### Data / control flow
…

### Key symbols & env vars
- …

### Gaps / unknowns
- …

### Recommended implementation touch points
| Priority | File | Why |
|---|---|---|
| 1 | `…` | … |

### Suggested next step
- Proceed with implementation, or run `tapocam-verifier` after it
```

Cite real workspace paths. Label **new file** when something must be created.
