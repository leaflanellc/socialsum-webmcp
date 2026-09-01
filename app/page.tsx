'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getActiveWebMcpToolNames,
  toWebMcpError,
  WEBMCP_TOOL_GROUPS,
  WEBMCP_TOOL_NAMES,
} from '../lib/webmcp-contract';

type RoomSummary = {
  id: string;
  title: string;
  problem: string;
  desired_outcome: string;
  governance_model: string;
  decision_authority: string;
  status: 'draft' | 'active' | 'closed';
  current_phase: number;
  deadline_at: number | null;
  people_count: number;
  requirement_count: number;
  accepted_count: number;
  published_count: number;
  private_draft_count: number;
  requiredInputs: number;
  acceptedInputs: number;
  progress: number;
  version: number;
  meeting_avoided: number;
  constitution: Record<string, string>;
  successCriteria: string[];
};

type Phase = { id: string; position: number; name: string; status: string; starts_at: number; ends_at: number };
type Requirement = {
  id: string;
  title: string;
  description: string;
  owner_label: string;
  owner_user_id: string | null;
  kind: string;
  required: number;
  status: 'open' | 'submitted' | 'accepted';
  due_at: number | null;
  contribution_id: string | null;
};
type Contribution = {
  id: string;
  type: string;
  title: string;
  body: string;
  visibility: 'private_draft' | 'published';
  author_name: string;
  prepared_with_agent: number;
  source_count: number;
  created_at: number;
};
type Activity = {
  id: string;
  actor_name: string;
  actor_path: 'human' | 'webmcp';
  action: string;
  summary: string;
  created_at: number;
  room_title?: string;
};
type AgentSession = {
  id: string; owner_user_id: string; agent_name: string; scopes: string[]; status: string; expires_at: number; last_seen_at: number;
  catchUp: {
    caught_up_through: number | null; unread_count: number; work_status: 'working' | 'checkpointed' | 'never_started';
    active_work_session_id: string | null;
    latest_checkpoint: null | { id: string; summary: string | null; assumptions: string[]; commitments: string[]; created_at: number };
  };
};
type RoomDetail = RoomSummary & {
  phases: Phase[];
  requirements: Requirement[];
  contributions: Contribution[];
  privateDrafts: Contribution[];
  members: Array<{ id: string; user_id: string; display_name: string; role: string }>;
  invitations: Array<{ id: string; invited_email: string; role: string; status: string; created_at: number }>;
  attachments: Array<{ id: string; filename: string; content_type: string; size_bytes: number; uploaded_by_name: string; created_at: number }>;
  currentUserRole: string;
  activity: Activity[];
  decision: null | { summary: string; rationale: string; dissent: string[]; decided_at: number };
  outcomeReview: null | (Record<string, unknown> & { overallScore: number; verification_level: string; evidence: string[]; dissent: string[] });
  agentSessions: AgentSession[];
  deliberationItems: Array<{ id: string; item_type: string; title: string; body: string; status: string; related_item_id: string | null; source_count: number; actor_path: string; author_name: string }>;
  approvals: Array<{ id: string; action_type: string; rationale: string; status: string; requested_by_name: string; created_at: number; payload: Record<string, unknown> }>;
  reminders: Array<{ id: string; requirement_id: string | null; recipient_user_id: string | null; status: string; due_at: number }>;
  decisionBrief: { room_version: number; ready: boolean; blockers: Requirement[]; accepted_evidence: Array<Record<string, unknown>>; leading_proposals: Array<Record<string, unknown>>; unresolved_questions: Array<Record<string, unknown>>; material_objections: Array<Record<string, unknown>>; contradictions: Array<Record<string, unknown>>; next_action: string; time_remaining_ms: number | null; meeting_avoided: boolean };
  changeSets: ChangeSet[];
  freshness: { viewed_version: number; latest_version: number; is_current: boolean; checked_at: number };
};
type RoomUpdates = {
  room_id: string;
  viewed_version: number;
  latest_version: number;
  is_current: boolean;
  versions_behind: number;
  checked_at: number;
  room_updated_at: number;
  updates: Array<Activity & { room_version: number | null; object_type: string; object_id: string | null }>;
};
type AgentActivityState = {
  status: 'idle' | 'working' | 'recent';
  toolName: string | null;
  lastCompletedAt: number | null;
};
type ChangeSet = {
  id: string; room_id: string; base_version: number; revision: number; title: string; summary: string;
  status: 'draft' | 'open' | 'changes_requested' | 'approved' | 'adopted' | 'closed'; author_user_id: string; author_name: string;
  actor_path: 'human' | 'webmcp'; updated_at: number; ready: boolean;
  changes: Array<{ id: string; position: number; change_type: string; target_type: string; target_id: string | null; field_name: string | null; before: unknown; after: unknown }>;
  reviews: Array<{ id: string; reviewer_user_id: string; reviewer_name: string; verdict: string; body: string; reviewed_revision: number }>;
  threads: Array<{ id: string; change_id: string | null; author_user_id: string; author_name: string; body: string; status: string }>;
  checks: Array<{ key: string; label: string; required: boolean; status: 'pass' | 'fail'; detail: string }>;
};
type WorkspaceData = {
  workspace: { id: string; name: string };
  user: { userId: string; displayName: string; email: string; isAnonymous?: boolean };
  localTesting: boolean;
  rooms: RoomSummary[];
  activity: Activity[];
  outcomes: Array<Record<string, unknown> & { overallScore: number; title: string; verification_level: string; evidence: string[] }>;
  invitations: Array<{ id: string; room_id: string; room_title: string; role: string }>;
};

type ModelContext = {
  registerTool: (tool: Record<string, unknown>) => Promise<void>;
  unregisterTool?: (name: string) => Promise<void>;
};

const API = '/api/commonwork';
type LocalIdentity = 'local-jonathan' | 'local-sarah' | 'local-marcus' | 'local-priya' | 'local-outsider';
const LOCAL_IDENTITY_KEY = 'commonwork-local-identity';

function currentLocalIdentity(): LocalIdentity {
  if (typeof window === 'undefined') return 'local-jonathan';
  const value = window.localStorage.getItem(LOCAL_IDENTITY_KEY);
  return localIdentities.some((item) => item.id === value) ? value as LocalIdentity : 'local-jonathan';
}

const roomModels = {
  'Decision room': {
    completion: '76%',
    median: '5.2 days',
    description: 'A clear owner decides after required cross-functional input.',
  },
  'Technical RFC': {
    completion: '71%',
    median: '8.4 days',
    description: 'Competing technical approaches receive documented review.',
  },
  'Consent workshop': {
    completion: '64%',
    median: '6.7 days',
    description: 'Material objections are surfaced and resolved before action.',
  },
};

const localIdentities: Array<{ id: LocalIdentity; name: string; initials: string }> = [
  { id: 'local-jonathan', name: 'Jonathan · owner', initials: 'JF' },
  { id: 'local-sarah', name: 'Sarah · facilitator', initials: 'SC' },
  { id: 'local-marcus', name: 'Marcus · reviewer', initials: 'MR' },
  { id: 'local-priya', name: 'Priya · invited', initials: 'PS' },
  { id: 'local-outsider', name: 'Outside tester', initials: 'OT' },
];

class SocialsumApiError extends Error {
  status: number;
  details?: ReturnType<typeof toWebMcpError>;

  constructor(message: string, status: number, details?: ReturnType<typeof toWebMcpError>) {
    super(message);
    this.name = 'SocialsumApiError';
    this.status = status;
    this.details = details;
  }
}

async function apiGet(action: string, roomId?: string, changeSetId?: string, sinceVersion?: number) {
  const url = new URL(API, window.location.origin);
  url.searchParams.set('action', action);
  if (roomId) url.searchParams.set('room_id', roomId);
  if (changeSetId) url.searchParams.set('change_set_id', changeSetId);
  if (sinceVersion !== undefined) url.searchParams.set('since_version', String(sinceVersion));
  const result = await fetch(url, { headers: { 'x-commonwork-test-user': currentLocalIdentity() } });
  const data = await result.json() as Record<string, unknown> & { error?: string; error_details?: ReturnType<typeof toWebMcpError> };
  if (!result.ok) throw new SocialsumApiError(data.error || 'Request failed.', result.status, data.error_details);
  return data;
}

async function apiPost(body: Record<string, unknown>) {
  const result = await fetch(API, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-commonwork-test-user': currentLocalIdentity() },
    body: JSON.stringify(body),
  });
  const data = await result.json() as Record<string, unknown> & { error?: string; error_details?: ReturnType<typeof toWebMcpError> };
  if (!result.ok) throw new SocialsumApiError(data.error || 'Request failed.', result.status, data.error_details);
  return data;
}

function formatDate(value: number | null, withTime = false) {
  if (!value) return 'No deadline';
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: 'numeric', minute: '2-digit' } : {}),
  }).format(new Date(value));
}

function initialsFor(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase() || 'CW';
}

function relativeTime(value: number) {
  const hours = Math.round((Date.now() - value) / 3_600_000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return hours + 'h ago';
  return Math.round(hours / 24) + 'd ago';
}

function changeLabel(change: ChangeSet['changes'][number]) {
  if (change.change_type === 'add_deliberation_item') return `Add ${String((change.after as Record<string, unknown>)?.item_type || 'deliberation item')}`;
  if (change.change_type === 'add_requirement') return 'Add required input';
  if (change.change_type === 'update_room_field') return `Update ${String(change.field_name || 'room field').replaceAll('_', ' ')}`;
  return 'Resolve deliberation item';
}

function changeValue(value: unknown) {
  if (value === null || value === undefined) return 'Not set';
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return String(record.title || record.body || record.description || record.status || JSON.stringify(record));
  }
  return String(value);
}

function toolActivityLabel(toolName: string | null) {
  if (!toolName) return 'site tools';
  const labels: Record<string, string> = {
    guide_socialsum_user: 'guiding you through Socialsum',
    get_room_brief: 'reading the room',
    get_updates_since_version: 'checking for updates',
    start_agent_work_session: 'opening a work session',
    get_agent_catch_up_packet: 'catching up on the room',
    update_agent_event_state: 'recording what it reviewed',
    create_agent_checkpoint: 'leaving a durable checkpoint',
    create_change_set: 'preparing a change set',
    revise_change_set: 'revising a change set',
    submit_change_set_for_review: 'submitting work for review',
    create_deliberation_item: 'adding structured work',
    add_private_contribution: 'preparing a private draft',
    submit_requirement_input: 'preparing required input',
    navigate_to_room: 'opening the room',
  };
  return labels[toolName] || toolName.replaceAll('_', ' ');
}

export default function Home() {
  const [workspace, setWorkspace] = useState<WorkspaceData | null>(null);
  const [activeRoomId, setActiveRoomId] = useState('webmcp-first-use-case');
  const activeRoomRef = useRef(activeRoomId);
  const [roomDetail, setRoomDetail] = useState<RoomDetail | null>(null);
  const [roomUpdates, setRoomUpdates] = useState<RoomUpdates | null>(null);
  const [updatesExpanded, setUpdatesExpanded] = useState(false);
  const [agentActivity, setAgentActivity] = useState<AgentActivityState>({ status: 'idle', toolName: null, lastCompletedAt: null });
  const [activeWebMcpToolCount, setActiveWebMcpToolCount] = useState<number>(WEBMCP_TOOL_GROUPS.bootstrap.length);
  const agentCallsInFlight = useRef(0);
  const agentIdleTimer = useRef<number | null>(null);
  const webMcpRegistrationGeneration = useRef(0);
  const [detailOpen, setDetailOpen] = useState(false);
  const [publicExploreOpen, setPublicExploreOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'work' | 'requirements' | 'files' | 'constitution' | 'activity'>('work');
  const webMcpContextRef = useRef<{
    isAnonymous: boolean;
    detailOpen: boolean;
    activeTab: 'work' | 'requirements' | 'files' | 'constitution' | 'activity';
  }>({ isAnonymous: true, detailOpen: false, activeTab: 'work' });
  const [localIdentity, setLocalIdentity] = useState<LocalIdentity>(() => currentLocalIdentity());
  const [setupOpen, setSetupOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [setupStep, setSetupStep] = useState(1);
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('collaborator@local.test');
  const [inviteRole, setInviteRole] = useState<'facilitator' | 'contributor' | 'reviewer'>('contributor');
  const [contributionForm, setContributionForm] = useState({ requirementId: '', type: 'evidence', title: '', content: '', sourceCount: '0' });
  const [decisionForm, setDecisionForm] = useState({ summary: '', rationale: '', dissent: '' });
  const [outcomeForm, setOutcomeForm] = useState({
    goalAchievement: '8', evidenceQuality: '8', processIntegrity: '8', participationHealth: '8', execution: '8', learningValue: '8',
    verificationLevel: 'self_reported', evidence: '', dissent: '',
  });
  const [deliberationForm, setDeliberationForm] = useState({ itemType: 'claim', title: '', content: '', relatedItemId: '', sourceCount: '0' });
  const [agentForm, setAgentForm] = useState({ name: 'My external agent', expiresInHours: '24', scopes: ['read_room', 'read_files', 'prepare_contributions', 'submit_requirements', 'request_approvals', 'prepare_change_sets'] });
  const [changeSetForm, setChangeSetForm] = useState({ title: '', summary: '', itemType: 'proposal', changeTitle: '', content: '' });
  const [reviewDrafts, setReviewDrafts] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    title: "Choose Socialsum's first production use case",
    problem: 'We need to choose a first real-world workflow where WebMCP makes human-agent collaboration substantially better than a normal dashboard or chatbot.',
    desiredOutcome: 'Select one use case with a target user, workflow, required evidence, WebMCP actions, and a pilot success measure.',
    governanceModel: 'Decision room',
    successCriteria: 'Painful real-world problem\nWebMCP is essential, not decorative\nDemoable in under three minutes\nBuildable and testable during the hackathon',
  });

  const notify = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(''), 3200);
  }, []);

  const loadWorkspace = useCallback(async () => {
    try {
      setError('');
      const data = await apiGet('workspace') as WorkspaceData;
      setWorkspace(data);
      if (localIdentities.some((item) => item.id === data.user.userId)) setLocalIdentity(data.user.userId as LocalIdentity);
      if (!data.rooms.some((room) => room.id === activeRoomRef.current) && data.rooms[0]) {
        setActiveRoomId(data.rooms[0].id);
      }
      return data;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load Socialsum.');
      return null;
    }
  }, []);

  const loadRoom = useCallback(async (roomId: string, shouldOpen = true) => {
    try {
      setError('');
      const room = await apiGet('room', roomId) as RoomDetail;
      setActiveRoomId(roomId);
      setRoomDetail(room);
      setRoomUpdates(null);
      setUpdatesExpanded(false);
      if (shouldOpen) setDetailOpen(true);
      return room;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load room.');
      return null;
    }
  }, []);

  useEffect(() => {
    const openFromHash = () => {
      const params = new URLSearchParams(window.location.hash.slice(1));
      const roomId = params.get('room');
      const requestedTab = params.get('tab');
      if (!roomId) return;
      setPublicExploreOpen(true);
      const tab = ['work', 'requirements', 'files', 'constitution', 'activity'].includes(requestedTab || '')
        ? requestedTab as 'work' | 'requirements' | 'files' | 'constitution' | 'activity'
        : 'work';
      setActiveTab(tab);
      void loadRoom(roomId, true);
    };
    window.addEventListener('hashchange', openFromHash);
    openFromHash();
    return () => window.removeEventListener('hashchange', openFromHash);
  }, [loadRoom]);

  useEffect(() => {
    const timer = window.setTimeout(() => void loadWorkspace(), 0);
    return () => window.clearTimeout(timer);
  }, [loadWorkspace]);

  useEffect(() => {
    activeRoomRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    webMcpContextRef.current = {
      isAnonymous: workspace?.user.isAnonymous ?? true,
      detailOpen,
      activeTab,
    };
  }, [activeTab, detailOpen, workspace?.user.isAnonymous]);

  useEffect(() => () => {
    if (agentIdleTimer.current !== null) window.clearTimeout(agentIdleTimer.current);
  }, []);

  useEffect(() => {
    if (!detailOpen || !roomDetail) return;
    let cancelled = false;
    const checkForUpdates = async () => {
      try {
        const result = await apiGet('room_updates', roomDetail.id, undefined, roomDetail.version) as RoomUpdates;
        if (!cancelled) setRoomUpdates(result.is_current ? null : result);
      } catch {
        // The full room load owns user-visible access errors; polling stays quiet.
      }
    };
    void checkForUpdates();
    const interval = window.setInterval(() => void checkForUpdates(), 5_000);
    return () => { cancelled = true; window.clearInterval(interval); };
  }, [detailOpen, roomDetail]);

  useEffect(() => {
    const modelContext = (document as Document & { modelContext?: ModelContext }).modelContext;
    if (!modelContext?.registerTool) return;
    const toolDefinitions: Record<string, unknown>[] = [];
    const register = (tool: Record<string, unknown>) => {
      const execute = tool.execute;
      if (typeof execute !== 'function') {
        toolDefinitions.push(tool);
        return;
      }
      const toolName = String(tool.name || 'site_tool');
      toolDefinitions.push({
        ...tool,
        execute: async (input: Record<string, unknown>) => {
          agentCallsInFlight.current += 1;
          if (agentIdleTimer.current !== null) window.clearTimeout(agentIdleTimer.current);
          setAgentActivity({ status: 'working', toolName, lastCompletedAt: null });
          try {
            return await (execute as (value: Record<string, unknown>) => unknown)(input);
          } catch (caught) {
            const error = caught instanceof SocialsumApiError && caught.details
              ? caught.details
              : toWebMcpError(caught, caught instanceof SocialsumApiError ? caught.status : undefined);
            return { ok: false, error };
          } finally {
            agentCallsInFlight.current = Math.max(0, agentCallsInFlight.current - 1);
            if (agentCallsInFlight.current === 0) {
              const completedAt = Date.now();
              agentIdleTimer.current = window.setTimeout(() => {
                if (agentCallsInFlight.current > 0) return;
                setAgentActivity({ status: 'recent', toolName, lastCompletedAt: completedAt });
                agentIdleTimer.current = window.setTimeout(() => {
                  setAgentActivity((current) => current.lastCompletedAt === completedAt
                    ? { status: 'idle', toolName: null, lastCompletedAt: completedAt }
                    : current);
                }, 45_000);
              }, 650);
            }
          }
        },
      });
    };

    register({
      name: 'guide_socialsum_user',
      description: 'Use this when a person asks what Socialsum is, why it is useful, how to use it, what to do next, or seems unfamiliar with the app. Returns a practical, user-ready explanation tailored to their goal, current room, role, and available WebMCP actions. It is gently persuasive but prioritizes accurate guidance over marketing.',
      inputSchema: {
        type: 'object',
        properties: {
          goal: {
            type: 'string',
            enum: ['understand', 'evaluate', 'start_room', 'contribute', 'bring_agent', 'replace_meeting'],
            description: 'What the person is trying to accomplish. Defaults to understand.',
          },
          depth: {
            type: 'string',
            enum: ['quick', 'guided', 'complete'],
            description: 'Quick is a short orientation; guided adds steps and current context; complete includes concepts, safeguards, and example prompts.',
          },
          room_id: {
            type: 'string',
            description: 'Optional exact room id. When omitted, use the room currently open on the page when available.',
          },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ goal = 'understand', depth = 'guided', room_id }: { goal?: string; depth?: string; room_id?: string }) => {
        const data = await apiGet('workspace') as WorkspaceData;
        const targetRoomId = room_id || activeRoomRef.current;
        const roomSummary = data.rooms.find((room) => room.id === targetRoomId) || data.rooms.find((room) => room.status === 'active') || data.rooms[0] || null;
        let room: RoomDetail | null = null;
        if (roomSummary) {
          try {
            room = await apiGet('room', roomSummary.id) as RoomDetail;
          } catch {
            // Workspace-level guidance remains useful when a room is not visible to this participant.
          }
        }

        const goalGuidance: Record<string, { outcome: string; steps: string[]; tools: string[]; example: string }> = {
          understand: {
            outcome: 'Understand the shared human-agent workflow before taking action.',
            steps: ['Scan the active rooms and their deadlines.', 'Open one room and read its problem, desired outcome, constitution, and required inputs.', 'Ask which contribution or decision is currently blocked.'],
            tools: ['get_workspace_snapshot', 'get_room_brief', 'get_decision_brief'],
            example: 'Explain this room in plain language, tell me what is blocked, and recommend one useful next step for me and one for you.',
          },
          evaluate: {
            outcome: 'Decide whether Socialsum fits a real coordination problem.',
            steps: ['Compare the problem with an existing room pattern.', 'Inspect completed outcome evidence, not just activity.', 'Identify where shared live state and human approval make WebMCP essential.'],
            tools: ['get_outcome_benchmarks', 'list_governance_templates', 'recommend_room_setup'],
            example: 'Evaluate whether Socialsum could replace our weekly status meeting, including where it would help and where it would not.',
          },
          start_room: {
            outcome: 'Turn a fuzzy problem into a reviewable room draft.',
            steps: ['State the decision or deliverable in one sentence.', 'Name the required evidence, owners, deadline, and decision authority.', 'Ask the agent to recommend a setup, then create only a private draft for review.'],
            tools: ['recommend_room_setup', 'list_governance_templates', 'create_room_draft'],
            example: 'Help me design a room for this decision. Recommend the governance and timeline, then show me the draft before creating it.',
          },
          contribute: {
            outcome: 'Make a useful contribution without adding noise or publishing prematurely.',
            steps: ['Check your assigned and overdue inputs.', 'Catch up on relevant changes and unresolved objections.', 'Prepare evidence or a proposal privately, then ask the person to review it before publication.'],
            tools: ['get_my_assignments', 'get_agent_catch_up_packet', 'add_private_contribution', 'submit_requirement_input'],
            example: 'Find what I owe this room, catch me up only on relevant changes, and help me prepare a private contribution.',
          },
          bring_agent: {
            outcome: 'Connect an agent to the same durable room state with clear limits.',
            steps: ['Confirm an active scoped agent connection for this room.', 'Start or resume a work session and request a delta catch-up packet.', 'Acknowledge only events actually considered, and leave a durable checkpoint before ending.'],
            tools: ['get_agent_session', 'start_agent_work_session', 'get_agent_catch_up_packet', 'update_agent_event_state', 'create_agent_checkpoint'],
            example: 'Connect to this room, catch up from my last checkpoint, and tell me what you read, deferred, and recommend next.',
          },
          replace_meeting: {
            outcome: 'Replace routine status collection with an asynchronous, deadline-driven decision room.',
            steps: ['Define the decision and the evidence required from each owner.', 'Set an input window and an explicit escalation rule.', 'Use a live meeting only for a named material objection that remains unresolved at the deadline.'],
            tools: ['recommend_room_setup', 'create_room_draft', 'list_room_requirements', 'get_decision_readiness'],
            example: 'Design a five-day room to replace this meeting. Require owner inputs, enforce a deadline, and escalate only unresolved conflict.',
          },
        };
        const selected = goalGuidance[goal] || goalGuidance.understand;
        const currentContext = room ? {
          room_id: room.id,
          room_title: room.title,
          status: room.status,
          participant_role: room.currentUserRole,
          progress_percent: room.progress,
          deadline_at: room.deadline_at,
          room_version: room.version,
          open_required_inputs: room.requirements.filter((item) => item.required && item.status !== 'accepted').length,
          private_drafts: room.privateDrafts.length,
          unresolved_objections: room.decisionBrief.material_objections.length,
          ready_to_decide: room.decisionBrief.ready,
          next_action: room.decisionBrief.next_action,
        } : null;

        const guide: Record<string, unknown> = {
          response_instruction: 'Explain this in your own natural voice. Start with the plain-language summary, connect it to the person’s stated goal and current room, then offer no more than three next steps. Do not read field names aloud or oversell the product.',
          plain_language_summary: 'Socialsum is a shared decision workspace where people contribute judgment and their own agents help gather evidence, find gaps, prepare proposals, and keep work moving. Everyone works against the same durable room state instead of passing summaries between chats.',
          concise_value_proposition: 'Fewer status meetings, clearer required inputs, visible deadlines, and decisions with an attributable record.',
          not_a_chatbot: 'Socialsum does not contain a resident AI that speaks for the group. Each participant brings their own agent, and WebMCP gives that agent safe access to the same rooms, requirements, timelines, and review state the person sees.',
          current_context: currentContext,
          goal: { name: goal, intended_outcome: selected.outcome },
          recommended_next_steps: selected.steps,
          useful_webmcp_tools: selected.tools,
          example_request_for_the_person: selected.example,
          access: data.user.isAnonymous
            ? { mode: 'public_demo', can_read: true, can_change: false, next_step: 'Sign in with ChatGPT to create rooms, contribute, or connect an agent.' }
            : { mode: 'participant', can_read: true, can_change: true },
        };
        if (depth !== 'quick') {
          guide.how_a_room_works = ['Frame a concrete problem and desired outcome.', 'Choose governance, roles, required inputs, authority, and a timeline.', 'People and agents prepare evidence and proposals; agent-created work begins private or reviewable.', 'Structured objections and readiness checks expose what is still unresolved.', 'Authorized humans approve consequential changes and record the final decision.', 'Closed rooms can be scored so future rooms learn from demonstrated outcomes.'];
          guide.trust_model = ['Agents inherit only the participant’s room access and scoped connection.', 'Agent work is attributed in the audit trail.', 'Delivered information is not silently treated as acknowledged.', 'Publishing, acceptance, activation, adoption, and final decisions retain human gates.', 'Version checks and semantic diffs prevent stale work from being applied invisibly.'];
        }
        if (depth === 'complete') {
          guide.best_fit = ['Cross-functional decisions with several required inputs', 'Technical RFCs and policy proposals', 'Meeting replacement for routine operational decisions', 'Investigations where evidence and dissent must remain attributable'];
          guide.poor_fit = ['Urgent decisions requiring second-by-second coordination', 'Casual conversation with no durable outcome', 'Work where no participant can own the final decision'];
          guide.key_terms = {
            room: 'A bounded workspace for one decision, investigation, or deliverable.',
            constitution: 'The room’s declared governance, roles, authority, safeguards, and success criteria.',
            required_input: 'A named contribution with an owner, due date, and human acceptance state.',
            change_set: 'A versioned proposal showing semantic before-and-after changes for review.',
            checkpoint: 'A durable handoff recording what an agent understood, assumed, committed to, or deferred.',
          };
        }
        return guide;
      },
    });

    register({
      name: 'get_webmcp_capabilities',
      description: 'Start here to understand the complete Socialsum WebMCP contract, the smaller capability pack active on this page, and where to navigate for other tools. Tool availability reflects sign-in and the current room tab; authorization is still enforced on the server.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => {
        const context = webMcpContextRef.current;
        const active = getActiveWebMcpToolNames(context);
        return {
          contract_version: '2026-09-01',
          authentication: context.isAnonymous ? 'anonymous_read_only' : 'signed_in_participant',
          page: context.detailOpen ? { kind: 'room', room_id: activeRoomRef.current, tab: context.activeTab } : { kind: 'workspace' },
          active_tools: active,
          active_tool_count: active.length,
          total_capabilities: WEBMCP_TOOL_NAMES.length,
          capability_groups: WEBMCP_TOOL_GROUPS,
          discovery_instruction: 'Use the active tools for this page. Navigate or change room tabs, then rediscover tools instead of assuming a stale catalog.',
        };
      },
    });

    register({
      name: 'get_workspace_snapshot',
      description: 'Read the persistent Socialsum workspace, including rooms, progress, deadlines, draft counts, recent activity, and outcomes.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async () => apiGet('workspace'),
    });
    register({
      name: 'list_rooms',
      description: 'List rooms that exist in the persistent workspace and summarize their governance, status, progress, and deadlines.',
      inputSchema: {
        type: 'object',
        properties: { status: { type: 'string', enum: ['all', 'draft', 'active', 'closed'] } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ status = 'all' }: { status?: string }) => {
        const data = await apiGet('workspace') as WorkspaceData;
        return { rooms: status === 'all' ? data.rooms : data.rooms.filter((room) => room.status === status) };
      },
    });
    register({
      name: 'get_room_brief',
      description: 'Read one persistent room with its current version, freshness metadata, constitution, participants, work, and decision state.',
      inputSchema: {
        type: 'object',
        properties: { room_id: { type: 'string', description: 'Exact room id from list_rooms.' } },
        required: ['room_id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id }: { room_id: string }) => apiGet('room', room_id),
    });
    register({
      name: 'get_updates_since_version',
      description: 'Check whether a room has changed since a known version and return the attributable update summaries. Read this before revising work; never silently rebase consequential changes.',
      inputSchema: {
        type: 'object',
        properties: { room_id: { type: 'string' }, since_version: { type: 'number', minimum: 0 } },
        required: ['room_id', 'since_version'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id, since_version }: { room_id: string; since_version: number }) => apiGet('room_updates', room_id, undefined, since_version),
    });
    register({
      name: 'list_room_requirements',
      description: 'List required inputs for a room, including owners, due dates, statuses, and whether attached input still awaits human acceptance.',
      inputSchema: {
        type: 'object',
        properties: { room_id: { type: 'string' }, status: { type: 'string', enum: ['all', 'open', 'submitted', 'accepted'] } },
        required: ['room_id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id, status = 'all' }: { room_id: string; status?: string }) => {
        const room = await apiGet('room', room_id) as RoomDetail;
        return {
          room_id,
          requirements: status === 'all' ? room.requirements : room.requirements.filter((item) => item.status === status),
        };
      },
    });
    register({
      name: 'get_decision_readiness',
      description: 'Check whether a room can decide now and explain every remaining blocker. This does not make or approve a decision.',
      inputSchema: {
        type: 'object',
        properties: { room_id: { type: 'string' } },
        required: ['room_id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id }: { room_id: string }) => {
        const room = await apiGet('room', room_id) as RoomDetail;
        const blockers = room.requirements.filter((item) => item.required && item.status !== 'accepted');
        return {
          room_id,
          ready: blockers.length === 0 && room.status === 'active',
          blockers,
          published_contributions: room.contributions.length,
          human_only_action: 'Recording the final decision remains a human action.',
        };
      },
    });
    register({
      name: 'get_room_activity',
      description: 'Read the room audit trail with human versus WebMCP attribution and persistent timestamps.',
      inputSchema: {
        type: 'object',
        properties: { room_id: { type: 'string' } },
        required: ['room_id'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id }: { room_id: string }) => {
        const room = await apiGet('room', room_id) as RoomDetail;
        return { room_id, activity: room.activity };
      },
    });
    register({
      name: 'recommend_room_setup',
      description: 'Recommend a room model, phases, authority, and safeguards using seeded completed-room benchmarks. This is advisory and does not create a room.',
      inputSchema: {
        type: 'object',
        properties: {
          problem: { type: 'string' },
          desired_outcome: { type: 'string' },
          decision_type: { type: 'string', enum: ['operational', 'technical', 'community', 'investigation'] },
        },
        required: ['problem'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ decision_type = 'operational' }: { decision_type?: string }) => {
        const recommendation = decision_type === 'technical' ? 'Technical RFC' : decision_type === 'community' ? 'Consent workshop' : 'Decision room';
        return {
          recommendation,
          ...roomModels[recommendation],
          phases: recommendation === 'Technical RFC'
            ? ['Frame', 'Collect options', 'Technical review', 'Resolve objections', 'Decide']
            : ['Frame', 'Collect input', 'Resolve gaps', 'Decide', 'Review outcome'],
          safeguards: ['Required inputs are explicit', 'Agent work starts private', 'Humans approve publication', 'Final decisions are human-only'],
          benchmark_warning: 'Seeded demonstration history shows correlation, not a causal guarantee.',
        };
      },
    });
    register({
      name: 'create_room_draft',
      description: 'Persist a private room draft with a constitution and timeline. It does not activate the room, invite participants, or publish anything.',
      inputSchema: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          problem: { type: 'string' },
          desired_outcome: { type: 'string' },
          governance_model: { type: 'string', enum: ['Decision room', 'Technical RFC', 'Consent workshop'] },
          success_criteria: { type: 'array', items: { type: 'string' }, maxItems: 12 },
        },
        required: ['title', 'problem', 'desired_outcome'],
        additionalProperties: false,
      },
      execute: async (input: Record<string, unknown>) => {
        const room = await apiPost({ action: 'create_room_draft', ...input, actor_path: 'webmcp' }) as RoomDetail;
        setActiveRoomId(room.id);
        setRoomDetail(room);
        setDetailOpen(true);
        await loadWorkspace();
        window.history.replaceState(null, '', `#room=${encodeURIComponent(room.id)}&tab=work&open=${Date.now()}`);
        return {
          room_id: room.id,
          status: room.status,
          activated: false,
          verification: 'The room exists in D1 as a private draft. Human activation is required.',
        };
      },
    });
    register({
      name: 'add_private_contribution',
      description: 'Persist an evidence, proposal, critique, or question draft visible only to the current user. Human review is required before publication.',
      inputSchema: {
        type: 'object',
        properties: {
          room_id: { type: 'string' },
          contribution_type: { type: 'string', enum: ['evidence', 'proposal', 'critique', 'question'] },
          title: { type: 'string' },
          content: { type: 'string' },
          source_count: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['room_id', 'contribution_type', 'title', 'content'],
        additionalProperties: false,
      },
      execute: async (input: Record<string, unknown>) => {
        const result = await apiPost({ action: 'add_private_contribution', ...input, actor_path: 'webmcp' });
        await loadRoom(String(input.room_id), true);
        await loadWorkspace();
        return result;
      },
    });
    register({
      name: 'submit_requirement_input',
      description: 'Attach a private contribution draft to one required input. The requirement becomes submitted, not accepted; human review is still required.',
      inputSchema: {
        type: 'object',
        properties: {
          requirement_id: { type: 'string' },
          contribution_type: { type: 'string', enum: ['evidence', 'proposal', 'critique', 'question'] },
          title: { type: 'string' },
          content: { type: 'string' },
          source_count: { type: 'number', minimum: 0, maximum: 100 },
        },
        required: ['requirement_id', 'contribution_type', 'title', 'content'],
        additionalProperties: false,
      },
      execute: async (input: Record<string, unknown>) => {
        const result = await apiPost({ action: 'submit_requirement_input', ...input, actor_path: 'webmcp' });
        await loadRoom(activeRoomRef.current, true);
        await loadWorkspace();
        return result;
      },
    });
    register({
      name: 'navigate_to_room',
      description: 'Open a room in the visible Socialsum interface so the person and agent inspect the same live state.',
      inputSchema: {
        type: 'object',
        properties: { room_id: { type: 'string' }, tab: { type: 'string', enum: ['work', 'requirements', 'files', 'constitution', 'activity'] } },
        required: ['room_id'],
        additionalProperties: false,
      },
      execute: async ({ room_id, tab = 'work' }: { room_id: string; tab?: 'work' | 'requirements' | 'files' | 'constitution' | 'activity' }) => {
        window.location.hash = `room=${encodeURIComponent(room_id)}&tab=${tab}&open=${Date.now()}`;
        return { opened: true, room_id, visible_tab: tab };
      },
    });
    register({
      name: 'get_outcome_benchmarks',
      description: 'Read seeded historical room benchmarks and warnings for governance setup. These are correlations, not guarantees.',
      inputSchema: {
        type: 'object',
        properties: { governance_model: { type: 'string', enum: ['Decision room', 'Technical RFC', 'Consent workshop'] } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async ({ governance_model = 'Decision room' }: { governance_model?: keyof typeof roomModels }) => ({
        governance_model,
        ...roomModels[governance_model],
        comparable_rooms: governance_model === 'Decision room' ? 42 : governance_model === 'Technical RFC' ? 31 : 18,
        warning: 'Seeded demonstration data. Correlation, not a causal guarantee.',
      }),
    });
    register({
      name: 'get_my_assignments',
      description: 'List required inputs assigned to the current signed-in participant across rooms they are authorized to access.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' } }, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id }: { room_id?: string }) => {
        const data = await apiGet('workspace') as WorkspaceData;
        const rooms = room_id ? data.rooms.filter((room) => room.id === room_id) : data.rooms;
        const details = await Promise.all(rooms.map((room) => apiGet('room', room.id) as Promise<unknown>));
        return {
          user: data.user,
          assignments: (details as RoomDetail[]).flatMap((room) => room.requirements
            .filter((item) => item.owner_user_id === data.user.userId)
            .map((item) => ({ room_id: room.id, room_title: room.title, ...item }))),
        };
      },
    });
    register({
      name: 'list_room_participants',
      description: 'List a room’s authorized participants and roles. Pending invitation details are only returned to owners and facilitators.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' } }, required: ['room_id'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id }: { room_id: string }) => {
        const room = await apiGet('room', room_id) as RoomDetail;
        return { room_id, current_user_role: room.currentUserRole, members: room.members, pending_invitations: room.invitations };
      },
    });
    register({
      name: 'list_room_files',
      description: 'List authorized room file metadata and download identifiers. This does not reveal file bytes or files from other rooms.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' } }, required: ['room_id'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id }: { room_id: string }) => {
        const room = await apiGet('room', room_id) as RoomDetail;
        return { room_id, files: room.attachments };
      },
    });
    register({
      name: 'get_decision_brief',
      description: 'Return the current decision question, accepted evidence, proposals, unresolved questions, objections, contradictions, blockers, room version, and recommended next action.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' } }, required: ['room_id'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id }: { room_id: string }) => ({ room_id, decision_brief: (await apiGet('room', room_id) as RoomDetail).decisionBrief }),
    });
    register({
      name: 'list_deliberation_items',
      description: 'List structured claims, evidence, proposals, questions, assumptions, objections, and decision criteria for a room.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' }, item_type: { type: 'string', enum: ['all', 'claim', 'evidence', 'proposal', 'question', 'assumption', 'objection', 'criterion'] }, status: { type: 'string', enum: ['all', 'open', 'resolved', 'accepted', 'rejected'] } }, required: ['room_id'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id, item_type = 'all', status = 'all' }: { room_id: string; item_type?: string; status?: string }) => {
        const room = await apiGet('room', room_id) as RoomDetail;
        return { room_id, items: room.deliberationItems.filter((item) => (item_type === 'all' || item.item_type === item_type) && (status === 'all' || item.status === status)) };
      },
    });
    register({
      name: 'compare_proposals',
      description: 'Compare room proposals with linked objections, unresolved questions, and evidence so an agent can surface tradeoffs without choosing for the owner.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' } }, required: ['room_id'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id }: { room_id: string }) => {
        const room = await apiGet('room', room_id) as RoomDetail;
        return { room_id, proposals: room.decisionBrief.leading_proposals, objections: room.decisionBrief.material_objections, contradictions: room.decisionBrief.contradictions, unresolved_questions: room.decisionBrief.unresolved_questions };
      },
    });
    register({
      name: 'get_agent_session',
      description: 'Inspect the current participant’s active agent connections, scopes, expiration, catch-up position, and current work-session state for a room.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' } }, required: ['room_id'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id }: { room_id: string }) => {
        const room = await apiGet('room', room_id) as RoomDetail; const data = await apiGet('workspace') as WorkspaceData;
        return { room_id, sessions: room.agentSessions.filter((session) => session.owner_user_id === data.user.userId && session.status === 'active' && session.expires_at > Date.now()) };
      },
    });
    register({
      name: 'start_agent_work_session',
      description: 'Open or resume a session-specific catch-up ledger for one agent connection. Use this before requesting a catch-up packet.',
      inputSchema: { type: 'object', properties: { agent_session_id: { type: 'string' }, resume_existing: { type: 'boolean', description: 'Resume an active work session when one exists. Defaults to true.' } }, required: ['agent_session_id'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => {
        const result = await apiPost({ action: 'start_agent_work_session', ...input });
        await loadRoom(activeRoomRef.current, true);
        return result;
      },
    });
    register({
      name: 'get_agent_catch_up_packet',
      description: 'Deliver a structured room catch-up packet and record which exact events entered this agent’s current session. Delivery is not acknowledgement.',
      inputSchema: {
        type: 'object',
        properties: {
          work_session_id: { type: 'string' },
          mode: { type: 'string', enum: ['delta', 'decision_history', 'topic_history', 'contribution_history', 'full_audit'] },
          query: { type: 'string', description: 'Required only for topic_history.' },
          limit: { type: 'number', minimum: 1, maximum: 100 },
        },
        required: ['work_session_id'], additionalProperties: false,
      },
      execute: async (input: Record<string, unknown>) => {
        const result = await apiPost({ action: 'get_agent_catch_up_packet', ...input });
        await loadRoom(activeRoomRef.current, true);
        return result;
      },
    });
    register({
      name: 'update_agent_event_state',
      description: 'Explicitly mark events delivered in this work session as acknowledged, deferred, or skipped. Never use acknowledged merely because events were returned by a tool.',
      inputSchema: { type: 'object', properties: { work_session_id: { type: 'string' }, event_ids: { type: 'array', minItems: 1, maxItems: 100, items: { type: 'string' } }, state: { type: 'string', enum: ['acknowledged', 'deferred', 'skipped'] } }, required: ['work_session_id', 'event_ids', 'state'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => {
        const result = await apiPost({ action: 'update_agent_event_state', ...input });
        await loadRoom(activeRoomRef.current, true);
        return result;
      },
    });
    register({
      name: 'create_agent_checkpoint',
      description: 'Leave a durable plain-language checkpoint for a future agent session, including current assumptions, commitments, deferred events, and the latest explicitly acknowledged event.',
      inputSchema: { type: 'object', properties: { work_session_id: { type: 'string' }, summary: { type: 'string' }, assumptions: { type: 'array', maxItems: 20, items: { type: 'string' } }, commitments: { type: 'array', maxItems: 20, items: { type: 'string' } }, close_session: { type: 'boolean' } }, required: ['work_session_id', 'summary'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => {
        const result = await apiPost({ action: 'create_agent_checkpoint', ...input });
        await loadRoom(activeRoomRef.current, true);
        return result;
      },
    });
    register({
      name: 'get_approval_status',
      description: 'Read pending and resolved human approval requests for a room.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' }, status: { type: 'string', enum: ['all', 'pending', 'approved', 'rejected'] } }, required: ['room_id'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id, status = 'all' }: { room_id: string; status?: string }) => { const room = await apiGet('room', room_id) as RoomDetail; return { room_id, approvals: room.approvals.filter((item) => status === 'all' || item.status === status) }; },
    });
    register({
      name: 'list_available_room_actions',
      description: 'Explain which actions the current participant and their agent can take now, including which actions require human approval.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' } }, required: ['room_id'], additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: async ({ room_id }: { room_id: string }) => { const room = await apiGet('room', room_id) as RoomDetail; return { room_id, room_version: room.version, agent_can: ['inspect room', 'prepare private work', 'create or revise scoped change sets', 'submit change sets for review', 'open review threads', 'request approval'], agent_cannot: ['approve a change set', 'adopt changes', 'approve its own work'], human_can: ['publish own drafts', 'comment on proposals', ...(room.currentUserRole === 'reviewer' ? ['approve or request changes on others’ change sets'] : []), ...(room.currentUserRole === 'owner' ? ['adopt ready change sets', 'activate room', 'record final decision', 'connect or revoke agent sessions'] : [])], approval_required: ['change-set adoption', 'publication', 'requirement acceptance', 'activation', 'final decision', 'deadline extension'] }; },
    });
    register({
      name: 'list_governance_templates',
      description: 'List reusable governance templates for operating decisions, RFCs, incident reviews, consent, and meeting replacement.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true },
      execute: async () => apiGet('governance_templates'),
    });
    register({
      name: 'create_deliberation_item',
      description: 'Create a structured published claim, evidence item, proposal, question, assumption, objection, or criterion. Supports dry-run, idempotency, and room-version conflict checks.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' }, item_type: { type: 'string', enum: ['claim', 'evidence', 'proposal', 'question', 'assumption', 'objection', 'criterion'] }, title: { type: 'string' }, content: { type: 'string' }, related_item_id: { type: 'string' }, source_count: { type: 'number', minimum: 0, maximum: 100 }, idempotency_key: { type: 'string' }, expected_room_version: { type: 'number' }, dry_run: { type: 'boolean' } }, required: ['room_id', 'item_type', 'title', 'content', 'idempotency_key'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => { const result = await apiPost({ action: 'create_deliberation_item', ...input, actor_path: 'webmcp' }); if (!input.dry_run) { await loadRoom(String(input.room_id), true); await loadWorkspace(); } return result; },
    });
    register({
      name: 'request_human_approval',
      description: 'Request, but never execute, a consequential publication, acceptance, activation, final decision, or deadline action. Supports dry-run, idempotency, and room-version conflict checks.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' }, action_type: { type: 'string', enum: ['publish_contribution', 'accept_requirement', 'activate_room', 'record_decision', 'deadline_extension'] }, payload: { type: 'object' }, rationale: { type: 'string' }, agent_session_id: { type: 'string' }, idempotency_key: { type: 'string' }, expected_room_version: { type: 'number' }, dry_run: { type: 'boolean' } }, required: ['room_id', 'action_type', 'payload', 'rationale', 'idempotency_key'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => { const result = await apiPost({ action: 'request_approval', ...input }); if (!input.dry_run) { await loadRoom(String(input.room_id), true); await loadWorkspace(); } return result; },
    });
    register({
      name: 'propose_requirement',
      description: 'Propose a new required input for human approval. The agent cannot add the requirement directly.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, owner_label: { type: 'string' }, due_at: { type: 'number' }, rationale: { type: 'string' }, agent_session_id: { type: 'string' }, idempotency_key: { type: 'string' }, expected_room_version: { type: 'number' }, dry_run: { type: 'boolean' } }, required: ['room_id', 'title', 'description', 'rationale', 'idempotency_key'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => apiPost({ action: 'request_approval', room_id: input.room_id, action_type: 'create_requirement', payload: { title: input.title, description: input.description, owner_label: input.owner_label, due_at: input.due_at }, rationale: input.rationale, agent_session_id: input.agent_session_id, idempotency_key: input.idempotency_key, expected_room_version: input.expected_room_version, dry_run: input.dry_run }),
    });
    register({
      name: 'list_change_sets', description: 'List visible versioned change sets for a room. Private drafts are visible only to their author, owner, or facilitator.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' }, status: { type: 'string', enum: ['all', 'draft', 'open', 'changes_requested', 'approved', 'adopted'] } }, required: ['room_id'], additionalProperties: false }, annotations: { readOnlyHint: true },
      execute: async ({ room_id, status = 'all' }: { room_id: string; status?: string }) => { const room = await apiGet('room', room_id) as RoomDetail; return { room_id, room_version: room.version, change_sets: room.changeSets.filter((item) => status === 'all' || item.status === status).map((item) => ({ id: item.id, title: item.title, summary: item.summary, status: item.status, revision: item.revision, base_version: item.base_version, author_name: item.author_name, actor_path: item.actor_path, ready: item.ready })) }; },
    });
    register({
      name: 'get_change_set', description: 'Read one change set with semantic before/after changes, review threads, current-revision reviews, policy checks, and adoption readiness.',
      inputSchema: { type: 'object', properties: { change_set_id: { type: 'string' } }, required: ['change_set_id'], additionalProperties: false }, annotations: { readOnlyHint: true },
      execute: async ({ change_set_id }: { change_set_id: string }) => apiGet('change_set', undefined, change_set_id),
    });
    register({
      name: 'compare_change_set', description: 'Compare a proposed change set against its recorded base values without applying it.',
      inputSchema: { type: 'object', properties: { change_set_id: { type: 'string' } }, required: ['change_set_id'], additionalProperties: false }, annotations: { readOnlyHint: true },
      execute: async ({ change_set_id }: { change_set_id: string }) => { const item = await apiGet('change_set', undefined, change_set_id) as ChangeSet; return { change_set_id, base_version: item.base_version, revision: item.revision, changes: item.changes.map((change) => ({ change_id: change.id, type: change.change_type, target: change.target_type, field: change.field_name, before: change.before, after: change.after })) }; },
    });
    register({
      name: 'get_change_set_readiness', description: 'Return deterministic adoption checks for a change set. This does not approve or adopt it.',
      inputSchema: { type: 'object', properties: { change_set_id: { type: 'string' } }, required: ['change_set_id'], additionalProperties: false }, annotations: { readOnlyHint: true },
      execute: async ({ change_set_id }: { change_set_id: string }) => { const item = await apiGet('change_set', undefined, change_set_id) as ChangeSet; return { change_set_id, ready: item.ready, status: item.status, checks: item.checks }; },
    });
    register({
      name: 'create_change_set', description: 'Prepare a private, versioned set of semantic room changes. Requires a scoped agent session and supports dry-run, idempotency, and expected room version.',
      inputSchema: { type: 'object', properties: { room_id: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, changes: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', properties: { change_type: { type: 'string', enum: ['add_deliberation_item', 'add_requirement', 'update_room_field', 'resolve_deliberation_item'] }, target_id: { type: 'string' }, field_name: { type: 'string' }, after: {} }, required: ['change_type', 'after'], additionalProperties: false } }, agent_session_id: { type: 'string' }, idempotency_key: { type: 'string' }, expected_room_version: { type: 'number' }, dry_run: { type: 'boolean' } }, required: ['room_id', 'title', 'summary', 'changes', 'agent_session_id', 'idempotency_key'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => { const result = await apiPost({ action: 'create_change_set', ...input, actor_path: 'webmcp' }); if (!input.dry_run) { await loadRoom(String(input.room_id), true); await loadWorkspace(); } return result; },
    });
    register({
      name: 'revise_change_set', description: 'Replace the changes in an agent-owned draft or changes-requested change set. Revision invalidates prior approvals.',
      inputSchema: { type: 'object', properties: { change_set_id: { type: 'string' }, title: { type: 'string' }, summary: { type: 'string' }, changes: { type: 'array', minItems: 1, maxItems: 20, items: { type: 'object', properties: { change_type: { type: 'string' }, target_id: { type: 'string' }, field_name: { type: 'string' }, after: {} }, required: ['change_type', 'after'], additionalProperties: false } }, agent_session_id: { type: 'string' } }, required: ['change_set_id', 'changes', 'agent_session_id'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => { const result = await apiPost({ action: 'revise_change_set', ...input, actor_path: 'webmcp' }); await loadRoom(activeRoomRef.current, true); return result; },
    });
    register({
      name: 'submit_change_set_for_review', description: 'Submit an agent-owned draft for human review. This cannot approve or adopt the changes.',
      inputSchema: { type: 'object', properties: { change_set_id: { type: 'string' }, agent_session_id: { type: 'string' } }, required: ['change_set_id', 'agent_session_id'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => { const result = await apiPost({ action: 'submit_change_set', ...input, actor_path: 'webmcp' }); await loadRoom(activeRoomRef.current, true); return result; },
    });
    register({
      name: 'add_change_set_review_thread', description: 'Open a scoped review thread on an exact proposed change. This comments but does not approve, reject, or adopt.',
      inputSchema: { type: 'object', properties: { change_set_id: { type: 'string' }, change_id: { type: 'string' }, content: { type: 'string' }, agent_session_id: { type: 'string' } }, required: ['change_set_id', 'content', 'agent_session_id'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => { const result = await apiPost({ action: 'add_change_set_thread', ...input, actor_path: 'webmcp' }); await loadRoom(activeRoomRef.current, true); return result; },
    });
    register({
      name: 'resolve_change_set_review_thread', description: 'Resolve a review thread only when the current participant is authorized and the agent session has change-set scope.',
      inputSchema: { type: 'object', properties: { thread_id: { type: 'string' }, agent_session_id: { type: 'string' } }, required: ['thread_id', 'agent_session_id'], additionalProperties: false },
      execute: async (input: Record<string, unknown>) => { const result = await apiPost({ action: 'resolve_change_set_thread', ...input, actor_path: 'webmcp' }); await loadRoom(activeRoomRef.current, true); return result; },
    });

    let cancelled = false;
    const generation = ++webMcpRegistrationGeneration.current;
    const registrationTimer = window.setTimeout(() => void (async () => {
      const allowed = new Set(getActiveWebMcpToolNames({
        isAnonymous: workspace?.user.isAnonymous ?? true,
        detailOpen,
        activeTab,
      }));
      const activeDefinitions = toolDefinitions.filter((tool) => allowed.has(String(tool.name)));
      if (modelContext.unregisterTool) await Promise.all(WEBMCP_TOOL_NAMES.map((name) => modelContext.unregisterTool?.(name).catch(() => undefined)));
      if (!cancelled && webMcpRegistrationGeneration.current === generation) {
        await Promise.all(activeDefinitions.map((tool) => modelContext.registerTool(tool).catch(() => undefined)));
        setActiveWebMcpToolCount(activeDefinitions.length);
      }
    })(), 0);

    return () => {
      cancelled = true;
      if (webMcpRegistrationGeneration.current === generation) webMcpRegistrationGeneration.current += 1;
      window.clearTimeout(registrationTimer);
    };
  }, [activeTab, detailOpen, loadRoom, loadWorkspace, workspace?.user.isAnonymous]);

  const focusRoom = useMemo(() => {
    if (!workspace) return null;
    return workspace.rooms.find((room) => room.id === activeRoomId)
      ?? workspace.rooms.find((room) => room.id === 'webmcp-first-use-case')
      ?? workspace.rooms[0];
  }, [workspace, activeRoomId]);

  const filteredRooms = useMemo(() => {
    if (!workspace) return [];
    const query = search.trim().toLowerCase();
    return query
      ? workspace.rooms.filter((room) => (room.title + ' ' + room.problem + ' ' + room.governance_model).toLowerCase().includes(query))
      : workspace.rooms;
  }, [search, workspace]);

  const openRequirements = useMemo(() => {
    if (!roomDetail) return [];
    return roomDetail.requirements.filter((item) => item.status !== 'accepted');
  }, [roomDetail]);

  const completeHumanAction = async (action: Record<string, unknown>, success: string) => {
    setBusy(true);
    try {
      await apiPost(action);
      if (roomDetail) await loadRoom(roomDetail.id, true);
      await loadWorkspace();
      notify(success);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Action failed.');
    } finally {
      setBusy(false);
    }
  };

  const showLatestRoom = async () => {
    if (!roomDetail) return;
    const previousVersion = roomDetail.version;
    const latest = await loadRoom(roomDetail.id, true);
    if (latest) {
      await loadWorkspace();
      notify(`Now viewing room v${latest.version}; updated from v${previousVersion}`);
    }
  };

  const saveHumanContribution = async () => {
    if (!roomDetail) return;
    setBusy(true);
    try {
      const shared = {
        contribution_type: contributionForm.type,
        title: contributionForm.title,
        content: contributionForm.content,
        source_count: Number(contributionForm.sourceCount) || 0,
        actor_path: 'human',
      };
      await apiPost(contributionForm.requirementId
        ? { action: 'submit_requirement_input', requirement_id: contributionForm.requirementId, ...shared }
        : { action: 'add_private_contribution', room_id: roomDetail.id, ...shared });
      setContributionForm({ requirementId: '', type: 'evidence', title: '', content: '', sourceCount: '0' });
      await loadRoom(roomDetail.id, true);
      await loadWorkspace();
      notify(contributionForm.requirementId ? 'Required input submitted for human review' : 'Private human draft saved');
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Could not save contribution.');
    } finally {
      setBusy(false);
    }
  };

  const saveDecision = async () => {
    if (!roomDetail) return;
    await completeHumanAction({
      action: 'record_decision', room_id: roomDetail.id, summary: decisionForm.summary, rationale: decisionForm.rationale,
      dissent: decisionForm.dissent.split('\n').map((item) => item.trim()).filter(Boolean),
    }, 'Final decision recorded and room closed');
  };

  const saveOutcomeReview = async () => {
    if (!roomDetail) return;
    await completeHumanAction({
      action: 'record_outcome_review', room_id: roomDetail.id,
      goal_achievement: Number(outcomeForm.goalAchievement), evidence_quality: Number(outcomeForm.evidenceQuality),
      process_integrity: Number(outcomeForm.processIntegrity), participation_health: Number(outcomeForm.participationHealth),
      execution: Number(outcomeForm.execution), learning_value: Number(outcomeForm.learningValue),
      verification_level: outcomeForm.verificationLevel,
      evidence: outcomeForm.evidence.split('\n').map((item) => item.trim()).filter(Boolean),
      dissent: outcomeForm.dissent.split('\n').map((item) => item.trim()).filter(Boolean),
    }, 'Outcome review added to the learning library');
  };

  const saveDeliberationItem = async () => {
    if (!roomDetail) return;
    await completeHumanAction({ action: 'create_deliberation_item', room_id: roomDetail.id, item_type: deliberationForm.itemType,
      title: deliberationForm.title, content: deliberationForm.content, related_item_id: deliberationForm.relatedItemId || undefined,
      source_count: Number(deliberationForm.sourceCount) || 0, expected_room_version: roomDetail.version,
      idempotency_key: `human-${roomDetail.id}-${Date.now()}` }, 'Structured contribution added');
    setDeliberationForm({ itemType: 'claim', title: '', content: '', relatedItemId: '', sourceCount: '0' });
  };

  const saveChangeSet = async () => {
    if (!roomDetail) return;
    setBusy(true);
    try {
      await apiPost({
        action: 'create_change_set', room_id: roomDetail.id, title: changeSetForm.title, summary: changeSetForm.summary,
        changes: [{ change_type: 'add_deliberation_item', after: { item_type: changeSetForm.itemType, title: changeSetForm.changeTitle, body: changeSetForm.content, source_count: 0 } }],
        expected_room_version: roomDetail.version, idempotency_key: `human-changeset-${roomDetail.id}-${Date.now()}`, actor_path: 'human',
      });
      setChangeSetForm({ title: '', summary: '', itemType: 'proposal', changeTitle: '', content: '' });
      await loadRoom(roomDetail.id, true); await loadWorkspace(); notify('Private change set draft created');
    } catch (caught) { notify(caught instanceof Error ? caught.message : 'Could not create change set.'); }
    finally { setBusy(false); }
  };

  const reviseHumanChangeSet = async (item: ChangeSet) => {
    const note = reviewDrafts[item.id]?.trim();
    if (!note) return;
    await completeHumanAction({
      action: 'revise_change_set', change_set_id: item.id, title: item.title, summary: `${item.summary}\n\nRevision ${item.revision + 1}: ${note}`,
      changes: item.changes.map((change) => ({ change_type: change.change_type, target_id: change.target_id, field_name: change.field_name, after: change.after })),
      actor_path: 'human',
    }, 'Revision saved; prior approvals are stale');
  };

  const connectAgent = async () => {
    if (!roomDetail) return;
    await completeHumanAction({ action: 'create_agent_session', room_id: roomDetail.id, agent_name: agentForm.name,
      scopes: agentForm.scopes, expires_in_hours: Number(agentForm.expiresInHours) || 24 }, 'Scoped agent session created');
  };

  const switchIdentity = async (identity: LocalIdentity) => {
    window.localStorage.setItem(LOCAL_IDENTITY_KEY, identity);
    document.cookie = `commonwork_test_user=${identity}; Path=/; SameSite=Lax`;
    setLocalIdentity(identity);
    setProfileOpen(false);
    setDetailOpen(false);
    setRoomDetail(null);
    setRoomUpdates(null);
    agentCallsInFlight.current = 0;
    if (agentIdleTimer.current !== null) window.clearTimeout(agentIdleTimer.current);
    setAgentActivity({ status: 'idle', toolName: null, lastCompletedAt: null });
    const data = await loadWorkspace();
    notify(`Now testing as ${localIdentities.find((item) => item.id === identity)?.name || identity}`);
    if (data?.rooms[0]) setActiveRoomId(data.rooms[0].id);
  };

  const uploadRoomFile = async (file: File) => {
    if (!roomDetail) return;
    setBusy(true);
    try {
      const formData = new FormData();
      formData.set('room_id', roomDetail.id);
      formData.set('file', file);
      const result = await fetch('/api/commonwork/files', {
        method: 'POST',
        headers: { 'x-commonwork-test-user': currentLocalIdentity() },
        body: formData,
      });
      const data = await result.json() as { error?: string };
      if (!result.ok) throw new Error(data.error || 'Upload failed.');
      await loadRoom(roomDetail.id, true);
      await loadWorkspace();
      notify('File attached to the room');
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  const downloadAttachment = async (attachment: RoomDetail['attachments'][number]) => {
    try {
      const result = await fetch(`/api/commonwork/files?attachment_id=${encodeURIComponent(attachment.id)}`, {
        headers: { 'x-commonwork-test-user': currentLocalIdentity() },
      });
      if (!result.ok) {
        const data = await result.json() as { error?: string };
        throw new Error(data.error || 'Download failed.');
      }
      const url = URL.createObjectURL(await result.blob());
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = attachment.filename;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Download failed.');
    }
  };

  const downloadDecisionBrief = () => {
    if (!roomDetail) return;
    const brief = roomDetail.decisionBrief;
    const lines = [
      `# ${roomDetail.title}`,
      '',
      `**Room:** ${roomDetail.id} · version ${brief.room_version}`,
      `**Status:** ${roomDetail.status} · ${brief.ready ? 'Ready to decide' : `${brief.blockers.length} blockers`}`,
      `**Governance:** ${roomDetail.governance_model}`,
      `**Decision authority:** ${roomDetail.decision_authority}`,
      '',
      '## Problem', roomDetail.problem,
      '',
      '## Desired outcome', roomDetail.desired_outcome,
      '',
      '## Next action', brief.next_action,
      '',
      '## Blocking inputs', ...(brief.blockers.length ? brief.blockers.map((item) => `- ${item.title} — ${item.owner_label}`) : ['- None']),
      '',
      '## Leading proposals', ...(brief.leading_proposals.length ? brief.leading_proposals.map((item) => `- ${String(item.title)}`) : ['- None']),
      '',
      '## Material objections', ...(brief.material_objections.length ? brief.material_objections.map((item) => `- ${String(item.title)}`) : ['- None']),
      '',
      '## Unresolved questions', ...(brief.unresolved_questions.length ? brief.unresolved_questions.map((item) => `- ${String(item.title)}`) : ['- None']),
      '',
      `Generated from live Socialsum room state on ${new Date().toLocaleString()}.`,
    ];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/markdown' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${roomDetail.id}-decision-brief.md`;
    anchor.click();
    URL.revokeObjectURL(url);
    notify('Decision brief exported');
  };

  const saveRoomDraft = async () => {
    setBusy(true);
    try {
      const room = await apiPost({
        action: 'create_room_draft',
        title: form.title,
        problem: form.problem,
        desired_outcome: form.desiredOutcome,
        governance_model: form.governanceModel,
        success_criteria: form.successCriteria.split('\n').map((item) => item.trim()).filter(Boolean),
        actor_path: 'human',
      }) as RoomDetail;
      setSetupOpen(false);
      setSetupStep(1);
      await loadWorkspace();
      await loadRoom(room.id, true);
      notify('Persistent room draft saved');
    } catch (caught) {
      notify(caught instanceof Error ? caught.message : 'Could not save room.');
    } finally {
      setBusy(false);
    }
  };

  const copyAgentPrompt = async (roomId?: string) => {
    const target = roomId || activeRoomId;
    if (workspace?.user.isAnonymous) {
      const prompt = `Open this public Socialsum demo and use its WebMCP site tools for room_id "${target}". Start with guide_socialsum_user using goal "understand" and depth "guided". Then use read-only tools to explain the room, its governance, current blockers, and what a participant and their agent could do next. Do not attempt write actions in public demo mode; explain that I can sign in with ChatGPT to participate.`;
      await navigator.clipboard.writeText(prompt);
      notify('Public demo agent prompt copied');
      return;
    }
    const ownAgent = roomDetail?.id === target
      ? roomDetail.agentSessions.find((session) => session.owner_user_id === workspace?.user.userId && session.status === 'active' && session.expires_at > Date.now())
      : null;
    const sessionInstruction = ownAgent
      ? `Use agent_session_id "${ownAgent.id}". Call start_agent_work_session, then get_agent_catch_up_packet in delta mode. Explicitly mark each delivered event acknowledged, deferred, or skipped only after considering it. Before finishing, create_agent_checkpoint with a plain-language summary, current assumptions, commitments, and close_session true.`
      : 'Call get_agent_session to find my active scoped connection. If none exists, explain that I must connect one in People & rules before a durable catch-up session can begin.';
    const prompt = `Open this Socialsum page and use its WebMCP site tools for room_id "${target}". Start with guide_socialsum_user using goal "contribute" and depth "quick" so you can orient me in plain language before acting. ${sessionInstruction} Then read get_decision_brief and list_change_sets before preparing consequential work. If a coherent update is needed, use create_change_set with dry_run first, show me the semantic diff and readiness checks, then submit it for human review. Never equate delivered with acknowledged, silently rebase stale work, or claim to approve or adopt your own work; those actions remain human-only.`;
    await navigator.clipboard.writeText(prompt);
    notify('Agent handoff copied');
  };

  if (!workspace) {
    return (
      <main className="loading-screen">
        <div className="brand-mark"><span /></div>
        <h1>Opening Socialsum</h1>
        <p>{error || 'Loading persistent rooms and activity…'}</p>
        {error && <button className="primary-button" onClick={() => void loadWorkspace()}>Try again</button>}
      </main>
    );
  }

  if (!focusRoom) {
    return (
      <main className="loading-screen identity-empty">
        <div className="brand-mark"><span /></div>
        <p className="eyebrow">LOCAL MULTIUSER TESTING</p>
        <h1>{workspace.invitations.length ? 'You have a room invitation.' : 'No rooms are available to this identity.'}</h1>
        <p>{workspace.invitations.length ? 'Accept the constitution and join with the assigned role.' : 'Membership enforcement is working: private rooms stay hidden from non-participants.'}</p>
        {workspace.invitations.map((invitation) => (
          <article className="invite-callout" key={invitation.id}>
            <div><small>{invitation.role}</small><h3>{invitation.room_title}</h3></div>
            <button className="primary-button" disabled={busy} onClick={() => void completeHumanAction({ action: 'accept_room_invitation', invitation_id: invitation.id }, 'Invitation accepted')}>Accept and join</button>
          </article>
        ))}
        {workspace.localTesting && <label className="identity-switcher">Test identity<select value={localIdentity} onChange={(event) => void switchIdentity(event.target.value as LocalIdentity)}>{localIdentities.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
      </main>
    );
  }

  const attention = workspace.rooms.flatMap((room) => {
    const missing = room.requirement_count - room.accepted_count;
    return missing > 0 && room.status === 'active' ? [{ room, missing }] : [];
  }).slice(0, 3);
  const isPublicDemo = Boolean(workspace.user.isAnonymous);
  const activeRoomAgent = roomDetail?.agentSessions.find((session) => session.owner_user_id === workspace.user.userId && session.status === 'active' && session.expires_at > roomDetail.freshness.checked_at);
  const agentPresenceLabel = agentActivity.status === 'working'
    ? `${activeRoomAgent?.agent_name || 'Your agent'} is working · ${toolActivityLabel(agentActivity.toolName)}`
    : agentActivity.status === 'recent'
      ? `${activeRoomAgent?.agent_name || 'Your agent'} active just now`
      : activeRoomAgent
        ? `${activeRoomAgent.agent_name} · idle`
        : 'No agent connected';

  const openPublicRoom = (roomId: string) => {
    setPublicExploreOpen(true);
    setActiveRoomId(roomId);
    setActiveTab('work');
    window.location.hash = `room=${encodeURIComponent(roomId)}&tab=work`;
    void loadRoom(roomId);
  };

  if (isPublicDemo && !publicExploreOpen) {
    const activeRooms = workspace.rooms.filter((room) => room.status === 'active');
    const completedRooms = workspace.rooms.filter((room) => room.status === 'closed');
    const totalPeople = workspace.rooms.reduce((sum, room) => sum + room.people_count, 0);
    return (
      <main className="public-home" id="top">
        <header className="public-nav">
          <a className="brand public-brand" href="#top" aria-label="Socialsum home">
            <span className="brand-mark"><span /></span>
            <span>Socialsum</span>
          </a>
          <nav aria-label="Public navigation">
            <a href="#public-rooms">Explore rooms</a>
            <a href="#how-it-works">How it works</a>
            <a href="#agents">For your agent</a>
          </nav>
          <div>
            <button className="public-agent-button" onClick={() => void copyAgentPrompt(focusRoom.id)}>✦ Bring my agent</button>
            <button className="public-signin-button" onClick={() => { window.location.href = '/signin-with-chatgpt?return_to=%2F'; }}>Sign in <span>→</span></button>
          </div>
        </header>

        <section className="public-hero">
          <div className="public-hero-copy">
            <div className="public-kicker"><i /> Public rooms are open to explore</div>
            <h1>Important work,<br /><em>without the meeting.</em></h1>
            <p>Socialsum gives people and their own agents a shared place to gather evidence, challenge ideas, and move a decision to a clear outcome.</p>
            <div className="public-hero-actions">
              <a className="public-primary-cta" href="#public-rooms">Explore public rooms <span>↓</span></a>
              <button onClick={() => void copyAgentPrompt(focusRoom.id)}>✦ Let my agent show me around</button>
            </div>
            <div className="public-proof">
              <span><b>{workspace.rooms.length}</b> public examples</span>
              <span><b>{totalPeople}</b> participant seats</span>
              <span><b>{WEBMCP_TOOL_NAMES.length}</b> contextual capabilities</span>
            </div>
          </div>

          <div className="public-hero-stage" aria-label="Example Socialsum decision room">
            <div className="stage-orbit orbit-one">✦</div>
            <div className="stage-orbit orbit-two">JF</div>
            <article className="stage-card">
              <header><span><i /> LIVE DECISION ROOM</span><small>Public · read only</small></header>
              <div className="stage-card-body">
                <div className="stage-chips"><span>{focusRoom.governance_model}</span><span>WebMCP active</span></div>
                <h2>{focusRoom.title}</h2>
                <p>{focusRoom.problem}</p>
                <div className="stage-status">
                  <div><span style={{ width: `${focusRoom.progress}%` }} /></div>
                  <b>{focusRoom.progress}% ready</b>
                </div>
                <ul>
                  <li className="done"><i>✓</i><span><b>Frame the decision</b><small>Purpose and authority agreed</small></span></li>
                  <li className="active"><i>2</i><span><b>Collect required input</b><small>{focusRoom.accepted_count} of {focusRoom.requirement_count} accepted</small></span></li>
                  <li><i>3</i><span><b>Resolve material gaps</b><small>Agents prepare; people approve</small></span></li>
                </ul>
              </div>
              <footer><span>✦ Agent caught up to room v{focusRoom.version}</span><button onClick={() => openPublicRoom(focusRoom.id)}>Open room →</button></footer>
            </article>
          </div>
        </section>

        <section className="public-room-browser" id="public-rooms">
          <div className="public-section-heading">
            <div><span className="public-eyebrow">SEE THE WORK HAPPEN</span><h2>Browse public rooms</h2><p>Realistic examples of decisions, investigations, and operating work shaped by people and their agents.</p></div>
            <label className="public-search"><span>⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search public rooms" aria-label="Search public rooms" /></label>
          </div>
          <div className="public-filter-row" aria-label="Room summary">
            <span className="active">All rooms <b>{workspace.rooms.length}</b></span>
            <span>Active <b>{activeRooms.length}</b></span>
            <span>Completed <b>{completedRooms.length}</b></span>
            <small>Anyone can inspect these rooms. Sign in to contribute.</small>
          </div>
          <div className="public-room-grid">
            {filteredRooms.map((room, index) => {
              const missing = Math.max(0, room.requirement_count - room.accepted_count);
              return (
                <button className={`public-room-card tone-${index % 3}`} onClick={() => openPublicRoom(room.id)} key={room.id}>
                  <div className="public-room-card-top"><span className={`public-status ${room.status}`}><i /> {room.status}</span><small>Public room ↗</small></div>
                  <div className="public-room-model">{room.governance_model}</div>
                  <h3>{room.title}</h3>
                  <p>{room.problem}</p>
                  <div className="public-room-progress"><div><span style={{ width: `${room.progress}%` }} /></div><b>{room.progress}%</b></div>
                  <dl>
                    <div><dt>People</dt><dd>{room.people_count}</dd></div>
                    <div><dt>Inputs</dt><dd>{room.accepted_count}/{room.requirement_count}</dd></div>
                    <div><dt>{room.status === 'closed' ? 'Outcome' : 'Blockers'}</dt><dd>{room.status === 'closed' ? 'Scored' : missing}</dd></div>
                  </dl>
                  <footer><span>{room.status === 'closed' ? 'View the decision record' : `Due ${formatDate(room.deadline_at)}`}</span><b>Open room →</b></footer>
                </button>
              );
            })}
          </div>
          {!filteredRooms.length && <div className="public-empty"><b>No public rooms match “{search}”</b><button onClick={() => setSearch('')}>Clear search</button></div>}
        </section>

        <section className="public-how" id="how-it-works">
          <div className="public-how-intro"><span className="public-eyebrow">A SHARED OPERATING SYSTEM</span><h2>One room. Many minds.<br />A decision you can trust.</h2><p>Socialsum replaces scattered chats and status meetings with a visible process that both people and agents can understand.</p></div>
          <div className="public-how-steps">
            <article><span>01</span><i>◇</i><h3>Frame the work</h3><p>Declare the problem, finish line, required evidence, roles, timeline, and who has authority to decide.</p></article>
            <article><span>02</span><i>✦</i><h3>Bring every agent</h3><p>Each participant’s agent catches up from the same live room, prepares work privately, and shows its sources.</p></article>
            <article><span>03</span><i>✓</i><h3>Close the loop</h3><p>People resolve objections, approve consequential changes, record the outcome, and preserve what was learned.</p></article>
          </div>
        </section>

        <section className="public-agent-section" id="agents">
          <div className="agent-console" aria-hidden="true">
            <header><span><i /><i /><i /></span><b>socialsum.com · WebMCP</b><small>connected</small></header>
            <div><p><span>YOU</span> Catch me up on this room. What changed, what is blocked, and where can I help?</p><p><span>AGENT</span> I read the room constitution, version 12, and the three unresolved inputs. Two are waiting on evidence; one needs a human decision.</p><p className="tool-call"><span>TOOL</span> get_agent_catch_up_packet <b>✓ read only</b></p><p><span>AGENT</span> I can prepare the vendor comparison as a private draft. I will not publish or approve it.</p></div>
          </div>
          <div className="public-agent-copy">
            <span className="public-eyebrow">WEBMCP, BUILT IN</span>
            <h2>Your agent doesn’t visit.<br />It participates.</h2>
            <p>There is no mystery bot inside Socialsum. You bring the agent you already trust. WebMCP gives it structured, permission-aware access to the exact room state you see.</p>
            <ul><li><i>✓</i><span><b>Gets caught up</b><small>Reads the constitution, changes, blockers, and prior checkpoints.</small></span></li><li><i>✓</i><span><b>Prepares useful work</b><small>Drafts evidence, proposals, and semantic change sets for review.</small></span></li><li><i>✓</i><span><b>Respects human authority</b><small>Publishing, approval, adoption, and final decisions stay with people.</small></span></li></ul>
            <button onClick={() => void copyAgentPrompt(focusRoom.id)}>✦ Copy a prompt for my agent <span>→</span></button>
          </div>
        </section>

        <section className="public-final-cta">
          <span className="public-eyebrow">MAKE THE NEXT MEETING OPTIONAL</span>
          <h2>Bring the problem.<br />Socialsum the answer.</h2>
          <p>Explore the public rooms, then sign in to create a governed workspace for your own team and agents.</p>
          <div><a href="#public-rooms">Explore rooms</a><button onClick={() => { window.location.href = '/signin-with-chatgpt?return_to=%2F'; }}>Sign in to participate →</button></div>
        </section>

        <footer className="public-footer"><a className="brand" href="#top"><span className="brand-mark"><span /></span><span>Socialsum</span></a><p>The sum of people and their agents.</p><div><a href="#public-rooms">Public rooms</a><a href="#how-it-works">How it works</a><a href="#agents">WebMCP</a></div></footer>
        {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
      </main>
    );
  }

  return (
    <main className="app-shell" id="top">
      <header className="topbar">
        <a className="brand" href="#top" aria-label="Socialsum home" onClick={() => { if (isPublicDemo) { setPublicExploreOpen(false); setDetailOpen(false); window.history.replaceState(null, '', window.location.pathname); } }}>
          <span className="brand-mark"><span /></span>
          <span>Socialsum</span>
        </a>
        <label className="search-wrap">
          <span>⌕</span>
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search rooms, evidence, people…" aria-label="Search rooms" />
          <kbd>⌘ K</kbd>
        </label>
        <div className="top-actions">
          <span className="persisted-badge"><i /> D1 connected</span>
          {workspace.localTesting && <label className="identity-switcher"><span>Viewing as</span><select value={localIdentity} onChange={(event) => void switchIdentity(event.target.value as LocalIdentity)}>{localIdentities.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>}
          {isPublicDemo && <span className="persisted-badge"><i /> Public demo · read only</span>}
          <button className="quiet-button" onClick={() => void copyAgentPrompt()}>✦ Bring my agent</button>
          {isPublicDemo
            ? <button className="primary-button" onClick={() => { window.location.href = '/signin-with-chatgpt?return_to=%2F'; }}>Sign in to participate</button>
            : <button className="primary-button" onClick={() => setSetupOpen(true)}>＋ New room</button>}
          <button
            className="avatar"
            aria-label="Open profile"
            aria-haspopup="dialog"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((open) => !open)}
          >
            {isPublicDemo ? 'PV' : localIdentities.find((item) => item.id === localIdentity)?.initials || initialsFor(workspace.user.displayName)}
          </button>
          {profileOpen && (
            <section className="profile-menu" role="dialog" aria-label="Profile menu">
              <div className="profile-menu-heading">
                <span>{isPublicDemo ? 'PV' : localIdentities.find((item) => item.id === localIdentity)?.initials || initialsFor(workspace.user.displayName)}</span>
                <div><b>{workspace.user.displayName}</b><small>{workspace.user.email}</small></div>
                <button aria-label="Close profile menu" onClick={() => setProfileOpen(false)}>×</button>
              </div>
              <div className="profile-status"><i /> D1 workspace connected</div>
              {workspace.localTesting ? (
                <label className="profile-identity-select">
                  <span>Test participant</span>
                  <select value={localIdentity} onChange={(event) => void switchIdentity(event.target.value as LocalIdentity)}>
                    {localIdentities.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
                  </select>
                </label>
              ) : isPublicDemo ? (
                <a className="profile-signout" href="/signin-with-chatgpt?return_to=%2F">Sign in with ChatGPT</a>
              ) : (
                <a className="profile-signout" href="/signout-with-chatgpt?return_to=%2F">Sign out</a>
              )}
              <p>{isPublicDemo ? 'Explore the seeded rooms with read-only WebMCP tools. Sign in to participate.' : 'Agents use this participant’s room access and private review queue.'}</p>
            </section>
          )}
        </div>
      </header>

      {isPublicDemo && <section className="invitation-banner"><span>◎</span><p><b>You’re viewing the public demo.</b> Explore every seeded room and use the read-only WebMCP tools. Sign in before creating, contributing, or connecting an agent.</p><button onClick={() => { window.location.href = '/signin-with-chatgpt?return_to=%2F'; }}>Sign in to participate →</button></section>}
      {workspace.invitations.length > 0 && <section className="invitation-banner"><span>◇</span><p><b>{workspace.invitations.length} pending invitation</b> Accept to join with the room’s declared role and constitution.</p>{workspace.invitations.map((invitation) => <button key={invitation.id} onClick={() => void completeHumanAction({ action: 'accept_room_invitation', invitation_id: invitation.id }, 'Invitation accepted')}>Join {invitation.room_title} →</button>)}</section>}

      <aside className="sidebar">
        <nav aria-label="Primary navigation">
          <a className="nav-item active" href="#top"><span>⌂</span>Overview</a>
          <a className="nav-item" href="#rooms"><span>□</span>Rooms <b>{workspace.rooms.length}</b></a>
          <a className="nav-item" href="#attention"><span>◇</span>Needs input <b className="alert-count">{attention.length}</b></a>
          <a className="nav-item" href="#webmcp-lab"><span>✦</span>WebMCP lab <b>{activeWebMcpToolCount}</b></a>
          <a className="nav-item" href="#history"><span>↺</span>Outcomes</a>
        </nav>
        <div className="sidebar-section">
          <p>Workspace</p>
          <a className="workspace-link" href="#rooms"><span className="dot" /> Socialsum lab</a>
          <a className="workspace-link" href="#webmcp-lab"><span className="dot amber" /> Hackathon testing</a>
          <a className="workspace-link" href="#history"><span className="dot blue" /> Learning library</a>
        </div>
        <div className="agent-card">
          <div className="agent-status"><i /> Site tools ready</div>
          <p>Agents share the live page and persistent room state. Every write is attributed and reviewable.</p>
          <button onClick={() => void copyAgentPrompt()}><span>Copy agent handoff</span><span>↗</span></button>
          <small>{activeWebMcpToolCount} active here · {WEBMCP_TOOL_NAMES.length} total · rediscover after navigation</small>
        </div>
      </aside>

      <section className="content">
        <div className="page-heading">
          <div>
            <p className="eyebrow">SOCIALSUM · {workspace.localTesting ? 'LOCAL DEMO' : 'LIVE WORKSPACE'}</p>
            <h1>Decisions without the meeting.</h1>
            <p>People contribute judgment. Their agents gather evidence, find gaps, and prepare the work.</p>
          </div>
          <div className="pulse-card" aria-label="Workspace metrics">
            <div><span>{workspace.rooms.filter((room) => room.status === 'active').length}</span><small>active rooms</small></div>
            <div><span>{workspace.rooms.reduce((sum, room) => sum + room.private_draft_count, 0)}</span><small>private drafts</small></div>
            <div><span>{activeWebMcpToolCount}</span><small>tools active here</small></div>
          </div>
        </div>

        <article className="focus-room">
          <div className="focus-topline">
            <span className="room-label"><i className="live-dot" /> {focusRoom.status === 'draft' ? 'DRAFT AWAITING HUMAN REVIEW' : 'DECISION IN PROGRESS'}</span>
            <button className="more-button" aria-label="More room options">•••</button>
          </div>
          <div className="focus-grid">
            <div className="focus-copy">
              <div className="chip-row">
                <span className="model-chip">{focusRoom.governance_model}</span>
                <span className="visibility-chip">Invite-only</span>
                <span className="visibility-chip webmcp-chip">✦ WebMCP active</span>
              </div>
              <h2>{focusRoom.title}</h2>
              <p>{focusRoom.problem}</p>
              <div className="focus-outcome"><span>Finish line</span><b>{focusRoom.desired_outcome}</b></div>
              <div className="requirement-row">
                <span className="avatar-stack"><i>JF</i><i>AG</i><i>+{Math.max(0, focusRoom.people_count - 2)}</i></span>
                <span><b>{focusRoom.accepted_count} of {focusRoom.requirement_count} required inputs accepted</b><small>{focusRoom.private_draft_count} private drafts awaiting your review</small></span>
              </div>
              <div className="focus-actions">
                <button className="primary-button" onClick={() => { setActiveTab('work'); void loadRoom(focusRoom.id); }}>Open decision room <span>→</span></button>
                <button className="quiet-button" onClick={() => void copyAgentPrompt(focusRoom.id)}>✦ Ask my agent</button>
              </div>
            </div>
            <div className="timeline-panel">
              <div className="panel-heading"><span>Room timeline</span><b>{formatDate(focusRoom.deadline_at, true)}</b></div>
              <div className="timeline">
                {['Frame', 'Collect input', 'Resolve gaps', 'Decide', 'Review'].map((name, index) => (
                  <div className={'timeline-step ' + (index < focusRoom.current_phase ? 'done' : index === focusRoom.current_phase ? 'active' : 'next')} key={name}>
                    <i>{index < focusRoom.current_phase ? '✓' : ''}</i>
                    <span><b>{name}</b><small>{index === focusRoom.current_phase ? 'Current phase' : index < focusRoom.current_phase ? 'Complete' : 'Upcoming'}</small></span>
                  </div>
                ))}
              </div>
              <div className="progress-summary">
                <div><span style={{ width: focusRoom.progress + '%' }} /></div>
                <p><b>{focusRoom.progress}% requirements accepted</b><span>{focusRoom.requirement_count - focusRoom.accepted_count} blockers</span></p>
              </div>
            </div>
          </div>
        </article>

        <section className="rooms-section" id="rooms">
          <div className="section-heading">
            <div><p className="eyebrow">PERSISTENT WORKSPACE</p><h2>Rooms moving now</h2></div>
            {isPublicDemo ? <button onClick={() => { setPublicExploreOpen(false); setDetailOpen(false); window.history.replaceState(null, '', window.location.pathname); }}>Browse public rooms →</button> : <button onClick={() => setSetupOpen(true)}>Create a room →</button>}
          </div>
          <div className="room-grid">
            {filteredRooms.map((room, index) => (
              <button className={'room-card ' + (index % 3 === 1 ? 'blue' : index % 3 === 2 ? 'amber' : '') + (room.id === activeRoomId ? ' selected' : '')} onClick={() => { setActiveRoomId(room.id); setActiveTab('work'); void loadRoom(room.id); }} key={room.id}>
                <div className="room-card-top"><span>{room.governance_model}</span><small>{room.status}</small></div>
                <h3>{room.title}</h3>
                <p>{room.problem}</p>
                <div className="mini-progress"><span style={{ width: room.progress + '%' }} /></div>
                <div className="room-meta"><span>◷ {formatDate(room.deadline_at)}</span><span>◎ {room.people_count} people</span></div>
                <div className="room-card-footer"><span>{room.accepted_count}/{room.requirement_count} inputs</span><span>✦ {room.private_draft_count} drafts</span><b>{room.published_count} shared</b></div>
              </button>
            ))}
          </div>
        </section>

        <section className="webmcp-lab" id="webmcp-lab">
          <div className="lab-heading">
            <div><p className="eyebrow">WEBMCP IS THE PRODUCT SURFACE</p><h2>Agent collaboration lab</h2><p>These tools operate on the same persistent records as the human interface. Drafting is agent-friendly; authority stays human.</p></div>
            <button className="primary-button" onClick={() => void copyAgentPrompt(focusRoom.id)}>Copy end-to-end test prompt</button>
          </div>
          <div className="lab-grid">
            <article>
              <span className="tool-count">Start here</span>
              <h3>Understand</h3>
              <p>A context-aware guide teaches the person what Socialsum is, how their current room works, and what to do next.</p>
              <code>guide_socialsum_user</code>
              <small>Read-only · useful first · practical before promotional</small>
            </article>
            <article>
              <span className="tool-count amber">11 tools</span>
              <h3>Collaborate</h3>
              <p>Create versioned change sets, revise stale work, submit reviews, and discuss exact proposed changes.</p>
              <code>create_change_set</code>
              <small>Scoped session · dry-run · idempotent · version checked</small>
            </article>
            <article>
              <span className="tool-count blue">Human gates</span>
              <h3>Approve</h3>
              <p>Approve revisions, adopt ready changes, activate rooms, publish contributions, and record final decisions.</p>
              <code>adopt_change_set</code>
              <small>Human-only · independent review required</small>
            </article>
          </div>
          <div className="test-sequence">
            <span>Suggested live test</span>
            {['Read current version', 'Dry-run change set', 'Submit proposal', 'Review semantic diff', 'Human adopts', 'Verify provenance'].map((step, index) => (
              <div key={step}><b>{index + 1}</b><small>{step}</small></div>
            ))}
          </div>
        </section>

        <section className="outcomes-section" id="history">
          <div className="section-heading">
            <div><p className="eyebrow">LEARNING LOOP</p><h2>Verified outcomes</h2></div>
            <button>How scoring works →</button>
          </div>
          <div className="outcome-grid">
            {workspace.outcomes.length ? workspace.outcomes.map((outcome, index) => (
              <article key={String(outcome.id)}>
                <div className={'outcome-score ' + (index % 2 ? 'blue' : '')}><span>{outcome.overallScore}</span><small>overall</small></div>
                <div><span className={'closed-chip ' + (index % 2 ? 'blue' : '')}>{String(outcome.verification_level)}</span><h3>{outcome.title}</h3><p>{outcome.evidence?.[0] || 'Outcome evidence recorded for review.'}</p><small>Scored after the decision · visible during future room setup</small></div>
              </article>
            )) : <article className="empty-outcome"><div><h3>No outcome reviews yet</h3><p>Closed rooms become reusable evidence after their review date.</p></div></article>}
          </div>
        </section>
      </section>

      <aside className="right-rail" id="attention">
        <section>
          <div className="rail-heading"><h2>Needs input</h2><span>{attention.length}</span></div>
          {attention.map(({ room, missing }, index) => (
            <article className={'attention-item ' + (index === 0 ? 'urgent' : '')} key={room.id}>
              <span className={'attention-icon ' + (index ? 'blue' : '')}>{index ? '◇' : '!'}</span>
              <div><small>{formatDate(room.deadline_at, true)}</small><h3>{missing} required inputs unresolved</h3><p>{room.title}</p><button onClick={() => { setActiveTab('requirements'); void loadRoom(room.id); }}>Review blockers →</button></div>
            </article>
          ))}
        </section>
        <section>
          <div className="rail-heading"><h2>Recent activity</h2><button>•••</button></div>
          <div className="activity-rail">
            {workspace.activity.slice(0, 6).map((item) => (
              <article key={item.id}><i className={item.actor_path === 'webmcp' ? 'agent' : ''}>{item.actor_path === 'webmcp' ? '✦' : 'JF'}</i><div><b>{item.summary}</b><small>{item.room_title} · {relativeTime(item.created_at)}</small></div></article>
            ))}
          </div>
        </section>
        <section className="insight-card">
          <span className="spark">✦</span>
          <p><b>Agent-ready, not agent-run</b>WebMCP can prepare consequential work without silently taking authority from participants.</p>
          <button onClick={() => void copyAgentPrompt(focusRoom.id)}>Try the room with your agent →</button>
        </section>
      </aside>

      {detailOpen && roomDetail && (
        <div className="modal-backdrop" role="presentation">
          <section className="room-modal" role="dialog" aria-modal="true" aria-labelledby="room-title">
            <header className="modal-header">
              <div><span className="model-chip">{roomDetail.governance_model}</span><span className="room-id">{roomDetail.id}</span></div>
              <div className="modal-header-actions"><span className={'agent-presence-pill ' + agentActivity.status} aria-live="polite"><i />{agentPresenceLabel}</span><span className={'room-version-pill ' + (roomUpdates ? 'behind' : '')}>{roomUpdates ? `Viewing v${roomDetail.version}` : `Current · v${roomDetail.version}`}</span><button onClick={() => setDetailOpen(false)} aria-label="Close room">×</button></div>
            </header>
            {roomUpdates && <section className="version-update-banner" aria-live="polite">
              <div className="version-update-icon">↻</div>
              <div className="version-update-copy"><small>NEW VERSION AVAILABLE · V{roomUpdates.latest_version}</small><b>Room updated while you were working</b><p>{roomUpdates.updates.at(-1)?.actor_name || 'A participant'}: {roomUpdates.updates.at(-1)?.summary || `${roomUpdates.versions_behind} newer room version${roomUpdates.versions_behind === 1 ? '' : 's'} available.`}</p></div>
              <div className="version-update-actions"><button onClick={() => setUpdatesExpanded((value) => !value)}>{updatesExpanded ? 'Hide changes' : 'View changes'}</button><button className="show-latest" onClick={() => void showLatestRoom()}>Show latest</button></div>
              {updatesExpanded && <div className="version-update-list">{roomUpdates.updates.length ? roomUpdates.updates.map((item) => <article key={item.id}><span>{item.actor_path === 'webmcp' ? '✦' : '●'}</span><div><b>{item.summary}</b><small>{item.actor_name} · v{item.room_version || roomUpdates.latest_version} · {relativeTime(item.created_at)}</small></div></article>) : <p>The room version changed. Open the latest version to inspect its current state.</p>}</div>}
            </section>}
            <div className="room-modal-hero">
              <div><p className="eyebrow">{roomDetail.status.toUpperCase()} · PERSISTED</p><h2 id="room-title">{roomDetail.title}</h2><p>{roomDetail.problem}</p></div>
              <div className="modal-deadline"><small>Decision deadline</small><b>{formatDate(roomDetail.deadline_at, true)}</b><span>{roomDetail.requirements.filter((item) => item.status !== 'accepted').length} blockers remain</span></div>
            </div>
            <nav className="room-tabs" aria-label="Room sections">
              {(['work', 'requirements', 'files', 'constitution', 'activity'] as const).map((tab) => (
                <button className={activeTab === tab ? 'active' : ''} onClick={() => setActiveTab(tab)} key={tab}>{tab === 'work' ? 'Shared work' : tab === 'requirements' ? 'Required inputs' : tab === 'files' ? 'Files' : tab === 'constitution' ? 'People & rules' : 'Activity & provenance'}</button>
              ))}
            </nav>

            {activeTab === 'work' && (
              <div className="modal-body">
                <div className="modal-main">
                  <div className="finish-line"><span>Desired outcome</span><p>{roomDetail.desired_outcome}</p></div>
                  <section className="decision-brief-panel">
                    <div className="brief-heading"><div><p className="eyebrow">LIVE DECISION BRIEF · V{roomDetail.decisionBrief.room_version}</p><h3>{roomDetail.decisionBrief.next_action}</h3></div><div className="brief-actions"><button onClick={downloadDecisionBrief}>Export .md</button><span className={roomDetail.decisionBrief.ready ? 'ready' : ''}>{roomDetail.decisionBrief.ready ? 'Ready to decide' : `${roomDetail.decisionBrief.blockers.length} blockers`}</span></div></div>
                    <div className="brief-metrics"><span><b>{roomDetail.decisionBrief.accepted_evidence.length}</b> evidence</span><span><b>{roomDetail.decisionBrief.leading_proposals.length}</b> proposals</span><span><b>{roomDetail.decisionBrief.unresolved_questions.length}</b> questions</span><span><b>{roomDetail.decisionBrief.material_objections.length}</b> objections</span></div>
                    <div className="brief-columns"><div><small>Leading proposals</small>{roomDetail.decisionBrief.leading_proposals.slice(0, 3).map((item, index) => <p key={String(item.id || index)}>{String(item.title)}</p>)}{!roomDetail.decisionBrief.leading_proposals.length && <p>No proposal recorded yet.</p>}</div><div><small>Material tension</small>{roomDetail.decisionBrief.material_objections.slice(0, 3).map((item, index) => <p key={String(item.id || index)}>{String(item.title)}</p>)}{!roomDetail.decisionBrief.material_objections.length && <p>No unresolved objection.</p>}</div></div>
                  </section>
                  <section className="agent-catchup-panel">
                    <div className="catchup-heading"><div><p className="eyebrow">AGENT CATCH-UP LEDGER</p><h3>Every session knows what it actually reviewed.</h3><p>Delivered updates remain separate from acknowledged work. Future sessions resume from the latest durable checkpoint and can deliberately inspect older history.</p></div><button onClick={() => void copyAgentPrompt(roomDetail.id)}>Catch up my agent →</button></div>
                    <div className="catchup-flow"><span><b>1</b> Open session</span><i>→</i><span><b>2</b> Review packet</span><i>→</i><span><b>3</b> Acknowledge</span><i>→</i><span><b>4</b> Checkpoint</span></div>
                    <div className="catchup-matrix">
                      {roomDetail.agentSessions.filter((session) => session.status === 'active').map((session) => {
                        const ownSession = session.owner_user_id === workspace.user.userId;
                        return <article className={ownSession ? 'mine' : ''} key={session.id}>
                          <div className="catchup-agent"><span>✦</span><div><b>{session.agent_name}</b><small>{ownSession ? 'Your agent' : session.owner_user_id}</small></div></div>
                          <div className={'catchup-state ' + session.catchUp.work_status}><b>{session.catchUp.work_status === 'working' ? 'Working now' : session.catchUp.unread_count === 0 && session.catchUp.caught_up_through ? 'Caught up' : `${session.catchUp.unread_count} waiting`}</b><small>{session.catchUp.caught_up_through ? `through ${formatDate(session.catchUp.caught_up_through, true)}` : 'No checkpoint yet'}</small></div>
                          <div className="catchup-checkpoint"><small>Latest checkpoint</small><p>{session.catchUp.latest_checkpoint?.summary || (ownSession ? 'Ask your agent to catch up and leave its first handoff.' : 'Checkpoint details remain private to its owner.')}</p>{ownSession && Boolean(session.catchUp.latest_checkpoint?.commitments.length) && <span>{session.catchUp.latest_checkpoint?.commitments.length} open commitment{session.catchUp.latest_checkpoint?.commitments.length === 1 ? '' : 's'}</span>}</div>
                        </article>;
                      })}
                      {!roomDetail.agentSessions.some((session) => session.status === 'active') && <div className="catchup-empty"><span>✦</span><p>Connect an agent in People & rules to create a durable catch-up position.</p></div>}
                    </div>
                    <div className="catchup-note"><span>Delivered ≠ acknowledged</span><p>An interrupted tool call cannot silently mark important room history as understood.</p><small>Lookback modes: delta · decision · topic · contribution · full audit</small></div>
                  </section>
                  <section className="change-sets-panel">
                    <div className="modal-section-heading"><div><p className="eyebrow">VERSIONED PROPOSALS</p><h3>Review the change, not another wall of comments.</h3></div><span>{roomDetail.changeSets.length} change sets</span></div>
                    {roomDetail.status !== 'closed' && <div className="change-set-composer"><div><input value={changeSetForm.title} onChange={(event) => setChangeSetForm({ ...changeSetForm, title: event.target.value })} placeholder="Change-set title" /><input value={changeSetForm.summary} onChange={(event) => setChangeSetForm({ ...changeSetForm, summary: event.target.value })} placeholder="Why should the room adopt this?" /></div><div><select value={changeSetForm.itemType} onChange={(event) => setChangeSetForm({ ...changeSetForm, itemType: event.target.value })}>{['proposal', 'evidence', 'claim', 'criterion', 'question', 'objection', 'assumption'].map((type) => <option key={type}>{type}</option>)}</select><input value={changeSetForm.changeTitle} onChange={(event) => setChangeSetForm({ ...changeSetForm, changeTitle: event.target.value })} placeholder="Proposed item title" /></div><textarea value={changeSetForm.content} onChange={(event) => setChangeSetForm({ ...changeSetForm, content: event.target.value })} placeholder="Describe the proposed addition…" /><button disabled={busy || !changeSetForm.title.trim() || !changeSetForm.summary.trim() || !changeSetForm.changeTitle.trim() || !changeSetForm.content.trim()} onClick={() => void saveChangeSet()}>Create private change set</button></div>}
                    <div className="change-set-list">{roomDetail.changeSets.map((item) => {
                      const openThreads = item.threads.filter((thread) => thread.status === 'open');
                      const canReview = ['owner', 'facilitator', 'reviewer'].includes(roomDetail.currentUserRole) && item.author_user_id !== workspace.user.userId && ['open', 'approved'].includes(item.status);
                      const canResolve = (thread: ChangeSet['threads'][number]) => thread.author_user_id === workspace.user.userId || item.author_user_id === workspace.user.userId || ['owner', 'facilitator'].includes(roomDetail.currentUserRole);
                      return <article className="change-set-card" key={item.id}><header><div><span className={'change-status ' + item.status}>{item.status.replaceAll('_', ' ')}</span><small>BASE V{item.base_version} · REVISION {item.revision} · {item.actor_path === 'webmcp' ? 'VIA WEBMCP' : 'HUMAN'}</small><h4>{item.title}</h4><p>{item.summary}</p></div><div className={'readiness-ring ' + (item.ready ? 'ready' : '')}><b>{item.checks.filter((check) => check.status === 'pass').length}/{item.checks.length}</b><span>checks</span></div></header><div className="semantic-diff">{item.changes.map((change) => <div key={change.id}><span>＋</span><div><small>{changeLabel(change)}</small><b>{changeValue(change.after)}</b>{change.before !== null && <p><del>{changeValue(change.before)}</del><ins>{changeValue(change.after)}</ins></p>}</div></div>)}</div><div className="check-strip">{item.checks.map((check) => <span className={check.status} title={check.detail} key={check.key}>{check.status === 'pass' ? '✓' : '○'} {check.label}</span>)}</div>{item.reviews.length > 0 && <div className="review-ledger">{item.reviews.map((review) => <span className={review.verdict} key={review.id}><b>{review.reviewer_name}</b> {review.verdict.replaceAll('_', ' ')} · r{review.reviewed_revision}</span>)}</div>}{item.threads.length > 0 && <div className="review-threads">{item.threads.map((thread) => <div className={thread.status} key={thread.id}><span>↳</span><p><b>{thread.author_name}</b>{thread.body}</p>{thread.status === 'open' && canResolve(thread) && <button onClick={() => void completeHumanAction({ action: 'resolve_change_set_thread', thread_id: thread.id }, 'Review thread resolved')}>Resolve</button>}</div>)}</div>}
                        {['draft', 'open', 'approved', 'changes_requested'].includes(item.status) && <div className="change-set-actions"><input value={reviewDrafts[item.id] || ''} onChange={(event) => setReviewDrafts({ ...reviewDrafts, [item.id]: event.target.value })} placeholder={item.status === 'changes_requested' && item.author_user_id === workspace.user.userId ? 'Describe what changed in this revision…' : canReview ? 'Review note or requested change…' : 'Comment on this exact proposal…'} />{item.status === 'draft' && (item.author_user_id === workspace.user.userId || ['owner', 'facilitator'].includes(roomDetail.currentUserRole)) && <button onClick={() => void completeHumanAction({ action: 'submit_change_set', change_set_id: item.id }, 'Change set submitted for review')}>Submit for review</button>}{item.status === 'changes_requested' && item.author_user_id === workspace.user.userId && <button disabled={!reviewDrafts[item.id]?.trim()} onClick={() => void reviseHumanChangeSet(item)}>Save revision</button>}{['open', 'approved'].includes(item.status) && <button disabled={!reviewDrafts[item.id]?.trim()} onClick={() => void completeHumanAction({ action: 'add_change_set_thread', change_set_id: item.id, change_id: item.changes[0]?.id, content: reviewDrafts[item.id] }, 'Review thread opened')}>Comment</button>}{canReview && <><button className="request" onClick={() => void completeHumanAction({ action: 'review_change_set', change_set_id: item.id, verdict: 'request_changes', content: reviewDrafts[item.id] || 'Please revise the proposed changes.' }, 'Changes requested')}>Request changes</button><button className="approve" onClick={() => void completeHumanAction({ action: 'review_change_set', change_set_id: item.id, verdict: 'approve', content: reviewDrafts[item.id] || 'Reviewed against the current room state.' }, 'Change set approved')}>Approve revision</button></>}{roomDetail.currentUserRole === 'owner' && ['open', 'approved'].includes(item.status) && <button className="adopt" disabled={!item.ready || openThreads.length > 0} onClick={() => void completeHumanAction({ action: 'adopt_change_set', change_set_id: item.id }, 'Change set adopted into the room')}>Adopt changes</button>}</div>}
                      </article>;
                    })}{!roomDetail.changeSets.length && <div className="empty-state compact"><span>⇄</span><h4>No change sets yet</h4><p>Prepare a versioned proposal or ask your agent to create one through WebMCP.</p></div>}</div>
                  </section>
                  {roomDetail.status !== 'closed' && <section className="human-contribution-panel">
                    <div><p className="eyebrow">ADD YOUR INPUT</p><h3>Contribute directly or satisfy a requirement.</h3><p>Your draft stays private until you publish it. Agent and human authorship remain visible in provenance.</p></div>
                    <div className="contribution-fields">
                      <label>Apply to<select value={contributionForm.requirementId} onChange={(event) => setContributionForm({ ...contributionForm, requirementId: event.target.value })}><option value="">General room contribution</option>{roomDetail.requirements.filter((item) => item.status === 'open' && (!item.owner_user_id || item.owner_user_id === workspace.user.userId || ['owner', 'facilitator'].includes(roomDetail.currentUserRole))).map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
                      <label>Type<select value={contributionForm.type} onChange={(event) => setContributionForm({ ...contributionForm, type: event.target.value })}><option value="evidence">Evidence</option><option value="proposal">Proposal</option><option value="critique">Critique</option><option value="question">Question</option></select></label>
                      <label className="wide">Title<input value={contributionForm.title} onChange={(event) => setContributionForm({ ...contributionForm, title: event.target.value })} placeholder="A clear, specific contribution title" /></label>
                      <label className="wide">Contribution<textarea value={contributionForm.content} onChange={(event) => setContributionForm({ ...contributionForm, content: event.target.value })} placeholder="Add evidence, judgment, a proposal, or a material concern…" /></label>
                      <label>Source count<input type="number" min="0" max="100" value={contributionForm.sourceCount} onChange={(event) => setContributionForm({ ...contributionForm, sourceCount: event.target.value })} /></label>
                      <button disabled={busy || !contributionForm.title.trim() || !contributionForm.content.trim()} onClick={() => void saveHumanContribution()}>Save private draft</button>
                    </div>
                  </section>}
                  {roomDetail.status !== 'closed' && <section className="deliberation-panel">
                    <div className="modal-section-heading"><div><p className="eyebrow">STRUCTURED DELIBERATION</p><h3>Connect claims, evidence, proposals, and objections.</h3></div><span>{roomDetail.deliberationItems.length} items</span></div>
                    <div className="deliberation-composer"><select value={deliberationForm.itemType} onChange={(event) => setDeliberationForm({ ...deliberationForm, itemType: event.target.value })}>{['claim', 'evidence', 'proposal', 'question', 'assumption', 'objection', 'criterion'].map((type) => <option value={type} key={type}>{type}</option>)}</select><input value={deliberationForm.title} onChange={(event) => setDeliberationForm({ ...deliberationForm, title: event.target.value })} placeholder="Concise title" /><textarea value={deliberationForm.content} onChange={(event) => setDeliberationForm({ ...deliberationForm, content: event.target.value })} placeholder="State the item so another participant can evaluate it…" /><select value={deliberationForm.relatedItemId} onChange={(event) => setDeliberationForm({ ...deliberationForm, relatedItemId: event.target.value })}><option value="">No relationship</option>{roomDetail.deliberationItems.map((item) => <option value={item.id} key={item.id}>Challenges or supports: {item.title}</option>)}</select><button disabled={busy || !deliberationForm.title.trim() || !deliberationForm.content.trim()} onClick={() => void saveDeliberationItem()}>Add structured item</button></div>
                    <div className="deliberation-list">{roomDetail.deliberationItems.slice(0, 8).map((item) => <article key={item.id}><span className={'type ' + item.item_type}>{item.item_type}</span><div><h4>{item.title}</h4><p>{item.body}</p><small>{item.author_name} · {item.actor_path === 'webmcp' ? 'via WebMCP' : 'human'}{item.related_item_id ? ' · linked' : ''}</small></div>{item.status === 'open' && ['owner', 'facilitator', 'reviewer'].includes(roomDetail.currentUserRole) && <button onClick={() => void completeHumanAction({ action: 'resolve_deliberation_item', item_id: item.id, status: 'resolved' }, 'Deliberation item resolved')}>Resolve</button>}</article>)}</div>
                  </section>}
                  <div className="modal-section-heading"><div><p className="eyebrow">PRIVATE REVIEW QUEUE</p><h3>Drafts awaiting your review</h3></div><span>{roomDetail.privateDrafts.length} drafts</span></div>
                  {roomDetail.privateDrafts.length ? (
                    <div className="draft-review-list">
                      {roomDetail.privateDrafts.map((draft) => (
                        <article key={draft.id}>
                          <div><span>✦ {draft.type}</span><h4>{draft.title}</h4><p>{draft.body}</p><small>{draft.source_count} sources · Only visible to you</small></div>
                          <button disabled={busy} onClick={() => void completeHumanAction({ action: 'publish_contribution', contribution_id: draft.id }, 'Contribution published after review')}>Publish</button>
                        </article>
                      ))}
                    </div>
                  ) : <div className="empty-state"><span>✦</span><h4>No private drafts</h4><p>Add input above or ask your agent to prepare evidence through WebMCP.</p><button onClick={() => void copyAgentPrompt(roomDetail.id)}>Copy agent prompt</button></div>}

                  <div className="evidence-block">
                    <div className="modal-section-heading"><div><p className="eyebrow">VISIBLE TO PARTICIPANTS</p><h3>Published work</h3></div><span>{roomDetail.contributions.length} items</span></div>
                    <div className="evidence-grid">
                      {roomDetail.contributions.map((item) => (
                        <article key={item.id}><span className={item.type === 'proposal' ? 'proposal' : ''}>{item.type}</span><h4>{item.title}</h4><p>{item.body}</p><small>{item.source_count} sources · {item.prepared_with_agent ? 'Agent-assisted · ' : ''}{item.author_name}</small></article>
                      ))}
                    </div>
                  </div>
                  {roomDetail.status === 'closed' && <section className="closed-loop-panel">
                    <div className="modal-section-heading"><div><p className="eyebrow">DECISION & LEARNING LOOP</p><h3>{roomDetail.decision?.summary || 'Decision recorded'}</h3></div><div className="closed-badges">{Boolean(roomDetail.meeting_avoided) && <span>1 meeting avoided</span>}{roomDetail.outcomeReview && <span>{roomDetail.outcomeReview.overallScore}/10</span>}</div></div>
                    {roomDetail.decision && <div className="decision-record"><p>{roomDetail.decision.rationale}</p>{roomDetail.decision.dissent.length > 0 && <small>Dissent retained: {roomDetail.decision.dissent.join(' · ')}</small>}</div>}
                    {roomDetail.outcomeReview ? <div className="recorded-outcome"><b>{roomDetail.outcomeReview.verification_level.replace('_', ' ')} outcome</b><p>{roomDetail.outcomeReview.evidence[0] || 'Outcome scores recorded for future room setup.'}</p><small>Visible in workspace benchmarks and this room’s WebMCP brief.</small></div> : roomDetail.currentUserRole === 'owner' && <div className="outcome-form">
                      <p>Score what happened after the decision. These results become evidence for future room setup.</p>
                      <div className="score-grid">{([
                        ['goalAchievement', 'Goal achieved'], ['evidenceQuality', 'Evidence quality'], ['processIntegrity', 'Process integrity'],
                        ['participationHealth', 'Participation'], ['execution', 'Execution'], ['learningValue', 'Learning value'],
                      ] as const).map(([key, label]) => <label key={key}>{label}<input type="number" min="0" max="10" step="0.1" value={outcomeForm[key]} onChange={(event) => setOutcomeForm({ ...outcomeForm, [key]: event.target.value })} /></label>)}</div>
                      <label>Verification<select value={outcomeForm.verificationLevel} onChange={(event) => setOutcomeForm({ ...outcomeForm, verificationLevel: event.target.value })}><option value="self_reported">Self reported</option><option value="reviewed">Peer reviewed</option><option value="verified">Verified against evidence</option></select></label>
                      <label>Outcome evidence<textarea value={outcomeForm.evidence} onChange={(event) => setOutcomeForm({ ...outcomeForm, evidence: event.target.value })} placeholder="One evidence item per line" /></label>
                      <label>Dissent or caveats<textarea value={outcomeForm.dissent} onChange={(event) => setOutcomeForm({ ...outcomeForm, dissent: event.target.value })} placeholder="Optional, one item per line" /></label>
                      <button disabled={busy || !outcomeForm.evidence.trim()} onClick={() => void saveOutcomeReview()}>Record outcome review</button>
                    </div>}
                  </section>}
                </div>
                <aside className="modal-side">
                  <div className="side-card">
                    <p className="eyebrow">DECISION READINESS</p>
                    <div className="readiness-score"><span>{roomDetail.progress}%</span><small>required input accepted</small></div>
                    <dl>
                      <div><dt>Authority</dt><dd>{roomDetail.decision_authority}</dd></div>
                      <div><dt>Participants</dt><dd>{roomDetail.members.length}</dd></div>
                      <div><dt>Published work</dt><dd>{roomDetail.contributions.length}</dd></div>
                      <div><dt>Private drafts</dt><dd>{roomDetail.privateDrafts.length}</dd></div>
                    </dl>
                  </div>
                  {roomDetail.status === 'draft' && roomDetail.currentUserRole === 'owner' && <button className="activate-button" disabled={busy} onClick={() => void completeHumanAction({ action: 'activate_room', room_id: roomDetail.id }, 'Room activated after human review')}>Activate room</button>}
                  {roomDetail.approvals.some((item) => item.status === 'pending') && <div className="side-card approval-inbox"><p className="eyebrow">HUMAN APPROVAL INBOX</p><h3>{roomDetail.approvals.filter((item) => item.status === 'pending').length} requests waiting</h3>{roomDetail.approvals.filter((item) => item.status === 'pending').map((approval) => <article key={approval.id}><b>{approval.action_type.replaceAll('_', ' ')}</b><p>{approval.rationale}</p><small>{approval.requested_by_name} · {relativeTime(approval.created_at)}</small><div><button onClick={() => void completeHumanAction({ action: 'resolve_approval_request', approval_id: approval.id, resolution: 'rejected' }, 'Approval request rejected')}>Reject</button><button onClick={() => void completeHumanAction({ action: 'resolve_approval_request', approval_id: approval.id, resolution: 'approved' }, 'Approved and applied')}>Approve</button></div></article>)}</div>}
                  {roomDetail.status === 'active' && roomDetail.currentUserRole === 'owner' && <div className="side-card decision-panel"><p className="eyebrow">FINAL HUMAN DECISION</p><h3>{openRequirements.length ? `${openRequirements.length} blockers remain` : 'The room is ready to decide.'}</h3><label>Decision summary<input value={decisionForm.summary} onChange={(event) => setDecisionForm({ ...decisionForm, summary: event.target.value })} placeholder="What will happen?" /></label><label>Rationale<textarea value={decisionForm.rationale} onChange={(event) => setDecisionForm({ ...decisionForm, rationale: event.target.value })} placeholder="Why this decision follows from the accepted input…" /></label><label>Dissent<textarea value={decisionForm.dissent} onChange={(event) => setDecisionForm({ ...decisionForm, dissent: event.target.value })} placeholder="Optional, one material objection per line" /></label><button disabled={busy || openRequirements.length > 0 || !decisionForm.summary.trim() || !decisionForm.rationale.trim()} onClick={() => void saveDecision()}>Record final decision</button><small>{openRequirements.length ? 'Accept every required input before closing the room.' : 'This human-only action closes the room and preserves dissent.'}</small></div>}
                  <div className="side-card agent-work"><span className="spark">✦</span><h3>Continue with your agent</h3><p>Inspect blockers, prepare private input, and verify the audit trail with site tools.</p><button onClick={() => void copyAgentPrompt(roomDetail.id)}>Copy room handoff</button><small>Human approval gates remain enforced</small></div>
                </aside>
              </div>
            )}

            {activeTab === 'requirements' && (
              <section className="requirements-view">
                <div className="requirements-header"><div><p className="eyebrow">INPUT CONTRACT</p><h3>The room cannot decide until required input is accepted.</h3><small>{roomDetail.reminders.filter((item) => item.status === 'scheduled').length} reminders scheduled · Escalate only unresolved conflict to a meeting.</small></div><span>{openRequirements.length} unresolved</span></div>
                <div className="requirement-board">
                  {roomDetail.requirements.map((item) => (
                    <article className={'requirement-card ' + item.status} key={item.id}>
                      <div className="requirement-card-top"><span className={'status ' + (item.status === 'accepted' ? 'ready' : 'waiting')}>{item.status}</span><small>{item.owner_label}</small></div>
                      <h4>{item.title}</h4><p>{item.description}</p>
                      {['owner', 'facilitator'].includes(roomDetail.currentUserRole) && <label className="assignment-select">Assign to<select value={item.owner_user_id || ''} onChange={(event) => event.target.value && void completeHumanAction({ action: 'assign_requirement', requirement_id: item.id, assignee_user_id: event.target.value }, 'Requirement assigned')}><option value="">Choose participant</option>{roomDetail.members.map((member) => <option value={member.user_id} key={member.user_id}>{member.display_name} · {member.role}</option>)}</select></label>}
                      <div className="requirement-card-footer"><small>Due {formatDate(item.due_at)}</small><div>{item.status !== 'accepted' && ['owner', 'facilitator'].includes(roomDetail.currentUserRole) && <button disabled={busy} onClick={() => void completeHumanAction({ action: 'schedule_reminder', room_id: roomDetail.id, requirement_id: item.id, recipient_user_id: item.owner_user_id, due_at: Date.now() + 86_400_000 }, 'Reminder scheduled for 24 hours')}>Remind 24h</button>}{item.status === 'submitted' && ['owner', 'facilitator', 'reviewer'].includes(roomDetail.currentUserRole) && <button disabled={busy} onClick={() => void completeHumanAction({ action: 'accept_requirement', requirement_id: item.id }, 'Required input accepted')}>Accept input</button>}</div></div>
                    </article>
                  ))}
                </div>
                <div className="requirements-note"><span>✦</span><p><b>Agent workflow:</b> submit_requirement_input attaches a private draft and changes the requirement to submitted. Only a person can accept it.</p></div>
              </section>
            )}

            {activeTab === 'files' && (
              <section className="files-view">
                <div className="files-heading"><div><p className="eyebrow">ROOM KNOWLEDGE</p><h3>Documents and media stay with the decision.</h3><p>Bytes are stored in R2; ownership, room access, type, and provenance are recorded in D1.</p></div><label className="upload-button">{busy ? 'Uploading…' : '＋ Add file'}<input type="file" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadRoomFile(file); event.currentTarget.value = ''; }} /></label></div>
                <div className="file-grid">
                  {roomDetail.attachments.map((attachment) => <article key={attachment.id}><span>▤</span><div><h4>{attachment.filename}</h4><p>{attachment.content_type} · {Math.max(1, Math.round(attachment.size_bytes / 1024))} KB</p><small>{attachment.uploaded_by_name} · {relativeTime(attachment.created_at)}</small></div><button onClick={() => void downloadAttachment(attachment)}>Download</button></article>)}
                  {!roomDetail.attachments.length && <div className="empty-state"><span>▤</span><h4>No files yet</h4><p>Add a brief, spreadsheet, image, code sample, or video for participants and their agents to reference.</p></div>}
                </div>
              </section>
            )}

            {activeTab === 'constitution' && (
              <section className="constitution-view">
                <div><p className="eyebrow">ROOM CONSTITUTION</p><h3>Everyone sees the rules before joining.</h3><p>The governance model determines how input becomes a decision and which actions remain human-only.</p></div>
                <div className="constitution-grid">
                  <article><span>01</span><h4>Purpose</h4><p>{roomDetail.desired_outcome}</p></article>
                  <article><span>02</span><h4>Authority</h4><p>{roomDetail.decision_authority}</p></article>
                  <article><span>03</span><h4>Participation</h4><p>{roomDetail.constitution.participation}</p></article>
                  <article><span>04</span><h4>Evidence</h4><p>{roomDetail.constitution.evidence}</p></article>
                  <article><span>05</span><h4>Agent role</h4><p>{roomDetail.constitution.agentPolicy}</p></article>
                  <article><span>06</span><h4>Red team</h4><p>{roomDetail.constitution.redTeam}</p></article>
                </div>
                <div className="criteria-panel"><p className="eyebrow">SUCCESS CRITERIA</p>{roomDetail.successCriteria.map((criterion) => <span key={criterion}>✓ {criterion}</span>)}</div>
                <div className="people-panel"><div><p className="eyebrow">PARTICIPANTS & ROLES</p><h3>{roomDetail.members.length} people can access this room.</h3></div><div className="people-list">{roomDetail.members.map((member) => <span key={member.id}><i>{member.display_name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</i><b>{member.display_name}</b><small>{member.role}</small></span>)}</div></div>
                <div className="agent-access-panel"><div><p className="eyebrow">BRING YOUR OWN AGENT</p><h3>Scoped sessions keep access visible and revocable.</h3><p>An agent remains external. This room records who owns it, what it may do, when access expires, and its last activity.</p></div><div className="agent-session-list">{roomDetail.agentSessions.map((session) => <article key={session.id}><span className={session.status}>{session.status}</span><div><b>{session.agent_name}</b><p>{session.scopes.join(' · ')}</p><small>{session.owner_user_id} · expires {formatDate(session.expires_at, true)}</small></div>{session.status === 'active' && (session.owner_user_id === workspace.user.userId || roomDetail.currentUserRole === 'owner') && <button onClick={() => void completeHumanAction({ action: 'revoke_agent_session', session_id: session.id }, 'Agent disconnected')}>Disconnect</button>}</article>)}</div><div className="agent-connect-form"><input value={agentForm.name} onChange={(event) => setAgentForm({ ...agentForm, name: event.target.value })} aria-label="Agent name" /><select value={agentForm.expiresInHours} onChange={(event) => setAgentForm({ ...agentForm, expiresInHours: event.target.value })}><option value="1">1 hour</option><option value="24">24 hours</option><option value="168">7 days</option></select><div>{['read_room', 'read_files', 'prepare_contributions', 'submit_requirements', 'request_approvals', 'prepare_change_sets'].map((scope) => <label key={scope}><input type="checkbox" checked={agentForm.scopes.includes(scope)} onChange={(event) => setAgentForm({ ...agentForm, scopes: event.target.checked ? [...agentForm.scopes, scope] : agentForm.scopes.filter((item) => item !== scope) })} />{scope.replaceAll('_', ' ')}</label>)}</div><button disabled={busy || !agentForm.name.trim() || !agentForm.scopes.length} onClick={() => void connectAgent()}>Create scoped session</button></div></div>
                {['owner', 'facilitator'].includes(roomDetail.currentUserRole) && <div className="invite-panel"><div><p className="eyebrow">INVITE A PARTICIPANT</p><h3>Access changes require a person.</h3><p>Invitations are bound to the signed-in email and do not send an external message in this demo.</p></div><div><input type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} aria-label="Invitation email" /><select value={inviteRole} onChange={(event) => setInviteRole(event.target.value as typeof inviteRole)}><option value="contributor">Contributor</option><option value="reviewer">Reviewer</option><option value="facilitator">Facilitator</option></select><button disabled={busy} onClick={() => void completeHumanAction({ action: 'create_room_invitation', room_id: roomDetail.id, invited_email: inviteEmail, role: inviteRole }, 'Invitation created')}>Create invitation</button></div>{roomDetail.invitations.map((invitation) => <small key={invitation.id}>{invitation.invited_email} · {invitation.role} · pending</small>)}</div>}
              </section>
            )}

            {activeTab === 'activity' && (
              <section className="activity-view">
                <div><p className="eyebrow">AUDIT & PROVENANCE</p><h3>Every meaningful change is attributable.</h3></div>
                <div className="activity-list">
                  {roomDetail.activity.map((item) => (
                    <article key={item.id}><i className={item.actor_path === 'webmcp' ? 'agent' : ''}>{item.actor_path === 'webmcp' ? '✦' : initialsFor(item.actor_name)}</i><div><b>{item.actor_name} · {item.actor_path === 'webmcp' ? 'via WebMCP' : 'human action'}</b><p>{item.summary}</p><small>{new Date(item.created_at).toLocaleString()}</small></div></article>
                  ))}
                </div>
              </section>
            )}
          </section>
        </div>
      )}

      {setupOpen && (
        <div className="modal-backdrop" role="presentation">
          <section className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title">
            <header className="modal-header"><div><span className="spark">✦</span><span className="room-id">PERSISTENT ROOM SETUP</span></div><button onClick={() => setSetupOpen(false)} aria-label="Close setup">×</button></header>
            <div className="setup-progress"><span className={setupStep >= 1 ? 'active' : ''}><b>1</b> Problem</span><i /><span className={setupStep >= 2 ? 'active' : ''}><b>2</b> Governance</span><i /><span className={setupStep >= 3 ? 'active' : ''}><b>3</b> Review</span></div>
            {setupStep === 1 && (
              <div className="setup-content intro">
                <div className="setup-copy"><p className="eyebrow">START WITH THE DECISION</p><h2 id="setup-title">What needs to move forward?</h2><p>Define the problem and finish line. Socialsum turns them into required input, phases, and agent-ready actions.</p>
                  <label className="field-label">Room title<input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
                  <label className="field-label">Problem<textarea value={form.problem} onChange={(event) => setForm({ ...form, problem: event.target.value })} /></label>
                  <label className="field-label">Desired outcome<textarea value={form.desiredOutcome} onChange={(event) => setForm({ ...form, desiredOutcome: event.target.value })} /></label>
                </div>
                <aside className="setup-agent-panel"><span className="spark">✦</span><h3>Your agent can set this up</h3><p>create_room_draft persists a private room with a constitution and phases. It cannot activate the room.</p><button onClick={() => void copyAgentPrompt()}><span>Copy setup prompt</span><span>↗</span></button><small>Or continue manually</small></aside>
              </div>
            )}
            {setupStep === 2 && (
              <div className="setup-content design">
                <div className="setup-copy"><p className="eyebrow">SEEDED BENCHMARKS · ADVISORY</p><h2 id="setup-title">Choose how the room decides.</h2><button className="meeting-template" onClick={() => setForm({ ...form, title: 'Replace one cross-functional decision meeting', problem: 'A recurring meeting exists mainly to collect status, evidence, and approvals, but people still leave without a complete decision record.', desiredOutcome: 'Collect assigned input asynchronously, resolve only material conflict live, record the decision, and measure meeting hours avoided.', governanceModel: 'Decision room', successCriteria: 'All required owners respond by the deadline\nAgents prepare evidence against live room state\nOnly unresolved conflict escalates to a call\nDecision and dissent are recorded\nMeeting hours avoided are measured' })}><span>Recommended pilot</span><b>Replace a decision meeting</b><small>Deadlines · assigned input · escalation threshold · meeting avoided metric</small></button><div className="model-options">
                  {(Object.keys(roomModels) as Array<keyof typeof roomModels>).map((model) => (
                    <button className={form.governanceModel === model ? 'active' : ''} onClick={() => setForm({ ...form, governanceModel: model })} key={model}><span>{model === 'Decision room' ? 'Recommended' : 'Alternative'}</span><h3>{model}</h3><p>{roomModels[model].description}</p><dl><div><dt>Completion</dt><dd>{roomModels[model].completion}</dd></div><div><dt>Median</dt><dd>{roomModels[model].median}</dd></div></dl></button>
                  ))}
                </div><label className="field-label criteria-field">Success criteria, one per line<textarea value={form.successCriteria} onChange={(event) => setForm({ ...form, successCriteria: event.target.value })} /></label></div>
                <aside className="constitution-preview"><p className="eyebrow">DRAFT CONSTITUTION</p><h3>Authority remains explicit.</h3><ul><li><b>Decision</b><span>Owner after required input</span></li><li><b>Agent work</b><span>Private by default</span></li><li><b>Publication</b><span>Human approval</span></li><li><b>Outcome</b><span>Review after 30 days</span></li></ul></aside>
              </div>
            )}
            {setupStep === 3 && (
              <div className="setup-content review">
                <div className="review-check"><span>✓</span><p className="eyebrow">READY FOR HUMAN REVIEW</p><h2 id="setup-title">This room has a clear finish line.</h2><p>The draft will persist in the workspace but remain inactive until you explicitly activate it.</p></div>
                <div className="review-summary"><article><small>Room</small><p>{form.title}</p></article><article><small>Model</small><p>{form.governanceModel}</p></article><article><small>Authority</small><p>Owner after input</p></article><article><small>Agent policy</small><p>Private drafts</p></article></div>
                <div className="review-note"><span>✦</span><p><b>WebMCP-ready from creation</b>The agent can inspect this room, find requirements, and prepare private contributions immediately after it is saved.</p></div>
              </div>
            )}
            <footer className="setup-footer"><button className="quiet-button" onClick={() => setupStep === 1 ? setSetupOpen(false) : setSetupStep(setupStep - 1)}>{setupStep === 1 ? 'Cancel' : 'Back'}</button><div><span>Persistent draft · Human activation required</span><button className="primary-button" disabled={busy} onClick={() => setupStep < 3 ? setSetupStep(setupStep + 1) : void saveRoomDraft()}>{setupStep === 1 ? 'Design room' : setupStep === 2 ? 'Review room' : busy ? 'Saving…' : 'Save room draft'} <span>→</span></button></div></footer>
          </section>
        </div>
      )}

      {toast && <div className="toast" role="status"><span>✓</span>{toast}</div>}
      {error && <div className="error-banner" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}
    </main>
  );
}
