# Socialsum

**Important work, without the meeting.**

Socialsum is a shared decision workspace where people and their own agents gather evidence, challenge proposals, resolve required inputs, and move a bounded problem to an attributable outcome. It is a submission for the 2026 OpenAI WebMCP Challenge.

- Live app: [socialsum.com](https://www.socialsum.com/)
- Demo room: [Replace the weekly operations meeting](https://www.socialsum.com/#room=ops-meeting&tab=work)
- WebMCP use cases: [WEBMCP_USE_CASES.md](./WEBMCP_USE_CASES.md)

## Why WebMCP is central

Socialsum does not contain a resident AI. Each participant brings an outside agent. Native WebMCP tools let that agent work against the same durable rooms, requirements, versions, evidence, review threads, approvals, and checkpoints the human sees.

The active tool surface is contextual:

- Anonymous visitors receive a compact read-only discovery pack.
- Signing in reveals participant tools.
- Opening a room and switching tabs replaces the focused capability pack.
- A capability-index tool explains inactive groups without flooding discovery.
- Server-side authorization remains authoritative regardless of which tools are visible.

Representative workflows include room orientation, delta catch-up, assigned-input preparation, versioned change sets, human approval requests, and durable session checkpoints. WebMCP failures return stable codes and a safe recovery action.

## Human authority model

Agents may inspect, organize, research, draft, compare, and propose. They cannot approve their own work, adopt a change set, activate a room, publish on another person's behalf, or record a final decision. Consequential actions stop at an exact human review boundary and every mutation is attributed.

## Architecture

- Vinext / React / TypeScript
- Native `document.modelContext.registerTool()` WebMCP registration
- ChatGPT Sites identity headers and sign-in flow
- Cloudflare D1 for structured durable state
- Cloudflare R2 for room files
- Optimistic room versions, idempotency keys, semantic diffs, audit events, and checkpoints

The WebMCP contract and contextual packs live in [`lib/webmcp-contract.ts`](./lib/webmcp-contract.ts). Tool definitions and browser-facing registration live in [`app/page.tsx`](./app/page.tsx). Server authorization and state transitions live in [`lib/commonwork-db.ts`](./lib/commonwork-db.ts).

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

Open the local URL printed by Vinext. Local development supports the identity switcher for owner, facilitator, reviewer, contributor, and outsider permission testing. Production ignores that test header and uses the signed-in ChatGPT identity.

## Test

```bash
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:webmcp:live
```

The live check defaults to `https://www.socialsum.com`. Override it with `SOCIALSUM_BASE_URL` when testing another deployment.

In ChatGPT's in-app browser, open the demo room and ask your agent:

> Use this site's WebMCP. Explain the room, identify the blockers, and show what you can prepare versus what requires a person.

Then switch between **Work**, **Requirements**, and **Files** and rediscover tools to verify that the focused capability pack changes without accumulating stale tools.

## Data and privacy

The public gallery contains fictional demonstration data. Anonymous visitors are read-only. Do not use the demo deployment for confidential information. No API keys or private credentials are required to run the application source.

## License

[MIT](./LICENSE)
