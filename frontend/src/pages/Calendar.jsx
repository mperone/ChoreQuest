import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { useTheme } from '../hooks/useTheme';
import { themedTitle } from '../utils/questThemeText';
import {
  addDays,
  backendMondayWeekStartsForSundayWeek,
  sundayWeekStart,
} from '../utils/calendarWeek';
import { todayISOInTimeZone } from '../utils/daytime';
import {
  groupAssignmentsByChore,
  groupAssignmentsByKid,
  parentCalendarStatus,
} from '../utils/parentCalendarGroups';
import Modal from '../components/Modal';
import {
  ChevronLeft,
  ChevronRight,
  CheckCheck,
  Clock,
  Slash,
  Swords,
  Users,
  ArrowRightLeft,
  Loader2,
  X,
  Sparkles,
} from 'lucide-react';

const SHORT_DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function statusStyle(assignment, dayStr, today) {
  if (assignment.status === 'verified') {
    return {
      border: 'border-emerald',
      bg: 'bg-emerald/10',
      icon: <CheckCheck size={16} className="text-emerald" />,
    };
  }
  if (assignment.status === 'completed') {
    return {
      border: 'border-emerald',
      bg: 'bg-emerald/5',
      icon: <CheckCheck size={16} className="text-emerald/60" />,
    };
  }
  if (assignment.status === 'skipped') {
    return {
      border: 'border-border',
      bg: 'bg-navy-light/50',
      icon: <Slash size={16} className="text-muted" />,
      textClass: 'line-through text-muted',
    };
  }
  // pending
  if (dayStr < today && !assignment.is_optional) {
    // overdue
    return {
      border: 'border-crimson',
      bg: 'bg-crimson/5',
      icon: <Clock size={16} className="text-crimson" />,
    };
  }
  return {
    border: 'border-border',
    bg: '',
    icon: <Clock size={16} className="text-muted" />,
  };
}

const STATUS_TONE_CLASSES = {
  pending: 'text-gold border-gold/30 bg-gold/10',
  overdue: 'text-crimson border-crimson/30 bg-crimson/10',
  completed: 'text-emerald border-emerald/30 bg-emerald/10',
  approved: 'text-accent border-accent/30 bg-accent/10',
  muted: 'text-muted border-border bg-surface-raised/40',
  optional: 'text-gold border-gold/30 bg-gold/10',
};

function parentGroupClass(group, dayStr, today) {
  const hasOverdue = group.items.some(
    (item) =>
      (item.status === 'pending' || item.status === 'assigned') &&
      item.assignment.date < today &&
      !item.assignment.is_optional
  );
  if (hasOverdue) return 'border-crimson/60 bg-crimson/5';
  if (group.totalCount > 0 && group.doneCount === group.totalCount) {
    return 'border-emerald/50 bg-emerald/5';
  }
  if (dayStr === today) return 'border-accent/30 bg-accent/5';
  return '';
}

function ParentStatusBadge({ assignment, today }) {
  const status = parentCalendarStatus(assignment, today);
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap px-1.5 py-0.5 rounded-md text-[10px] leading-tight border ${
        STATUS_TONE_CLASSES[status.tone] || STATUS_TONE_CLASSES.pending
      }`}
    >
      {status.label}
    </span>
  );
}

function ParentCalendarGroup({
  group,
  dayStr,
  today,
  colorTheme,
  onNavigate,
  onRemove,
  removingId,
}) {
  const isQuestGroup = group.kind === 'chore';
  const HeaderIcon = isQuestGroup ? Swords : Users;

  return (
    <div
      className={`game-panel !border p-2 space-y-2 hover:border-accent/40 transition-colors ${parentGroupClass(group, dayStr, today)}`}
    >
      <button
        type="button"
        onClick={() => {
          if (isQuestGroup && group.chore_id) onNavigate(group.chore_id);
        }}
        className={`w-full flex items-start gap-1.5 text-left ${
          isQuestGroup ? 'cursor-pointer' : 'cursor-default'
        }`}
      >
        <HeaderIcon size={14} className="text-accent mt-0.5 flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p
            className="text-sm leading-tight text-cream font-medium break-words"
            title={isQuestGroup ? themedTitle(group.title, colorTheme) : group.title}
          >
            {isQuestGroup ? themedTitle(group.title, colorTheme) : group.title}
          </p>
          <p className="text-xs text-muted mt-0.5">
            {group.doneCount}/{group.totalCount} checked off
          </p>
        </div>
      </button>

      <div className="space-y-1">
        {group.items.map((item) => {
          const assignment = item.assignment;
          const canRemove = assignment.status === 'pending';
          const label = group.kind === 'kid'
            ? themedTitle(item.label, colorTheme)
            : item.label;
          return (
            <div
              key={assignment.id}
              className="rounded-md border border-border/60 bg-surface-raised/20 px-2 py-1.5"
            >
              <div className="flex items-start justify-between gap-1.5">
                <button
                  type="button"
                  onClick={() => onNavigate(assignment.chore_id || assignment.chore?.id)}
                  className="min-w-0 flex-1 text-left text-xs text-muted hover:text-cream transition-colors leading-snug break-words"
                  title={label}
                >
                  <span>{label}</span>
                  {assignment.is_optional && (
                    <span className="ml-1 inline-flex items-center gap-0.5 text-gold">
                      <Sparkles size={10} />
                      Bonus
                    </span>
                  )}
                </button>
                {canRemove && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(assignment);
                    }}
                    disabled={removingId === assignment.id}
                    className="p-0.5 rounded text-muted hover:text-crimson transition-colors disabled:opacity-50 flex-shrink-0"
                    title="Remove this assignment"
                    aria-label="Remove this assignment"
                  >
                    {removingId === assignment.id ? (
                      <Loader2 size={12} className="animate-spin" />
                    ) : (
                      <X size={12} />
                    )}
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1.5">
                <ParentStatusBadge assignment={assignment} today={today} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function Calendar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { chore_trading_enabled, daily_rollover_timezone } = useSettings();
  const { colorTheme } = useTheme();
  const isKid = user?.role === 'kid';
  const familyToday = todayISOInTimeZone(daily_rollover_timezone);

  const [startDate, setStartDate] = useState(() => sundayWeekStart(familyToday));
  const [assignments, setAssignments] = useState({});
  const [parentCalendarView, setParentCalendarView] = useState('quest');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Trade modal
  const [tradeModal, setTradeModal] = useState(false);
  const [tradeAssignment, setTradeAssignment] = useState(null);
  const [familyKids, setFamilyKids] = useState([]);
  const [selectedKid, setSelectedKid] = useState('');
  const [tradeSubmitting, setTradeSubmitting] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [removingId, setRemovingId] = useState(null);
  const [removeTarget, setRemoveTarget] = useState(null);

  const fetchCalendar = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const byDay = {};
      for (let i = 0; i < 7; i++) {
        const dayKey = addDays(startDate, i);
        byDay[dayKey] = [];
      }

      const backendWeeks = backendMondayWeekStartsForSundayWeek(startDate);
      const results = await Promise.all(
        backendWeeks.map((weekStart) => api(`/api/calendar?week_start=${weekStart}`))
      );
      for (const data of results) {
        for (const dayKey of Object.keys(byDay)) {
          if (data.days?.[dayKey]) {
            byDay[dayKey] = data.days[dayKey];
          }
        }
      }
      setAssignments(byDay);
    } catch (err) {
      setError(err.message || 'Failed to load calendar');
    } finally {
      setLoading(false);
    }
  }, [startDate]);

  useEffect(() => {
    fetchCalendar();
  }, [fetchCalendar]);

  useEffect(() => {
    setStartDate(sundayWeekStart(familyToday));
  }, [familyToday]);

  // Live updates via WebSocket
  useEffect(() => {
    const handler = () => { fetchCalendar(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchCalendar]);

  const prevWeek = () => setStartDate(addDays(startDate, -7));
  const nextWeek = () => setStartDate(addDays(startDate, 7));
  const goToday = () => setStartDate(sundayWeekStart(familyToday));

  const openTrade = async (assignment) => {
    setTradeAssignment(assignment);
    setTradeError('');
    setSelectedKid('');
    setTradeModal(true);
    try {
      const data = await api('/api/stats/kids');
      const kids = (data || []).filter((k) => k.id !== user.id);
      setFamilyKids(kids);
    } catch {
      setFamilyKids([]);
    }
  };

  const submitTrade = async () => {
    if (!selectedKid) {
      setTradeError('Select a hero to trade with');
      return;
    }
    setTradeSubmitting(true);
    setTradeError('');
    try {
      await api('/api/calendar/trade', {
        method: 'POST',
        body: {
          assignment_id: tradeAssignment.id,
          target_user_id: selectedKid,
        },
      });
      setTradeModal(false);
      fetchCalendar();
    } catch (err) {
      setTradeError(err.message || 'Trade failed');
    } finally {
      setTradeSubmitting(false);
    }
  };

  const removeAssignment = async (assignmentId, allFuture = false) => {
    setRemovingId(assignmentId);
    setRemoveTarget(null);
    try {
      const qs = allFuture ? '?all_future=true' : '';
      await api(`/api/calendar/assignments/${assignmentId}${qs}`, { method: 'DELETE' });
      fetchCalendar();
    } catch (err) {
      setError(err.message || 'Failed to remove quest');
    } finally {
      setRemovingId(null);
    }
  };

  const requestRemoveAssignment = (assignment) => {
    const isRecurring = assignment.chore?.recurrence && assignment.chore.recurrence !== 'once';
    if (isRecurring) {
      setRemoveTarget(assignment);
    } else {
      removeAssignment(assignment.id);
    }
  };

  const endDate = addDays(startDate, 6);
  const today = familyToday;
  const currentWeekStart = sundayWeekStart(today);
  const isAtCurrentWeek = startDate === currentWeekStart;
  const formatShortDate = (str) => {
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-6">
        <h1 className="text-cream text-lg font-semibold">
          Calendar
        </h1>

        {/* Week navigation */}
        <div className="flex flex-wrap items-center gap-2">
          {!isKid && (
            <div className="inline-flex items-center rounded-md border border-border bg-surface-raised/30 p-0.5">
              <button
                type="button"
                onClick={() => setParentCalendarView('quest')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  parentCalendarView === 'quest'
                    ? 'bg-accent text-navy'
                    : 'text-muted hover:text-cream'
                }`}
              >
                <Swords size={13} />
                By Quest
              </button>
              <button
                type="button"
                onClick={() => setParentCalendarView('kid')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                  parentCalendarView === 'kid'
                    ? 'bg-accent text-navy'
                    : 'text-muted hover:text-cream'
                }`}
              >
                <Users size={13} />
                By Kid
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            <button
              onClick={prevWeek}
              className="p-2 rounded hover:bg-surface-raised transition-colors text-muted hover:text-cream"
              aria-label="Previous week"
            >
              <ChevronLeft size={20} />
            </button>

            <span className="text-cream text-sm min-w-[140px] sm:min-w-[180px] text-center">
              {formatShortDate(startDate)} &ndash; {formatShortDate(endDate)}
            </span>

            <button
              onClick={nextWeek}
              className="p-2 rounded hover:bg-surface-raised transition-colors text-muted hover:text-cream"
              aria-label="Next week"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          {!isAtCurrentWeek && (
            <button onClick={goToday} className="game-btn game-btn-blue">
              Today
            </button>
          )}

        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-md border border-crimson/30 bg-crimson/10 text-crimson text-sm text-center">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="text-accent animate-spin" />
        </div>
      )}

      {/* Calendar Grid — Sunday through Saturday */}
      {!loading && (
        <div className="grid grid-cols-1 md:grid-cols-7 gap-3">
          {Array.from({ length: 7 }, (_, i) => {
            const dayStr = addDays(startDate, i);
            const d = new Date(dayStr + 'T00:00:00');
            const label = SHORT_DAYS[d.getDay()];
            const isToday = dayStr === today;
            const allDayAssignments = assignments[dayStr] || [];
            const dayAssignments = isKid
              ? allDayAssignments.filter((a) => a.user_id === user?.id)
              : allDayAssignments;
            const parentGroups = isKid
              ? []
              : parentCalendarView === 'quest'
              ? groupAssignmentsByChore(dayAssignments)
              : groupAssignmentsByKid(dayAssignments);

            return (
              <div key={dayStr} className="min-w-0">
                {/* Day header */}
                <div
                  className={`text-center py-2 px-1 rounded-t-md border-b ${
                    isToday
                      ? 'bg-accent/10 border-accent text-accent'
                      : 'bg-surface-raised/30 border-border text-muted'
                  }`}
                >
                  <div className="text-xs font-medium">
                    {label}
                  </div>
                  <div className="text-sm mt-1">
                    {new Date(dayStr + 'T00:00:00').getDate()}
                  </div>
                </div>

                {/* Assignments */}
                <div className="space-y-2 mt-2 min-h-[80px]">
                  {dayAssignments.length === 0 && (
                    <p className="text-muted text-xs text-center py-4">
                      No quests
                    </p>
                  )}
                  {isKid
                    ? dayAssignments.map((a) => {
                        const style = statusStyle(a, dayStr, today);
                        return (
                          <div
                            key={a.id}
                            className={`game-panel !border ${style.border} ${style.bg} p-2 cursor-pointer hover:border-accent/40 transition-colors`}
                            onClick={() =>
                              navigate(`/chores/${a.chore_id || a.id}`)
                            }
                          >
                            <div className="flex items-start gap-1.5">
                              {style.icon}
                              <div className="min-w-0 flex-1">
                                <p
                                  className={`text-sm leading-tight break-words ${
                                    style.textClass || 'text-cream'
                                  }`}
                                  title={themedTitle(a.chore?.title || a.chore_title || 'Quest', colorTheme)}
                                >
                                  {themedTitle(a.chore?.title || a.chore_title || 'Quest', colorTheme)}
                                </p>
                                {a.is_optional && (
                                  <span className="mt-1 inline-flex items-center gap-1 text-gold text-[10px] font-medium">
                                    <Sparkles size={10} />
                                    Bonus
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Trade button for kids */}
                            {chore_trading_enabled && a.status === 'pending' && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openTrade(a);
                                }}
                                className="mt-1.5 flex items-center gap-1 text-xs font-medium text-accent hover:text-accent/80 transition-colors"
                              >
                                <ArrowRightLeft size={12} />
                                Trade
                              </button>
                            )}
                          </div>
                        );
                      })
                    : parentGroups.map((group) => (
                        <ParentCalendarGroup
                          key={`${group.kind}-${group.id}`}
                          group={group}
                          dayStr={dayStr}
                          today={today}
                          colorTheme={colorTheme}
                          removingId={removingId}
                          onNavigate={(choreId) => navigate(`/chores/${choreId}`)}
                          onRemove={requestRemoveAssignment}
                        />
                      ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Empty state */}
      {!loading &&
        !error &&
        Object.values(assignments).every((arr) => arr.length === 0) && (
          <div className="text-center py-16">
            <p className="text-muted text-sm">
              No tasks scheduled this week.
            </p>
          </div>
        )}

      {/* Trade Modal */}
      <Modal
        isOpen={tradeModal}
        onClose={() => setTradeModal(false)}
        title="Propose a Trade"
        actions={[
          {
            label: 'Cancel',
            onClick: () => setTradeModal(false),
            className: 'game-btn game-btn-red',
          },
          {
            label: tradeSubmitting ? 'Sending...' : 'Send Trade',
            onClick: submitTrade,
            className: 'game-btn game-btn-blue',
            disabled: tradeSubmitting || !selectedKid,
          },
        ]}
      >
        <div className="space-y-4">
          <p className="text-muted text-sm">
            Trade{' '}
            <span className="text-cream font-medium">
              {themedTitle(tradeAssignment?.chore?.title || tradeAssignment?.chore_title || 'Quest', colorTheme)}
            </span>{' '}
            with another member:
          </p>

          {tradeError && (
            <div className="p-2 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
              {tradeError}
            </div>
          )}

          {familyKids.length === 0 ? (
            <p className="text-muted text-sm">
              No other members found in your family.
            </p>
          ) : (
            <div className="space-y-2">
              {familyKids.map((kid) => (
                <button
                  key={kid.id}
                  onClick={() => setSelectedKid(kid.id)}
                  className={`w-full text-left p-3 rounded-md border transition-colors ${
                    selectedKid === kid.id
                      ? 'border-accent bg-accent/10 text-accent'
                      : 'border-border text-muted hover:border-cream/30'
                  }`}
                >
                  <span className="text-sm">
                    {kid.display_name || kid.username}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>

      {/* Remove Recurring Quest Modal */}
      <Modal
        isOpen={!!removeTarget}
        onClose={() => setRemoveTarget(null)}
        title="Remove Recurring Quest"
        actions={[
          {
            label: 'Cancel',
            onClick: () => setRemoveTarget(null),
            className: 'game-btn game-btn-blue',
          },
          {
            label: 'Just This One',
            onClick: () => removeAssignment(removeTarget?.id, false),
            className: 'game-btn game-btn-red',
          },
          {
            label: 'All Future',
            onClick: () => removeAssignment(removeTarget?.id, true),
            className: 'game-btn game-btn-red',
          },
        ]}
      >
        <p className="text-muted text-sm">
          <span className="text-cream font-bold">
            {themedTitle(removeTarget?.chore?.title || 'Quest', colorTheme)}
          </span>{' '}
          is recurring{removeTarget?.user?.display_name ? ` for ${removeTarget.user.display_name}` : ''}.
          Remove just this instance, or all future pending instances?
        </p>
      </Modal>
    </div>
  );
}
