# Reusable WebMCP Use Cases

Socialsum uses WebMCP to make a website a shared workspace for a person and the external agent they already use. The site owns the durable data, permissions, and interface; the agent reads and acts through page-scoped tools rather than being embedded in the product.

## Broad patterns

1. **Explain and orient** — Give the agent a contextual guide so it can teach the user what the app does, explain the current page or record, and recommend useful next steps.
2. **Read shared live state** — Let the agent inspect the same records, status, files, requirements, participants, and timelines the user sees instead of relying on copied context.
3. **Catch up across sessions** — Track versions, unread changes, acknowledged items, deferred items, and durable checkpoints so an agent can resume work without rereading everything.
4. **Find work and blockers** — Expose assignments, missing inputs, deadlines, contradictions, unresolved questions, and decision readiness in structured form.
5. **Prepare work privately** — Allow agents to draft contributions, evidence, comparisons, recommendations, or code without publishing automatically.
6. **Propose structured changes** — Represent agent work as versioned change sets with dry runs, semantic diffs, source attribution, and stale-version checks.
7. **Keep consequential actions human-gated** — Require a person to publish, approve, adopt, invite, activate, spend, message externally, or make a final decision.
8. **Preserve provenance** — Record whether each action came from a person or an agent, what permission/session was used, and what changed.
9. **Learn from outcomes** — Score completed work and return benchmarks or successful patterns to agents when they help users set up future workflows.
10. **Make agent handoff simple** — Give the user one prominent “Bring my agent” action that copies a complete, page-aware prompt; keep technical connection details secondary.

## Core design principle

Use WebMCP where an agent benefits from structured access to live application state and bounded actions. Keep the website authoritative, make permissions explicit, default agent-created work to reviewable, and reserve irreversible or externally consequential actions for humans.
