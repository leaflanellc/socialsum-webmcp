import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  ownerUserId: text('owner_user_id').notNull(),
  createdAt: integer('created_at').notNull(),
});

export const rooms = sqliteTable('rooms', {
  id: text('id').primaryKey(),
  workspaceId: text('workspace_id').notNull().references(() => workspaces.id),
  title: text('title').notNull(),
  problem: text('problem').notNull(),
  desiredOutcome: text('desired_outcome').notNull().default(''),
  governanceModel: text('governance_model').notNull(),
  visibility: text('visibility').notNull().default('invite_only'),
  decisionAuthority: text('decision_authority').notNull(),
  constitutionJson: text('constitution_json').notNull(),
  successCriteriaJson: text('success_criteria_json').notNull(),
  status: text('status').notNull().default('draft'),
  currentPhase: integer('current_phase').notNull().default(0),
  deadlineAt: integer('deadline_at'),
  outcomeReviewAt: integer('outcome_review_at'),
  createdBy: text('created_by').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  version: integer('version').notNull().default(1),
  meetingAvoided: integer('meeting_avoided', { mode: 'boolean' }).notNull().default(false),
}, (table) => [
  index('idx_rooms_workspace_status').on(table.workspaceId, table.status),
  index('idx_rooms_deadline').on(table.deadlineAt),
]);

export const memberships = sqliteTable('memberships', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  userId: text('user_id').notNull(),
  displayName: text('display_name').notNull(),
  role: text('role').notNull().default('contributor'),
  constitutionAcceptedAt: integer('constitution_accepted_at'),
  joinedAt: integer('joined_at').notNull(),
}, (table) => [
  uniqueIndex('idx_memberships_room_user').on(table.roomId, table.userId),
]);

export const roomInvitations = sqliteTable('room_invitations', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  invitedEmail: text('invited_email').notNull(),
  role: text('role').notNull().default('contributor'),
  status: text('status').notNull().default('pending'),
  invitedBy: text('invited_by').notNull(),
  createdAt: integer('created_at').notNull(),
  acceptedAt: integer('accepted_at'),
}, (table) => [
  uniqueIndex('idx_invitations_room_email').on(table.roomId, table.invitedEmail),
  index('idx_invitations_email_status').on(table.invitedEmail, table.status),
]);

export const phases = sqliteTable('phases', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  position: integer('position').notNull(),
  name: text('name').notNull(),
  status: text('status').notNull().default('upcoming'),
  startsAt: integer('starts_at'),
  endsAt: integer('ends_at'),
}, (table) => [uniqueIndex('idx_phases_room_position').on(table.roomId, table.position)]);

export const requirements = sqliteTable('requirements', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  title: text('title').notNull(),
  description: text('description').notNull(),
  ownerLabel: text('owner_label').notNull(),
  ownerUserId: text('owner_user_id'),
  kind: text('kind').notNull().default('input'),
  required: integer('required', { mode: 'boolean' }).notNull().default(true),
  status: text('status').notNull().default('open'),
  dueAt: integer('due_at'),
  contributionId: text('contribution_id'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  index('idx_requirements_room_status').on(table.roomId, table.status),
]);

export const contributions = sqliteTable('contributions', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  authorUserId: text('author_user_id').notNull(),
  authorName: text('author_name').notNull().default('Participant'),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  visibility: text('visibility').notNull().default('private_draft'),
  preparedWithAgent: integer('prepared_with_agent', { mode: 'boolean' }).notNull().default(false),
  sourceCount: integer('source_count').notNull().default(0),
  createdAt: integer('created_at').notNull(),
  publishedAt: integer('published_at'),
}, (table) => [
  index('idx_contributions_room_visibility').on(table.roomId, table.visibility),
]);

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  contributionId: text('contribution_id').references(() => contributions.id),
  uploadedBy: text('uploaded_by').notNull(),
  uploadedByName: text('uploaded_by_name').notNull(),
  filename: text('filename').notNull(),
  contentType: text('content_type').notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  r2Key: text('r2_key').notNull(),
  status: text('status').notNull().default('ready'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_attachments_room_created').on(table.roomId, table.createdAt),
  uniqueIndex('idx_attachments_r2_key').on(table.r2Key),
]);

export const decisions = sqliteTable('decisions', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  summary: text('summary').notNull(),
  rationale: text('rationale').notNull(),
  dissentJson: text('dissent_json').notNull().default('[]'),
  decidedBy: text('decided_by').notNull(),
  decidedAt: integer('decided_at').notNull(),
}, (table) => [uniqueIndex('idx_decisions_room').on(table.roomId)]);

export const outcomeReviews = sqliteTable('outcome_reviews', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  goalAchievement: real('goal_achievement'),
  evidenceQuality: real('evidence_quality'),
  processIntegrity: real('process_integrity'),
  participationHealth: real('participation_health'),
  execution: real('execution'),
  learningValue: real('learning_value'),
  verificationLevel: text('verification_level').notNull().default('unreviewed'),
  evidenceJson: text('evidence_json').notNull().default('[]'),
  dissentJson: text('dissent_json').notNull().default('[]'),
  reviewedAt: integer('reviewed_at').notNull(),
}, (table) => [index('idx_outcomes_room').on(table.roomId)]);

export const activityEvents = sqliteTable('activity_events', {
  id: text('id').primaryKey(),
  roomId: text('room_id').notNull().references(() => rooms.id),
  actorUserId: text('actor_user_id').notNull(),
  actorName: text('actor_name').notNull().default('Participant'),
  actorPath: text('actor_path').notNull().default('human'),
  action: text('action').notNull(),
  objectType: text('object_type').notNull(),
  objectId: text('object_id').notNull(),
  summary: text('summary').notNull(),
  roomVersion: integer('room_version'),
  createdAt: integer('created_at').notNull(),
}, (table) => [index('idx_activity_room_created').on(table.roomId, table.createdAt)]);

export const agentSessions = sqliteTable('agent_sessions', {
  id: text('id').primaryKey(), roomId: text('room_id').notNull().references(() => rooms.id),
  ownerUserId: text('owner_user_id').notNull(), agentName: text('agent_name').notNull(), scopesJson: text('scopes_json').notNull().default('[]'),
  status: text('status').notNull().default('active'), expiresAt: integer('expires_at').notNull(), lastSeenAt: integer('last_seen_at'), createdAt: integer('created_at').notNull(),
}, (table) => [index('idx_agent_sessions_room_status').on(table.roomId, table.status)]);

export const agentWorkSessions = sqliteTable('agent_work_sessions', {
  id: text('id').primaryKey(),
  agentSessionId: text('agent_session_id').notNull().references(() => agentSessions.id),
  roomId: text('room_id').notNull().references(() => rooms.id),
  ownerUserId: text('owner_user_id').notNull(),
  status: text('status').notNull().default('active'),
  previousCheckpointId: text('previous_checkpoint_id'),
  startedAt: integer('started_at').notNull(),
  lastActivityAt: integer('last_activity_at').notNull(),
  closedAt: integer('closed_at'),
}, (table) => [
  index('idx_agent_work_sessions_agent_status').on(table.agentSessionId, table.status),
  index('idx_agent_work_sessions_room_started').on(table.roomId, table.startedAt),
]);

export const agentEventReceipts = sqliteTable('agent_event_receipts', {
  id: text('id').primaryKey(),
  agentSessionId: text('agent_session_id').notNull().references(() => agentSessions.id),
  workSessionId: text('work_session_id').notNull().references(() => agentWorkSessions.id),
  eventId: text('event_id').notNull().references(() => activityEvents.id),
  state: text('state').notNull().default('delivered'),
  deliveredAt: integer('delivered_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
}, (table) => [
  uniqueIndex('idx_agent_event_receipts_work_event').on(table.workSessionId, table.eventId),
  index('idx_agent_event_receipts_work_state').on(table.workSessionId, table.state),
]);

export const agentCheckpoints = sqliteTable('agent_checkpoints', {
  id: text('id').primaryKey(),
  agentSessionId: text('agent_session_id').notNull().references(() => agentSessions.id),
  workSessionId: text('work_session_id').notNull().references(() => agentWorkSessions.id),
  roomId: text('room_id').notNull().references(() => rooms.id),
  ownerUserId: text('owner_user_id').notNull(),
  acknowledgedThroughEventId: text('acknowledged_through_event_id'),
  acknowledgedThroughAt: integer('acknowledged_through_at'),
  summary: text('summary').notNull(),
  assumptionsJson: text('assumptions_json').notNull().default('[]'),
  commitmentsJson: text('commitments_json').notNull().default('[]'),
  deferredEventIdsJson: text('deferred_event_ids_json').notNull().default('[]'),
  createdAt: integer('created_at').notNull(),
}, (table) => [
  index('idx_agent_checkpoints_agent_created').on(table.agentSessionId, table.createdAt),
  index('idx_agent_checkpoints_room_created').on(table.roomId, table.createdAt),
]);

export const deliberationItems = sqliteTable('deliberation_items', {
  id: text('id').primaryKey(), roomId: text('room_id').notNull().references(() => rooms.id), authorUserId: text('author_user_id').notNull(),
  authorName: text('author_name').notNull(), itemType: text('item_type').notNull(), title: text('title').notNull(), body: text('body').notNull(),
  status: text('status').notNull().default('open'), visibility: text('visibility').notNull().default('published'), relatedItemId: text('related_item_id'),
  sourceCount: integer('source_count').notNull().default(0), actorPath: text('actor_path').notNull().default('human'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
  idempotencyKey: text('idempotency_key'),
}, (table) => [index('idx_deliberation_room_type_status').on(table.roomId, table.itemType, table.status), uniqueIndex('idx_deliberation_room_idempotency').on(table.roomId, table.idempotencyKey)]);

export const approvalRequests = sqliteTable('approval_requests', {
  id: text('id').primaryKey(), roomId: text('room_id').notNull().references(() => rooms.id), requestedBy: text('requested_by').notNull(),
  requestedByName: text('requested_by_name').notNull(), agentSessionId: text('agent_session_id'), actionType: text('action_type').notNull(),
  payloadJson: text('payload_json').notNull().default('{}'), rationale: text('rationale').notNull(), status: text('status').notNull().default('pending'),
  resolvedBy: text('resolved_by'), resolvedAt: integer('resolved_at'), createdAt: integer('created_at').notNull(), idempotencyKey: text('idempotency_key'),
}, (table) => [index('idx_approvals_room_status').on(table.roomId, table.status), uniqueIndex('idx_approvals_room_idempotency').on(table.roomId, table.idempotencyKey)]);

export const reminders = sqliteTable('reminders', {
  id: text('id').primaryKey(), roomId: text('room_id').notNull().references(() => rooms.id), requirementId: text('requirement_id'),
  recipientUserId: text('recipient_user_id'), kind: text('kind').notNull(), status: text('status').notNull().default('scheduled'),
  dueAt: integer('due_at').notNull(), createdAt: integer('created_at').notNull(), sentAt: integer('sent_at'),
}, (table) => [index('idx_reminders_room_due').on(table.roomId, table.dueAt)]);

export const changeSets = sqliteTable('change_sets', {
  id: text('id').primaryKey(), roomId: text('room_id').notNull().references(() => rooms.id),
  baseVersion: integer('base_version').notNull(), revision: integer('revision').notNull().default(1),
  title: text('title').notNull(), summary: text('summary').notNull(), status: text('status').notNull().default('draft'),
  authorUserId: text('author_user_id').notNull(), authorName: text('author_name').notNull(), actorPath: text('actor_path').notNull().default('human'),
  agentSessionId: text('agent_session_id'), idempotencyKey: text('idempotency_key'), createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
  submittedAt: integer('submitted_at'), adoptedAt: integer('adopted_at'), adoptedBy: text('adopted_by'),
}, (table) => [index('idx_change_sets_room_status').on(table.roomId, table.status), uniqueIndex('idx_change_sets_room_idempotency').on(table.roomId, table.idempotencyKey)]);

export const changeSetChanges = sqliteTable('change_set_changes', {
  id: text('id').primaryKey(), changeSetId: text('change_set_id').notNull().references(() => changeSets.id),
  position: integer('position').notNull(), changeType: text('change_type').notNull(), targetType: text('target_type').notNull(), targetId: text('target_id'),
  fieldName: text('field_name'), beforeJson: text('before_json').notNull().default('null'), afterJson: text('after_json').notNull(),
}, (table) => [uniqueIndex('idx_change_set_changes_position').on(table.changeSetId, table.position)]);

export const changeSetReviews = sqliteTable('change_set_reviews', {
  id: text('id').primaryKey(), changeSetId: text('change_set_id').notNull().references(() => changeSets.id), reviewerUserId: text('reviewer_user_id').notNull(),
  reviewerName: text('reviewer_name').notNull(), verdict: text('verdict').notNull(), body: text('body').notNull().default(''), reviewedRevision: integer('reviewed_revision').notNull(),
  createdAt: integer('created_at').notNull(), updatedAt: integer('updated_at').notNull(),
}, (table) => [uniqueIndex('idx_change_set_reviews_reviewer_revision').on(table.changeSetId, table.reviewerUserId, table.reviewedRevision)]);

export const changeSetThreads = sqliteTable('change_set_threads', {
  id: text('id').primaryKey(), changeSetId: text('change_set_id').notNull().references(() => changeSets.id), changeId: text('change_id').references(() => changeSetChanges.id),
  authorUserId: text('author_user_id').notNull(), authorName: text('author_name').notNull(), body: text('body').notNull(), status: text('status').notNull().default('open'),
  createdAt: integer('created_at').notNull(), resolvedAt: integer('resolved_at'), resolvedBy: text('resolved_by'),
}, (table) => [index('idx_change_set_threads_status').on(table.changeSetId, table.status)]);
