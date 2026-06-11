import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { toISO } from '../utils/calendarWeek';
import { themedTitle, themedDescription } from '../utils/questThemeText';
import { formatScheduleSummary } from '../utils/scheduleDays';
import {
  assignmentActionState,
  assignmentStatusLabel,
  splitQuestAssignments,
} from '../utils/assignmentActions';
import QuestAssignModal from '../components/QuestAssignModal';
import {
  Star,
  RefreshCw,
  Camera,
  CheckCircle2,
  XCircle,
  SkipForward,
  Calendar,
  Shield,
  Loader2,
  Users,
  Settings,
  Sparkles,
} from 'lucide-react';

const DIFFICULTY_LEVEL = { easy: 1, medium: 2, hard: 3, expert: 4 };
const DIFFICULTY_LABELS = ['Trivial', 'Easy', 'Medium', 'Hard', 'Legendary'];
const DIFFICULTY_COLORS = [
  'text-muted',
  'text-emerald',
  'text-accent',
  'text-purple',
  'text-gold',
];

const CATEGORY_COLORS = {
  cleaning: 'bg-accent/20 text-accent border-accent/40',
  cooking: 'bg-gold/20 text-gold border-gold/40',
  outdoor: 'bg-emerald/20 text-emerald border-emerald/40',
  homework: 'bg-purple/20 text-purple border-purple/40',
  pet_care: 'bg-crimson/20 text-crimson border-crimson/40',
  laundry: 'bg-accent/20 text-accent border-accent/40',
  errands: 'bg-gold/20 text-gold border-gold/40',
  default: 'bg-cream/10 text-muted border-border',
};

function DifficultyStars({ level }) {
  const num = typeof level === 'string' ? (DIFFICULTY_LEVEL[level] || 1) : (level || 1);
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={18}
          className={i <= num ? 'text-gold fill-gold' : 'text-cream/20'}
        />
      ))}
      <span className={`ml-2 text-sm ${DIFFICULTY_COLORS[num - 1] || 'text-muted'}`}>
        {DIFFICULTY_LABELS[num - 1] || 'Unknown'}
      </span>
    </div>
  );
}

function StatusBadge({ status }) {
  const styles = {
    pending: 'bg-gold/20 text-gold border-gold/40',
    assigned: 'bg-gold/20 text-gold border-gold/40',
    completed: 'bg-emerald/20 text-emerald border-emerald/40',
    verified: 'bg-accent/20 text-accent border-accent/40',
    skipped: 'bg-cream/10 text-muted border-border',
    missed: 'bg-crimson/20 text-crimson border-crimson/40',
  };
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-md text-xs border ${
        styles[status] || styles.pending
      }`}
    >
      {assignmentStatusLabel(status)}
    </span>
  );
}

function scheduleTypeFor(item) {
  return item?.schedule_type ||
    (item?.month_day ? 'monthly' : null) ||
    (item?.recurrence === 'custom' ? 'weekly' : item?.recurrence);
}

function scheduleWeekdaysFor(item) {
  return item?.weekdays || item?.custom_days;
}

function formatAssignmentDate(value) {
  if (!value) return 'No date';
  return new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function assignmentPersonName(assignment) {
  return assignment?.user?.display_name || assignment?.user?.username || `Kid #${assignment?.user_id}`;
}

export default function ChoreDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const isParent = user?.role === 'parent' || user?.role === 'admin';
  const isKid = user?.role === 'kid';

  const [chore, setChore] = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [assignmentRules, setAssignmentRules] = useState([]);
  const [allKids, setAllKids] = useState([]);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [assignmentsLoading, setAssignmentsLoading] = useState(false);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState('');
  const [actionMessage, setActionMessage] = useState('');

  const fetchChore = useCallback(async () => {
    try {
      setError('');
      const data = await api(`/api/chores/${id}`);
      setChore(data);
    } catch (err) {
      setError(err.message || 'This quest scroll could not be found.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    try {
      const data = await api(`/api/chores/${id}/assignments?past_days=30&future_days=60`);
      setAssignments(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message || 'Could not load quest assignments.');
      setAssignments([]);
    } finally {
      setAssignmentsLoading(false);
    }
  }, [id]);

  const fetchAssignmentRules = useCallback(async () => {
    if (!isParent) return;
    try {
      const rules = await api(`/api/chores/${id}/rules`);
      setAssignmentRules(Array.isArray(rules) ? rules.filter((r) => r.is_active) : []);
    } catch {
      setAssignmentRules([]);
    }
  }, [id, isParent]);

  const fetchKids = useCallback(async () => {
    if (!isParent) return;
    try {
      const data = await api('/api/stats/kids');
      setAllKids(data || []);
    } catch {
      setAllKids([]);
    }
  }, [isParent]);

  const refreshDetail = useCallback(async () => {
    await Promise.all([
      fetchChore(),
      fetchAssignments(),
      fetchAssignmentRules(),
      fetchKids(),
    ]);
  }, [fetchChore, fetchAssignments, fetchAssignmentRules, fetchKids]);

  useEffect(() => {
    refreshDetail();
  }, [refreshDetail]);

  useEffect(() => {
    const handler = () => { refreshDetail(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [refreshDetail]);

  const handleComplete = async () => {
    setActionLoading('complete');
    setActionMessage('');
    try {
      await api(`/api/chores/${id}/complete`, { method: 'POST' });
      setActionMessage('Quest submitted for approval.');
      await fetchAssignments();
    } catch (err) {
      setActionMessage(err.message || 'Failed to complete the quest.');
    } finally {
      setActionLoading('');
    }
  };

  const handleAssignmentAction = async (assignmentId, action) => {
    const pathAction = action === 'needsWork' ? 'needs-work' : action;
    const key = `${action}-${assignmentId}`;
    const messages = {
      approve: 'Quest approved.',
      needsWork: 'Quest sent back.',
      skip: 'Quest skipped.',
    };
    const errors = {
      approve: 'Approval failed.',
      needsWork: 'Could not send the quest back.',
      skip: 'Could not skip the quest.',
    };

    setActionLoading(key);
    setActionMessage('');
    try {
      await api(`/api/chores/assignments/${assignmentId}/${pathAction}`, { method: 'POST' });
      setActionMessage(messages[action]);
      await fetchAssignments();
    } catch (err) {
      setActionMessage(err.message || errors[action]);
    } finally {
      setActionLoading('');
    }
  };

  const handleAssigned = async () => {
    await refreshDetail();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  if (error && !chore) {
    return (
      <div className="max-w-2xl mx-auto py-10">
        <div className="game-panel p-10 text-center">
          <XCircle size={48} className="mx-auto text-crimson mb-4" />
          <p className="text-cream text-base font-semibold mb-2">Not Found</p>
          <p className="text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!chore) return null;

  const today = toISO(new Date());
  const { today: todayAssignments, upcoming, recent } = splitQuestAssignments(assignments, today);
  const todayAssignment = todayAssignments.find((a) => a.user_id === user?.id) || todayAssignments[0];
  const hasPendingToday = isKid && todayAssignment && assignmentActionState(todayAssignment).canSkip;

  const categoryName = typeof chore.category === 'object' ? chore.category?.name : chore.category;
  const categoryColorClass =
    CATEGORY_COLORS[categoryName?.toLowerCase()] || CATEGORY_COLORS.default;
  const choreScheduleType = scheduleTypeFor(chore);
  const choreScheduleWeekdays = scheduleWeekdaysFor(chore);
  const hasSchedule =
    chore.schedule_type ||
    chore.start_date ||
    chore.month_day ||
    (Array.isArray(choreScheduleWeekdays) && choreScheduleWeekdays.length > 0) ||
    (chore.recurrence && chore.recurrence !== 'once');
  const choreScheduleSummary = hasSchedule
    ? formatScheduleSummary({
        ...chore,
        schedule_type: choreScheduleType,
        weekdays: choreScheduleWeekdays,
      })
    : 'Not scheduled';

  const AssignmentRow = ({ assignment, compact = false }) => {
    const actions = assignmentActionState(assignment);
    const name = assignmentPersonName(assignment);
    const title = themedTitle(assignment.chore?.title || chore.title, colorTheme);
    const approveKey = `approve-${assignment.id}`;
    const needsWorkKey = `needsWork-${assignment.id}`;
    const skipKey = `skip-${assignment.id}`;
    const hasActions = isParent && (actions.canApprove || actions.canSendBack || actions.canSkip);

    return (
      <div className="rounded-md border border-border bg-surface-raised/20 p-3 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-cream text-sm font-medium break-words" title={title}>
              {isParent ? name : title}
            </p>
            <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-muted">
              {isParent && <span>{formatAssignmentDate(assignment.date)}</span>}
              {!isParent && assignment.user_id !== user?.id && <span>{name}</span>}
              {assignment.chore?.points && (
                <span className="text-gold font-medium">+{assignment.chore.points} XP</span>
              )}
              {assignment.is_optional && (
                <span className="inline-flex items-center gap-1 text-gold">
                  <Sparkles size={10} />
                  Bonus
                </span>
              )}
              {(assignment.photo_proof_path || assignment.chore?.requires_photo) && (
                <span className="inline-flex items-center gap-1 text-accent">
                  <Camera size={10} />
                  Photo
                </span>
              )}
            </div>
          </div>
          <StatusBadge status={assignment.status} />
        </div>

        {assignment.photo_proof_path && (
          <img
            src={`/api/uploads/${assignment.photo_proof_path}`}
            alt="Photo proof"
            className="rounded-md max-h-56 object-cover border border-border"
          />
        )}

        {assignment.feedback && (
          <p className="text-muted text-xs italic">
            Feedback: {assignment.feedback}
          </p>
        )}

        {hasActions && (
          <div className={`flex flex-wrap gap-2 ${compact ? '' : 'pt-1'}`}>
            {actions.canApprove && (
              <button
                type="button"
                onClick={() => handleAssignmentAction(assignment.id, 'approve')}
                disabled={actionLoading === approveKey}
                className="game-btn game-btn-blue flex items-center gap-1.5 !py-1.5 !px-3 !text-[11px]"
              >
                {actionLoading === approveKey ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                Approve
              </button>
            )}
            {actions.canSendBack && (
              <button
                type="button"
                onClick={() => handleAssignmentAction(assignment.id, 'needsWork')}
                disabled={actionLoading === needsWorkKey}
                className="game-btn game-btn-red flex items-center gap-1.5 !py-1.5 !px-3 !text-[11px]"
              >
                {actionLoading === needsWorkKey ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <XCircle size={14} />
                )}
                Needs Work
              </button>
            )}
            {actions.canSkip && (
              <button
                type="button"
                onClick={() => handleAssignmentAction(assignment.id, 'skip')}
                disabled={actionLoading === skipKey}
                className="game-btn game-btn-red flex items-center gap-1.5 !py-1.5 !px-3 !text-[11px]"
              >
                {actionLoading === skipKey ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <SkipForward size={14} />
                )}
                Skip
              </button>
            )}
          </div>
        )}
      </div>
    );
  };

  const AssignmentSection = ({ title, rows, empty }) => (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-cream text-xs font-semibold uppercase tracking-wide">
          {title}
        </h3>
        <span className="text-muted text-xs">{rows.length}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-muted text-xs py-2">{empty}</p>
      ) : (
        <div className="space-y-2">
          {rows.map((assignment) => (
            <AssignmentRow key={assignment.id} assignment={assignment} compact />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="game-panel p-6 space-y-5">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <h1 className="text-cream text-lg font-semibold leading-relaxed break-words">
              {themedTitle(chore.title, colorTheme)}
            </h1>
          </div>
        </div>

        {chore.description && (
          <div className="pl-10">
            <p className="text-muted text-sm leading-relaxed">
              {themedDescription(chore.title, chore.description, colorTheme)}
            </p>
          </div>
        )}

        <div className="mx-auto w-full h-[1px] bg-border" />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-gold/10 flex items-center justify-center">
              <span className="text-gold text-xl">&#9733;</span>
            </div>
            <div>
              <p className="text-muted text-xs font-medium">XP Reward</p>
              <p className="text-gold text-lg font-medium">{chore.points} XP</p>
            </div>
          </div>

          <div>
            <p className="text-muted text-xs font-medium mb-1">Difficulty</p>
            <DifficultyStars level={chore.difficulty || 1} />
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-surface-raised flex items-center justify-center">
              <Shield size={18} className="text-muted" />
            </div>
            <div>
              <p className="text-muted text-xs font-medium">Category</p>
              <span
                className={`inline-block px-2 py-0.5 rounded-md text-sm border capitalize ${categoryColorClass}`}
              >
                {categoryName || 'General'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-md bg-surface-raised flex items-center justify-center">
              <RefreshCw size={18} className="text-muted" />
            </div>
            <div>
              <p className="text-muted text-xs font-medium">Schedule</p>
              <p className="text-cream text-sm">{choreScheduleSummary}</p>
            </div>
          </div>
        </div>

        {chore.requires_photo && (
          <div className="flex items-center gap-2 px-3 py-2 rounded bg-purple/10 border border-purple/30">
            <Camera size={16} className="text-purple" />
            <span className="text-purple text-xs">
              Photo proof required
            </span>
          </div>
        )}
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded border text-sm text-center ${
            actionMessage.toLowerCase().includes('fail') ||
            actionMessage.toLowerCase().includes('could not')
              ? 'border-crimson/40 bg-crimson/10 text-crimson'
              : 'border-emerald/40 bg-emerald/10 text-emerald'
          }`}
        >
          {actionMessage}
        </div>
      )}

      {error && chore && (
        <div className="p-3 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm text-center">
          {error}
        </div>
      )}

      {isKid && hasPendingToday && (
        <div className="game-panel p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-cream text-sm font-semibold mb-1">Today's Quest</p>
              <p className="text-muted text-xs">{formatAssignmentDate(todayAssignment.date)}</p>
            </div>
            <button
              onClick={handleComplete}
              disabled={!!actionLoading}
              className={`game-btn game-btn-blue flex items-center gap-2 ${
                actionLoading === 'complete' ? 'opacity-60 cursor-wait' : ''
              }`}
            >
              <CheckCircle2 size={16} />
              {actionLoading === 'complete' ? 'Submitting...' : 'Complete Quest'}
            </button>
          </div>
        </div>
      )}

      {isParent && (
        <div className="game-panel p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Settings size={18} className="text-accent" />
              <h2 className="text-cream text-sm font-semibold">Quest Assignment</h2>
            </div>
            <button
              type="button"
              onClick={() => setAssignModalOpen(true)}
              className="game-btn game-btn-blue flex items-center gap-2 justify-center"
            >
              <Users size={14} />
              Manage Assignment
            </button>
          </div>

          {assignmentRules.length === 0 ? (
            <p className="text-muted text-sm">Not assigned.</p>
          ) : (
            <div className="space-y-2">
              {assignmentRules.map((rule) => {
                const kid = allKids.find((k) => k.id === rule.user_id);
                const ruleScheduleType = scheduleTypeFor(rule);
                const ruleWeekdays = scheduleWeekdaysFor(rule);
                return (
                  <div
                    key={rule.id}
                    className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-md border border-border bg-surface-raised/20"
                  >
                    <span className="text-cream text-sm font-medium">
                      {kid?.display_name || rule.user?.display_name || `Kid #${rule.user_id}`}
                    </span>
                    <div className="flex flex-wrap items-center gap-2 text-muted text-xs">
                      <span className="inline-flex items-center gap-1">
                        <RefreshCw size={10} />
                        {formatScheduleSummary({
                          ...rule,
                          schedule_type: ruleScheduleType,
                          weekdays: ruleWeekdays,
                        })}
                      </span>
                      {rule.requires_photo && (
                        <span className="inline-flex items-center gap-1">
                          <Camera size={10} />
                          Photo
                        </span>
                      )}
                      {rule.is_optional && (
                        <span className="inline-flex items-center gap-1 text-gold">
                          <Sparkles size={10} />
                          Bonus
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="game-panel p-5 space-y-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Calendar size={18} className="text-accent" />
            <h2 className="text-cream text-sm font-semibold">Assignments</h2>
          </div>
          {assignmentsLoading && <Loader2 size={16} className="animate-spin text-accent" />}
        </div>

        <AssignmentSection
          title="Today"
          rows={todayAssignments}
          empty="Nothing scheduled today."
        />
        <AssignmentSection
          title="Upcoming"
          rows={upcoming.slice(0, 12)}
          empty="No upcoming assignments."
        />
        <AssignmentSection
          title="Recent"
          rows={recent.slice(0, 12)}
          empty="No recent history."
        />
      </div>

      {isParent && (
        <QuestAssignModal
          isOpen={assignModalOpen}
          onClose={() => setAssignModalOpen(false)}
          onAssigned={handleAssigned}
          chore={chore}
          kids={allKids}
        />
      )}
    </div>
  );
}
