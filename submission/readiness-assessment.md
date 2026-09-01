# Socialsum submission readiness

Checked September 1, 2026 against the official OpenAI challenge page and Devpost requirements.

| Requirement or claim | Evidence | Status | Gap or action |
| --- | --- | --- | --- |
| Working public app | `https://www.socialsum.com` loads publicly | Pass | Reverify after final deployment |
| Meaningful WebMCP workflow | Agent reads a room, catches up from a checkpoint, prepares a versioned change set, and stops for human approval | Pass | Capture in video |
| Shared human-agent state | UI and WebMCP use the same D1-backed API and room versions | Pass | Show parity in judge path |
| Contextual discovery | Compact bootstrap plus auth, room, and tab-scoped capability packs | Pass | Reverify live tool counts |
| Recoverable errors | Stable error code, message, recoverability, and next action | Pass | Show `NOT_FOUND` or `AUTH_REQUIRED` |
| Human authority boundary | Server rejects anonymous writes; agents cannot approve or adopt their own work | Pass | Rehearse signed-in role tests |
| Public repository and license | Public GitHub repository with MIT license and setup instructions | In progress | Verify logged out after push |
| Automated tests | Contract tests plus live public/API smoke test | Pass | Record final commands |
| Public YouTube demo under 3 minutes | Narrated MP4, captions, and upload package | In progress | Publish only after confirmation |
| Devpost entry | Description and testing instructions prepared | In progress | Final submit requires confirmation |

## Competitive score

| Dimension | Score | Evidence |
| --- | ---: | --- |
| WebMCP essentiality (2x) | 4/4 | Outside agents work directly with typed, versioned, durable group state |
| Human-agent collaboration (2x) | 4/4 | Shared objects, explicit turn-taking, checkpoints, and human review |
| Structured action quality | 4/4 | Strict schemas, semantic diffs, provenance, deep links, structured errors |
| Discovery and state awareness | 4/4 | Bootstrap/index plus replaceable auth/page/tab packs |
| Durable continuity | 4/4 | Delta catch-up, acknowledgement state, blockers, and checkpoints |
| Trust and authority | 4/4 | Canonical identity, roles, server checks, approval and adoption separation |
| Product execution | 4/4 | Public polished UI, D1/R2 persistence, realistic data, tests |
| Demo clarity and ambition | 4/4 | Concrete meeting-replacement story with broad problem-room expansion |

**Provisional score: 40/40, contingent on the final public repository, live regression run, and video QA.**

Official sources:

- https://openai.com/webmcp-challenge/
- https://webmcp.devpost.com/
- https://webmcp.devpost.com/rules
