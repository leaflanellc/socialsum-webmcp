# Socialsum — important work, without the meeting

## Tagline

Shared decision rooms where people and their own agents turn scattered input into attributable outcomes.

## Inspiration

Many meetings exist because information, judgment, and authority are trapped in different places. People repeat status, agents work in isolated chats, and the actual decision disappears into a summary nobody can reliably resume from.

We wanted a workspace designed around a better unit of collaboration: one bounded problem, an explicit constitution, named required inputs, visible blockers, a deadline, and a decision record.

## What it does

Socialsum lets a person create or join a Problem Room for a decision, investigation, policy, technical RFC, or operational workflow. Participants add evidence, proposals, objections, files, and required inputs. Their own agents can use WebMCP to understand the room, catch up on changes, research and prepare work, compare proposals, and submit versioned change sets.

The centerpiece demo replaces a weekly operations meeting. An agent reads the live decision brief, finds the remaining urgent-decision blocker, resumes from a durable checkpoint, and prepares a scoped operating-rule change. A reviewer sees the exact semantic diff. The agent can request review, but only an authorized person can approve and adopt the change.

## Why WebMCP is essential

This workflow depends on an outside agent understanding and acting on the same live state as several people. Screen scraping would force the agent to infer IDs, roles, deadlines, versions, and consequences from pixels. A chat-only assistant would lose the group record and could not safely resume another participant's work.

WebMCP gives Socialsum typed actions over durable domain objects. Contextual discovery exposes a small bootstrap pack, then replaces it with focused tools based on sign-in, the current room, and the selected tab. Tools return room versions, provenance, blockers, permissions, and recoverable errors. The result is not “AI inside a dashboard”; it is an open workspace that each participant's agent can join safely.

## Better human-agent UX

Agents handle breadth: orientation, catch-up, evidence synthesis, missing-input detection, drafting, and comparison. People supply local context, judgment, dissent, approval, and commitment. Both see the same requirements, proposals, reviews, checkpoints, and audit trail. Consequential work stops at a clear human boundary.

## How we built it

Socialsum is a Vinext/React TypeScript app hosted on ChatGPT Sites. Native `document.modelContext.registerTool()` definitions expose contextual WebMCP capability packs. D1 stores rooms, membership, requirements, deliberation, approvals, change sets, versions, activity, agent sessions, and checkpoints; R2 stores files. ChatGPT sign-in supplies canonical identity. Server-side role and scope checks, optimistic versions, idempotency keys, semantic diffs, and independent-review rules protect mutations.

Automated contract tests verify bounded discovery and stable error classification. A live smoke test verifies the public app, anonymous reads, structured `NOT_FOUND`, and server-enforced `AUTH_REQUIRED` writes.

## Challenges

The hardest problem was authority, not tool registration. An agent needs enough scope to make meaningful progress without becoming a shadow voter or silently committing its participant. We separated preparation, review, approval, and adoption and made delivered information distinct from acknowledged information across agent sessions.

## Accomplishments

- Contextual WebMCP discovery instead of a flat catalog
- Shared human/WebMCP state with visible parity
- Durable cross-session catch-up and checkpoints
- Versioned semantic change sets and independent review
- Human-gated consequential actions enforced on the server
- Realistic public rooms, outcome scoring, and governance recommendations

## What we learned

The most useful human-agent systems do not merely give an agent more buttons. They make the social contract machine-readable: who may act, what evidence is required, what changed, what remains disputed, and where a human must decide.

## What's next

Next we would add organization workspaces, delegated expiring agent access, integrations for source evidence, reusable room templates with measured success rates, and notifications that enforce input windows without recreating a noisy social feed.

## Links

- Live app: https://www.socialsum.com/
- Public source: https://github.com/leaflanellc/socialsum-webmcp
- Demo room: https://www.socialsum.com/#room=ops-meeting&tab=work
