import { env } from 'cloudflare:workers';
import { ensurePolishedDemoHistory } from './commonwork-demo-seed';

export type CommonworkUser = {
  userId: string;
  displayName: string;
  email: string;
  isAnonymous?: boolean;
};

type RoomDraftInput = {
  title: string;
  problem: string;
  desiredOutcome: string;
  governanceModel: string;
  decisionAuthority?: string;
  deadlineAt?: number | null;
  successCriteria?: string[];
  actorPath?: 'human' | 'webmcp';
};

type ContributionInput = {
  roomId: string;
  type: 'evidence' | 'proposal' | 'critique' | 'question';
  title: string;
  body: string;
  sourceCount?: number;
  actorPath?: 'human' | 'webmcp';
};

const WORKSPACE_ID = 'commonwork-demo';
const PUBLIC_DEMO_ROOM_IDS = ['webmcp-first-use-case', 'ops-meeting', 'field-scheduling', 'onboarding-owner', 'refund-policy', 'inventory-reorder'];

function db() {
  if (!env.DB) throw new Error('Socialsum database is unavailable.');
  return env.DB;
}

function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function parseJson<T>(value: unknown, fallback: T): T {
  if (typeof value !== 'string') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

async function ensureColumn(table: string, column: string, definition: string) {
  const result = await db().prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
  if (!result.results.some((item) => item.name === column)) {
    try {
      await db().prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    } catch (error) {
      if (!(error instanceof Error) || !error.message.toLowerCase().includes('duplicate column')) throw error;
    }
  }
}

export async function ensureCommonworkData(user: CommonworkUser) {
  const d1 = db();
  const seedUser = user.isAnonymous
    ? { userId: 'socialsum-demo-owner', displayName: 'Socialsum Demo Owner', email: 'owner@socialsum.local' }
    : user;
  const statements = [
    `CREATE TABLE IF NOT EXISTS workspaces (
      id TEXT PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      owner_user_id TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS rooms (
      id TEXT PRIMARY KEY NOT NULL,
      workspace_id TEXT NOT NULL,
      title TEXT NOT NULL,
      problem TEXT NOT NULL,
      desired_outcome TEXT NOT NULL DEFAULT '',
      governance_model TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'invite_only',
      decision_authority TEXT NOT NULL,
      constitution_json TEXT NOT NULL,
      success_criteria_json TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft',
      current_phase INTEGER NOT NULL DEFAULT 0,
      deadline_at INTEGER,
      outcome_review_at INTEGER,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS memberships (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
      display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'contributor',
      constitution_accepted_at INTEGER,
      joined_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS room_invitations (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      invited_email TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'contributor',
      status TEXT NOT NULL DEFAULT 'pending',
      invited_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      accepted_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS phases (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming',
      starts_at INTEGER,
      ends_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS requirements (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      owner_label TEXT NOT NULL,
      owner_user_id TEXT,
      kind TEXT NOT NULL DEFAULT 'input',
      required INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'open',
      due_at INTEGER,
      contribution_id TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS contributions (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      author_user_id TEXT NOT NULL,
      author_name TEXT NOT NULL DEFAULT 'Participant',
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      visibility TEXT NOT NULL DEFAULT 'private_draft',
      prepared_with_agent INTEGER NOT NULL DEFAULT 0,
      source_count INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      published_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS attachments (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      contribution_id TEXT,
      uploaded_by TEXT NOT NULL,
      uploaded_by_name TEXT NOT NULL,
      filename TEXT NOT NULL,
      content_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      r2_key TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ready',
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS decisions (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      rationale TEXT NOT NULL,
      dissent_json TEXT NOT NULL DEFAULT '[]',
      decided_by TEXT NOT NULL,
      decided_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS outcome_reviews (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      goal_achievement REAL,
      evidence_quality REAL,
      process_integrity REAL,
      participation_health REAL,
      execution REAL,
      learning_value REAL,
      verification_level TEXT NOT NULL DEFAULT 'unreviewed',
      evidence_json TEXT NOT NULL DEFAULT '[]',
      dissent_json TEXT NOT NULL DEFAULT '[]',
      reviewed_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS activity_events (
      id TEXT PRIMARY KEY NOT NULL,
      room_id TEXT NOT NULL,
      actor_user_id TEXT NOT NULL,
      actor_name TEXT NOT NULL DEFAULT 'Participant',
      actor_path TEXT NOT NULL DEFAULT 'human',
      action TEXT NOT NULL,
      object_type TEXT NOT NULL,
      object_id TEXT NOT NULL,
      summary TEXT NOT NULL,
      room_version INTEGER,
      created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS agent_sessions (
      id TEXT PRIMARY KEY NOT NULL, room_id TEXT NOT NULL, owner_user_id TEXT NOT NULL, agent_name TEXT NOT NULL,
      scopes_json TEXT NOT NULL DEFAULT '[]', status TEXT NOT NULL DEFAULT 'active', expires_at INTEGER NOT NULL,
      last_seen_at INTEGER, created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS agent_work_sessions (
      id TEXT PRIMARY KEY NOT NULL, agent_session_id TEXT NOT NULL, room_id TEXT NOT NULL, owner_user_id TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'active', previous_checkpoint_id TEXT, started_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL, closed_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS agent_event_receipts (
      id TEXT PRIMARY KEY NOT NULL, agent_session_id TEXT NOT NULL, work_session_id TEXT NOT NULL, event_id TEXT NOT NULL,
      state TEXT NOT NULL DEFAULT 'delivered', delivered_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS agent_checkpoints (
      id TEXT PRIMARY KEY NOT NULL, agent_session_id TEXT NOT NULL, work_session_id TEXT NOT NULL, room_id TEXT NOT NULL,
      owner_user_id TEXT NOT NULL, acknowledged_through_event_id TEXT, acknowledged_through_at INTEGER,
      summary TEXT NOT NULL, assumptions_json TEXT NOT NULL DEFAULT '[]', commitments_json TEXT NOT NULL DEFAULT '[]',
      deferred_event_ids_json TEXT NOT NULL DEFAULT '[]', created_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS deliberation_items (
      id TEXT PRIMARY KEY NOT NULL, room_id TEXT NOT NULL, author_user_id TEXT NOT NULL, author_name TEXT NOT NULL,
      item_type TEXT NOT NULL, title TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open',
      visibility TEXT NOT NULL DEFAULT 'published', related_item_id TEXT, source_count INTEGER NOT NULL DEFAULT 0,
      actor_path TEXT NOT NULL DEFAULT 'human', created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, idempotency_key TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY NOT NULL, room_id TEXT NOT NULL, requested_by TEXT NOT NULL, requested_by_name TEXT NOT NULL,
      agent_session_id TEXT, action_type TEXT NOT NULL, payload_json TEXT NOT NULL DEFAULT '{}', rationale TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending', resolved_by TEXT, resolved_at INTEGER, created_at INTEGER NOT NULL, idempotency_key TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS reminders (
      id TEXT PRIMARY KEY NOT NULL, room_id TEXT NOT NULL, requirement_id TEXT, recipient_user_id TEXT,
      kind TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'scheduled', due_at INTEGER NOT NULL, created_at INTEGER NOT NULL, sent_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS change_sets (
      id TEXT PRIMARY KEY NOT NULL, room_id TEXT NOT NULL, base_version INTEGER NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      title TEXT NOT NULL, summary TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', author_user_id TEXT NOT NULL,
      author_name TEXT NOT NULL, actor_path TEXT NOT NULL DEFAULT 'human', agent_session_id TEXT, idempotency_key TEXT,
      created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, submitted_at INTEGER, adopted_at INTEGER, adopted_by TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS change_set_changes (
      id TEXT PRIMARY KEY NOT NULL, change_set_id TEXT NOT NULL, position INTEGER NOT NULL, change_type TEXT NOT NULL,
      target_type TEXT NOT NULL, target_id TEXT, field_name TEXT, before_json TEXT NOT NULL DEFAULT 'null', after_json TEXT NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS change_set_reviews (
      id TEXT PRIMARY KEY NOT NULL, change_set_id TEXT NOT NULL, reviewer_user_id TEXT NOT NULL, reviewer_name TEXT NOT NULL,
      verdict TEXT NOT NULL, body TEXT NOT NULL DEFAULT '', reviewed_revision INTEGER NOT NULL, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS change_set_threads (
      id TEXT PRIMARY KEY NOT NULL, change_set_id TEXT NOT NULL, change_id TEXT, author_user_id TEXT NOT NULL,
      author_name TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', created_at INTEGER NOT NULL,
      resolved_at INTEGER, resolved_by TEXT
    )`,
  ];
  await d1.batch(statements.map((sql) => d1.prepare(sql)));

  await ensureColumn('rooms', 'desired_outcome', "TEXT NOT NULL DEFAULT ''");
  await ensureColumn('contributions', 'author_name', "TEXT NOT NULL DEFAULT 'Participant'");
  await ensureColumn('activity_events', 'actor_name', "TEXT NOT NULL DEFAULT 'Participant'");
  await ensureColumn('activity_events', 'room_version', 'INTEGER');
  await ensureColumn('rooms', 'version', 'INTEGER NOT NULL DEFAULT 1');
  await ensureColumn('rooms', 'meeting_avoided', 'INTEGER NOT NULL DEFAULT 0');

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_rooms_workspace_status ON rooms(workspace_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_rooms_deadline ON rooms(deadline_at)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_memberships_room_user ON memberships(room_id, user_id)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_invitations_room_email ON room_invitations(room_id, invited_email)',
    'CREATE INDEX IF NOT EXISTS idx_invitations_email_status ON room_invitations(invited_email, status)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_phases_room_position ON phases(room_id, position)',
    'CREATE INDEX IF NOT EXISTS idx_requirements_room_status ON requirements(room_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_contributions_room_visibility ON contributions(room_id, visibility)',
    'CREATE INDEX IF NOT EXISTS idx_attachments_room_created ON attachments(room_id, created_at)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_attachments_r2_key ON attachments(r2_key)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_decisions_room ON decisions(room_id)',
    'CREATE INDEX IF NOT EXISTS idx_activity_room_created ON activity_events(room_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_agent_sessions_room_status ON agent_sessions(room_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_agent_work_sessions_agent_status ON agent_work_sessions(agent_session_id, status)',
    'CREATE INDEX IF NOT EXISTS idx_agent_work_sessions_room_started ON agent_work_sessions(room_id, started_at)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_event_receipts_work_event ON agent_event_receipts(work_session_id, event_id)',
    'CREATE INDEX IF NOT EXISTS idx_agent_event_receipts_work_state ON agent_event_receipts(work_session_id, state)',
    'CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_agent_created ON agent_checkpoints(agent_session_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_agent_checkpoints_room_created ON agent_checkpoints(room_id, created_at)',
    'CREATE INDEX IF NOT EXISTS idx_deliberation_room_type_status ON deliberation_items(room_id, item_type, status)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_deliberation_room_idempotency ON deliberation_items(room_id, idempotency_key) WHERE idempotency_key IS NOT NULL',
    'CREATE INDEX IF NOT EXISTS idx_approvals_room_status ON approval_requests(room_id, status)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_approvals_room_idempotency ON approval_requests(room_id, idempotency_key) WHERE idempotency_key IS NOT NULL',
    'CREATE INDEX IF NOT EXISTS idx_reminders_room_due ON reminders(room_id, due_at)',
    'CREATE INDEX IF NOT EXISTS idx_change_sets_room_status ON change_sets(room_id, status)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_change_sets_room_idempotency ON change_sets(room_id, idempotency_key) WHERE idempotency_key IS NOT NULL',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_change_set_changes_position ON change_set_changes(change_set_id, position)',
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_change_set_reviews_reviewer_revision ON change_set_reviews(change_set_id, reviewer_user_id, reviewed_revision)',
    'CREATE INDEX IF NOT EXISTS idx_change_set_threads_status ON change_set_threads(change_set_id, status)',
  ];
  await d1.batch(indexes.map((sql) => d1.prepare(sql)));

  const roomCount = await d1.prepare('SELECT COUNT(*) AS count FROM rooms').first<{ count: number }>();
  if (!roomCount?.count) await seedDemoWorkspace(seedUser);
  await ensureDemoCollaboration(seedUser);
  await ensurePolishedDemoHistory(d1, seedUser);
  await d1.batch([
    d1.prepare("UPDATE workspaces SET name = 'Socialsum lab' WHERE id = ?").bind(WORKSPACE_ID),
    d1.prepare("UPDATE rooms SET title = ? WHERE id = 'webmcp-first-use-case'").bind("Choose Socialsum's first WebMCP use case"),
  ]);
  if (user.isAnonymous) {
    const now = Date.now();
    await d1.batch(PUBLIC_DEMO_ROOM_IDS.map((roomId) => d1.prepare(`INSERT OR IGNORE INTO memberships
      (id, room_id, user_id, display_name, role, constitution_accepted_at, joined_at)
      SELECT ?, id, ?, ?, 'viewer', ?, ? FROM rooms WHERE id = ?`)
      .bind(`public-viewer-${roomId}`, user.userId, user.displayName, now, now, roomId)));
  }
  await d1.prepare('PRAGMA optimize').run();
}

async function ensureDemoCollaboration(user: CommonworkUser) {
  const d1 = db();
  const now = Date.now();
  const membershipsToSeed = [
    ['demo-member-webmcp-sarah', 'webmcp-first-use-case', 'local-sarah', 'Sarah Chen', 'facilitator'],
    ['demo-member-webmcp-marcus', 'webmcp-first-use-case', 'local-marcus', 'Marcus Reed', 'reviewer'],
    ['demo-member-ops-sarah', 'ops-meeting', 'local-sarah', 'Sarah Chen', 'contributor'],
    ['demo-member-field-marcus', 'field-scheduling', 'local-marcus', 'Marcus Reed', 'reviewer'],
  ];
  await d1.batch(membershipsToSeed.map((item) => d1.prepare(`INSERT OR IGNORE INTO memberships
    (id, room_id, user_id, display_name, role, constitution_accepted_at, joined_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(item[0], item[1], item[2], item[3], item[4], now, now)));
  await d1.prepare(`INSERT OR IGNORE INTO room_invitations
    (id, room_id, invited_email, role, status, invited_by, created_at)
    VALUES ('demo-invite-priya', 'webmcp-first-use-case', 'priya@local.test', 'contributor', 'pending', ?, ?)`)
    .bind(user.userId, now).run();
  await d1.prepare(`UPDATE requirements SET owner_user_id = 'local-sarah', owner_label = 'Sarah Chen'
    WHERE id = 'req-webmcp-workflow' AND owner_user_id IS NULL`).run();
  await d1.prepare(`UPDATE requirements SET owner_user_id = 'local-marcus', owner_label = 'Marcus Reed'
    WHERE id = 'req-webmcp-demo' AND owner_user_id IS NULL`).run();
  await d1.batch([
    d1.prepare(`INSERT OR IGNORE INTO agent_sessions
      (id, room_id, owner_user_id, agent_name, scopes_json, status, expires_at, last_seen_at, created_at)
      VALUES ('demo-agent-jonathan', 'webmcp-first-use-case', ?, 'Jonathan’s Codex', ?, 'active', ?, ?, ?)`)
      .bind(user.userId, JSON.stringify(['read_room', 'read_files', 'prepare_contributions', 'submit_requirements', 'request_approvals', 'prepare_change_sets']), now + 7 * 86_400_000, now, now),
    d1.prepare(`INSERT OR IGNORE INTO deliberation_items
      (id, room_id, author_user_id, author_name, item_type, title, body, status, visibility, source_count, actor_path, created_at, updated_at)
      VALUES ('demo-criterion-webmcp', 'webmcp-first-use-case', 'local-jonathan', 'Jonathan Ferrell', 'criterion', 'WebMCP must be essential', 'The workflow must become meaningfully worse if the agent cannot inspect and prepare work against the live shared state.', 'accepted', 'published', 0, 'human', ?, ?)`)
      .bind(now, now),
    d1.prepare(`INSERT OR IGNORE INTO deliberation_items
      (id, room_id, author_user_id, author_name, item_type, title, body, status, visibility, source_count, actor_path, created_at, updated_at)
      VALUES ('demo-proposal-meeting', 'webmcp-first-use-case', 'local-sarah', 'Sarah Chen', 'proposal', 'Replace a recurring decision meeting', 'Use a five-day room with assigned inputs, agent-prepared evidence, and a human final decision.', 'open', 'published', 2, 'webmcp', ?, ?)`)
      .bind(now, now),
    d1.prepare(`INSERT OR IGNORE INTO deliberation_items
      (id, room_id, author_user_id, author_name, item_type, title, body, status, visibility, related_item_id, source_count, actor_path, created_at, updated_at)
      VALUES ('demo-objection-adoption', 'webmcp-first-use-case', 'local-marcus', 'Marcus Reed', 'objection', 'Adoption may recreate the meeting in comments', 'The workflow needs deadlines, concise input contracts, and escalation rules or it will become another noisy channel.', 'open', 'published', 'demo-proposal-meeting', 1, 'human', ?, ?)`)
      .bind(now, now),
    d1.prepare(`INSERT OR IGNORE INTO reminders
      (id, room_id, requirement_id, recipient_user_id, kind, status, due_at, created_at)
      VALUES ('demo-reminder-workflow', 'webmcp-first-use-case', 'req-webmcp-workflow', 'local-sarah', 'input_due', 'scheduled', ?, ?)`)
      .bind(now + 86_400_000, now),
  ]);
  await d1.prepare(`UPDATE agent_sessions SET scopes_json = ?, expires_at = CASE WHEN expires_at < ? THEN ? ELSE expires_at END
    WHERE id = 'demo-agent-jonathan'`).bind(
      JSON.stringify(['read_room', 'read_files', 'prepare_contributions', 'submit_requirements', 'request_approvals', 'prepare_change_sets']),
      now, now + 7 * 86_400_000,
    ).run();
}

async function seedDemoWorkspace(user: CommonworkUser) {
  const d1 = db();
  const now = Date.now();
  const day = 86_400_000;
  const rooms = [
    {
      id: 'webmcp-first-use-case',
      title: "Choose Socialsum's first WebMCP use case",
      problem: 'Which initial workflow will best prove that people and their own agents can make a consequential decision together?',
      desired: 'Select one buildable use case with a target user, required evidence, WebMCP actions, and pilot success measures.',
      model: 'Decision room',
      status: 'active',
      phase: 1,
      deadline: now + 5 * day,
      criteria: ['Compelling human-agent collaboration', 'Painful real-world problem', 'Demoable in under three minutes', 'Buildable and testable during the hackathon'],
    },
    {
      id: 'ops-meeting',
      title: 'Replace the weekly operations meeting',
      problem: 'Can an asynchronous decision room save four hours a week without losing accountability?',
      desired: 'Run operations decisions asynchronously and reserve meetings for unresolved conflict.',
      model: 'Decision room',
      status: 'active',
      phase: 2,
      deadline: now + day,
      criteria: ['Save four meeting hours weekly', 'Keep 90% of assigned actions on time'],
    },
    {
      id: 'field-scheduling',
      title: 'Choose a field scheduling system',
      problem: 'Which platform best fits dispatch, technicians, and billing before the fall season?',
      desired: 'Select and pilot one system with explicit migration and cost assumptions.',
      model: 'Technical RFC',
      status: 'active',
      phase: 2,
      deadline: now + 9 * day,
      criteria: ['Mobile workflow tested', 'Integration costs verified', 'Migration owner named'],
    },
    {
      id: 'onboarding-owner',
      title: 'Move customer onboarding to a single owner',
      problem: 'Would one accountable owner reduce onboarding time without creating a bottleneck?',
      desired: 'Reduce activation time below six days.',
      model: 'Decision room',
      status: 'closed',
      phase: 4,
      deadline: now - 60 * day,
      criteria: ['Activation below six days', 'No increase in unresolved handoffs'],
    },
  ];

  const statements: D1PreparedStatement[] = [
    d1.prepare('INSERT OR IGNORE INTO workspaces (id, name, owner_user_id, created_at) VALUES (?, ?, ?, ?)')
      .bind(WORKSPACE_ID, 'Socialsum lab', user.userId, now),
  ];
  for (const room of rooms) {
    statements.push(
      d1.prepare(`INSERT OR IGNORE INTO rooms
        (id, workspace_id, title, problem, desired_outcome, governance_model, visibility, decision_authority, constitution_json, success_criteria_json, status, current_phase, deadline_at, outcome_review_at, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'invite_only', 'Room owner after required input', ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(
          room.id, WORKSPACE_ID, room.title, room.problem, room.desired, room.model,
          JSON.stringify({
            participation: 'Invite-only · two focused contributions',
            evidence: 'Sources, direct observations, or labeled assumptions',
            agentPolicy: 'Agents may research and draft; humans approve publication and decisions',
            redTeam: 'One independent reviewer before decision',
          }),
          JSON.stringify(room.criteria), room.status, room.phase, room.deadline,
          room.status === 'closed' ? now - 30 * day : room.deadline + 30 * day,
          user.userId, now - 2 * day, now,
        ),
    );
    statements.push(
      d1.prepare(`INSERT OR IGNORE INTO memberships
        (id, room_id, user_id, display_name, role, constitution_accepted_at, joined_at)
        VALUES (?, ?, ?, ?, 'owner', ?, ?)`)
        .bind(`member-${room.id}-owner`, room.id, user.userId, user.displayName, now, now),
    );
    const phaseNames = room.model === 'Technical RFC'
      ? ['Frame', 'Collect options', 'Technical review', 'Resolve objections', 'Decide']
      : ['Frame', 'Collect input', 'Resolve gaps', 'Decide', 'Review outcome'];
    phaseNames.forEach((name, position) => {
      statements.push(
        d1.prepare(`INSERT OR IGNORE INTO phases (id, room_id, position, name, status, starts_at, ends_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .bind(`phase-${room.id}-${position}`, room.id, position, name,
            position < room.phase ? 'complete' : position === room.phase ? 'current' : 'upcoming',
            now + (position - room.phase) * day, now + (position - room.phase + 1) * day),
      );
    });
  }
  await d1.batch(statements);

  const requirements = [
    ['req-webmcp-user', 'webmcp-first-use-case', 'Name the first target user', 'Define the person with the most painful coordination problem.', 'Product lead', 'open'],
    ['req-webmcp-workflow', 'webmcp-first-use-case', 'Map the human-agent workflow', 'Show what the person sees and which actions their agent performs through WebMCP.', 'Experience design', 'open'],
    ['req-webmcp-demo', 'webmcp-first-use-case', 'Prove hackathon feasibility', 'Estimate scope and identify the smallest credible end-to-end demo.', 'Engineering', 'open'],
    ['req-webmcp-metric', 'webmcp-first-use-case', 'Define success measures', 'Specify adoption, time saved, decision quality, and trust signals.', 'Room owner', 'open'],
    ['req-ops-cost', 'ops-meeting', 'Meeting cost baseline', 'Confirm recurring meeting hours and participant cost.', 'Finance', 'accepted'],
    ['req-ops-risk', 'ops-meeting', 'Escalation risks', 'Identify decisions that still require synchronous discussion.', 'Operations', 'open'],
    ['req-ops-team', 'ops-meeting', 'Team readiness', 'Confirm owners can respond during the input window.', 'People lead', 'open'],
    ['req-field-mobile', 'field-scheduling', 'Technician mobile test', 'Test core jobs on two representative devices.', 'Field team', 'accepted'],
    ['req-field-cost', 'field-scheduling', 'Three-year cost', 'Verify licenses, implementation, and migration costs.', 'Finance', 'submitted'],
  ];
  await d1.batch(requirements.map((item) =>
    d1.prepare(`INSERT OR IGNORE INTO requirements
      (id, room_id, title, description, owner_label, kind, required, status, due_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'input', 1, ?, ?, ?, ?)`)
      .bind(item[0], item[1], item[2], item[3], item[4], item[5], now + 3 * day, now, now),
  ));

  const contributions = [
    ['contrib-ops-audit', 'ops-meeting', 'evidence', 'Meeting audit: 47% of agenda time produced no action', 'Three months of notes show that status updates and repeated context consume nearly half of the meeting.', 'published', 12],
    ['contrib-ops-proposal', 'ops-meeting', 'proposal', 'Five-day asynchronous input window', 'Escalate only unresolved conflicts to a focused 20-minute call.', 'published', 4],
    ['contrib-field-cost', 'field-scheduling', 'evidence', 'Cost model for three finalists', 'The lowest license price is not the lowest three-year cost once migration and integrations are included.', 'published', 7],
    ['contrib-webmcp-question', 'webmcp-first-use-case', 'question', 'What must WebMCP uniquely enable?', 'The winning use case should fail or become meaningfully worse if the agent cannot see and act on the same live workspace as the person.', 'published', 0],
  ];
  await d1.batch(contributions.map((item) =>
    d1.prepare(`INSERT OR IGNORE INTO contributions
      (id, room_id, author_user_id, author_name, type, title, body, visibility, prepared_with_agent, source_count, created_at, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`)
      .bind(item[0], item[1], user.userId, user.displayName, item[2], item[3], item[4], item[5], item[6], now - day, now - day),
  ));

  await d1.batch([
    d1.prepare(`INSERT OR IGNORE INTO decisions (id, room_id, summary, rationale, dissent_json, decided_by, decided_at)
      VALUES ('decision-onboarding', 'onboarding-owner', 'Assign one onboarding owner from signed agreement through activation', 'A single owner removed repeated handoffs while keeping specialist reviews explicit.', '[]', ?, ?)`)
      .bind(user.userId, now - 60 * day),
    d1.prepare(`INSERT OR IGNORE INTO outcome_reviews
      (id, room_id, goal_achievement, evidence_quality, process_integrity, participation_health, execution, learning_value, verification_level, evidence_json, dissent_json, reviewed_at)
      VALUES ('outcome-onboarding', 'onboarding-owner', 9.2, 8.6, 8.7, 8.1, 9.0, 8.4, 'verified', ?, '[]', ?)`)
      .bind(JSON.stringify(['Activation time fell from 8.4 to 5.1 days']), now - day),
  ]);

  await recordActivity({
    roomId: 'webmcp-first-use-case', user, actorPath: 'webmcp', action: 'room_created',
    objectType: 'room', objectId: 'webmcp-first-use-case',
    summary: 'Agent prepared the room constitution; Jonathan saved the draft for review.',
  });
}

async function getMembership(roomId: string, userId: string) {
  return db().prepare('SELECT * FROM memberships WHERE room_id = ? AND user_id = ?')
    .bind(roomId, userId).first<Record<string, unknown>>();
}

async function requireMembership(roomId: string, user: CommonworkUser) {
  const membership = await getMembership(roomId, user.userId);
  if (!membership) throw new Error('You are not a participant in this room.');
  return membership;
}

async function requireRoomRole(roomId: string, user: CommonworkUser, allowed: string[]) {
  const membership = await requireMembership(roomId, user);
  if (!allowed.includes(String(membership.role))) {
    throw new Error(`This action requires one of these room roles: ${allowed.join(', ')}.`);
  }
  return membership;
}

export const governanceTemplates = [
  { id: 'operating-decision', name: 'Operating decision', model: 'Decision room', bestFor: 'Cross-functional choices with one accountable owner', phases: ['Frame', 'Collect input', 'Resolve gaps', 'Decide', 'Review outcome'], safeguards: ['Named authority', 'Required cross-functional input', 'Outcome review'] },
  { id: 'technical-rfc', name: 'Technical RFC', model: 'Technical RFC', bestFor: 'Architecture, vendor, and implementation choices', phases: ['Frame', 'Collect options', 'Technical review', 'Resolve objections', 'Decide'], safeguards: ['Alternatives required', 'Independent technical critique', 'Migration assumptions'] },
  { id: 'incident-review', name: 'Incident review', model: 'Investigation', bestFor: 'Learning from failures without blame', phases: ['Stabilize', 'Build timeline', 'Find contributing factors', 'Choose actions', 'Verify prevention'], safeguards: ['Evidence before conclusions', 'System factors', 'Assigned follow-ups'] },
  { id: 'consent-workshop', name: 'Consent workshop', model: 'Consent workshop', bestFor: 'Community or policy changes with material objections', phases: ['Frame', 'Hear perspectives', 'Form proposal', 'Test objections', 'Consent'], safeguards: ['Objections are explicit', 'Minority report retained', 'Revisit date'] },
  { id: 'meeting-replacement', name: 'Replace a decision meeting', model: 'Decision room', bestFor: 'Recurring meetings that collect status, evidence, and approvals', phases: ['Frame asynchronously', 'Collect owner input', 'Resolve only conflicts', 'Decide', 'Measure time saved'], safeguards: ['Response deadlines', 'Escalation threshold', 'Meeting avoided metric'] },
];

async function assertRoomVersion(roomId: string, expectedVersion?: number) {
  const room = await db().prepare('SELECT version FROM rooms WHERE id = ?').bind(roomId).first<{ version: number }>();
  if (!room) throw new Error('Room not found.');
  if (expectedVersion !== undefined && room.version !== expectedVersion) throw new Error(`ROOM_VERSION_CONFLICT: expected ${expectedVersion}, current ${room.version}.`);
  return room.version;
}

async function bumpRoomVersion(roomId: string) {
  await db().prepare('UPDATE rooms SET version = version + 1, updated_at = ? WHERE id = ?').bind(Date.now(), roomId).run();
}

export async function getWorkspace(user: CommonworkUser, localTesting = false) {
  await ensureCommonworkData(user);
  const d1 = db();
  const rooms = await d1.prepare(`SELECT r.*,
      my.role AS current_user_role,
      (SELECT COUNT(*) FROM memberships m WHERE m.room_id = r.id) AS people_count,
      (SELECT COUNT(*) FROM requirements q WHERE q.room_id = r.id AND q.required = 1) AS requirement_count,
      (SELECT COUNT(*) FROM requirements q WHERE q.room_id = r.id AND q.required = 1 AND q.status = 'accepted') AS accepted_count,
      (SELECT COUNT(*) FROM contributions c WHERE c.room_id = r.id AND c.visibility = 'published') AS published_count,
      (SELECT COUNT(*) FROM contributions c WHERE c.room_id = r.id AND c.visibility = 'private_draft' AND c.author_user_id = ?) AS private_draft_count
    FROM rooms r
    JOIN memberships my ON my.room_id = r.id AND my.user_id = ?
    WHERE r.workspace_id = ?
    ORDER BY CASE r.status WHEN 'active' THEN 0 WHEN 'draft' THEN 1 ELSE 2 END, r.deadline_at ASC`)
    .bind(user.userId, user.userId, WORKSPACE_ID).all<Record<string, unknown>>();
  const activity = await d1.prepare(`SELECT a.*, r.title AS room_title
    FROM activity_events a JOIN rooms r ON r.id = a.room_id
    JOIN memberships m ON m.room_id = r.id AND m.user_id = ?
    ORDER BY a.created_at DESC LIMIT 12`).bind(user.userId).all<Record<string, unknown>>();
  const outcomes = await d1.prepare(`SELECT o.*, r.title, r.governance_model
    FROM outcome_reviews o JOIN rooms r ON r.id = o.room_id
    JOIN memberships m ON m.room_id = r.id AND m.user_id = ?
    ORDER BY o.reviewed_at DESC LIMIT 6`).bind(user.userId).all<Record<string, unknown>>();
  const invitations = await d1.prepare(`SELECT i.*, r.title AS room_title
    FROM room_invitations i JOIN rooms r ON r.id = i.room_id
    WHERE lower(i.invited_email) = lower(?) AND i.status = 'pending'
    ORDER BY i.created_at DESC`).bind(user.email).all<Record<string, unknown>>();
  return {
    workspace: { id: WORKSPACE_ID, name: 'Socialsum lab' },
    user,
    localTesting,
    rooms: rooms.results.map(serializeRoom),
    activity: activity.results,
    outcomes: outcomes.results.map((outcome) => ({
      ...outcome,
      overallScore: averageScore(outcome),
      evidence: parseJson(outcome.evidence_json, []),
    })),
    invitations: invitations.results,
  };
}

export async function getRoom(roomId: string, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const d1 = db();
  const room = await d1.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first<Record<string, unknown>>();
  if (!room) return null;
  const membership = await requireMembership(roomId, user);
  const [phases, requirements, published, drafts, members, invitations, attachments, activity, decision, outcomeReview, agentSessions, deliberationItems, approvals, reminders] = await Promise.all([
    d1.prepare('SELECT * FROM phases WHERE room_id = ? ORDER BY position').bind(roomId).all(),
    d1.prepare('SELECT * FROM requirements WHERE room_id = ? ORDER BY required DESC, due_at').bind(roomId).all(),
    d1.prepare("SELECT * FROM contributions WHERE room_id = ? AND visibility = 'published' ORDER BY created_at DESC").bind(roomId).all(),
    d1.prepare("SELECT * FROM contributions WHERE room_id = ? AND visibility = 'private_draft' AND author_user_id = ? ORDER BY created_at DESC").bind(roomId, user.userId).all(),
    d1.prepare('SELECT * FROM memberships WHERE room_id = ? ORDER BY joined_at').bind(roomId).all(),
    d1.prepare("SELECT id, invited_email, role, status, created_at FROM room_invitations WHERE room_id = ? AND status = 'pending' ORDER BY created_at DESC").bind(roomId).all(),
    d1.prepare('SELECT id, room_id, contribution_id, uploaded_by, uploaded_by_name, filename, content_type, size_bytes, status, created_at FROM attachments WHERE room_id = ? ORDER BY created_at DESC').bind(roomId).all(),
    d1.prepare('SELECT * FROM activity_events WHERE room_id = ? ORDER BY created_at DESC LIMIT 30').bind(roomId).all(),
    d1.prepare('SELECT * FROM decisions WHERE room_id = ?').bind(roomId).first<Record<string, unknown>>(),
    d1.prepare('SELECT * FROM outcome_reviews WHERE room_id = ? ORDER BY reviewed_at DESC LIMIT 1').bind(roomId).first<Record<string, unknown>>(),
    d1.prepare("SELECT * FROM agent_sessions WHERE room_id = ? ORDER BY created_at DESC").bind(roomId).all(),
    d1.prepare("SELECT * FROM deliberation_items WHERE room_id = ? AND visibility = 'published' ORDER BY created_at DESC").bind(roomId).all(),
    d1.prepare("SELECT * FROM approval_requests WHERE room_id = ? ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, created_at DESC").bind(roomId).all(),
    d1.prepare('SELECT * FROM reminders WHERE room_id = ? ORDER BY due_at').bind(roomId).all(),
  ]);
  const requiredRequirements = requirements.results.filter((item) => Number(item.required) === 1);
  const acceptedRequirements = requiredRequirements.filter((item) => item.status === 'accepted');
  const changeSetRows = await d1.prepare(`SELECT id FROM change_sets WHERE room_id = ?
    AND (status != 'draft' OR author_user_id = ? OR ? IN ('owner', 'facilitator'))
    ORDER BY CASE status WHEN 'open' THEN 0 WHEN 'approved' THEN 1 WHEN 'changes_requested' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END, updated_at DESC`)
    .bind(roomId, user.userId, membership.role).all<{ id: string }>();
  const changeSets = await Promise.all(changeSetRows.results.map((item) => getChangeSet(item.id, user)));
  const serializedAgentSessions = await Promise.all(agentSessions.results.map(async (session) => {
    const [checkpoint, activeWork] = await Promise.all([
      d1.prepare('SELECT * FROM agent_checkpoints WHERE agent_session_id = ? ORDER BY created_at DESC LIMIT 1')
        .bind(session.id).first<Record<string, unknown>>(),
      d1.prepare("SELECT id, started_at, last_activity_at FROM agent_work_sessions WHERE agent_session_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1")
        .bind(session.id).first<Record<string, unknown>>(),
    ]);
    const caughtUpThrough = Number(checkpoint?.acknowledged_through_at ?? 0);
    const unread = await d1.prepare('SELECT COUNT(*) AS count FROM activity_events WHERE room_id = ? AND created_at > ?')
      .bind(roomId, caughtUpThrough).first<{ count: number }>();
    const ownSession = session.owner_user_id === user.userId;
    return {
      ...session,
      scopes: parseJson(session.scopes_json, []),
      catchUp: {
        caught_up_through: caughtUpThrough || null,
        unread_count: Number(unread?.count ?? 0),
        work_status: activeWork ? 'working' : checkpoint ? 'checkpointed' : 'never_started',
        active_work_session_id: ownSession ? activeWork?.id ?? null : null,
        latest_checkpoint: checkpoint ? {
          id: checkpoint.id,
          summary: ownSession ? checkpoint.summary : null,
          assumptions: ownSession ? parseJson(checkpoint.assumptions_json, []) : [],
          commitments: ownSession ? parseJson(checkpoint.commitments_json, []) : [],
          created_at: checkpoint.created_at,
        } : null,
      },
    };
  }));
  const serializedRoom = serializeRoom({
    ...room,
    requirement_count: requiredRequirements.length,
    accepted_count: acceptedRequirements.length,
    people_count: members.results.length,
    published_count: published.results.length,
    private_draft_count: drafts.results.length,
  });
  return {
    ...serializedRoom,
    phases: phases.results,
    requirements: requirements.results,
    contributions: published.results,
    privateDrafts: drafts.results,
    members: members.results,
    invitations: ['owner', 'facilitator'].includes(String(membership.role)) ? invitations.results : [],
    attachments: attachments.results,
    currentUserRole: membership.role,
    activity: activity.results,
    decision: decision ? { ...decision, dissent: parseJson(decision.dissent_json, []) } : null,
    outcomeReview: outcomeReview ? {
      ...outcomeReview,
      overallScore: averageScore(outcomeReview),
      evidence: parseJson(outcomeReview.evidence_json, []),
      dissent: parseJson(outcomeReview.dissent_json, []),
    } : null,
    agentSessions: serializedAgentSessions,
    deliberationItems: deliberationItems.results,
    approvals: approvals.results.map((approval) => ({ ...approval, payload: parseJson(approval.payload_json, {}) })),
    reminders: reminders.results,
    changeSets,
    freshness: {
      viewed_version: Number(room.version),
      latest_version: Number(room.version),
      is_current: true,
      checked_at: Date.now(),
    },
    decisionBrief: buildDecisionBrief({ ...room, status: room.status }, requirements.results, published.results, deliberationItems.results, decision),
  };
}

export async function getRoomUpdates(roomId: string, sinceVersion: number, user: CommonworkUser) {
  await ensureCommonworkData(user);
  await requireMembership(roomId, user);
  const room = await db().prepare('SELECT version, updated_at FROM rooms WHERE id = ?').bind(roomId).first<{ version: number; updated_at: number }>();
  if (!room) throw new Error('Room not found.');
  const viewedVersion = Math.max(0, Math.floor(sinceVersion));
  const latestVersion = Number(room.version);
  if (viewedVersion > latestVersion) throw new Error(`ROOM_VERSION_CONFLICT: viewed ${viewedVersion}, current ${latestVersion}.`);
  const updates = latestVersion > viewedVersion
    ? await db().prepare(`SELECT id, actor_user_id, actor_name, actor_path, action, object_type, object_id, summary, room_version, created_at
        FROM activity_events WHERE room_id = ? AND room_version > ? ORDER BY room_version ASC, created_at ASC LIMIT 40`)
      .bind(roomId, viewedVersion).all<Record<string, unknown>>()
    : { results: [] as Record<string, unknown>[] };
  return {
    room_id: roomId,
    viewed_version: viewedVersion,
    latest_version: latestVersion,
    is_current: viewedVersion === latestVersion,
    versions_behind: Math.max(0, latestVersion - viewedVersion),
    checked_at: Date.now(),
    room_updated_at: Number(room.updated_at),
    updates: updates.results.map((item) => {
      const isPrivate = ['private_draft_added', 'requirement_input_submitted'].includes(String(item.action)) && item.actor_user_id !== user.userId;
      return isPrivate
        ? { ...item, object_id: null, summary: 'Private participant work changed the room version.' }
        : item;
    }),
  };
}

export async function createRoomDraft(input: RoomDraftInput, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const d1 = db();
  const now = Date.now();
  const roomId = makeId('room');
  const model = input.governanceModel || 'Decision room';
  const phaseNames = model === 'Technical RFC'
    ? ['Frame', 'Collect options', 'Technical review', 'Resolve objections', 'Decide']
    : model === 'Consent workshop'
      ? ['Frame', 'Hear perspectives', 'Form proposal', 'Test objections', 'Consent']
      : ['Frame', 'Collect input', 'Resolve gaps', 'Decide', 'Review outcome'];
  const constitution = {
    participation: 'Invite-only · two focused contributions expected',
    evidence: 'Sources, direct observations, or labeled assumptions',
    agentPolicy: 'Agents may research and prepare private drafts. Humans approve publication and decisions.',
    redTeam: 'One independent reviewer before decision',
  };
  const deadline = input.deadlineAt ?? now + 5 * 86_400_000;
  const statements: D1PreparedStatement[] = [
    d1.prepare(`INSERT INTO rooms
      (id, workspace_id, title, problem, desired_outcome, governance_model, visibility, decision_authority, constitution_json, success_criteria_json, status, current_phase, deadline_at, outcome_review_at, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, 'invite_only', ?, ?, ?, 'draft', 0, ?, ?, ?, ?, ?)`)
      .bind(roomId, WORKSPACE_ID, input.title, input.problem, input.desiredOutcome, model,
        input.decisionAuthority ?? 'Room owner after required input', JSON.stringify(constitution),
        JSON.stringify(input.successCriteria ?? []), deadline, deadline + 30 * 86_400_000,
        user.userId, now, now),
    d1.prepare(`INSERT INTO memberships
      (id, room_id, user_id, display_name, role, constitution_accepted_at, joined_at)
      VALUES (?, ?, ?, ?, 'owner', ?, ?)`)
      .bind(makeId('member'), roomId, user.userId, user.displayName, now, now),
  ];
  phaseNames.forEach((name, position) => {
    statements.push(d1.prepare(`INSERT INTO phases
      (id, room_id, position, name, status, starts_at, ends_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(makeId('phase'), roomId, position, name, position === 0 ? 'current' : 'upcoming',
        now + position * 86_400_000, now + (position + 1) * 86_400_000));
  });
  [
    ['Confirm the accountable owner', 'Name the person authorized to make the decision after required input.', 'Room owner'],
    ['Gather stakeholder evidence', 'Collect the evidence and direct observations needed to evaluate the decision.', 'Research lead'],
    ['Record an independent critique', 'Ask one reviewer to challenge assumptions and surface material risks.', 'Independent reviewer'],
    ['Define the pilot success measure', 'Specify how the outcome will be evaluated after the decision.', 'Room owner'],
  ].forEach((requirement) => {
    statements.push(d1.prepare(`INSERT INTO requirements
      (id, room_id, title, description, owner_label, kind, required, status, due_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, 'input', 1, 'open', ?, ?, ?)`)
      .bind(makeId('requirement'), roomId, requirement[0], requirement[1], requirement[2],
        deadline - 86_400_000, now, now));
  });
  await d1.batch(statements);
  await recordActivity({
    roomId, user, actorPath: input.actorPath ?? 'human', action: 'draft_created',
    objectType: 'room', objectId: roomId, summary: `Created room draft “${input.title}”.`,
  });
  return getRoom(roomId, user);
}

export async function addPrivateContribution(input: ContributionInput, user: CommonworkUser) {
  await ensureCommonworkData(user);
  await requireMembership(input.roomId, user);
  const contributionId = makeId('contribution');
  const now = Date.now();
  await db().prepare(`INSERT INTO contributions
    (id, room_id, author_user_id, author_name, type, title, body, visibility, prepared_with_agent, source_count, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'private_draft', ?, ?, ?)`)
    .bind(contributionId, input.roomId, user.userId, user.displayName, input.type, input.title,
      input.body, input.actorPath === 'webmcp' ? 1 : 0, input.sourceCount ?? 0, now).run();
  await bumpRoomVersion(input.roomId);
  await recordActivity({
    roomId: input.roomId, user, actorPath: input.actorPath ?? 'human', action: 'private_draft_added',
    objectType: 'contribution', objectId: contributionId,
    summary: `Prepared a private ${input.type} draft: “${input.title}”.`,
  });
  return {
    contributionId,
    visibility: 'private_draft',
    published: false,
    verification: 'Saved to the current user’s private review queue.',
  };
}

export async function publishContribution(contributionId: string, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const contribution = await db().prepare('SELECT * FROM contributions WHERE id = ? AND author_user_id = ?')
    .bind(contributionId, user.userId).first<Record<string, unknown>>();
  if (!contribution) throw new Error('Private draft not found for this user.');
  await requireMembership(String(contribution.room_id), user);
  if (contribution.visibility !== 'private_draft') throw new Error('Only private drafts can be published.');
  const now = Date.now();
  await db().prepare("UPDATE contributions SET visibility = 'published', published_at = ? WHERE id = ?")
    .bind(now, contributionId).run();
  await bumpRoomVersion(String(contribution.room_id));
  await recordActivity({
    roomId: String(contribution.room_id), user, actorPath: 'human', action: 'contribution_published',
    objectType: 'contribution', objectId: contributionId,
    summary: `Published “${String(contribution.title)}” after human review.`,
  });
  return { contributionId, visibility: 'published', published: true, verifiedAt: now };
}

export async function submitRequirementInput(
  requirementId: string,
  input: Omit<ContributionInput, 'roomId'>,
  user: CommonworkUser,
) {
  await ensureCommonworkData(user);
  const requirement = await db().prepare('SELECT * FROM requirements WHERE id = ?')
    .bind(requirementId).first<Record<string, unknown>>();
  if (!requirement) throw new Error('Requirement not found.');
  const membership = await requireMembership(String(requirement.room_id), user);
  const assignedUserId = requirement.owner_user_id ? String(requirement.owner_user_id) : null;
  if (assignedUserId && assignedUserId !== user.userId && !['owner', 'facilitator'].includes(String(membership.role))) {
    throw new Error('This required input is assigned to another participant.');
  }
  const result = await addPrivateContribution({ ...input, roomId: String(requirement.room_id) }, user);
  await db().prepare("UPDATE requirements SET status = 'submitted', contribution_id = ?, updated_at = ? WHERE id = ?")
    .bind(result.contributionId, Date.now(), requirementId).run();
  await recordActivity({
    roomId: String(requirement.room_id), user, actorPath: input.actorPath ?? 'human',
    action: 'requirement_input_submitted', objectType: 'requirement', objectId: requirementId,
    summary: `Submitted private input for “${String(requirement.title)}”; acceptance is still required.`,
  });
  return {
    ...result,
    requirementId,
    requirementStatus: 'submitted',
    accepted: false,
    verification: 'Requirement input is attached as a private draft and awaits human review.',
  };
}

export async function acceptRequirement(requirementId: string, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const requirement = await db().prepare('SELECT * FROM requirements WHERE id = ?')
    .bind(requirementId).first<Record<string, unknown>>();
  if (!requirement) throw new Error('Requirement not found.');
  await requireRoomRole(String(requirement.room_id), user, ['owner', 'facilitator', 'reviewer']);
  if (requirement.status !== 'submitted') throw new Error('Only submitted input can be accepted.');
  await db().prepare("UPDATE requirements SET status = 'accepted', updated_at = ? WHERE id = ?")
    .bind(Date.now(), requirementId).run();
  await bumpRoomVersion(String(requirement.room_id));
  await recordActivity({
    roomId: String(requirement.room_id), user, actorPath: 'human', action: 'requirement_accepted',
    objectType: 'requirement', objectId: requirementId,
    summary: `Accepted required input: “${String(requirement.title)}”.`,
  });
  return { requirementId, status: 'accepted', accepted: true };
}

export async function activateRoom(roomId: string, user: CommonworkUser) {
  await ensureCommonworkData(user);
  await requireRoomRole(roomId, user, ['owner']);
  const now = Date.now();
  await db().prepare("UPDATE rooms SET status = 'active', version = version + 1, updated_at = ? WHERE id = ? AND status = 'draft'")
    .bind(now, roomId).run();
  await recordActivity({
    roomId, user, actorPath: 'human', action: 'room_activated', objectType: 'room',
    objectId: roomId, summary: 'Activated the room after human review.',
  });
  return { roomId, status: 'active', activatedAt: now };
}

export async function recordDecision(
  roomId: string,
  summary: string,
  rationale: string,
  dissent: string[],
  user: CommonworkUser,
) {
  await ensureCommonworkData(user);
  await requireRoomRole(roomId, user, ['owner']);
  const open = await db().prepare("SELECT COUNT(*) AS count FROM requirements WHERE room_id = ? AND required = 1 AND status != 'accepted'")
    .bind(roomId).first<{ count: number }>();
  if (open?.count) throw new Error(`Decision blocked: ${open.count} required inputs are not accepted.`);
  const decisionId = makeId('decision');
  const now = Date.now();
  const outcomeReminderOffsets = [7, 30, 90].map((days) => ({
    id: makeId('reminder'),
    days,
    dueAt: now + days * 86_400_000,
  }));
  await db().batch([
    db().prepare(`INSERT INTO decisions (id, room_id, summary, rationale, dissent_json, decided_by, decided_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(decisionId, roomId, summary, rationale, JSON.stringify(dissent), user.userId, now),
    db().prepare("UPDATE rooms SET status = 'closed', current_phase = 4, meeting_avoided = CASE WHEN lower(title) LIKE '%meeting%' OR governance_model = 'Decision room' THEN 1 ELSE meeting_avoided END, version = version + 1, updated_at = ? WHERE id = ?").bind(now, roomId),
    ...outcomeReminderOffsets.map((reminder) => db().prepare(`INSERT INTO reminders
      (id, room_id, requirement_id, recipient_user_id, kind, status, due_at, created_at)
      VALUES (?, ?, NULL, ?, ?, 'scheduled', ?, ?)`).bind(
        reminder.id, roomId, user.userId, `outcome_review_${reminder.days}d`, reminder.dueAt, now,
      )),
  ]);
  await recordActivity({
    roomId, user, actorPath: 'human', action: 'decision_recorded', objectType: 'decision',
    objectId: decisionId, summary: `Recorded final decision: “${summary}”.`,
  });
  return {
    decisionId,
    roomId,
    status: 'closed',
    decidedAt: now,
    outcomeReviewReminders: outcomeReminderOffsets.map(({ days, dueAt }) => ({ days, dueAt })),
  };
}

export async function recordOutcomeReview(
  roomId: string,
  scores: {
    goalAchievement: number;
    evidenceQuality: number;
    processIntegrity: number;
    participationHealth: number;
    execution: number;
    learningValue: number;
  },
  verificationLevel: 'self_reported' | 'reviewed' | 'verified',
  evidence: string[],
  dissent: string[],
  user: CommonworkUser,
) {
  await ensureCommonworkData(user);
  await requireRoomRole(roomId, user, ['owner']);
  const room = await db().prepare('SELECT status FROM rooms WHERE id = ?').bind(roomId).first<{ status: string }>();
  if (!room || room.status !== 'closed') throw new Error('Outcome review requires a closed room with a recorded decision.');
  const existing = await db().prepare('SELECT id FROM outcome_reviews WHERE room_id = ?').bind(roomId).first<{ id: string }>();
  if (existing) throw new Error('This room already has an outcome review.');
  const values = Object.values(scores);
  if (values.some((score) => !Number.isFinite(score) || score < 0 || score > 10)) {
    throw new Error('Outcome scores must be numbers from 0 to 10.');
  }
  const reviewId = makeId('outcome');
  const now = Date.now();
  await db().prepare(`INSERT INTO outcome_reviews
    (id, room_id, goal_achievement, evidence_quality, process_integrity, participation_health, execution, learning_value, verification_level, evidence_json, dissent_json, reviewed_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
      reviewId, roomId, scores.goalAchievement, scores.evidenceQuality, scores.processIntegrity,
      scores.participationHealth, scores.execution, scores.learningValue, verificationLevel,
      JSON.stringify(evidence), JSON.stringify(dissent), now,
    ).run();
  await recordActivity({
    roomId, user, actorPath: 'human', action: 'outcome_review_recorded', objectType: 'outcome_review',
    objectId: reviewId, summary: `Recorded a ${verificationLevel.replace('_', ' ')} outcome review with an overall score of ${averageScore({
      goal_achievement: scores.goalAchievement,
      evidence_quality: scores.evidenceQuality,
      process_integrity: scores.processIntegrity,
      participation_health: scores.participationHealth,
      execution: scores.execution,
      learning_value: scores.learningValue,
    })}.`,
  });
  return { reviewId, roomId, overallScore: averageScore({
    goal_achievement: scores.goalAchievement,
    evidence_quality: scores.evidenceQuality,
    process_integrity: scores.processIntegrity,
    participation_health: scores.participationHealth,
    execution: scores.execution,
    learning_value: scores.learningValue,
  }), reviewedAt: now };
}

export async function createRoomInvitation(
  roomId: string,
  invitedEmail: string,
  role: 'facilitator' | 'contributor' | 'reviewer',
  user: CommonworkUser,
) {
  await ensureCommonworkData(user);
  await requireRoomRole(roomId, user, ['owner', 'facilitator']);
  const email = invitedEmail.trim().toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a valid invitation email.');
  const existing = await db().prepare('SELECT id, status FROM room_invitations WHERE room_id = ? AND invited_email = ?')
    .bind(roomId, email).first<{ id: string; status: string }>();
  if (existing?.status === 'pending') throw new Error('A pending invitation already exists for this email.');
  if (existing?.status === 'accepted') throw new Error('This invitation was already accepted.');
  const invitationId = makeId('invitation');
  const now = Date.now();
  await db().prepare(`INSERT INTO room_invitations
    (id, room_id, invited_email, role, status, invited_by, created_at)
    VALUES (?, ?, ?, ?, 'pending', ?, ?)`)
    .bind(invitationId, roomId, email, role, user.userId, now).run();
  await recordActivity({
    roomId, user, actorPath: 'human', action: 'participant_invited', objectType: 'invitation',
    objectId: invitationId, summary: `Invited ${email} as ${role}.`,
  });
  return { invitationId, roomId, invitedEmail: email, role, status: 'pending', sent: false };
}

export async function acceptRoomInvitation(invitationId: string, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const invitation = await db().prepare('SELECT * FROM room_invitations WHERE id = ?')
    .bind(invitationId).first<Record<string, unknown>>();
  if (!invitation || invitation.status !== 'pending') throw new Error('Pending invitation not found.');
  if (String(invitation.invited_email).toLowerCase() !== user.email.toLowerCase()) {
    throw new Error('This invitation belongs to a different signed-in email.');
  }
  const now = Date.now();
  await db().batch([
    db().prepare(`INSERT OR IGNORE INTO memberships
      (id, room_id, user_id, display_name, role, constitution_accepted_at, joined_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .bind(makeId('member'), invitation.room_id, user.userId, user.displayName, invitation.role, now, now),
    db().prepare("UPDATE room_invitations SET status = 'accepted', accepted_at = ? WHERE id = ? AND status = 'pending'")
      .bind(now, invitationId),
  ]);
  await recordActivity({
    roomId: String(invitation.room_id), user, actorPath: 'human', action: 'invitation_accepted',
    objectType: 'membership', objectId: user.userId,
    summary: `${user.displayName} joined as ${String(invitation.role)} and accepted the room constitution.`,
  });
  return { invitationId, roomId: invitation.room_id, joined: true, role: invitation.role };
}

export async function assignRequirement(requirementId: string, assigneeUserId: string, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const requirement = await db().prepare('SELECT * FROM requirements WHERE id = ?')
    .bind(requirementId).first<Record<string, unknown>>();
  if (!requirement) throw new Error('Requirement not found.');
  const roomId = String(requirement.room_id);
  await requireRoomRole(roomId, user, ['owner', 'facilitator']);
  const assignee = await getMembership(roomId, assigneeUserId);
  if (!assignee) throw new Error('The assignee is not a participant in this room.');
  await db().prepare('UPDATE requirements SET owner_user_id = ?, owner_label = ?, updated_at = ? WHERE id = ?')
    .bind(assigneeUserId, assignee.display_name, Date.now(), requirementId).run();
  await bumpRoomVersion(roomId);
  await recordActivity({
    roomId, user, actorPath: 'human', action: 'requirement_assigned', objectType: 'requirement',
    objectId: requirementId, summary: `Assigned “${String(requirement.title)}” to ${String(assignee.display_name)}.`,
  });
  return { requirementId, assigneeUserId, assigneeName: assignee.display_name };
}

export async function createAgentSession(
  roomId: string, agentName: string, scopes: string[], expiresInHours: number, user: CommonworkUser,
) {
  await ensureCommonworkData(user);
  await requireMembership(roomId, user);
  const allowed = ['read_room', 'read_files', 'prepare_contributions', 'submit_requirements', 'request_approvals', 'prepare_change_sets'];
  const cleanScopes = [...new Set(scopes.filter((scope) => allowed.includes(scope)))];
  if (!cleanScopes.length) throw new Error('Choose at least one valid agent scope.');
  const id = makeId('agent-session');
  const now = Date.now();
  const expiresAt = now + Math.max(1, Math.min(168, expiresInHours)) * 3_600_000;
  await db().prepare(`INSERT INTO agent_sessions
    (id, room_id, owner_user_id, agent_name, scopes_json, status, expires_at, last_seen_at, created_at)
    VALUES (?, ?, ?, ?, ?, 'active', ?, ?, ?)`).bind(id, roomId, user.userId, agentName, JSON.stringify(cleanScopes), expiresAt, now, now).run();
  await recordActivity({ roomId, user, actorPath: 'human', action: 'agent_session_created', objectType: 'agent_session', objectId: id, summary: `Connected ${agentName} with ${cleanScopes.length} scoped capabilities.` });
  return { id, roomId, agentName, scopes: cleanScopes, status: 'active', expiresAt };
}

export async function revokeAgentSession(sessionId: string, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const session = await db().prepare('SELECT * FROM agent_sessions WHERE id = ?').bind(sessionId).first<Record<string, unknown>>();
  if (!session) throw new Error('Agent session not found.');
  const membership = await requireMembership(String(session.room_id), user);
  if (session.owner_user_id !== user.userId && membership.role !== 'owner') throw new Error('Only the session owner or room owner can disconnect this agent.');
  await db().prepare("UPDATE agent_sessions SET status = 'revoked' WHERE id = ?").bind(sessionId).run();
  await recordActivity({ roomId: String(session.room_id), user, actorPath: 'human', action: 'agent_session_revoked', objectType: 'agent_session', objectId: sessionId, summary: `Disconnected ${String(session.agent_name)}.` });
  return { sessionId, status: 'revoked' };
}

type CatchUpMode = 'delta' | 'decision_history' | 'topic_history' | 'contribution_history' | 'full_audit';

async function requireOwnedAgentSession(sessionId: string, user: CommonworkUser, roomId?: string) {
  const session = await db().prepare('SELECT * FROM agent_sessions WHERE id = ?').bind(sessionId).first<Record<string, unknown>>();
  if (!session) throw new Error('Agent session not found.');
  if (session.owner_user_id !== user.userId) throw new Error('Only the participant who owns this agent session can use its catch-up ledger.');
  if (roomId && session.room_id !== roomId) throw new Error('Agent session does not belong to this room.');
  await requireMembership(String(session.room_id), user);
  if (session.status !== 'active' || Number(session.expires_at) <= Date.now()) throw new Error('The agent session is inactive or expired.');
  if (!parseJson<string[]>(session.scopes_json, []).includes('read_room')) throw new Error('The agent session is missing an active read_room scope.');
  return session;
}

async function requireOwnedWorkSession(workSessionId: string, user: CommonworkUser) {
  const work = await db().prepare(`SELECT w.*, a.scopes_json, a.expires_at, a.status AS agent_status, a.agent_name
    FROM agent_work_sessions w JOIN agent_sessions a ON a.id = w.agent_session_id WHERE w.id = ?`)
    .bind(workSessionId).first<Record<string, unknown>>();
  if (!work) throw new Error('Agent work session not found.');
  if (work.owner_user_id !== user.userId) throw new Error('Only the participant who owns this agent can use its work session.');
  await requireMembership(String(work.room_id), user);
  if (work.status !== 'active') throw new Error('Agent work session is already closed.');
  if (work.agent_status !== 'active' || Number(work.expires_at) <= Date.now()) throw new Error('The parent agent session is inactive or expired.');
  if (!parseJson<string[]>(work.scopes_json, []).includes('read_room')) throw new Error('The agent session is missing an active read_room scope.');
  return work;
}

export async function startAgentWorkSession(agentSessionId: string, resumeExisting: boolean, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const agent = await requireOwnedAgentSession(agentSessionId, user);
  if (resumeExisting) {
    const existing = await db().prepare(`SELECT * FROM agent_work_sessions
      WHERE agent_session_id = ? AND owner_user_id = ? AND status = 'active' ORDER BY started_at DESC LIMIT 1`)
      .bind(agentSessionId, user.userId).first<Record<string, unknown>>();
    if (existing) {
      await db().prepare('UPDATE agent_work_sessions SET last_activity_at = ? WHERE id = ?').bind(Date.now(), existing.id).run();
      return { ...existing, resumed: true, agent_name: agent.agent_name };
    }
  }
  const checkpoint = await db().prepare('SELECT id FROM agent_checkpoints WHERE agent_session_id = ? ORDER BY created_at DESC LIMIT 1')
    .bind(agentSessionId).first<{ id: string }>();
  const id = makeId('agent-work');
  const now = Date.now();
  await db().prepare(`INSERT INTO agent_work_sessions
    (id, agent_session_id, room_id, owner_user_id, status, previous_checkpoint_id, started_at, last_activity_at)
    VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`)
    .bind(id, agentSessionId, agent.room_id, user.userId, checkpoint?.id ?? null, now, now).run();
  await db().prepare('UPDATE agent_sessions SET last_seen_at = ? WHERE id = ?').bind(now, agentSessionId).run();
  return { id, agent_session_id: agentSessionId, room_id: agent.room_id, status: 'active', started_at: now, previous_checkpoint_id: checkpoint?.id ?? null, resumed: false, agent_name: agent.agent_name };
}

function redactCatchUpEvent(item: Record<string, unknown>, user: CommonworkUser) {
  const isPrivate = ['private_draft_added', 'requirement_input_submitted'].includes(String(item.action)) && item.actor_user_id !== user.userId;
  return isPrivate ? { ...item, object_id: null, summary: 'Private participant work changed the room.' } : item;
}

export async function getAgentCatchUpPacket(
  workSessionId: string, mode: CatchUpMode, query: string | null, limit: number, user: CommonworkUser,
) {
  await ensureCommonworkData(user);
  const work = await requireOwnedWorkSession(workSessionId, user);
  const previous = work.previous_checkpoint_id
    ? await db().prepare('SELECT * FROM agent_checkpoints WHERE id = ? AND agent_session_id = ?').bind(work.previous_checkpoint_id, work.agent_session_id).first<Record<string, unknown>>()
    : null;
  const since = mode === 'full_audit' ? 0 : Number(previous?.acknowledged_through_at ?? 0);
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  let sql = `SELECT e.* FROM activity_events e WHERE e.room_id = ? AND e.created_at > ?`;
  const bindings: unknown[] = [work.room_id, since];
  if (mode === 'delta') {
    sql += ' AND NOT EXISTS (SELECT 1 FROM agent_event_receipts r WHERE r.work_session_id = ? AND r.event_id = e.id)';
    bindings.push(workSessionId);
  }
  if (mode === 'decision_history') sql += " AND e.object_type IN ('decision', 'approval_request', 'requirement', 'change_set', 'change_set_review', 'change_set_thread', 'deliberation_item')";
  if (mode === 'contribution_history') {
    sql += " AND (e.actor_user_id = ? OR e.object_type IN ('contribution', 'requirement'))";
    bindings.push(user.userId);
  }
  if (mode === 'topic_history') {
    if (!query?.trim()) throw new Error('topic_history requires a query.');
    sql += ' AND lower(e.summary) LIKE ?';
    bindings.push(`%${query.trim().toLowerCase().slice(0, 120)}%`);
  }
  sql += ' ORDER BY e.created_at ASC, e.id ASC LIMIT ?';
  bindings.push(safeLimit);
  const events = await db().prepare(sql).bind(...bindings).all<Record<string, unknown>>();
  const now = Date.now();
  if (events.results.length) {
    await db().batch(events.results.map((event) => db().prepare(`INSERT OR IGNORE INTO agent_event_receipts
      (id, agent_session_id, work_session_id, event_id, state, delivered_at, updated_at)
      VALUES (?, ?, ?, ?, 'delivered', ?, ?)`)
      .bind(makeId('agent-receipt'), work.agent_session_id, workSessionId, event.id, now, now)));
  }
  await db().prepare('UPDATE agent_work_sessions SET last_activity_at = ? WHERE id = ?').bind(now, workSessionId).run();
  await db().prepare('UPDATE agent_sessions SET last_seen_at = ? WHERE id = ?').bind(now, work.agent_session_id).run();
  const [requirements, approvals] = await Promise.all([
    db().prepare(`SELECT id, title, description, status, due_at FROM requirements
      WHERE room_id = ? AND owner_user_id = ? AND status != 'accepted' ORDER BY due_at`).bind(work.room_id, user.userId).all(),
    db().prepare(`SELECT id, action_type, rationale, status, created_at FROM approval_requests
      WHERE room_id = ? AND requested_by = ? AND status = 'pending' ORDER BY created_at`).bind(work.room_id, user.userId).all(),
  ]);
  const delivered = events.results.map((item) => redactCatchUpEvent(item, user));
  const importantActions = new Set(['decision_recorded', 'approval_approved', 'approval_rejected', 'change_set_adopted', 'requirement_accepted', 'room_activated']);
  return {
    work_session_id: workSessionId,
    room_id: work.room_id,
    mode,
    previous_checkpoint: previous ? {
      id: previous.id,
      summary: previous.summary,
      acknowledged_through_at: previous.acknowledged_through_at,
      assumptions: parseJson(previous.assumptions_json, []),
      commitments: parseJson(previous.commitments_json, []),
      created_at: previous.created_at,
    } : null,
    delivered_count: delivered.length,
    events: delivered,
    changed_decisions: delivered.filter((item) => importantActions.has(String(item.action))),
    requested_actions: [...requirements.results.map((item) => ({ kind: 'required_input', ...item })), ...approvals.results.map((item) => ({ kind: 'approval_follow_up', ...item }))],
    acknowledgement_required: delivered.map((item) => item.id),
    continuation: events.results.length === safeLimit ? { more_available: true, after_event_id: events.results.at(-1)?.id } : { more_available: false },
    note: 'Delivered does not mean acknowledged. Call update_agent_event_state after incorporating, deferring, or intentionally skipping each event.',
  };
}

export async function updateAgentEventState(
  workSessionId: string, eventIds: string[], state: 'acknowledged' | 'deferred' | 'skipped', user: CommonworkUser,
) {
  await ensureCommonworkData(user);
  await requireOwnedWorkSession(workSessionId, user);
  const uniqueIds = [...new Set(eventIds)].slice(0, 100);
  if (!uniqueIds.length) throw new Error('Choose at least one delivered event.');
  const placeholders = uniqueIds.map(() => '?').join(',');
  const receipts = await db().prepare(`SELECT event_id FROM agent_event_receipts
    WHERE work_session_id = ? AND event_id IN (${placeholders})`).bind(workSessionId, ...uniqueIds).all<{ event_id: string }>();
  if (receipts.results.length !== uniqueIds.length) throw new Error('Every event must be delivered in this work session before its state can change.');
  const now = Date.now();
  await db().batch(uniqueIds.map((eventId) => db().prepare('UPDATE agent_event_receipts SET state = ?, updated_at = ? WHERE work_session_id = ? AND event_id = ?')
    .bind(state, now, workSessionId, eventId)));
  await db().prepare('UPDATE agent_work_sessions SET last_activity_at = ? WHERE id = ?').bind(now, workSessionId).run();
  return { work_session_id: workSessionId, state, event_ids: uniqueIds, updated_at: now };
}

export async function createAgentCheckpoint(input: {
  workSessionId: string; summary: string; assumptions: string[]; commitments: string[]; closeSession: boolean;
}, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const work = await requireOwnedWorkSession(input.workSessionId, user);
  const [receipts, deferred, previous] = await Promise.all([
    db().prepare(`SELECT e.id, e.created_at, r.state FROM agent_event_receipts r JOIN activity_events e ON e.id = r.event_id
      WHERE r.work_session_id = ? ORDER BY e.created_at ASC, e.id ASC`).bind(input.workSessionId).all<{ id: string; created_at: number; state: string }>(),
    db().prepare("SELECT event_id FROM agent_event_receipts WHERE work_session_id = ? AND state = 'deferred' ORDER BY updated_at").bind(input.workSessionId).all<{ event_id: string }>(),
    work.previous_checkpoint_id
      ? db().prepare('SELECT acknowledged_through_event_id, acknowledged_through_at FROM agent_checkpoints WHERE id = ? AND agent_session_id = ?')
        .bind(work.previous_checkpoint_id, work.agent_session_id).first<{ acknowledged_through_event_id: string | null; acknowledged_through_at: number | null }>()
      : Promise.resolve(null),
  ]);
  let processed: { id: string; created_at: number } | null = null;
  for (const receipt of receipts.results) {
    if (!['acknowledged', 'skipped'].includes(receipt.state)) break;
    processed = receipt;
  }
  const acknowledgedThroughEventId = processed?.id ?? previous?.acknowledged_through_event_id ?? null;
  const acknowledgedThroughAt = processed?.created_at ?? previous?.acknowledged_through_at ?? null;
  const id = makeId('agent-checkpoint');
  const now = Date.now();
  await db().prepare(`INSERT INTO agent_checkpoints
    (id, agent_session_id, work_session_id, room_id, owner_user_id, acknowledged_through_event_id, acknowledged_through_at,
      summary, assumptions_json, commitments_json, deferred_event_ids_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, work.agent_session_id, input.workSessionId, work.room_id, user.userId, acknowledgedThroughEventId,
      acknowledgedThroughAt, input.summary, JSON.stringify(input.assumptions), JSON.stringify(input.commitments),
      JSON.stringify(deferred.results.map((item) => item.event_id)), now).run();
  if (input.closeSession) await db().prepare("UPDATE agent_work_sessions SET status = 'closed', closed_at = ?, last_activity_at = ? WHERE id = ?")
    .bind(now, now, input.workSessionId).run();
  else await db().prepare('UPDATE agent_work_sessions SET last_activity_at = ? WHERE id = ?').bind(now, input.workSessionId).run();
  return {
    id, work_session_id: input.workSessionId, room_id: work.room_id, status: input.closeSession ? 'closed' : 'active',
    acknowledged_through_event_id: acknowledgedThroughEventId, acknowledged_through_at: acknowledgedThroughAt,
    deferred_event_ids: deferred.results.map((item) => item.event_id), created_at: now,
  };
}

export async function createDeliberationItem(input: {
  roomId: string; itemType: 'claim' | 'evidence' | 'proposal' | 'question' | 'assumption' | 'objection' | 'criterion';
  title: string; body: string; relatedItemId?: string | null; sourceCount?: number; actorPath?: 'human' | 'webmcp';
  idempotencyKey?: string | null; expectedVersion?: number; dryRun?: boolean;
}, user: CommonworkUser) {
  await ensureCommonworkData(user);
  await requireMembership(input.roomId, user);
  if (input.idempotencyKey) {
    const existing = await db().prepare('SELECT * FROM deliberation_items WHERE room_id = ? AND idempotency_key = ?').bind(input.roomId, input.idempotencyKey).first<Record<string, unknown>>();
    if (existing) return { ...existing, idempotentReplay: true };
  }
  const currentVersion = await assertRoomVersion(input.roomId, input.expectedVersion);
  if (input.relatedItemId) {
    const related = await db().prepare('SELECT room_id FROM deliberation_items WHERE id = ?').bind(input.relatedItemId).first<{ room_id: string }>();
    if (!related || related.room_id !== input.roomId) throw new Error('Related item must exist in the same room.');
  }
  if (input.dryRun) return { dryRun: true, roomId: input.roomId, roomVersion: currentVersion, proposed: input, wouldCreate: 'published deliberation item' };
  const id = makeId('item'); const now = Date.now();
  await db().prepare(`INSERT INTO deliberation_items
    (id, room_id, author_user_id, author_name, item_type, title, body, status, visibility, related_item_id, source_count, actor_path, created_at, updated_at, idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'published', ?, ?, ?, ?, ?, ?)`).bind(
      id, input.roomId, user.userId, user.displayName, input.itemType, input.title, input.body, input.relatedItemId ?? null,
      input.sourceCount ?? 0, input.actorPath ?? 'human', now, now, input.idempotencyKey ?? null,
    ).run();
  await bumpRoomVersion(input.roomId);
  await recordActivity({ roomId: input.roomId, user, actorPath: input.actorPath ?? 'human', action: 'deliberation_item_created', objectType: 'deliberation_item', objectId: id, summary: `Added ${input.itemType}: “${input.title}”.` });
  return { id, roomId: input.roomId, roomVersion: currentVersion + 1, itemType: input.itemType, status: 'open', published: true };
}

export async function resolveDeliberationItem(itemId: string, status: 'resolved' | 'accepted' | 'rejected', user: CommonworkUser) {
  await ensureCommonworkData(user);
  const item = await db().prepare('SELECT * FROM deliberation_items WHERE id = ?').bind(itemId).first<Record<string, unknown>>();
  if (!item) throw new Error('Deliberation item not found.');
  await requireRoomRole(String(item.room_id), user, ['owner', 'facilitator', 'reviewer']);
  await db().prepare('UPDATE deliberation_items SET status = ?, updated_at = ? WHERE id = ?').bind(status, Date.now(), itemId).run();
  await bumpRoomVersion(String(item.room_id));
  await recordActivity({ roomId: String(item.room_id), user, actorPath: 'human', action: 'deliberation_item_resolved', objectType: 'deliberation_item', objectId: itemId, summary: `Marked “${String(item.title)}” ${status}.` });
  return { itemId, status };
}

export async function requestApproval(input: {
  roomId: string; actionType: 'publish_contribution' | 'accept_requirement' | 'activate_room' | 'record_decision' | 'deadline_extension' | 'create_requirement';
  payload: Record<string, unknown>; rationale: string; agentSessionId?: string | null; idempotencyKey?: string | null;
  expectedVersion?: number; dryRun?: boolean;
}, user: CommonworkUser) {
  await ensureCommonworkData(user);
  await requireMembership(input.roomId, user);
  if (input.idempotencyKey) {
    const existing = await db().prepare('SELECT * FROM approval_requests WHERE room_id = ? AND idempotency_key = ?').bind(input.roomId, input.idempotencyKey).first<Record<string, unknown>>();
    if (existing) return { ...existing, payload: parseJson(existing.payload_json, {}), idempotentReplay: true };
  }
  const currentVersion = await assertRoomVersion(input.roomId, input.expectedVersion);
  if (input.agentSessionId) {
    const session = await db().prepare("SELECT * FROM agent_sessions WHERE id = ? AND room_id = ? AND owner_user_id = ? AND status = 'active' AND expires_at > ?")
      .bind(input.agentSessionId, input.roomId, user.userId, Date.now()).first<Record<string, unknown>>();
    if (!session || !parseJson<string[]>(session.scopes_json, []).includes('request_approvals')) throw new Error('The agent session is missing an active request_approvals scope.');
    await db().prepare('UPDATE agent_sessions SET last_seen_at = ? WHERE id = ?').bind(Date.now(), input.agentSessionId).run();
  }
  if (input.dryRun) return { dryRun: true, roomId: input.roomId, roomVersion: currentVersion, wouldRequest: input.actionType, payload: input.payload };
  const id = makeId('approval'); const now = Date.now();
  await db().prepare(`INSERT INTO approval_requests
    (id, room_id, requested_by, requested_by_name, agent_session_id, action_type, payload_json, rationale, status, created_at, idempotency_key)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)`).bind(id, input.roomId, user.userId, user.displayName, input.agentSessionId ?? null, input.actionType, JSON.stringify(input.payload), input.rationale, now, input.idempotencyKey ?? null).run();
  await recordActivity({ roomId: input.roomId, user, actorPath: 'webmcp', action: 'approval_requested', objectType: 'approval_request', objectId: id, summary: `Requested human approval for ${input.actionType.replaceAll('_', ' ')}.` });
  return { id, roomId: input.roomId, status: 'pending', actionType: input.actionType, humanReviewRequired: true };
}

export async function resolveApprovalRequest(approvalId: string, resolution: 'approved' | 'rejected', user: CommonworkUser) {
  await ensureCommonworkData(user);
  const approval = await db().prepare('SELECT * FROM approval_requests WHERE id = ?').bind(approvalId).first<Record<string, unknown>>();
  if (!approval || approval.status !== 'pending') throw new Error('Pending approval request not found.');
  const roomId = String(approval.room_id);
  await requireRoomRole(roomId, user, ['owner', 'facilitator']);
  const payload = parseJson<Record<string, unknown>>(approval.payload_json, {});
  if (resolution === 'approved') {
    const action = String(approval.action_type);
    if (action === 'publish_contribution') {
      const contributionId = String(payload.contribution_id);
      const contribution = await db().prepare(`SELECT id, title FROM contributions
        WHERE id = ? AND room_id = ? AND author_user_id = ? AND visibility = 'private_draft'`)
        .bind(contributionId, roomId, approval.requested_by).first<{ id: string; title: string }>();
      if (!contribution) throw new Error('The requested private draft is missing, already published, or does not belong to the requester.');
      await db().prepare("UPDATE contributions SET visibility = 'published', published_at = ? WHERE id = ?")
        .bind(Date.now(), contributionId).run();
      await bumpRoomVersion(roomId);
      await recordActivity({
        roomId, user, actorPath: 'human', action: 'contribution_published', objectType: 'contribution',
        objectId: contributionId, summary: `Published approved contribution: “${contribution.title}”.`,
      });
    }
    else if (action === 'accept_requirement') await acceptRequirement(String(payload.requirement_id), user);
    else if (action === 'activate_room') await activateRoom(roomId, user);
    else if (action === 'record_decision') await recordDecision(roomId, String(payload.summary), String(payload.rationale), Array.isArray(payload.dissent) ? payload.dissent.map(String) : [], user);
    else if (action === 'deadline_extension') await db().prepare('UPDATE rooms SET deadline_at = ?, version = version + 1, updated_at = ? WHERE id = ?').bind(Number(payload.deadline_at), Date.now(), roomId).run();
    else if (action === 'create_requirement') {
      const now = Date.now();
      await db().prepare(`INSERT INTO requirements (id, room_id, title, description, owner_label, kind, required, status, due_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'input', 1, 'open', ?, ?, ?)`).bind(makeId('requirement'), roomId, String(payload.title), String(payload.description), String(payload.owner_label || 'Unassigned'), Number(payload.due_at || now + 86_400_000), now, now).run();
      await bumpRoomVersion(roomId);
    }
  }
  await db().prepare('UPDATE approval_requests SET status = ?, resolved_by = ?, resolved_at = ? WHERE id = ?').bind(resolution, user.userId, Date.now(), approvalId).run();
  await recordActivity({ roomId, user, actorPath: 'human', action: `approval_${resolution}`, objectType: 'approval_request', objectId: approvalId, summary: `${resolution === 'approved' ? 'Approved' : 'Rejected'} ${String(approval.action_type).replaceAll('_', ' ')} request.` });
  return { approvalId, status: resolution };
}

type ChangeSetChangeInput = {
  changeType: 'add_deliberation_item' | 'add_requirement' | 'update_room_field' | 'resolve_deliberation_item';
  targetId?: string | null;
  fieldName?: string | null;
  after: Record<string, unknown> | string | number | null;
};

async function validateAgentSession(roomId: string, sessionId: string, user: CommonworkUser, requiredScope: string) {
  const session = await db().prepare("SELECT * FROM agent_sessions WHERE id = ? AND room_id = ? AND owner_user_id = ? AND status = 'active' AND expires_at > ?")
    .bind(sessionId, roomId, user.userId, Date.now()).first<Record<string, unknown>>();
  if (!session || !parseJson<string[]>(session.scopes_json, []).includes(requiredScope)) {
    throw new Error(`The agent session is missing an active ${requiredScope} scope.`);
  }
  await db().prepare('UPDATE agent_sessions SET last_seen_at = ? WHERE id = ?').bind(Date.now(), sessionId).run();
}

async function normalizeChange(roomId: string, input: ChangeSetChangeInput, position: number) {
  const changeType = input.changeType;
  if (!['add_deliberation_item', 'add_requirement', 'update_room_field', 'resolve_deliberation_item'].includes(changeType)) {
    throw new Error(`Unsupported change type: ${changeType}.`);
  }
  let targetType = 'room';
  let targetId: string | null = input.targetId ?? null;
  const fieldName: string | null = input.fieldName ?? null;
  let before: unknown = null;
  const after = input.after;
  if (changeType === 'add_deliberation_item') {
    targetType = 'deliberation_item';
    if (!after || typeof after !== 'object' || Array.isArray(after)) throw new Error('A deliberation change requires an object payload.');
    const item = after as Record<string, unknown>;
    if (!['claim', 'evidence', 'proposal', 'question', 'assumption', 'objection', 'criterion'].includes(String(item.item_type))) throw new Error('Unsupported deliberation item_type.');
    if (!String(item.title || '').trim() || !String(item.body || '').trim()) throw new Error('Deliberation changes require a title and body.');
  } else if (changeType === 'add_requirement') {
    targetType = 'requirement';
    if (!after || typeof after !== 'object' || Array.isArray(after)) throw new Error('A requirement change requires an object payload.');
    const requirement = after as Record<string, unknown>;
    if (!String(requirement.title || '').trim() || !String(requirement.description || '').trim()) throw new Error('Requirement changes require a title and description.');
  } else if (changeType === 'update_room_field') {
    targetType = 'room'; targetId = roomId;
    if (!['desired_outcome', 'deadline_at'].includes(String(fieldName))) throw new Error('Only desired_outcome and deadline_at can be proposed as room-field changes.');
    const room = await db().prepare(`SELECT ${fieldName} AS value FROM rooms WHERE id = ?`).bind(roomId).first<{ value: unknown }>();
    before = room?.value ?? null;
    if (fieldName === 'deadline_at' && (typeof after !== 'number' || !Number.isFinite(after))) throw new Error('deadline_at must be a timestamp.');
    if (fieldName === 'desired_outcome' && !String(after || '').trim()) throw new Error('desired_outcome cannot be empty.');
  } else {
    targetType = 'deliberation_item';
    if (!targetId) throw new Error('Resolving a deliberation item requires target_id.');
    const item = await db().prepare('SELECT room_id, status, title FROM deliberation_items WHERE id = ?').bind(targetId).first<Record<string, unknown>>();
    if (!item || item.room_id !== roomId) throw new Error('The deliberation item must exist in the same room.');
    before = { status: item.status, title: item.title };
    const status = typeof after === 'object' && after ? String((after as Record<string, unknown>).status) : String(after);
    if (!['resolved', 'accepted', 'rejected'].includes(status)) throw new Error('Unsupported deliberation resolution.');
  }
  return { id: makeId('change'), position, changeType, targetType, targetId, fieldName, before, after };
}

async function getChangeSetChecks(changeSet: Record<string, unknown>) {
  const [room, changes, openThreads, approvals, changeRequests] = await Promise.all([
    db().prepare('SELECT version, status FROM rooms WHERE id = ?').bind(changeSet.room_id).first<{ version: number; status: string }>(),
    db().prepare('SELECT COUNT(*) AS count FROM change_set_changes WHERE change_set_id = ?').bind(changeSet.id).first<{ count: number }>(),
    db().prepare("SELECT COUNT(*) AS count FROM change_set_threads WHERE change_set_id = ? AND status = 'open'").bind(changeSet.id).first<{ count: number }>(),
    db().prepare("SELECT COUNT(*) AS count FROM change_set_reviews WHERE change_set_id = ? AND reviewed_revision = ? AND verdict = 'approve' AND reviewer_user_id != ?")
      .bind(changeSet.id, changeSet.revision, changeSet.author_user_id).first<{ count: number }>(),
    db().prepare("SELECT COUNT(*) AS count FROM change_set_reviews WHERE change_set_id = ? AND reviewed_revision = ? AND verdict = 'request_changes'")
      .bind(changeSet.id, changeSet.revision).first<{ count: number }>(),
  ]);
  const adopted = changeSet.status === 'adopted';
  return [
    { key: 'current_base', label: adopted ? 'Adopted from its reviewed base' : 'Based on current room version', required: true, status: adopted ? Number(room?.version) >= Number(changeSet.base_version) + 1 ? 'pass' : 'fail' : room?.version === changeSet.base_version ? 'pass' : 'fail', detail: room ? `Room v${room.version}; proposal based on v${changeSet.base_version}.` : 'Room missing.' },
    { key: 'has_changes', label: 'Contains at least one change', required: true, status: Number(changes?.count) > 0 ? 'pass' : 'fail', detail: `${Number(changes?.count || 0)} proposed changes.` },
    { key: 'threads_resolved', label: 'All review threads resolved', required: true, status: Number(openThreads?.count) === 0 ? 'pass' : 'fail', detail: `${Number(openThreads?.count || 0)} open review threads.` },
    { key: 'independent_approval', label: 'Independent human approval', required: true, status: Number(approvals?.count) > 0 ? 'pass' : 'fail', detail: `${Number(approvals?.count || 0)} current approvals from another participant.` },
    { key: 'no_change_requests', label: 'No blocking change requests', required: true, status: Number(changeRequests?.count) === 0 ? 'pass' : 'fail', detail: `${Number(changeRequests?.count || 0)} blocking reviews on this revision.` },
    { key: 'room_open', label: adopted ? 'Adoption recorded' : 'Room is open for changes', required: true, status: adopted || room?.status !== 'closed' ? 'pass' : 'fail', detail: room ? `Room status: ${room.status}.` : 'Room missing.' },
  ];
}

export async function getChangeSet(changeSetId: string, user: CommonworkUser) {
  const changeSet = await db().prepare('SELECT * FROM change_sets WHERE id = ?').bind(changeSetId).first<Record<string, unknown>>();
  if (!changeSet) throw new Error('Change set not found.');
  const membership = await requireMembership(String(changeSet.room_id), user);
  if (changeSet.status === 'draft' && changeSet.author_user_id !== user.userId && !['owner', 'facilitator'].includes(String(membership.role))) {
    throw new Error('Private change-set drafts are visible only to their author, owner, or facilitator.');
  }
  const [changes, reviews, threads] = await Promise.all([
    db().prepare('SELECT * FROM change_set_changes WHERE change_set_id = ? ORDER BY position').bind(changeSetId).all<Record<string, unknown>>(),
    db().prepare('SELECT * FROM change_set_reviews WHERE change_set_id = ? ORDER BY updated_at DESC').bind(changeSetId).all<Record<string, unknown>>(),
    db().prepare('SELECT * FROM change_set_threads WHERE change_set_id = ? ORDER BY created_at').bind(changeSetId).all<Record<string, unknown>>(),
  ]);
  const checks = await getChangeSetChecks(changeSet);
  return {
    ...changeSet,
    changes: changes.results.map((change) => ({ ...change, before: parseJson(change.before_json, null), after: parseJson(change.after_json, null) })),
    reviews: reviews.results,
    threads: threads.results,
    checks,
    ready: checks.every((check) => check.status === 'pass'),
  };
}

export async function createChangeSet(input: {
  roomId: string; title: string; summary: string; changes: ChangeSetChangeInput[]; actorPath?: 'human' | 'webmcp';
  agentSessionId?: string | null; idempotencyKey?: string | null; expectedVersion?: number; dryRun?: boolean;
}, user: CommonworkUser) {
  await ensureCommonworkData(user);
  await requireMembership(input.roomId, user);
  if (input.idempotencyKey) {
    const existing = await db().prepare('SELECT id FROM change_sets WHERE room_id = ? AND idempotency_key = ?').bind(input.roomId, input.idempotencyKey).first<{ id: string }>();
    if (existing) return { ...(await getChangeSet(existing.id, user)), idempotentReplay: true };
  }
  const baseVersion = await assertRoomVersion(input.roomId, input.expectedVersion);
  if (input.actorPath === 'webmcp') {
    if (!input.agentSessionId) throw new Error('WebMCP change sets require an active scoped agent session.');
    await validateAgentSession(input.roomId, input.agentSessionId, user, 'prepare_change_sets');
  }
  if (!input.changes.length || input.changes.length > 20) throw new Error('A change set requires 1 to 20 changes.');
  const normalized = await Promise.all(input.changes.map((change, index) => normalizeChange(input.roomId, change, index)));
  if (input.dryRun) return { dryRun: true, roomId: input.roomId, baseVersion, changes: normalized, wouldCreate: 'private change set draft' };
  const id = makeId('changeset'); const now = Date.now();
  await db().batch([
    db().prepare(`INSERT INTO change_sets
      (id, room_id, base_version, revision, title, summary, status, author_user_id, author_name, actor_path, agent_session_id, idempotency_key, created_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?)`).bind(
        id, input.roomId, baseVersion, input.title, input.summary, user.userId, user.displayName, input.actorPath ?? 'human', input.agentSessionId ?? null, input.idempotencyKey ?? null, now, now,
      ),
    ...normalized.map((change) => db().prepare(`INSERT INTO change_set_changes
      (id, change_set_id, position, change_type, target_type, target_id, field_name, before_json, after_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(
        change.id, id, change.position, change.changeType, change.targetType, change.targetId, change.fieldName, JSON.stringify(change.before), JSON.stringify(change.after),
      )),
  ]);
  await recordActivity({ roomId: input.roomId, user, actorPath: input.actorPath ?? 'human', action: 'change_set_created', objectType: 'change_set', objectId: id, summary: `Prepared change set “${input.title}” against room v${baseVersion}.` });
  return getChangeSet(id, user);
}

export async function reviseChangeSet(changeSetId: string, input: { title?: string; summary?: string; changes: ChangeSetChangeInput[]; actorPath?: 'human' | 'webmcp'; agentSessionId?: string | null }, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const current = await db().prepare('SELECT * FROM change_sets WHERE id = ?').bind(changeSetId).first<Record<string, unknown>>();
  if (!current) throw new Error('Change set not found.');
  await requireMembership(String(current.room_id), user);
  if (current.author_user_id !== user.userId) throw new Error('Only the change-set author can revise it.');
  if (input.actorPath === 'webmcp') {
    if (!input.agentSessionId || current.agent_session_id !== input.agentSessionId) throw new Error('This agent session does not own the change set.');
    await validateAgentSession(String(current.room_id), input.agentSessionId, user, 'prepare_change_sets');
  }
  if (['adopted', 'closed'].includes(String(current.status))) throw new Error('An adopted or closed change set cannot be revised.');
  if (!input.changes.length || input.changes.length > 20) throw new Error('A change set requires 1 to 20 changes.');
  const normalized = await Promise.all(input.changes.map((change, index) => normalizeChange(String(current.room_id), change, index)));
  const now = Date.now(); const revision = Number(current.revision) + 1;
  await db().batch([
    db().prepare("UPDATE change_sets SET title = ?, summary = ?, revision = ?, status = 'draft', updated_at = ? WHERE id = ?")
      .bind(input.title ?? current.title, input.summary ?? current.summary, revision, now, changeSetId),
    db().prepare("UPDATE change_set_reviews SET verdict = 'stale', updated_at = ? WHERE change_set_id = ? AND verdict IN ('approve', 'request_changes')").bind(now, changeSetId),
    db().prepare("UPDATE change_set_threads SET change_id = NULL, status = 'resolved', resolved_at = ?, resolved_by = ? WHERE change_set_id = ? AND status = 'open'").bind(now, user.userId, changeSetId),
    db().prepare('DELETE FROM change_set_changes WHERE change_set_id = ?').bind(changeSetId),
    ...normalized.map((change) => db().prepare(`INSERT INTO change_set_changes
      (id, change_set_id, position, change_type, target_type, target_id, field_name, before_json, after_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(change.id, changeSetId, change.position, change.changeType, change.targetType, change.targetId, change.fieldName, JSON.stringify(change.before), JSON.stringify(change.after))),
  ]);
  await recordActivity({ roomId: String(current.room_id), user, actorPath: String(current.actor_path) === 'webmcp' ? 'webmcp' : 'human', action: 'change_set_revised', objectType: 'change_set', objectId: changeSetId, summary: `Revised “${String(current.title)}” to revision ${revision}; prior approvals are stale.` });
  return getChangeSet(changeSetId, user);
}

export async function submitChangeSet(changeSetId: string, user: CommonworkUser, actorPath: 'human' | 'webmcp' = 'human', agentSessionId: string | null = null) {
  await ensureCommonworkData(user);
  const changeSet = await db().prepare('SELECT * FROM change_sets WHERE id = ?').bind(changeSetId).first<Record<string, unknown>>();
  if (!changeSet) throw new Error('Change set not found.');
  const membership = await requireMembership(String(changeSet.room_id), user);
  if (changeSet.author_user_id !== user.userId && !['owner', 'facilitator'].includes(String(membership.role))) throw new Error('Only the author, owner, or facilitator can submit this change set.');
  if (actorPath === 'webmcp') {
    if (!agentSessionId || changeSet.agent_session_id !== agentSessionId) throw new Error('This agent session does not own the change set.');
    await validateAgentSession(String(changeSet.room_id), agentSessionId, user, 'prepare_change_sets');
  }
  if (!['draft', 'changes_requested'].includes(String(changeSet.status))) throw new Error('Only draft or changes-requested change sets can be submitted.');
  const now = Date.now();
  await db().prepare("UPDATE change_sets SET status = 'open', submitted_at = ?, updated_at = ? WHERE id = ?").bind(now, now, changeSetId).run();
  await recordActivity({ roomId: String(changeSet.room_id), user, actorPath, action: 'change_set_submitted', objectType: 'change_set', objectId: changeSetId, summary: `Submitted “${String(changeSet.title)}” for review.` });
  return getChangeSet(changeSetId, user);
}

export async function addChangeSetThread(changeSetId: string, changeId: string | null, body: string, user: CommonworkUser, actorPath: 'human' | 'webmcp' = 'human', agentSessionId: string | null = null) {
  await ensureCommonworkData(user);
  const changeSet = await db().prepare('SELECT room_id FROM change_sets WHERE id = ?').bind(changeSetId).first<{ room_id: string }>();
  if (!changeSet) throw new Error('Change set not found.');
  await requireMembership(changeSet.room_id, user);
  if (actorPath === 'webmcp') {
    if (!agentSessionId) throw new Error('WebMCP review comments require an active scoped agent session.');
    await validateAgentSession(changeSet.room_id, agentSessionId, user, 'prepare_change_sets');
  }
  if (changeId) {
    const change = await db().prepare('SELECT id FROM change_set_changes WHERE id = ? AND change_set_id = ?').bind(changeId, changeSetId).first();
    if (!change) throw new Error('Review threads must target a change in this change set.');
  }
  const id = makeId('thread'); const now = Date.now();
  await db().prepare(`INSERT INTO change_set_threads
    (id, change_set_id, change_id, author_user_id, author_name, body, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`).bind(id, changeSetId, changeId, user.userId, user.displayName, body, now).run();
  await recordActivity({ roomId: changeSet.room_id, user, actorPath, action: 'review_thread_opened', objectType: 'change_set_thread', objectId: id, summary: 'Opened a review thread on a proposed change.' });
  return { id, changeSetId, status: 'open' };
}

export async function resolveChangeSetThread(threadId: string, user: CommonworkUser, actorPath: 'human' | 'webmcp' = 'human', agentSessionId: string | null = null) {
  await ensureCommonworkData(user);
  const thread = await db().prepare(`SELECT t.*, c.room_id, c.author_user_id AS change_set_author
    FROM change_set_threads t JOIN change_sets c ON c.id = t.change_set_id WHERE t.id = ?`).bind(threadId).first<Record<string, unknown>>();
  if (!thread || thread.status !== 'open') throw new Error('Open review thread not found.');
  const membership = await requireMembership(String(thread.room_id), user);
  if (actorPath === 'webmcp') {
    if (!agentSessionId) throw new Error('WebMCP thread resolution requires an active scoped agent session.');
    await validateAgentSession(String(thread.room_id), agentSessionId, user, 'prepare_change_sets');
  }
  if (thread.author_user_id !== user.userId && thread.change_set_author !== user.userId && !['owner', 'facilitator'].includes(String(membership.role))) {
    throw new Error('Only the thread author, change-set author, owner, or facilitator can resolve this thread.');
  }
  await db().prepare("UPDATE change_set_threads SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ?").bind(Date.now(), user.userId, threadId).run();
  await recordActivity({ roomId: String(thread.room_id), user, actorPath, action: 'review_thread_resolved', objectType: 'change_set_thread', objectId: threadId, summary: 'Resolved a change-set review thread.' });
  return { threadId, status: 'resolved' };
}

export async function reviewChangeSet(changeSetId: string, verdict: 'comment' | 'approve' | 'request_changes', body: string, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const changeSet = await db().prepare('SELECT * FROM change_sets WHERE id = ?').bind(changeSetId).first<Record<string, unknown>>();
  if (!changeSet) throw new Error('Change set not found.');
  await requireRoomRole(String(changeSet.room_id), user, ['owner', 'facilitator', 'reviewer']);
  if (changeSet.status !== 'open' && changeSet.status !== 'approved') throw new Error('Only an open change set can be reviewed.');
  if (verdict !== 'comment' && changeSet.author_user_id === user.userId) throw new Error('Authors cannot approve or block their own change set.');
  const now = Date.now(); const id = makeId('review');
  await db().prepare(`INSERT INTO change_set_reviews
    (id, change_set_id, reviewer_user_id, reviewer_name, verdict, body, reviewed_revision, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(change_set_id, reviewer_user_id, reviewed_revision) DO UPDATE SET verdict = excluded.verdict, body = excluded.body, updated_at = excluded.updated_at`)
    .bind(id, changeSetId, user.userId, user.displayName, verdict, body, changeSet.revision, now, now).run();
  const nextStatus = verdict === 'request_changes' ? 'changes_requested' : verdict === 'approve' ? 'approved' : changeSet.status;
  await db().prepare('UPDATE change_sets SET status = ?, updated_at = ? WHERE id = ?').bind(nextStatus, now, changeSetId).run();
  await recordActivity({ roomId: String(changeSet.room_id), user, actorPath: 'human', action: `change_set_${verdict}`, objectType: 'change_set', objectId: changeSetId, summary: `${verdict === 'approve' ? 'Approved' : verdict === 'request_changes' ? 'Requested changes on' : 'Reviewed'} “${String(changeSet.title)}” revision ${String(changeSet.revision)}.` });
  return getChangeSet(changeSetId, user);
}

export async function adoptChangeSet(changeSetId: string, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const changeSet = await db().prepare('SELECT * FROM change_sets WHERE id = ?').bind(changeSetId).first<Record<string, unknown>>();
  if (!changeSet) throw new Error('Change set not found.');
  await requireRoomRole(String(changeSet.room_id), user, ['owner']);
  if (!['open', 'approved'].includes(String(changeSet.status))) throw new Error('Only an open, reviewed change set can be adopted.');
  const detailed = await getChangeSet(changeSetId, user);
  const failed = detailed.checks.filter((check) => check.required && check.status !== 'pass');
  if (failed.length) throw new Error(`ADOPTION_BLOCKED: ${failed.map((check) => check.label).join('; ')}.`);
  const now = Date.now(); const roomId = String(changeSet.room_id);
  const statements: D1PreparedStatement[] = [];
  for (const raw of detailed.changes) {
    const change = raw as Record<string, unknown> & { after: unknown };
    const after = change.after as Record<string, unknown>;
    if (change.change_type === 'add_deliberation_item') {
      statements.push(db().prepare(`INSERT INTO deliberation_items
        (id, room_id, author_user_id, author_name, item_type, title, body, status, visibility, related_item_id, source_count, actor_path, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'open', 'published', ?, ?, ?, ?, ?)`).bind(
          makeId('item'), roomId, changeSet.author_user_id, changeSet.author_name, String(after.item_type), String(after.title), String(after.body),
          after.related_item_id ? String(after.related_item_id) : null, Number(after.source_count || 0), changeSet.actor_path, now, now,
        ));
    } else if (change.change_type === 'add_requirement') {
      statements.push(db().prepare(`INSERT INTO requirements
        (id, room_id, title, description, owner_label, owner_user_id, kind, required, status, due_at, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 'input', 1, 'open', ?, ?, ?)`).bind(
          makeId('requirement'), roomId, String(after.title), String(after.description), String(after.owner_label || 'Unassigned'),
          after.owner_user_id ? String(after.owner_user_id) : null, Number(after.due_at || now + 86_400_000), now, now,
        ));
    } else if (change.change_type === 'update_room_field') {
      if (change.field_name === 'desired_outcome') statements.push(db().prepare('UPDATE rooms SET desired_outcome = ? WHERE id = ?').bind(String(change.after), roomId));
      else statements.push(db().prepare('UPDATE rooms SET deadline_at = ? WHERE id = ?').bind(Number(change.after), roomId));
    } else if (change.change_type === 'resolve_deliberation_item') {
      statements.push(db().prepare('UPDATE deliberation_items SET status = ?, updated_at = ? WHERE id = ? AND room_id = ?').bind(String(after.status), now, change.target_id, roomId));
    }
  }
  statements.push(
    db().prepare('UPDATE rooms SET version = version + 1, updated_at = ? WHERE id = ? AND version = ?').bind(now, roomId, changeSet.base_version),
    db().prepare("UPDATE change_sets SET status = 'adopted', adopted_at = ?, adopted_by = ?, updated_at = ? WHERE id = ?").bind(now, user.userId, now, changeSetId),
  );
  await db().batch(statements);
  await recordActivity({ roomId, user, actorPath: 'human', action: 'change_set_adopted', objectType: 'change_set', objectId: changeSetId, summary: `Adopted “${String(changeSet.title)}” revision ${String(changeSet.revision)} into room v${Number(changeSet.base_version) + 1}.` });
  return { changeSetId, status: 'adopted', roomVersion: Number(changeSet.base_version) + 1, adoptedBy: user.userId };
}

export async function scheduleRoomReminder(roomId: string, requirementId: string | null, recipientUserId: string | null, dueAt: number, user: CommonworkUser) {
  await ensureCommonworkData(user); await requireRoomRole(roomId, user, ['owner', 'facilitator']);
  const id = makeId('reminder');
  await db().prepare(`INSERT INTO reminders (id, room_id, requirement_id, recipient_user_id, kind, status, due_at, created_at)
    VALUES (?, ?, ?, ?, 'input_due', 'scheduled', ?, ?)`).bind(id, roomId, requirementId, recipientUserId, dueAt, Date.now()).run();
  await recordActivity({ roomId, user, actorPath: 'human', action: 'reminder_scheduled', objectType: 'reminder', objectId: id, summary: `Scheduled an input reminder for ${new Date(dueAt).toLocaleString()}.` });
  return { id, status: 'scheduled', dueAt };
}

export async function saveAttachment(
  roomId: string,
  file: File,
  contributionId: string | null,
  user: CommonworkUser,
) {
  await ensureCommonworkData(user);
  await requireMembership(roomId, user);
  if (!env.FILES) throw new Error('Socialsum file storage is unavailable.');
  if (file.size <= 0) throw new Error('The selected file is empty.');
  if (file.size > 25 * 1024 * 1024) throw new Error('Files must be 25 MB or smaller.');
  if (contributionId) {
    const contribution = await db().prepare('SELECT room_id FROM contributions WHERE id = ?').bind(contributionId).first<{ room_id: string }>();
    if (!contribution || contribution.room_id !== roomId) throw new Error('Contribution does not belong to this room.');
  }
  const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 180) || 'attachment';
  const attachmentId = makeId('attachment');
  const key = `${roomId}/${attachmentId}/${safeName}`;
  const contentType = file.type || 'application/octet-stream';
  await env.FILES.put(key, file.stream(), {
    httpMetadata: { contentType },
    customMetadata: { roomId, uploadedBy: user.userId },
  });
  const now = Date.now();
  try {
    await db().prepare(`INSERT INTO attachments
      (id, room_id, contribution_id, uploaded_by, uploaded_by_name, filename, content_type, size_bytes, r2_key, status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?)`)
      .bind(attachmentId, roomId, contributionId, user.userId, user.displayName, safeName, contentType, file.size, key, now).run();
  } catch (error) {
    await env.FILES.delete(key);
    throw error;
  }
  await recordActivity({
    roomId, user, actorPath: 'human', action: 'file_uploaded', objectType: 'attachment',
    objectId: attachmentId, summary: `Uploaded “${safeName}” (${file.size} bytes).`,
  });
  return { attachmentId, roomId, filename: safeName, contentType, sizeBytes: file.size, status: 'ready' };
}

export async function getAttachment(attachmentId: string, user: CommonworkUser) {
  await ensureCommonworkData(user);
  const attachment = await db().prepare('SELECT * FROM attachments WHERE id = ?')
    .bind(attachmentId).first<Record<string, unknown>>();
  if (!attachment) return null;
  await requireMembership(String(attachment.room_id), user);
  if (!env.FILES) throw new Error('Socialsum file storage is unavailable.');
  const object = await env.FILES.get(String(attachment.r2_key));
  if (!object) return null;
  return { attachment, object };
}

export async function recordActivity(input: {
  roomId: string;
  user: CommonworkUser;
  actorPath: 'human' | 'webmcp';
  action: string;
  objectType: string;
  objectId: string;
  summary: string;
}) {
  const room = await db().prepare('SELECT version FROM rooms WHERE id = ?').bind(input.roomId).first<{ version: number }>();
  await db().prepare(`INSERT INTO activity_events
    (id, room_id, actor_user_id, actor_name, actor_path, action, object_type, object_id, summary, room_version, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(makeId('event'), input.roomId, input.user.userId, input.user.displayName, input.actorPath,
      input.action, input.objectType, input.objectId, input.summary, room?.version ?? null, Date.now()).run();
}

function serializeRoom(room: Record<string, unknown>) {
  const requirementCount = Number(room.requirement_count ?? 0);
  const acceptedCount = Number(room.accepted_count ?? 0);
  return {
    ...room,
    constitution: parseJson(room.constitution_json, {}),
    successCriteria: parseJson(room.success_criteria_json, []),
    progress: requirementCount ? Math.round((acceptedCount / requirementCount) * 100) : room.status === 'closed' ? 100 : 0,
    requiredInputs: requirementCount,
    acceptedInputs: acceptedCount,
  };
}

function buildDecisionBrief(
  room: Record<string, unknown>,
  requirements: Record<string, unknown>[],
  contributions: Record<string, unknown>[],
  items: Record<string, unknown>[],
  decision: Record<string, unknown> | null,
) {
  const blockers = requirements.filter((item) => Number(item.required) === 1 && item.status !== 'accepted');
  const byType = (type: string) => items.filter((item) => item.item_type === type);
  const proposals = [...contributions.filter((item) => item.type === 'proposal'), ...byType('proposal')];
  const evidence = [...contributions.filter((item) => item.type === 'evidence'), ...byType('evidence')];
  const questions = [...contributions.filter((item) => item.type === 'question'), ...byType('question')].filter((item) => item.status !== 'resolved');
  const objections = [...contributions.filter((item) => item.type === 'critique'), ...byType('objection')].filter((item) => item.status !== 'resolved');
  return {
    room_id: room.id,
    room_version: Number(room.version ?? 1),
    question: room.problem,
    desired_outcome: room.desired_outcome,
    status: room.status,
    decision,
    ready: blockers.length === 0 && room.status === 'active',
    blockers,
    accepted_evidence: evidence.slice(0, 8),
    leading_proposals: proposals.slice(0, 6),
    unresolved_questions: questions.slice(0, 8),
    material_objections: objections.slice(0, 8),
    contradictions: objections.filter((item) => item.related_item_id).map((item) => ({ objection: item, challenges_item_id: item.related_item_id })),
    next_action: room.status === 'closed' ? 'Review the measured outcome.' : blockers.length ? `Resolve ${blockers.length} required input${blockers.length === 1 ? '' : 's'}.` : 'The owner can record the final decision.',
    time_remaining_ms: room.deadline_at ? Math.max(0, Number(room.deadline_at) - Date.now()) : null,
    meeting_avoided: Boolean(room.meeting_avoided),
  };
}

function averageScore(outcome: Record<string, unknown>) {
  const keys = ['goal_achievement', 'evidence_quality', 'process_integrity', 'participation_health', 'execution', 'learning_value'];
  const values = keys.map((key) => Number(outcome[key])).filter((value) => Number.isFinite(value));
  return values.length ? Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 10) / 10 : null;
}
