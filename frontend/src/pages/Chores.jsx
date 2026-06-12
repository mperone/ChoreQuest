import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../hooks/useTheme';
import { useSettings } from '../hooks/useSettings';
import { themedTitle, themedDescription } from '../utils/questThemeText';
import { formatScheduleSummary } from '../utils/scheduleDays';
import { todayISOInTimeZone } from '../utils/daytime';
import {
  kidBrowseActionForStatus,
  filterKidQuestItems,
  groupKidQuestAssignments,
  isActionableStatus,
  isDoneStatus,
} from '../utils/kidQuestBoard';
import {
  DAYPART_LABELS,
  DAYPART_ORDER,
  buildChoreReorderPayload,
  groupChoresForParentOrdering,
  moveChoreBetweenDayparts,
} from '../utils/choreDayparts';
import Modal from '../components/Modal';
import QuestCreateModal from '../components/QuestCreateModal';
import QuestAssignModal from '../components/QuestAssignModal';
import {
  Swords,
  Plus,
  Pencil,
  Trash2,
  Star,
  RefreshCw,
  Calendar,
  Camera,
  Filter,
  CheckCircle2,
  Clock,
  Eye,
  EyeOff,
  Loader2,
  Users,
  ScrollText,
  Zap,
  Sparkles,
  GripVertical,
} from 'lucide-react';

const DIFFICULTY_OPTIONS = [
  { value: 'easy', label: 'Easy', level: 1 },
  { value: 'medium', label: 'Medium', level: 2 },
  { value: 'hard', label: 'Hard', level: 3 },
  { value: 'expert', label: 'Expert', level: 4 },
];
const DIFFICULTY_LEVEL = { easy: 1, medium: 2, hard: 3, expert: 4 };
const KID_TABS = [
  { id: 'today', label: 'Today', icon: Calendar },
  { id: 'upcoming', label: 'Upcoming', icon: Clock },
  { id: 'recent', label: 'Recent', icon: CheckCircle2 },
];

const selectClass =
  'bg-navy-light border border-border text-cream p-2 rounded-md text-sm ' +
  'focus:border-accent focus:outline-none transition-colors';

function DifficultyStars({ level }) {
  const numLevel = typeof level === 'string' ? (DIFFICULTY_LEVEL[level] || 1) : (level || 1);
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <Star
          key={i}
          size={12}
          className={i <= numLevel ? 'text-gold fill-gold' : 'text-muted'}
        />
      ))}
    </div>
  );
}

function CategoryBadge({ category }) {
  const catName = typeof category === 'object' ? category?.name : category;
  return (
    <span className="inline-block px-2 py-0.5 rounded-md text-xs border bg-surface-raised text-muted border-border capitalize">
      {catName || 'General'}
    </span>
  );
}

function ScheduleIndicator({ chore }) {
  const scheduleType =
    chore.schedule_type ||
    (chore.month_day ? 'monthly' : null) ||
    (chore.recurrence === 'custom' ? 'weekly' : chore.recurrence);
  const weekdays = chore.weekdays || chore.custom_days;
  const hasSchedule =
    chore.schedule_type ||
    chore.start_date ||
    chore.month_day ||
    (Array.isArray(weekdays) && weekdays.length > 0) ||
    (chore.recurrence && chore.recurrence !== 'once');

  if (!hasSchedule) return null;

  return (
    <div className="flex items-center gap-1 text-muted text-xs">
      <RefreshCw size={11} />
      <span>{formatScheduleSummary({ ...chore, schedule_type: scheduleType, weekdays })}</span>
    </div>
  );
}

function formatShortDate(dateStr) {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}

function kidStatusMeta(item, today) {
  const status = item.assignment_status || 'pending';
  if (isActionableStatus(status) && item.assignment_date < today && !item.is_optional) {
    return { label: 'Missed', className: 'text-crimson border-crimson/30 bg-crimson/10' };
  }
  if (status === 'completed') {
    return { label: 'Awaiting approval', className: 'text-emerald border-emerald/30 bg-emerald/10' };
  }
  if (status === 'verified') {
    return { label: 'Approved', className: 'text-accent border-accent/30 bg-accent/10' };
  }
  if (status === 'skipped') {
    return { label: 'Skipped', className: 'text-muted border-border bg-surface-raised/40' };
  }
  if (status === 'missed') {
    return item.is_optional
      ? { label: 'Bonus missed', className: 'text-muted border-border bg-surface-raised/40' }
      : { label: 'Missed', className: 'text-crimson border-crimson/30 bg-crimson/10' };
  }
  if (item.is_optional) {
    return { label: 'Bonus', className: 'text-gold border-gold/30 bg-gold/10' };
  }
  if (item.assignment_date > today) {
    return { label: 'Upcoming', className: 'text-purple border-purple/30 bg-purple/10' };
  }
  return { label: 'Ready', className: 'text-gold border-gold/30 bg-gold/10' };
}

function KidAssignmentMeta({ item, today }) {
  const dateLabel = item.assignment_date === today
    ? 'Today'
    : formatShortDate(item.assignment_date);
  const status = kidStatusMeta(item, today);

  return (
    <>
      <span className="flex items-center gap-1 text-muted text-xs">
        <Calendar size={11} />
        {dateLabel}
      </span>
      <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs border ${status.className}`}>
        {status.label}
      </span>
    </>
  );
}

function todayISO(timeZone) {
  return todayISOInTimeZone(timeZone);
}

export default function Chores() {
  const { user } = useAuth();
  const { colorTheme } = useTheme();
  const { daily_rollover_timezone } = useSettings();
  const navigate = useNavigate();
  const isParent = user?.role === 'parent' || user?.role === 'admin';
  const isKid = user?.role === 'kid';

  const [chores, setChores] = useState([]);
  const [categories, setCategories] = useState([]);
  const [kids, setKids] = useState([]);
  const [kidAssignments, setKidAssignments] = useState([]);
  const [kidToday, setKidToday] = useState(() => todayISO(daily_rollover_timezone));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [activeTab, setActiveTab] = useState('library');
  const [activeKidTab, setActiveKidTab] = useState('today');

  const [filterCategory, setFilterCategory] = useState('');
  const [filterDifficulty, setFilterDifficulty] = useState('');
  const [showCompleted, setShowCompleted] = useState(false);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingChore, setEditingChore] = useState(null);
  const [assigningChore, setAssigningChore] = useState(null);
  const [draggedChore, setDraggedChore] = useState(null);
  const [savingOrder, setSavingOrder] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchChores = useCallback(async () => {
    if (isKid) {
      setChores([]);
      return;
    }
    try {
      setError('');
      const data = await api('/api/chores');
      setChores(Array.isArray(data) ? data : data.chores || data.items || []);
    } catch (err) {
      setError(err.message || 'Failed to load quests.');
    }
  }, [isKid]);

  const fetchAssignments = useCallback(async () => {
    if (!isKid) return;
    try {
      const data = await api('/api/calendar/mine?past_days=14&future_days=28');
      setKidToday(data.today || todayISO(daily_rollover_timezone));
      setKidAssignments(Array.isArray(data.assignments) ? data.assignments : []);
    } catch (err) {
      setError(err.message || 'Failed to load your quests.');
    }
  }, [isKid, daily_rollover_timezone]);

  const fetchCategories = useCallback(async () => {
    try {
      const data = await api('/api/chores/categories');
      setCategories(Array.isArray(data) ? data : data.categories || []);
    } catch {
      // Non-critical
    }
  }, []);

  const fetchKids = useCallback(async () => {
    if (!isParent) return;
    try {
      const data = await api('/api/stats/family');
      setKids(Array.isArray(data) ? data : []);
    } catch {
      try {
        const data = await api('/api/admin/users');
        const users = Array.isArray(data) ? data : data.users || [];
        setKids(users.filter((u) => u.role === 'kid'));
      } catch {
        // Non-critical
      }
    }
  }, [isParent]);

  const fetchAll = useCallback(async () => {
    await Promise.all([fetchChores(), fetchAssignments(), fetchCategories(), fetchKids()]);
  }, [fetchChores, fetchAssignments, fetchCategories, fetchKids]);

  useEffect(() => {
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  useEffect(() => {
    const handler = () => { fetchChores(); fetchAssignments(); };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchChores, fetchAssignments]);

  const libraryChores = chores;
  const activeChores = chores.filter((c) => (c.assignment_count || 0) > 0);
  const parentOrderGroups = useMemo(() => {
    const groups = groupChoresForParentOrdering(chores);
    return Object.fromEntries(
      DAYPART_ORDER.map((daypart) => [
        daypart,
        groups[daypart].map((chore) => chore.id),
      ]),
    );
  }, [chores]);
  const parentChoreById = useMemo(
    () => new Map(chores.map((chore) => [Number(chore.id), chore])),
    [chores],
  );
  const kidQuestGroups = isKid
    ? groupKidQuestAssignments(kidAssignments, kidToday)
    : { today: [], upcoming: [], recent: [] };

  const currentChores = isParent
    ? (activeTab === 'library' ? libraryChores : activeChores)
    : kidQuestGroups[activeKidTab] || [];

  const filteredChores = isKid
    ? filterKidQuestItems(currentChores, {
        category: filterCategory,
        difficulty: filterDifficulty,
        showCompleted: activeKidTab === 'today' ? showCompleted : true,
      })
    : currentChores.filter((chore) => {
        if (filterCategory && chore.category?.name !== filterCategory) return false;
        if (filterDifficulty && chore.difficulty !== filterDifficulty) return false;
        return true;
      });

  const completedCount = isKid
    ? kidQuestGroups.today.filter((item) => isDoneStatus(item.assignment_status)).length
    : 0;
  const kidTabCounts = {
    today: kidQuestGroups.today.length,
    upcoming: kidQuestGroups.upcoming.length,
    recent: kidQuestGroups.recent.length,
  };

  const saveDaypartOrder = async (nextGroups) => {
    setSavingOrder(true);
    try {
      await api('/api/chores/reorder-dayparts', {
        method: 'POST',
        body: buildChoreReorderPayload(nextGroups),
      });
      await fetchChores();
    } catch (err) {
      setError(err.message || 'Failed to save quest order.');
    } finally {
      setSavingOrder(false);
    }
  };

  const handleDaypartDragStart = (event, choreId, fromDaypart) => {
    event.stopPropagation();
    if (savingOrder) return;
    setDraggedChore({ choreId, fromDaypart });
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(choreId));
  };

  const handleDaypartDragOver = (event) => {
    if (!draggedChore || savingOrder) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  };

  const dropChoreIntoDaypart = async (event, toDaypart, toIndex) => {
    event.preventDefault();
    event.stopPropagation();
    if (!draggedChore || savingOrder) return;

    const nextGroups = moveChoreBetweenDayparts(parentOrderGroups, {
      choreId: draggedChore.choreId,
      fromDaypart: draggedChore.fromDaypart,
      toDaypart,
      toIndex,
    });

    setDraggedChore(null);
    await saveDaypartOrder(nextGroups);
  };

  const dropChoreOntoRow = async (event, toDaypart, rowIndex) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const targetIndex = rowIndex + (event.clientY > rect.top + rect.height / 2 ? 1 : 0);
    const fromIds = parentOrderGroups[toDaypart] || [];
    const fromIndex = draggedChore?.fromDaypart === toDaypart
      ? fromIds.findIndex((id) => Number(id) === Number(draggedChore.choreId))
      : -1;
    const adjustedIndex = fromIndex !== -1 && fromIndex < targetIndex
      ? targetIndex - 1
      : targetIndex;

    await dropChoreIntoDaypart(event, toDaypart, adjustedIndex);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api(`/api/chores/${deleteTarget.id}`, { method: 'DELETE' });
      setDeleteTarget(null);
      await fetchChores();
    } catch (err) {
      setError(err.message || 'Failed to remove the quest.');
    } finally {
      setDeleting(false);
    }
  };

  const hasActiveFilters = !!filterCategory || !!filterDifficulty;
  const kidEmptyMessage = (() => {
    if (!isKid) return '';
    if (currentChores.length > 0 && hasActiveFilters) return 'No chores match your filters.';
    if (activeKidTab === 'today') {
      if (!showCompleted && completedCount > 0) return "All today's chores are complete.";
      return 'No chores due today.';
    }
    if (activeKidTab === 'upcoming') return 'No upcoming chores scheduled.';
    return 'No recent chore history.';
  })();

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 size={24} className="text-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <h1 className="text-cream text-lg font-semibold">
          {isParent ? 'Quest Management' : 'Chores'}
        </h1>
        <div className="flex items-center gap-2">
          {isKid && activeKidTab === 'today' && completedCount > 0 && (
            <button
              onClick={() => setShowCompleted((v) => !v)}
              className="flex items-center gap-1.5 text-muted hover:text-cream text-sm transition-colors"
            >
              {showCompleted ? <EyeOff size={14} /> : <Eye size={14} />}
              {showCompleted ? 'Hide' : 'Show'} completed ({completedCount})
            </button>
          )}
          {isParent && (
            <button
              onClick={() => { setEditingChore(null); setShowCreateModal(true); }}
              className="game-btn game-btn-blue flex items-center gap-1.5"
            >
              <Plus size={14} />
              Create Quest
            </button>
          )}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-2.5 rounded-md border border-crimson/40 bg-crimson/10 text-crimson text-sm">
          {error}
        </div>
      )}

      {/* Parent Tabs */}
      {isParent && (
        <div className="flex gap-0.5 border-b border-border">
          <button
            onClick={() => setActiveTab('library')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'library'
                ? 'border-accent text-accent'
                : 'border-transparent text-muted hover:text-cream'
            }`}
          >
            <ScrollText size={14} />
            Library
            <span className="text-xs text-muted">({libraryChores.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('active')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === 'active'
                ? 'border-emerald text-emerald'
                : 'border-transparent text-muted hover:text-cream'
            }`}
          >
            <Zap size={14} />
            Active
            <span className="text-xs text-muted">({activeChores.length})</span>
          </button>
        </div>
      )}

      {/* Kid Tabs */}
      {isKid && (
        <div className="flex gap-0.5 border-b border-border">
          {KID_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeKidTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveKidTab(tab.id)}
                className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                  active
                    ? 'border-accent text-accent'
                    : 'border-transparent text-muted hover:text-cream'
                }`}
              >
                <Icon size={14} />
                {tab.label}
                <span className="text-xs text-muted">({kidTabCounts[tab.id] || 0})</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Filter Bar */}
      <div className="game-panel p-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="flex items-center gap-1.5 text-muted">
            <Filter size={14} />
            <span className="text-sm">Filters:</span>
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className={selectClass}
          >
            <option value="">All Categories</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.name}>{cat.name}</option>
            ))}
          </select>
          <select
            value={filterDifficulty}
            onChange={(e) => setFilterDifficulty(e.target.value)}
            className={selectClass}
          >
            <option value="">All Difficulties</option>
            {DIFFICULTY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Parent Daypart Ordering */}
      {isParent && chores.length > 0 && (
        <section className="game-panel p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-cream text-sm font-semibold">Daily order</h2>
            {savingOrder && (
              <span className="inline-flex items-center gap-1 text-xs text-accent">
                <Loader2 size={12} className="animate-spin" />
                Saving order...
              </span>
            )}
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            {DAYPART_ORDER.map((daypart) => {
              const choreIds = parentOrderGroups[daypart] || [];

              return (
                <div
                  key={daypart}
                  className="rounded-md border border-border bg-navy-light/40 p-2 min-h-[8rem]"
                  onDragOver={handleDaypartDragOver}
                  onDrop={(event) => dropChoreIntoDaypart(event, daypart, choreIds.length)}
                >
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
                      {DAYPART_LABELS[daypart]}
                    </h3>
                    <span className="rounded-full border border-border bg-surface-raised px-2 py-0.5 text-[11px] text-muted">
                      {choreIds.length}
                    </span>
                  </div>

                  <div className="space-y-2">
                    {choreIds.length === 0 && (
                      <div className="flex min-h-20 items-center justify-center rounded-md border border-dashed border-border text-xs text-muted/70">
                        No quests
                      </div>
                    )}

                    {choreIds.map((choreId, index) => {
                      const chore = parentChoreById.get(Number(choreId));
                      if (!chore) return null;

                      const title = themedTitle(chore.title, colorTheme);
                      const isDraggingThis = Number(draggedChore?.choreId) === Number(choreId);

                      return (
                        <button
                          key={choreId}
                          type="button"
                          draggable={!savingOrder}
                          aria-disabled={savingOrder}
                          aria-label={`Move ${chore.title} within daily order`}
                          title={title}
                          onClick={(event) => event.stopPropagation()}
                          onDragStart={(event) => handleDaypartDragStart(event, choreId, daypart)}
                          onDragOver={handleDaypartDragOver}
                          onDrop={(event) => dropChoreOntoRow(event, daypart, index)}
                          onDragEnd={() => setDraggedChore(null)}
                          className={`flex w-full items-center gap-2 rounded-md border px-2 py-2 text-left transition-colors ${
                            isDraggingThis
                              ? 'border-accent bg-surface-raised opacity-60'
                              : 'border-border bg-surface-raised/60 hover:border-accent/50'
                          } ${savingOrder ? 'cursor-wait' : 'cursor-grab active:cursor-grabbing'}`}
                        >
                          <span className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-border bg-navy text-muted">
                            <GripVertical size={14} />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium text-cream">
                              {title}
                            </span>
                            <span className="block truncate text-xs text-muted">
                              {chore.points || 0} XP
                            </span>
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Chore List */}
      {filteredChores.length === 0 ? (
        <div className="game-panel p-8 text-center">
          <p className="text-muted text-sm">
            {isKid
              ? kidEmptyMessage
              : chores.length === 0
              ? 'No quests created yet.'
              : isParent && activeTab === 'active'
              ? 'No active quests. Assign some from the Library.'
              : 'No quests match your filters.'}
          </p>
          {isParent && chores.length === 0 && (
            <button
              onClick={() => { setEditingChore(null); setShowCreateModal(true); }}
              className="game-btn game-btn-blue mt-3 inline-flex items-center gap-1.5"
            >
              <Plus size={14} />
              Create first quest
            </button>
          )}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredChores.map((chore) => {
            const kidStatus = isKid ? chore.assignment_status : null;
            const isDone = isKid && isDoneStatus(kidStatus);
            const isPassiveKidBrowseAction =
              isKid && (kidStatus === 'completed' || kidStatus === 'verified');
            const assignCount = chore.assignment_count || 0;

            return (
              <div
                key={isKid ? `${chore.assignment_id}-${chore.id}` : chore.id}
                className={`game-panel p-3 flex flex-col gap-2 cursor-pointer hover:border-accent/40 transition-colors ${
                  isDone ? 'opacity-50' : ''
                }`}
                onClick={() => {
                  if (isParent && activeTab === 'library' && assignCount === 0) {
                    setAssigningChore(chore);
                  } else {
                    navigate(`/chores/${chore.id}`);
                  }
                }}
              >
                {/* Title row */}
                <div className="flex items-start justify-between gap-2">
                  <h3 className="text-cream text-sm font-medium flex-1">
                    {themedTitle(chore.title, colorTheme)}
                  </h3>
                  {isParent && (
                    <div className="flex items-center gap-0.5 flex-shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingChore(chore);
                          setShowCreateModal(true);
                        }}
                        className="p-1 rounded-md hover:bg-surface-raised transition-colors text-muted hover:text-accent"
                        aria-label="Edit quest"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeleteTarget(chore);
                        }}
                        className="p-1 rounded-md hover:bg-surface-raised transition-colors text-muted hover:text-crimson"
                        aria-label="Delete quest"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  )}
                  {isDone && (
                    <CheckCircle2 size={16} className="text-emerald flex-shrink-0" />
                  )}
                </div>

                {/* Description */}
                {chore.description && (
                  <p className="text-muted text-xs line-clamp-2">
                    {themedDescription(chore.title, chore.description, colorTheme)}
                  </p>
                )}

                {/* Meta row */}
                <div className="flex items-center flex-wrap gap-2 mt-auto">
                  <span className="flex items-center gap-1 text-gold font-medium text-sm">
                    <Star size={12} fill="currentColor" />
                    {chore.points} XP
                  </span>
                  {isKid && chore.is_optional && (
                    <span className="flex items-center gap-1 text-gold font-medium text-xs">
                      <Sparkles size={11} />
                      Bonus
                    </span>
                  )}
                  <DifficultyStars level={chore.difficulty || 1} />
                </div>

                {/* Bottom row */}
                <div className="flex items-center flex-wrap gap-1.5">
                  {isKid && (
                    <KidAssignmentMeta item={chore} today={kidToday} />
                  )}
                  <CategoryBadge category={chore.category} />
                  <ScheduleIndicator chore={chore} />
                  {chore.requires_photo && (
                    <span className="flex items-center gap-1 text-muted text-xs">
                      <Camera size={11} />
                      Photo
                    </span>
                  )}
                  {isParent && assignCount > 0 && (
                    <span className="flex items-center gap-1 text-emerald text-xs font-medium">
                      <Users size={11} />
                      {assignCount} assigned
                    </span>
                  )}
                  {isParent && assignCount === 0 && (
                    <span className="text-muted/60 text-xs">
                      Unassigned
                    </span>
                  )}
                </div>

                {/* Parent: assign button */}
                {isParent && activeTab === 'library' && assignCount === 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssigningChore(chore);
                    }}
                    className="game-btn game-btn-gold w-full flex items-center justify-center gap-1.5 !text-xs !py-1.5"
                  >
                    <Users size={12} />
                    Assign
                  </button>
                )}

                {isParent && assignCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setAssigningChore(chore);
                    }}
                    className="game-btn game-btn-purple w-full flex items-center justify-center gap-1.5 !text-xs !py-1.5"
                  >
                    <Users size={12} />
                    Manage
                  </button>
                )}

                {/* Kid: browse detail action */}
                {isKid && (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      navigate(`/chores/${chore.id}`);
                    }}
                    className={`game-btn w-full flex items-center justify-center gap-1.5 !text-xs !py-1.5 ${
                      isPassiveKidBrowseAction
                        ? 'bg-surface-raised text-muted border border-border hover:text-cream'
                        : 'game-btn-blue'
                    }`}
                  >
                    {kidBrowseActionForStatus(chore.assignment_status)}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <QuestCreateModal
        isOpen={showCreateModal}
        onClose={() => { setShowCreateModal(false); setEditingChore(null); }}
        onCreated={fetchChores}
        categories={categories}
        editingChore={editingChore}
      />

      <QuestAssignModal
        isOpen={!!assigningChore}
        onClose={() => setAssigningChore(null)}
        onAssigned={() => { fetchChores(); }}
        chore={assigningChore}
        kids={kids}
      />

      <Modal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Remove Quest"
        actions={[
          {
            label: 'Cancel',
            onClick: () => setDeleteTarget(null),
            className: 'game-btn game-btn-blue',
          },
          {
            label: deleting ? 'Removing...' : 'Remove',
            onClick: handleDelete,
            className: 'game-btn game-btn-red',
            disabled: deleting,
          },
        ]}
      >
        <p className="text-muted">
          Are you sure you want to remove{' '}
          <span className="text-cream font-medium">
            "{themedTitle(deleteTarget?.title || '', colorTheme)}"
          </span>
          ? This action cannot be undone.
        </p>
      </Modal>
    </div>
  );
}
