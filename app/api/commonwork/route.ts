import { getCommonworkUser, isLocalIdentityTesting } from '../../../lib/commonwork-auth';
import { toWebMcpError } from '../../../lib/webmcp-contract';
import {
  acceptRequirement,
  acceptRoomInvitation,
  activateRoom,
  addPrivateContribution,
  assignRequirement,
  createRoomInvitation,
  createRoomDraft,
  createAgentSession,
  createDeliberationItem,
  getRoom,
  getWorkspace,
  governanceTemplates,
  publishContribution,
  recordDecision,
  recordOutcomeReview,
  requestApproval,
  resolveApprovalRequest,
  resolveDeliberationItem,
  revokeAgentSession,
  scheduleRoomReminder,
  submitRequirementInput,
  createChangeSet,
  reviseChangeSet,
  submitChangeSet,
  addChangeSetThread,
  resolveChangeSetThread,
  reviewChangeSet,
  adoptChangeSet,
  getChangeSet,
  getRoomUpdates,
  startAgentWorkSession,
  getAgentCatchUpPacket,
  updateAgentEventState,
  createAgentCheckpoint,
} from '../../../lib/commonwork-db';

export const dynamic = 'force-dynamic';

function response(data: unknown, status = 200) {
  return Response.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

function errorResponse(error: unknown, status = 400) {
  const message = error instanceof Error ? error.message : typeof error === 'string' ? error : 'Request failed.';
  return response({ error: message, error_details: toWebMcpError(error, status) }, status);
}

function requiredText(value: unknown, field: string, max = 8_000) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${field} is required.`);
  if (value.length > max) throw new Error(`${field} is too long.`);
  return value.trim();
}

function optionalText(value: unknown, fallback: string, max = 8_000) {
  if (value === undefined || value === null || value === '') return fallback;
  return requiredText(value, 'text', max);
}

function stringList(value: unknown, maxItems = 12) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, maxItems).filter((item): item is string => typeof item === 'string').map((item) => item.slice(0, 500));
}

function changeList(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 20).map((raw) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Each change must be an object.');
    const item = raw as Record<string, unknown>;
    return {
      changeType: requiredText(item.change_type, 'change_type', 60) as 'add_deliberation_item' | 'add_requirement' | 'update_room_field' | 'resolve_deliberation_item',
      targetId: typeof item.target_id === 'string' ? item.target_id : null,
      fieldName: typeof item.field_name === 'string' ? item.field_name : null,
      after: item.after as Record<string, unknown> | string | number | null,
    };
  });
}

export async function GET(request: Request) {
  const user = await getCommonworkUser(request);
  if (!user) return errorResponse('Sign in with ChatGPT to access this workspace.', 401);
  const url = new URL(request.url);
  const action = url.searchParams.get('action') ?? 'workspace';
  try {
    if (action === 'workspace') return response(await getWorkspace(user, isLocalIdentityTesting));
    if (action === 'governance_templates') return response({ templates: governanceTemplates });
    if (action === 'room') {
      const roomId = requiredText(url.searchParams.get('room_id'), 'room_id', 200);
      const room = await getRoom(roomId, user);
      return room ? response(room) : errorResponse('Room not found.', 404);
    }
    if (action === 'room_updates') {
      const roomId = requiredText(url.searchParams.get('room_id'), 'room_id', 200);
      const rawVersion = Number(url.searchParams.get('since_version'));
      if (!Number.isInteger(rawVersion) || rawVersion < 0) throw new Error('since_version must be a non-negative integer.');
      return response(await getRoomUpdates(roomId, rawVersion, user));
    }
    if (action === 'change_set') return response(await getChangeSet(requiredText(url.searchParams.get('change_set_id'), 'change_set_id', 200), user));
    return errorResponse('Unsupported read action.', 400);
  } catch (error) {
    return errorResponse(error, 400);
  }
}

export async function POST(request: Request) {
  const user = await getCommonworkUser(request);
  if (!user || user.isAnonymous) return errorResponse('Sign in with ChatGPT to participate or change this workspace.', 401);
  try {
    const body = await request.json() as Record<string, unknown>;
    const action = requiredText(body.action, 'action', 100);
    if (action === 'create_room_draft') {
      return response(await createRoomDraft({
        title: requiredText(body.title, 'title', 180),
        problem: requiredText(body.problem, 'problem', 2_000),
        desiredOutcome: requiredText(body.desired_outcome, 'desired_outcome', 2_000),
        governanceModel: optionalText(body.governance_model, 'Decision room', 100),
        decisionAuthority: optionalText(body.decision_authority, 'Room owner after required input', 300),
        deadlineAt: typeof body.deadline_at === 'number' ? body.deadline_at : null,
        successCriteria: stringList(body.success_criteria),
        actorPath: body.actor_path === 'webmcp' ? 'webmcp' : 'human',
      }, user), 201);
    }
    if (action === 'add_private_contribution') {
      const type = requiredText(body.contribution_type, 'contribution_type', 40);
      if (!['evidence', 'proposal', 'critique', 'question'].includes(type)) throw new Error('Unsupported contribution_type.');
      return response(await addPrivateContribution({
        roomId: requiredText(body.room_id, 'room_id', 200),
        type: type as 'evidence' | 'proposal' | 'critique' | 'question',
        title: requiredText(body.title, 'title', 180),
        body: requiredText(body.content, 'content', 8_000),
        sourceCount: typeof body.source_count === 'number' ? Math.max(0, Math.min(100, body.source_count)) : 0,
        actorPath: body.actor_path === 'webmcp' ? 'webmcp' : 'human',
      }, user), 201);
    }
    if (action === 'submit_requirement_input') {
      const type = requiredText(body.contribution_type, 'contribution_type', 40);
      if (!['evidence', 'proposal', 'critique', 'question'].includes(type)) throw new Error('Unsupported contribution_type.');
      return response(await submitRequirementInput(
        requiredText(body.requirement_id, 'requirement_id', 200),
        {
          type: type as 'evidence' | 'proposal' | 'critique' | 'question',
          title: requiredText(body.title, 'title', 180),
          body: requiredText(body.content, 'content', 8_000),
          sourceCount: typeof body.source_count === 'number' ? Math.max(0, Math.min(100, body.source_count)) : 0,
          actorPath: body.actor_path === 'webmcp' ? 'webmcp' : 'human',
        },
        user,
      ), 201);
    }
    if (action === 'publish_contribution') {
      return response(await publishContribution(requiredText(body.contribution_id, 'contribution_id', 200), user));
    }
    if (action === 'accept_requirement') {
      return response(await acceptRequirement(requiredText(body.requirement_id, 'requirement_id', 200), user));
    }
    if (action === 'activate_room') {
      return response(await activateRoom(requiredText(body.room_id, 'room_id', 200), user));
    }
    if (action === 'create_room_invitation') {
      const role = optionalText(body.role, 'contributor', 40);
      if (!['facilitator', 'contributor', 'reviewer'].includes(role)) throw new Error('Unsupported invitation role.');
      return response(await createRoomInvitation(
        requiredText(body.room_id, 'room_id', 200),
        requiredText(body.invited_email, 'invited_email', 320),
        role as 'facilitator' | 'contributor' | 'reviewer',
        user,
      ), 201);
    }
    if (action === 'accept_room_invitation') {
      return response(await acceptRoomInvitation(requiredText(body.invitation_id, 'invitation_id', 200), user));
    }
    if (action === 'assign_requirement') {
      return response(await assignRequirement(
        requiredText(body.requirement_id, 'requirement_id', 200),
        requiredText(body.assignee_user_id, 'assignee_user_id', 200),
        user,
      ));
    }
    if (action === 'record_decision') {
      return response(await recordDecision(
        requiredText(body.room_id, 'room_id', 200),
        requiredText(body.summary, 'summary', 1_000),
        requiredText(body.rationale, 'rationale', 8_000),
        stringList(body.dissent),
        user,
      ));
    }
    if (action === 'record_outcome_review') {
      const verificationLevel = optionalText(body.verification_level, 'self_reported', 40);
      if (!['self_reported', 'reviewed', 'verified'].includes(verificationLevel)) throw new Error('Unsupported verification_level.');
      const score = (value: unknown, field: string) => {
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 10) throw new Error(`${field} must be a number from 0 to 10.`);
        return value;
      };
      return response(await recordOutcomeReview(
        requiredText(body.room_id, 'room_id', 200),
        {
          goalAchievement: score(body.goal_achievement, 'goal_achievement'),
          evidenceQuality: score(body.evidence_quality, 'evidence_quality'),
          processIntegrity: score(body.process_integrity, 'process_integrity'),
          participationHealth: score(body.participation_health, 'participation_health'),
          execution: score(body.execution, 'execution'),
          learningValue: score(body.learning_value, 'learning_value'),
        },
        verificationLevel as 'self_reported' | 'reviewed' | 'verified',
        stringList(body.evidence),
        stringList(body.dissent),
        user,
      ), 201);
    }
    if (action === 'create_agent_session') {
      return response(await createAgentSession(
        requiredText(body.room_id, 'room_id', 200), requiredText(body.agent_name, 'agent_name', 120),
        stringList(body.scopes, 12), typeof body.expires_in_hours === 'number' ? body.expires_in_hours : 24, user,
      ), 201);
    }
    if (action === 'revoke_agent_session') return response(await revokeAgentSession(requiredText(body.session_id, 'session_id', 200), user));
    if (action === 'start_agent_work_session') return response(await startAgentWorkSession(
      requiredText(body.agent_session_id, 'agent_session_id', 200), body.resume_existing !== false, user,
    ), 201);
    if (action === 'get_agent_catch_up_packet') {
      const mode = optionalText(body.mode, 'delta', 40);
      if (!['delta', 'decision_history', 'topic_history', 'contribution_history', 'full_audit'].includes(mode)) throw new Error('Unsupported catch-up mode.');
      return response(await getAgentCatchUpPacket(
        requiredText(body.work_session_id, 'work_session_id', 200),
        mode as 'delta' | 'decision_history' | 'topic_history' | 'contribution_history' | 'full_audit',
        typeof body.query === 'string' ? body.query : null,
        typeof body.limit === 'number' ? body.limit : 40,
        user,
      ));
    }
    if (action === 'update_agent_event_state') {
      const state = requiredText(body.state, 'state', 40);
      if (!['acknowledged', 'deferred', 'skipped'].includes(state)) throw new Error('Unsupported event state.');
      return response(await updateAgentEventState(
        requiredText(body.work_session_id, 'work_session_id', 200), stringList(body.event_ids, 100),
        state as 'acknowledged' | 'deferred' | 'skipped', user,
      ));
    }
    if (action === 'create_agent_checkpoint') return response(await createAgentCheckpoint({
      workSessionId: requiredText(body.work_session_id, 'work_session_id', 200),
      summary: requiredText(body.summary, 'summary', 2_000),
      assumptions: stringList(body.assumptions, 20), commitments: stringList(body.commitments, 20),
      closeSession: body.close_session !== false,
    }, user), 201);
    if (action === 'create_deliberation_item') {
      const itemType = requiredText(body.item_type, 'item_type', 40);
      if (!['claim', 'evidence', 'proposal', 'question', 'assumption', 'objection', 'criterion'].includes(itemType)) throw new Error('Unsupported item_type.');
      return response(await createDeliberationItem({
        roomId: requiredText(body.room_id, 'room_id', 200), itemType: itemType as 'claim' | 'evidence' | 'proposal' | 'question' | 'assumption' | 'objection' | 'criterion',
        title: requiredText(body.title, 'title', 180), body: requiredText(body.content, 'content', 8_000),
        relatedItemId: typeof body.related_item_id === 'string' ? body.related_item_id : null,
        sourceCount: typeof body.source_count === 'number' ? body.source_count : 0,
        actorPath: body.actor_path === 'webmcp' ? 'webmcp' : 'human', idempotencyKey: typeof body.idempotency_key === 'string' ? body.idempotency_key : null,
        expectedVersion: typeof body.expected_room_version === 'number' ? body.expected_room_version : undefined, dryRun: body.dry_run === true,
      }, user), body.dry_run === true ? 200 : 201);
    }
    if (action === 'resolve_deliberation_item') {
      const status = requiredText(body.status, 'status', 40);
      if (!['resolved', 'accepted', 'rejected'].includes(status)) throw new Error('Unsupported resolution status.');
      return response(await resolveDeliberationItem(requiredText(body.item_id, 'item_id', 200), status as 'resolved' | 'accepted' | 'rejected', user));
    }
    if (action === 'request_approval') {
      const actionType = requiredText(body.action_type, 'action_type', 60);
      if (!['publish_contribution', 'accept_requirement', 'activate_room', 'record_decision', 'deadline_extension', 'create_requirement'].includes(actionType)) throw new Error('Unsupported approval action_type.');
      return response(await requestApproval({
        roomId: requiredText(body.room_id, 'room_id', 200),
        actionType: actionType as 'publish_contribution' | 'accept_requirement' | 'activate_room' | 'record_decision' | 'deadline_extension' | 'create_requirement',
        payload: body.payload && typeof body.payload === 'object' ? body.payload as Record<string, unknown> : {},
        rationale: requiredText(body.rationale, 'rationale', 2_000), agentSessionId: typeof body.agent_session_id === 'string' ? body.agent_session_id : null,
        idempotencyKey: typeof body.idempotency_key === 'string' ? body.idempotency_key : null,
        expectedVersion: typeof body.expected_room_version === 'number' ? body.expected_room_version : undefined, dryRun: body.dry_run === true,
      }, user), body.dry_run === true ? 200 : 201);
    }
    if (action === 'resolve_approval_request') {
      const resolution = requiredText(body.resolution, 'resolution', 40);
      if (!['approved', 'rejected'].includes(resolution)) throw new Error('Unsupported resolution.');
      return response(await resolveApprovalRequest(requiredText(body.approval_id, 'approval_id', 200), resolution as 'approved' | 'rejected', user));
    }
    if (action === 'schedule_reminder') return response(await scheduleRoomReminder(
      requiredText(body.room_id, 'room_id', 200), typeof body.requirement_id === 'string' ? body.requirement_id : null,
      typeof body.recipient_user_id === 'string' ? body.recipient_user_id : null,
      typeof body.due_at === 'number' ? body.due_at : Date.now() + 86_400_000, user,
    ), 201);
    if (action === 'create_change_set') return response(await createChangeSet({
      roomId: requiredText(body.room_id, 'room_id', 200), title: requiredText(body.title, 'title', 180),
      summary: requiredText(body.summary, 'summary', 2_000), changes: changeList(body.changes),
      actorPath: body.actor_path === 'webmcp' ? 'webmcp' : 'human', agentSessionId: typeof body.agent_session_id === 'string' ? body.agent_session_id : null,
      idempotencyKey: typeof body.idempotency_key === 'string' ? body.idempotency_key : null,
      expectedVersion: typeof body.expected_room_version === 'number' ? body.expected_room_version : undefined, dryRun: body.dry_run === true,
    }, user), body.dry_run === true ? 200 : 201);
    if (action === 'revise_change_set') return response(await reviseChangeSet(
      requiredText(body.change_set_id, 'change_set_id', 200),
      { title: typeof body.title === 'string' ? body.title : undefined, summary: typeof body.summary === 'string' ? body.summary : undefined, changes: changeList(body.changes), actorPath: body.actor_path === 'webmcp' ? 'webmcp' : 'human', agentSessionId: typeof body.agent_session_id === 'string' ? body.agent_session_id : null }, user,
    ));
    if (action === 'submit_change_set') return response(await submitChangeSet(requiredText(body.change_set_id, 'change_set_id', 200), user, body.actor_path === 'webmcp' ? 'webmcp' : 'human', typeof body.agent_session_id === 'string' ? body.agent_session_id : null));
    if (action === 'add_change_set_thread') return response(await addChangeSetThread(
      requiredText(body.change_set_id, 'change_set_id', 200), typeof body.change_id === 'string' ? body.change_id : null,
      requiredText(body.content, 'content', 4_000), user, body.actor_path === 'webmcp' ? 'webmcp' : 'human', typeof body.agent_session_id === 'string' ? body.agent_session_id : null,
    ), 201);
    if (action === 'resolve_change_set_thread') return response(await resolveChangeSetThread(requiredText(body.thread_id, 'thread_id', 200), user, body.actor_path === 'webmcp' ? 'webmcp' : 'human', typeof body.agent_session_id === 'string' ? body.agent_session_id : null));
    if (action === 'review_change_set') {
      const verdict = requiredText(body.verdict, 'verdict', 40);
      if (!['comment', 'approve', 'request_changes'].includes(verdict)) throw new Error('Unsupported review verdict.');
      return response(await reviewChangeSet(requiredText(body.change_set_id, 'change_set_id', 200), verdict as 'comment' | 'approve' | 'request_changes', optionalText(body.content, '', 4_000), user));
    }
    if (action === 'adopt_change_set') return response(await adoptChangeSet(requiredText(body.change_set_id, 'change_set_id', 200), user));
    return errorResponse('Unsupported write action.', 400);
  } catch (error) {
    return errorResponse(error, 400);
  }
}
