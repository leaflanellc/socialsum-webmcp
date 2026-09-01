export const WEBMCP_TOOL_GROUPS = {
  bootstrap: [
    'guide_socialsum_user',
    'get_webmcp_capabilities',
    'list_rooms',
    'navigate_to_room',
    'get_outcome_benchmarks',
    'recommend_room_setup',
    'list_governance_templates',
  ],
  workspace: [
    'get_workspace_snapshot',
    'get_my_assignments',
    'create_room_draft',
  ],
  roomCore: [
    'get_room_brief',
    'get_updates_since_version',
    'get_decision_readiness',
    'get_room_activity',
  ],
  work: [
    'get_decision_brief',
    'list_deliberation_items',
    'compare_proposals',
    'get_agent_session',
    'start_agent_work_session',
    'get_agent_catch_up_packet',
    'update_agent_event_state',
    'create_agent_checkpoint',
    'get_approval_status',
    'list_available_room_actions',
    'create_deliberation_item',
    'request_human_approval',
    'list_change_sets',
    'get_change_set',
    'compare_change_set',
    'get_change_set_readiness',
    'create_change_set',
    'revise_change_set',
    'submit_change_set_for_review',
    'add_change_set_review_thread',
    'resolve_change_set_review_thread',
  ],
  requirements: [
    'list_room_requirements',
    'get_my_assignments',
    'add_private_contribution',
    'submit_requirement_input',
    'propose_requirement',
    'request_human_approval',
  ],
  files: ['list_room_files'],
  constitution: [
    'list_room_participants',
    'get_agent_session',
    'list_available_room_actions',
    'list_governance_templates',
  ],
  activity: [
    'get_updates_since_version',
    'get_room_activity',
    'get_agent_catch_up_packet',
    'update_agent_event_state',
    'create_agent_checkpoint',
  ],
} as const;

export type SocialsumTab = 'work' | 'requirements' | 'files' | 'constitution' | 'activity';

export const WEBMCP_TOOL_NAMES = Array.from(new Set(Object.values(WEBMCP_TOOL_GROUPS).flat()));

const READ_ONLY_TOOLS = new Set([
  ...WEBMCP_TOOL_GROUPS.bootstrap,
  'get_room_brief',
  'get_updates_since_version',
  'list_room_requirements',
  'get_decision_readiness',
  'get_room_activity',
  'get_decision_brief',
  'list_deliberation_items',
  'compare_proposals',
  'list_room_participants',
  'list_room_files',
  'list_change_sets',
  'get_change_set',
  'compare_change_set',
  'get_change_set_readiness',
  'get_approval_status',
  'list_available_room_actions',
]);

export function getActiveWebMcpToolNames(input: {
  isAnonymous: boolean;
  detailOpen: boolean;
  activeTab: SocialsumTab;
}) {
  const names = new Set<string>(WEBMCP_TOOL_GROUPS.bootstrap);
  if (!input.isAnonymous) WEBMCP_TOOL_GROUPS.workspace.forEach((name) => names.add(name));
  if (input.detailOpen) {
    WEBMCP_TOOL_GROUPS.roomCore.forEach((name) => names.add(name));
    WEBMCP_TOOL_GROUPS[input.activeTab].forEach((name) => names.add(name));
  }
  if (input.isAnonymous) {
    return Array.from(names).filter((name) => READ_ONLY_TOOLS.has(name));
  }
  return Array.from(names);
}

export type WebMcpErrorCode =
  | 'AUTH_REQUIRED'
  | 'NOT_FOUND'
  | 'VERSION_CONFLICT'
  | 'FORBIDDEN'
  | 'HUMAN_REQUIRED'
  | 'INVALID_INPUT'
  | 'INTERNAL_ERROR';

export type WebMcpError = {
  code: WebMcpErrorCode;
  message: string;
  recoverable: boolean;
  next_action: string;
};

export function toWebMcpError(value: unknown, status?: number): WebMcpError {
  const message = value instanceof Error ? value.message : typeof value === 'string' ? value : 'Request failed.';
  const normalized = message.toLowerCase();
  if (status === 401 || normalized.includes('sign in')) {
    return { code: 'AUTH_REQUIRED', message, recoverable: true, next_action: 'Ask the person to sign in with ChatGPT, then rediscover the page tools.' };
  }
  if (status === 404 || normalized.includes('not found')) {
    return { code: 'NOT_FOUND', message, recoverable: true, next_action: 'Refresh the relevant list, use an exact current id, and retry.' };
  }
  if (normalized.includes('version_conflict') || normalized.includes('version conflict')) {
    return { code: 'VERSION_CONFLICT', message, recoverable: true, next_action: 'Read updates since the known version, reconcile the change, and retry with the current version.' };
  }
  if (normalized.includes('human') && (normalized.includes('approve') || normalized.includes('required'))) {
    return { code: 'HUMAN_REQUIRED', message, recoverable: true, next_action: 'Prepare the exact payload for review and ask an authorized person to approve it in Socialsum.' };
  }
  if (status === 403 || normalized.includes('not a participant') || normalized.includes('requires one of these room roles') || normalized.includes('not authorized')) {
    return { code: 'FORBIDDEN', message, recoverable: false, next_action: 'Stop and ask the person to verify room membership, role, and agent scope.' };
  }
  if (status === 400 || normalized.includes('required') || normalized.includes('unsupported') || normalized.includes('must be')) {
    return { code: 'INVALID_INPUT', message, recoverable: true, next_action: 'Correct the input using the tool schema and retry once.' };
  }
  return { code: 'INTERNAL_ERROR', message, recoverable: true, next_action: 'Refresh the shared state and retry once. If it repeats, report the error without guessing.' };
}
