# Judge testing instructions

Tested in ChatGPT's in-app browser with native WebMCP.

1. Open `https://www.socialsum.com/` signed out. Ask the agent to use `guide_socialsum_user` and explain Socialsum. Confirm the public capability pack is compact and read-only.
2. Call `get_webmcp_capabilities`. Confirm it reports `anonymous_read_only`, the active tools, and the complete capability groups.
3. Open `https://www.socialsum.com/#room=ops-meeting&tab=work`. Call `get_decision_brief` and confirm the visible progress, blockers, and room version match the UI.
4. Switch to **Requirements**, rediscover tools, and confirm the focused pack replaces the Work tools rather than accumulating them. Switch to **Files** and repeat.
5. Request `get_room_brief` with `room_id: missing-judge-room`. Confirm the result contains `ok: false`, `code: NOT_FOUND`, and a recovery action.
6. While signed out, attempt a write such as an approval request. Confirm the server returns `AUTH_REQUIRED`; the hidden write tools cannot be invoked through discovery.
7. Sign in with ChatGPT. In the operations room, inspect the agent checkpoint, decision brief, approved change set, reviewer comment, and human-only adoption boundary.
8. Use local development's identity switcher to verify owner, facilitator, reviewer, contributor, and outsider rights. The proposing agent cannot approve its own change set; only the room owner can adopt an approved current-version change set.
9. Compare a human UI action and the corresponding WebMCP read. Both update/read the same D1-backed room version and audit history.
10. From a clean checkout run:

```bash
npm ci
npm test
npx tsc --noEmit
npm run lint
npm run build
npm run test:webmcp:live
```

Expected: three contract tests pass, compilation/lint/build succeed, and the live script reports four checks with `result: pass`.
