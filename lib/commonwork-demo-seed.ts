import type { CommonworkUser } from './commonwork-db';

const WORKSPACE_ID = 'commonwork-demo';

async function runBatches(database: D1Database, statements: D1PreparedStatement[], label: string) {
  for (let index = 0; index < statements.length; index += 75) {
    try {
      await database.batch(statements.slice(index, index + 75));
    } catch (error) {
      throw new Error(`${label} demo seed failed: ${error instanceof Error ? error.message : 'unknown database error'}`);
    }
  }
}

export async function ensurePolishedDemoHistory(database: D1Database, user: CommonworkUser) {
  const now = Date.now();
  const day = 86_400_000;
  const ownerId = user.userId;
  const ownerName = user.displayName;
  const standardConstitution = JSON.stringify({
    participation: 'Invite-only · concise, assigned input with explicit deadlines',
    evidence: 'Sources, direct observations, or clearly labeled assumptions',
    agentPolicy: 'Agents may inspect, research, and prepare changes; humans approve consequential actions',
    redTeam: 'Independent review is required before adoption or final decision',
  });

  const rooms = [
    {
      id: 'refund-policy',
      title: 'Set a fair exception policy for customer refunds',
      problem: 'Support needs discretion for unusual cases, while finance needs predictable limits and a defensible audit trail.',
      desired: 'Approve a 60-day pilot policy with clear thresholds, escalation rules, and a weekly fairness review.',
      model: 'Consent workshop',
      status: 'active',
      phase: 3,
      deadline: now + 4 * day,
      criteria: ['Resolve material frontline objections', 'Keep exceptions under 8% of monthly refunds', 'Publish a plain-language escalation path'],
      authority: 'Policy owner unless a material objection remains unresolved',
      version: 4,
    },
    {
      id: 'inventory-reorder',
      title: 'Automate seasonal inventory reorder decisions',
      problem: 'Managers were rebuilding the same reorder spreadsheet every week and still reacting late to fast-moving stock.',
      desired: 'Adopt a reviewable reorder rule that reduces stockouts without increasing excess inventory.',
      model: 'Decision room',
      status: 'closed',
      phase: 4,
      deadline: now - 48 * day,
      criteria: ['Cut priority stockouts by 30%', 'Keep excess inventory below 6%', 'Give managers an override with recorded rationale'],
      authority: 'Operations director after finance and warehouse review',
      version: 7,
    },
  ];

  const roomStatements: D1PreparedStatement[] = [];
  for (const room of rooms) {
    roomStatements.push(database.prepare(`INSERT OR IGNORE INTO rooms
      (id, workspace_id, title, problem, desired_outcome, governance_model, visibility, decision_authority, constitution_json, success_criteria_json, status, current_phase, deadline_at, outcome_review_at, created_by, created_at, updated_at, version, meeting_avoided)
      VALUES (?, ?, ?, ?, ?, ?, 'invite_only', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(room.id, WORKSPACE_ID, room.title, room.problem, room.desired, room.model, room.authority,
        standardConstitution, JSON.stringify(room.criteria), room.status, room.phase, room.deadline,
        room.status === 'closed' ? now - 18 * day : room.deadline + 30 * day,
        ownerId, now - 70 * day, now - day, room.version, room.id === 'inventory-reorder' ? 1 : 0));
    roomStatements.push(database.prepare(`INSERT OR IGNORE INTO memberships
      (id, room_id, user_id, display_name, role, constitution_accepted_at, joined_at)
      VALUES (?, ?, ?, ?, 'owner', ?, ?)`)
      .bind(`demo-member-${room.id}-owner`, room.id, ownerId, ownerName, now - 70 * day, now - 70 * day));
    const phases = room.model === 'Consent workshop'
      ? ['Frame', 'Hear perspectives', 'Form proposal', 'Test objections', 'Consent']
      : ['Frame', 'Collect input', 'Resolve gaps', 'Decide', 'Review outcome'];
    phases.forEach((name, position) => roomStatements.push(database.prepare(`INSERT OR IGNORE INTO phases
      (id, room_id, position, name, status, starts_at, ends_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(`phase-${room.id}-${position}`, room.id, position, name,
        position < room.phase ? 'complete' : position === room.phase ? 'current' : 'upcoming',
        room.deadline + (position - room.phase - 1) * day, room.deadline + (position - room.phase) * day)));
  }
  await runBatches(database, roomStatements, 'rooms');

  const memberships = [
    ['demo-polished-ops-marcus', 'ops-meeting', 'local-marcus', 'Marcus Reed', 'reviewer'],
    ['demo-polished-ops-sarah', 'ops-meeting', 'local-sarah', 'Sarah Chen', 'facilitator'],
    ['demo-polished-ops-priya', 'ops-meeting', 'local-priya', 'Priya Shah', 'contributor'],
    ['demo-polished-field-sarah', 'field-scheduling', 'local-sarah', 'Sarah Chen', 'facilitator'],
    ['demo-polished-field-priya', 'field-scheduling', 'local-priya', 'Priya Shah', 'contributor'],
    ['demo-polished-refund-sarah', 'refund-policy', 'local-sarah', 'Sarah Chen', 'facilitator'],
    ['demo-polished-refund-marcus', 'refund-policy', 'local-marcus', 'Marcus Reed', 'reviewer'],
    ['demo-polished-refund-priya', 'refund-policy', 'local-priya', 'Priya Shah', 'contributor'],
    ['demo-polished-onboarding-sarah', 'onboarding-owner', 'local-sarah', 'Sarah Chen', 'facilitator'],
    ['demo-polished-onboarding-marcus', 'onboarding-owner', 'local-marcus', 'Marcus Reed', 'reviewer'],
    ['demo-polished-inventory-sarah', 'inventory-reorder', 'local-sarah', 'Sarah Chen', 'facilitator'],
    ['demo-polished-inventory-marcus', 'inventory-reorder', 'local-marcus', 'Marcus Reed', 'reviewer'],
    ['demo-polished-inventory-priya', 'inventory-reorder', 'local-priya', 'Priya Shah', 'contributor'],
  ];
  await runBatches(database, memberships.map((member) => database.prepare(`INSERT OR IGNORE INTO memberships
    (id, room_id, user_id, display_name, role, constitution_accepted_at, joined_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .bind(member[0], member[1], member[2], member[3], member[4], now - 30 * day, now - 30 * day)), 'memberships');

  const contributions = [
    ['demo-ops-agenda-audit', 'ops-meeting', 'local-sarah', 'Sarah Chen', 'evidence', 'Twelve-week agenda audit', 'Across 12 meetings, 52% of scheduled time repeated status already available in operating systems. Only 18% of agenda items required live disagreement resolution.', 14, 'human', now - 8 * day],
    ['demo-ops-response-test', 'ops-meeting', 'local-priya', 'Priya Shah', 'evidence', 'Friday input-window trial', 'During a one-week dry run, seven of eight owners submitted before Friday noon. The missing input was recovered by a targeted reminder without scheduling a meeting.', 8, 'webmcp', now - 5 * day],
    ['demo-ops-escalation', 'ops-meeting', ownerId, ownerName, 'proposal', 'Escalate conflict, not missing status', 'Use the room for status, evidence, and approvals. Schedule a focused call only when a named material objection remains unresolved at the decision deadline.', 3, 'webmcp', now - 3 * day],
    ['demo-ops-risk-note', 'ops-meeting', 'local-marcus', 'Marcus Reed', 'critique', 'Urgent safety and staffing decisions need a bypass', 'The asynchronous default should not delay same-day safety, legal, or critical staffing decisions. Those cases need an immediate escalation lane.', 2, 'human', now - 2 * day],
    ['demo-field-mobile', 'field-scheduling', 'local-priya', 'Priya Shah', 'evidence', 'Technician mobile test on iPhone and Android', 'Four technicians completed dispatch, photo upload, parts use, signature, and offline recovery. Route changes were clear; offline invoice edits remained unreliable in one finalist.', 11, 'webmcp', now - 6 * day],
    ['demo-field-cost', 'field-scheduling', 'local-sarah', 'Sarah Chen', 'evidence', 'Three-year total-cost model', 'FieldFlow costs 14% more in licenses than RouteDesk but avoids a custom accounting connector and an estimated 220 hours of migration work.', 9, 'webmcp', now - 4 * day],
    ['demo-field-proposal', 'field-scheduling', ownerId, ownerName, 'proposal', 'Pilot FieldFlow with one service crew', 'Run a 21-day pilot with six technicians, parallel invoice reconciliation, and a rollback checkpoint after week one.', 5, 'human', now - 2 * day],
    ['demo-field-objection', 'field-scheduling', 'local-marcus', 'Marcus Reed', 'critique', 'Export ownership is still unclear', 'The recommendation is acceptable only if the contract guarantees a complete customer, job, image, and invoice export without professional-services fees.', 2, 'human', now - day],
    ['demo-refund-analysis', 'refund-policy', 'local-sarah', 'Sarah Chen', 'evidence', 'Six months of exception requests', 'Eighty-one percent of escalations were under $150, and 63% were resolved exactly as the frontline agent originally recommended after a two-day delay.', 18, 'webmcp', now - 9 * day],
    ['demo-refund-frontline', 'refund-policy', 'local-priya', 'Priya Shah', 'evidence', 'Frontline listening summary', 'Agents want discretion for duplicate shipments, service failures, and documented hardship. They do not want a vague customer-satisfaction exception.', 7, 'human', now - 7 * day],
    ['demo-refund-proposal', 'refund-policy', ownerId, ownerName, 'proposal', 'Tiered refund discretion pilot', 'Allow trained agents to approve documented exceptions up to $150, team leads up to $500, and route larger or repeated exceptions to finance.', 6, 'webmcp', now - 4 * day],
    ['demo-refund-objection', 'refund-policy', 'local-marcus', 'Marcus Reed', 'critique', 'Fairness must be measured across customer groups', 'Speed alone is insufficient. Weekly review should sample approvals and denials for inconsistent treatment, repeat exceptions, and manager overrides.', 4, 'human', now - 2 * day],
    ['demo-onboarding-baseline', 'onboarding-owner', 'local-sarah', 'Sarah Chen', 'evidence', 'Baseline handoff analysis', 'New customers crossed an average of 4.7 internal owners before activation. Thirty-eight percent of elapsed time occurred between handoffs.', 16, 'webmcp', now - 82 * day],
    ['demo-onboarding-pilot', 'onboarding-owner', ownerId, ownerName, 'proposal', 'Single accountable onboarding owner', 'One owner stays responsible from signed agreement through activation while specialists retain explicit review tasks and service-level deadlines.', 8, 'human', now - 74 * day],
    ['demo-onboarding-result', 'onboarding-owner', 'local-marcus', 'Marcus Reed', 'evidence', 'Independent 30-account review', 'Median activation fell from 8.4 to 5.1 days. Rework declined 22%, and specialist response time did not worsen.', 30, 'human', now - 20 * day],
    ['demo-inventory-baseline', 'inventory-reorder', 'local-sarah', 'Sarah Chen', 'evidence', 'Seasonal stockout baseline', 'Priority stockouts affected 11.8% of weekly orders during peak season, while manual reorder preparation consumed about five manager-hours each week.', 24, 'webmcp', now - 70 * day],
    ['demo-inventory-rule', 'inventory-reorder', ownerId, ownerName, 'proposal', 'Guardrailed reorder recommendation', 'The agent prepares reorder quantities from recent demand, lead time, committed jobs, and seasonality. A manager approves exceptions above the risk threshold.', 10, 'webmcp', now - 62 * day],
    ['demo-inventory-review', 'inventory-reorder', 'local-marcus', 'Marcus Reed', 'evidence', 'Eight-week outcome verification', 'Priority stockouts fell 37%, excess inventory stayed at 4.9%, and managers overrode 9% of recommendations with a recorded reason.', 8, 'human', now - 18 * day],
  ];
  await runBatches(database, contributions.map((item) => database.prepare(`INSERT OR IGNORE INTO contributions
    (id, room_id, author_user_id, author_name, type, title, body, visibility, prepared_with_agent, source_count, created_at, published_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?)`)
    .bind(item[0], item[1], item[2], item[3], item[4], item[5], item[6], item[8] === 'webmcp' ? 1 : 0, item[7], item[9], item[9])), 'contributions');

  const requirements = [
    ['demo-req-ops-response', 'ops-meeting', 'Confirm response-window reliability', 'Verify that owners can respond by Friday noon and document the reminder fallback.', 'Priya Shah', 'local-priya', 'accepted', 'demo-ops-response-test', now - 5 * day],
    ['demo-req-ops-bypass', 'ops-meeting', 'Define the urgent-decision bypass', 'Name safety, legal, and staffing cases that skip the normal asynchronous window.', 'Marcus Reed', 'local-marcus', 'submitted', 'demo-ops-risk-note', now + day],
    ['demo-req-field-export', 'field-scheduling', 'Verify data portability', 'Confirm contract language and test a complete export for customers, jobs, images, and invoices.', 'Marcus Reed', 'local-marcus', 'submitted', 'demo-field-objection', now + 3 * day],
    ['demo-req-field-pilot', 'field-scheduling', 'Approve pilot and rollback owner', 'Name the pilot crew, reconciliation owner, and rollback decision date.', ownerName, ownerId, 'accepted', 'demo-field-proposal', now + 5 * day],
    ['demo-req-refund-baseline', 'refund-policy', 'Quantify current exception patterns', 'Segment exception volume, value, resolution, and delay.', 'Sarah Chen', 'local-sarah', 'accepted', 'demo-refund-analysis', now - 7 * day],
    ['demo-req-refund-frontline', 'refund-policy', 'Document frontline cases', 'Identify concrete cases that need discretion and cases that should remain escalated.', 'Priya Shah', 'local-priya', 'accepted', 'demo-refund-frontline', now - 5 * day],
    ['demo-req-refund-fairness', 'refund-policy', 'Define fairness review', 'Specify the weekly sample, warning thresholds, owner, and correction process.', 'Marcus Reed', 'local-marcus', 'submitted', 'demo-refund-objection', now + day],
    ['demo-req-refund-owner', 'refund-policy', 'Name the pilot policy owner', 'Assign authority for thresholds, training, and the 60-day review.', ownerName, ownerId, 'open', null, now + 2 * day],
    ['demo-req-inventory-baseline', 'inventory-reorder', 'Verify the stockout baseline', 'Measure priority stockouts and weekly planning time.', 'Sarah Chen', 'local-sarah', 'accepted', 'demo-inventory-baseline', now - 68 * day],
    ['demo-req-inventory-guardrails', 'inventory-reorder', 'Approve recommendation guardrails', 'Define override thresholds and required rationale.', ownerName, ownerId, 'accepted', 'demo-inventory-rule', now - 58 * day],
    ['demo-req-inventory-outcome', 'inventory-reorder', 'Independently verify the pilot', 'Review stockouts, excess inventory, and override behavior after eight weeks.', 'Marcus Reed', 'local-marcus', 'accepted', 'demo-inventory-review', now - 18 * day],
  ];
  await runBatches(database, requirements.map((item) => database.prepare(`INSERT OR IGNORE INTO requirements
    (id, room_id, title, description, owner_label, owner_user_id, kind, required, status, due_at, contribution_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'input', 1, ?, ?, ?, ?, ?)`)
    .bind(item[0], item[1], item[2], item[3], item[4], item[5], item[6], item[8], item[7], now - 12 * day, now - day)), 'requirements');

  await database.batch([
    database.prepare("UPDATE requirements SET contribution_id = 'demo-ops-agenda-audit', status = 'accepted', updated_at = ? WHERE id = 'req-ops-cost'").bind(now - 7 * day),
    database.prepare("UPDATE requirements SET contribution_id = 'demo-field-mobile', status = 'accepted', updated_at = ? WHERE id = 'req-field-mobile'").bind(now - 5 * day),
    database.prepare("UPDATE requirements SET contribution_id = 'demo-field-cost', status = 'submitted', updated_at = ? WHERE id = 'req-field-cost'").bind(now - 3 * day),
  ]);

  const deliberation = [
    ['demo-item-ops-criterion', 'ops-meeting', ownerId, ownerName, 'criterion', 'A live meeting requires unresolved conflict', 'Missing status triggers a reminder or reassignment. Only a named material objection can trigger synchronous discussion.', 'accepted', null, 2, 'webmcp', now - 3 * day],
    ['demo-item-ops-objection', 'ops-meeting', 'local-marcus', 'Marcus Reed', 'objection', 'Urgent decisions need an immediate lane', 'Safety, legal exposure, and same-day staffing cannot wait for the standard deadline.', 'open', 'demo-item-ops-criterion', 2, 'human', now - 2 * day],
    ['demo-item-field-proposal', 'field-scheduling', ownerId, ownerName, 'proposal', 'Pilot FieldFlow with one crew', 'Run a 21-day controlled pilot before signing the annual agreement.', 'open', null, 5, 'human', now - 2 * day],
    ['demo-item-field-assumption', 'field-scheduling', 'local-sarah', 'Sarah Chen', 'assumption', 'Accounting integration avoids custom work', 'The cost advantage depends on the standard connector covering invoice edits, deposits, and tax mapping.', 'open', 'demo-item-field-proposal', 3, 'webmcp', now - day],
    ['demo-item-refund-proposal', 'refund-policy', ownerId, ownerName, 'proposal', 'Tiered refund discretion', 'Agents up to $150, team leads up to $500, finance above $500 or for repeated exceptions.', 'open', null, 6, 'webmcp', now - 4 * day],
    ['demo-item-refund-objection', 'refund-policy', 'local-marcus', 'Marcus Reed', 'objection', 'Measure consistency, not only speed', 'The pilot must detect materially different outcomes for similar cases.', 'open', 'demo-item-refund-proposal', 4, 'human', now - 2 * day],
    ['demo-item-refund-criterion', 'refund-policy', 'local-sarah', 'Sarah Chen', 'criterion', 'Weekly fairness sample', 'Review at least 20 approvals and 20 denials, including every manager override and repeat customer exception.', 'accepted', 'demo-item-refund-objection', 2, 'webmcp', now - day],
    ['demo-item-onboarding-proposal', 'onboarding-owner', ownerId, ownerName, 'proposal', 'One accountable owner, explicit specialist tasks', 'Accountability stays with one owner while specialist reviews remain visible and time-bound.', 'accepted', null, 8, 'human', now - 74 * day],
    ['demo-item-inventory-proposal', 'inventory-reorder', ownerId, ownerName, 'proposal', 'Agent-prepared reorder with manager approval', 'Recommendations are reviewable and overrides require a reason.', 'accepted', null, 10, 'webmcp', now - 62 * day],
  ];
  await runBatches(database, deliberation.map((item) => database.prepare(`INSERT OR IGNORE INTO deliberation_items
    (id, room_id, author_user_id, author_name, item_type, title, body, status, visibility, related_item_id, source_count, actor_path, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?)`)
    .bind(...item, item[11])), 'deliberation');

  await database.batch([
    database.prepare(`INSERT OR IGNORE INTO decisions
      (id, room_id, summary, rationale, dissent_json, decided_by, decided_at)
      VALUES ('demo-decision-inventory', 'inventory-reorder', 'Adopt the guardrailed reorder recommendation for seasonal inventory', 'The eight-week pilot reduced priority stockouts while keeping excess inventory below the agreed threshold. Manager approval remains required for high-risk or unusual orders.', ?, ?, ?)`)
      .bind(JSON.stringify(['Warehouse requested that vendor lead-time overrides remain visible in the weekly audit.']), ownerId, now - 45 * day),
    database.prepare(`INSERT OR IGNORE INTO outcome_reviews
      (id, room_id, goal_achievement, evidence_quality, process_integrity, participation_health, execution, learning_value, verification_level, evidence_json, dissent_json, reviewed_at)
      VALUES ('demo-outcome-inventory', 'inventory-reorder', 9.1, 9.0, 8.8, 8.5, 8.9, 9.2, 'verified', ?, ?, ?)`)
      .bind(JSON.stringify(['Priority stockouts fell 37%', 'Excess inventory held at 4.9%', 'Manager overrides were recorded for 9% of recommendations']), JSON.stringify(['Continue monitoring vendor lead-time overrides.']), now - 18 * day),
    database.prepare(`UPDATE outcome_reviews SET evidence_json = ?, dissent_json = ?, verification_level = 'verified'
      WHERE id = 'outcome-onboarding'`).bind(
      JSON.stringify(['Median activation fell from 8.4 to 5.1 days', 'Rework declined 22%', 'Independent review covered 30 accounts']),
      JSON.stringify(['Specialist workload should be reviewed again after the next growth quarter.'])),
  ]);

  await database.batch([
    database.prepare(`INSERT OR IGNORE INTO agent_sessions
      (id, room_id, owner_user_id, agent_name, scopes_json, status, expires_at, last_seen_at, created_at)
      VALUES ('demo-agent-ops', 'ops-meeting', ?, 'Operations Codex', ?, 'active', ?, ?, ?)`)
      .bind(ownerId, JSON.stringify(['read_room', 'read_files', 'prepare_contributions', 'submit_requirements', 'request_approvals', 'prepare_change_sets']), now + 7 * day, now - day, now - 10 * day),
    database.prepare(`INSERT OR IGNORE INTO agent_work_sessions
      (id, agent_session_id, room_id, owner_user_id, status, started_at, last_activity_at, closed_at)
      VALUES ('demo-agent-work-ops', 'demo-agent-ops', 'ops-meeting', ?, 'closed', ?, ?, ?)`)
      .bind(ownerId, now - 4 * day, now - 3 * day, now - 3 * day),
    database.prepare(`INSERT OR IGNORE INTO agent_checkpoints
      (id, agent_session_id, work_session_id, room_id, owner_user_id, summary, assumptions_json, commitments_json, deferred_event_ids_json, created_at)
      VALUES ('demo-agent-checkpoint-ops', 'demo-agent-ops', 'demo-agent-work-ops', 'ops-meeting', ?, ?, ?, ?, '[]', ?)`)
      .bind(ownerId,
        'Reviewed the agenda audit and response-window trial, then prepared an escalation rule that keeps live calls limited to unresolved material conflict.',
        JSON.stringify(['The six-hour weekly cost baseline will be rechecked after the pilot.']),
        JSON.stringify(['Help the owner define the urgent-decision bypass before the final decision.']), now - 3 * day),
  ]);

  await database.batch([
    database.prepare(`INSERT OR IGNORE INTO change_sets
      (id, room_id, base_version, revision, title, summary, status, author_user_id, author_name, actor_path, agent_session_id, idempotency_key, created_at, updated_at, submitted_at)
      VALUES ('demo-changeset-ops', 'ops-meeting', 1, 1, 'Meeting replacement operating rules', 'Add the escalation threshold and urgent-decision bypass as explicit room criteria.', 'approved', ?, ?, 'webmcp', 'demo-agent-ops', 'demo-seed-ops-rules', ?, ?, ?)`)
      .bind(ownerId, ownerName, now - 3 * day, now - 2 * day, now - 3 * day),
    database.prepare(`INSERT OR IGNORE INTO change_set_changes
      (id, change_set_id, position, change_type, target_type, before_json, after_json)
      VALUES ('demo-change-ops-1', 'demo-changeset-ops', 0, 'add_deliberation_item', 'deliberation_item', 'null', ?)`)
      .bind(JSON.stringify({ item_type: 'criterion', title: 'A live meeting requires unresolved conflict', body: 'Missing status triggers a reminder; material conflict triggers a focused call.' })),
    database.prepare(`INSERT OR IGNORE INTO change_set_changes
      (id, change_set_id, position, change_type, target_type, before_json, after_json)
      VALUES ('demo-change-ops-2', 'demo-changeset-ops', 1, 'add_requirement', 'requirement', 'null', ?)`)
      .bind(JSON.stringify({ title: 'Define the urgent-decision bypass', description: 'List safety, legal, and staffing cases that bypass the async window.', owner_label: 'Marcus Reed' })),
    database.prepare(`INSERT OR IGNORE INTO change_set_reviews
      (id, change_set_id, reviewer_user_id, reviewer_name, verdict, body, reviewed_revision, created_at, updated_at)
      VALUES ('demo-review-ops-marcus', 'demo-changeset-ops', 'local-marcus', 'Marcus Reed', 'approve', 'The escalation threshold is sound; keep the urgent bypass explicit in the final operating rule.', 1, ?, ?)`)
      .bind(now - 2 * day, now - 2 * day),
  ]);

  const activity = [
    ['demo-event-ops-1', 'ops-meeting', 'local-sarah', 'Sarah Chen', 'human', 'requirement_accepted', 'requirement', 'req-ops-cost', 'Accepted the twelve-week meeting-cost baseline.', 2, now - 7 * day],
    ['demo-event-ops-2', 'ops-meeting', 'local-priya', 'Priya Shah', 'webmcp', 'requirement_submitted', 'requirement', 'demo-req-ops-response', 'Submitted the Friday response-window trial with eight supporting records.', 2, now - 5 * day],
    ['demo-event-ops-3', 'ops-meeting', ownerId, ownerName, 'webmcp', 'change_set_submitted', 'change_set', 'demo-changeset-ops', 'Submitted “Meeting replacement operating rules” for independent review.', 2, now - 3 * day],
    ['demo-event-ops-4', 'ops-meeting', 'local-marcus', 'Marcus Reed', 'human', 'change_set_approve', 'change_set', 'demo-changeset-ops', 'Approved “Meeting replacement operating rules” revision 1.', 2, now - 2 * day],
    ['demo-event-field-1', 'field-scheduling', 'local-priya', 'Priya Shah', 'webmcp', 'requirement_accepted', 'requirement', 'req-field-mobile', 'Completed and accepted the cross-device technician workflow test.', 2, now - 5 * day],
    ['demo-event-field-2', 'field-scheduling', 'local-sarah', 'Sarah Chen', 'webmcp', 'requirement_submitted', 'requirement', 'req-field-cost', 'Submitted the three-year total-cost comparison.', 2, now - 3 * day],
    ['demo-event-field-3', 'field-scheduling', 'local-marcus', 'Marcus Reed', 'human', 'critique_published', 'contribution', 'demo-field-objection', 'Requested explicit data-portability protection before contract approval.', 2, now - day],
    ['demo-event-refund-1', 'refund-policy', 'local-sarah', 'Sarah Chen', 'webmcp', 'evidence_published', 'contribution', 'demo-refund-analysis', 'Published the six-month exception-pattern analysis.', 2, now - 9 * day],
    ['demo-event-refund-2', 'refund-policy', ownerId, ownerName, 'webmcp', 'proposal_published', 'contribution', 'demo-refund-proposal', 'Prepared the tiered refund discretion pilot.', 3, now - 4 * day],
    ['demo-event-refund-3', 'refund-policy', 'local-marcus', 'Marcus Reed', 'human', 'objection_published', 'deliberation_item', 'demo-item-refund-objection', 'Raised a material fairness-review objection.', 3, now - 2 * day],
    ['demo-event-refund-4', 'refund-policy', 'local-sarah', 'Sarah Chen', 'webmcp', 'criterion_accepted', 'deliberation_item', 'demo-item-refund-criterion', 'Added an accepted weekly fairness sample criterion.', 4, now - day],
    ['demo-event-onboarding-1', 'onboarding-owner', ownerId, ownerName, 'human', 'decision_recorded', 'decision', 'decision-onboarding', 'Assigned one accountable onboarding owner from agreement through activation.', 5, now - 60 * day],
    ['demo-event-onboarding-2', 'onboarding-owner', 'local-marcus', 'Marcus Reed', 'human', 'outcome_reviewed', 'outcome_review', 'outcome-onboarding', 'Verified the 30-account onboarding outcome review.', 6, now - 20 * day],
    ['demo-event-inventory-1', 'inventory-reorder', ownerId, ownerName, 'webmcp', 'proposal_published', 'contribution', 'demo-inventory-rule', 'Prepared the guardrailed seasonal reorder recommendation.', 3, now - 62 * day],
    ['demo-event-inventory-2', 'inventory-reorder', ownerId, ownerName, 'human', 'decision_recorded', 'decision', 'demo-decision-inventory', 'Adopted the guardrailed reorder recommendation.', 6, now - 45 * day],
    ['demo-event-inventory-3', 'inventory-reorder', 'local-marcus', 'Marcus Reed', 'human', 'outcome_reviewed', 'outcome_review', 'demo-outcome-inventory', 'Verified the eight-week inventory outcome.', 7, now - 18 * day],
  ];
  await runBatches(database, activity.map((item) => database.prepare(`INSERT OR IGNORE INTO activity_events
    (id, room_id, actor_user_id, actor_name, actor_path, action, object_type, object_id, summary, room_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(...item)), 'activity');

  await database.batch([
    database.prepare("UPDATE rooms SET version = MAX(version, 2), deadline_at = ?, outcome_review_at = ?, updated_at = ? WHERE id = 'webmcp-first-use-case'").bind(now + 5 * day, now + 35 * day, now - day),
    database.prepare("UPDATE rooms SET version = MAX(version, 2), deadline_at = ?, outcome_review_at = ?, updated_at = ? WHERE id = 'ops-meeting'").bind(now + 2 * day, now + 32 * day, now - day),
    database.prepare("UPDATE rooms SET version = MAX(version, 2), deadline_at = ?, outcome_review_at = ?, updated_at = ? WHERE id = 'field-scheduling'").bind(now + 8 * day, now + 38 * day, now - day),
    database.prepare("UPDATE rooms SET version = MAX(version, 4), deadline_at = ?, outcome_review_at = ?, updated_at = ? WHERE id = 'refund-policy'").bind(now + 4 * day, now + 64 * day, now - day),
    database.prepare("UPDATE rooms SET version = MAX(version, 6), meeting_avoided = 1, updated_at = ? WHERE id = 'onboarding-owner'").bind(now - 20 * day),
    database.prepare("UPDATE requirements SET due_at = ? WHERE id IN ('demo-req-ops-bypass', 'req-ops-risk', 'req-ops-team')").bind(now + day),
    database.prepare("UPDATE requirements SET due_at = ? WHERE id = 'demo-req-field-export'").bind(now + 3 * day),
    database.prepare("UPDATE requirements SET due_at = ? WHERE id = 'demo-req-field-pilot'").bind(now + 5 * day),
    database.prepare("UPDATE requirements SET due_at = ? WHERE id = 'demo-req-refund-fairness'").bind(now + day),
    database.prepare("UPDATE requirements SET due_at = ? WHERE id = 'demo-req-refund-owner'").bind(now + 2 * day),
    database.prepare("UPDATE agent_sessions SET expires_at = ?, last_seen_at = ? WHERE id = 'demo-agent-ops'").bind(now + 7 * day, now - day),
  ]);
}
