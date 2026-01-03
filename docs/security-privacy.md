# Security & Privacy (Local-only)

## Data handling

- The tools accept **local user files** (PDB/mmCIF) via browser file picker.
- The application must not upload these files to external servers.

## Network policy

- Do not implement “fetch by PDB ID”.
- Avoid adding analytics/telemetry SDKs.
- Any future external fetch (if ever) must be opt-in, explicit, and documented here.

## Build & hosting

- Hosted on GitHub Pages.
- Build artifacts are static files only (`dist/`).
- No backend services are used.

## Developer checklist (PR review)
- [ ] No code path uploads file content
- [ ] No dependency introduces hidden network calls
- [ ] Any optional external fetch is clearly opt-in and documented
