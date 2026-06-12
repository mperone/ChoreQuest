import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion } from 'framer-motion';
import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  Flame,
  Gift,
  ImagePlus,
  Loader2,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useSettings } from '../hooks/useSettings';
import { useTheme } from '../hooks/useTheme';
import { mondayWeekStart } from '../utils/calendarWeek';
import { todayISOInTimeZone } from '../utils/daytime';
import { themedTitle } from '../utils/questThemeText';
import {
  currentDaypartForDateInTimeZone,
  dailyDisplaySectionsForAssignments,
  groupDailyAssignments,
  kidCompletionLabelForAssignment,
} from '../utils/choreDayparts';
import SpinWheel from '../components/SpinWheel';
import RankBadge from '../components/RankBadge';
import {
  QuestBoardOverlay,
  QuestBoardPageGlow,
  QuestBoardParticles,
  QuestBoardDecorations,
  BOARD_THEMES,
  getTheme,
} from '../components/QuestBoardTheme';

// ---------- helpers ----------

function getMondayOfThisWeek(timeZone) {
  return mondayWeekStart(todayISOInTimeZone(timeZone));
}

function todayISO(timeZone) {
  return todayISOInTimeZone(timeZone);
}

function difficultyLabel(difficulty) {
  switch (difficulty) {
    case 'easy':
      return { text: 'Easy', color: 'text-emerald bg-emerald/10 border-emerald/20' };
    case 'medium':
      return { text: 'Medium', color: 'text-gold bg-gold/10 border-gold/20' };
    case 'hard':
      return { text: 'Hard', color: 'text-orange-400 bg-orange-400/10 border-orange-400/20' };
    case 'expert':
      return { text: 'Expert', color: 'text-crimson bg-crimson/10 border-crimson/20' };
    default:
      return { text: 'Easy', color: 'text-emerald bg-emerald/10 border-emerald/20' };
  }
}

function choreFromAssignment(item) {
  return item?.chore || item || {};
}

function assignmentStatus(item) {
  return item?.assignment_status || item?.status || 'pending';
}

function isOptionalAssignment(item) {
  const chore = choreFromAssignment(item);
  return Boolean(item?.is_optional ?? chore.is_optional);
}

function requiresPhotoForAssignment(item) {
  const chore = choreFromAssignment(item);
  return Boolean(item?.requires_photo ?? chore.requires_photo);
}

function proofKeyFor(item) {
  return item.assignment_id || item.id || item.chore_id;
}

function ProofThumbnail({ file }) {
  const [previewUrl, setPreviewUrl] = useState('');

  useEffect(() => {
    if (!file || typeof URL === 'undefined' || !URL.createObjectURL) {
      setPreviewUrl('');
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (previewUrl) {
    return (
      <img
        src={previewUrl}
        alt=""
        className="h-9 w-9 rounded-md object-cover border border-border"
      />
    );
  }

  return <CheckCircle2 size={18} className="text-emerald" />;
}

// ---------- card animation variants ----------

const cardVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: (i) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.16 },
  }),
};

const ACTIONABLE_STATUSES = new Set(['pending', 'assigned', 'needs_work']);

function DailyChoreCard({
  item,
  index,
  activeTheme,
  colorTheme,
  proofFile,
  isCompleting,
  onMarkDone,
  onPhotoSelected,
  onPickPhoto,
  setProofInputRef,
}) {
  const chore = choreFromAssignment(item);
  const status = assignmentStatus(item);
  const actionLabel = kidCompletionLabelForAssignment(item);
  const isActionable = ACTIONABLE_STATUSES.has(status);
  const requiresPhoto = requiresPhotoForAssignment(item);
  const optional = isOptionalAssignment(item);
  const diff = difficultyLabel(chore.difficulty);
  const categoryColor = chore.category?.colour || chore.category?.color || '#14b8a6';
  const points = chore.points ?? item.points ?? 0;
  const proofKey = proofKeyFor(item);
  const themedChoreTitle = themedTitle(chore.title || item.title || 'Chore', colorTheme);

  const pickPhoto = () => {
    onPickPhoto(item);
  };

  return (
    <motion.div
      className="game-panel p-4 transition-all"
      style={activeTheme.cardAccent ? {
        borderColor: `${activeTheme.cardAccent}25`,
        boxShadow: `0 0 12px ${activeTheme.cardAccent}10, inset 0 1px 0 ${activeTheme.cardAccent}08`,
      } : undefined}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={index}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 w-1 h-14 rounded-full flex-shrink-0"
          style={{ backgroundColor: categoryColor }}
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="text-cream text-sm font-semibold leading-snug">
                {themedChoreTitle}
              </h3>
              <div className="mt-2 flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-gold text-xs font-semibold">
                  <Star size={12} fill="currentColor" />
                  {points} XP
                </span>

                {optional && (
                  <span className="inline-flex items-center gap-1 text-gold text-xs font-semibold">
                    <Sparkles size={11} />
                    Bonus
                  </span>
                )}

                <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border ${diff.color}`}>
                  {diff.text}
                </span>

                {chore.category?.name && (
                  <span className="text-muted text-xs">
                    {chore.category.name}
                  </span>
                )}

                {requiresPhoto && (
                  <span className="inline-flex items-center gap-1 text-muted text-xs">
                    <Camera size={10} />
                    Photo
                  </span>
                )}
              </div>
            </div>
          </div>

          {isActionable && requiresPhoto && (
            <div className="rounded-md border border-border bg-surface-raised/50 p-2.5">
              <input
                ref={(node) => setProofInputRef(proofKey, node)}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => onPhotoSelected(item, e.target.files?.[0] || null)}
              />

              {proofFile ? (
                <div className="flex items-center gap-2">
                  <ProofThumbnail file={proofFile} />
                  <div className="min-w-0 flex-1">
                    <p className="text-emerald text-xs font-semibold">Photo ready</p>
                    <p className="text-muted text-[11px] truncate" title={proofFile.name}>
                      {proofFile.name}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={pickPhoto}
                    className="game-btn game-btn-blue !py-1.5 !px-3 !text-[11px]"
                  >
                    Change
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Camera size={16} className="text-gold flex-shrink-0" />
                  <span className="text-muted text-xs font-medium flex-1">Photo needed</span>
                  <button
                    type="button"
                    onClick={pickPhoto}
                    className="game-btn game-btn-blue inline-flex items-center gap-1.5 !py-1.5 !px-3 !text-[11px]"
                  >
                    <ImagePlus size={12} />
                    Add Photo
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => isActionable && onMarkDone(item)}
            disabled={!isActionable || isCompleting}
            className={`game-btn w-full flex items-center justify-center gap-1.5 ${
              isActionable ? 'game-btn-blue' : 'bg-surface-raised text-muted border border-border'
            } ${isCompleting ? 'opacity-60 cursor-wait' : ''}`}
          >
            {isCompleting ? (
              <>
                <Loader2 size={13} className="animate-spin" />
                Marking...
              </>
            ) : status === 'completed' ? (
              <>
                <CheckCircle2 size={13} />
                {actionLabel}
              </>
            ) : (
              actionLabel
            )}
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ---------- component ----------

export default function KidDashboard() {
  const { user } = useAuth();
  const { daily_rollover_timezone, spin_wheel_enabled } = useSettings();
  const { colorTheme } = useTheme();

  // data state
  const [assignments, setAssignments] = useState([]);
  const [spinAvailability, setSpinAvailability] = useState(null);
  const [myStats, setMyStats] = useState(null);

  // ui state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [completingChoreId, setCompletingChoreId] = useState(null);
  const [photoProofFiles, setPhotoProofFiles] = useState({});
  const [currentDaypart, setCurrentDaypart] = useState(() => (
    currentDaypartForDateInTimeZone(new Date(), daily_rollover_timezone)
  ));
  const proofInputRefs = useRef({});

  // Board theme — stored in localStorage
  const [boardTheme, setBoardTheme] = useState(() =>
    localStorage.getItem('chorequest-board-theme') || 'default'
  );
  const changeBoardTheme = (id) => {
    setBoardTheme(id);
    localStorage.setItem('chorequest-board-theme', id);
    setShowThemePicker(false);
  };

  // ---- data fetching ----

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const monday = getMondayOfThisWeek(daily_rollover_timezone);
      const today = todayISO(daily_rollover_timezone);

      const promises = [
        api(`/api/calendar?week_start=${monday}`),
      ];
      if (spin_wheel_enabled) {
        promises.push(api('/api/spin/availability'));
      }
      promises.push(api('/api/stats/me'));

      const results = await Promise.all(promises);
      const calendarRes = results[0];
      const spinRes = spin_wheel_enabled ? results[1] : null;
      const statsRes = results[spin_wheel_enabled ? 2 : 1];

      setMyStats(statsRes);

      // Filter calendar assignments to today and this user only
      const allToday = (calendarRes.days && calendarRes.days[today]) || [];
      const todayAssignments = allToday.filter((a) => a.user_id === user?.id);
      setAssignments(todayAssignments);

      setSpinAvailability(spinRes);
    } catch (err) {
      setError(err.message || 'Failed to load today');
    } finally {
      setLoading(false);
    }
  }, [user?.id, spin_wheel_enabled, daily_rollover_timezone]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ---- WebSocket listener ----

  useEffect(() => {
    const handler = () => {
      fetchData();
    };
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchData]);

  useEffect(() => {
    const refreshDaypart = () => {
      setCurrentDaypart(currentDaypartForDateInTimeZone(new Date(), daily_rollover_timezone));
    };

    refreshDaypart();
    const intervalId = window.setInterval(refreshDaypart, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [daily_rollover_timezone]);

  const dailyGroups = useMemo(() => (
    groupDailyAssignments(assignments, { currentDaypart })
  ), [assignments, currentDaypart]);
  const displaySections = useMemo(() => (
    dailyDisplaySectionsForAssignments(assignments, { currentDaypart })
  ), [assignments, currentDaypart]);
  const requiredComplete = dailyGroups.requiredTotal > 0 && dailyGroups.requiredLeft === 0;
  const activeTheme = getTheme(boardTheme);
  const pointsBalance = myStats?.points_balance ?? user?.points_balance ?? 0;
  const currentStreak = myStats?.current_streak ?? user?.current_streak ?? 0;

  const setProofInputRef = useCallback((key, node) => {
    if (node) {
      proofInputRefs.current[key] = node;
    } else {
      delete proofInputRefs.current[key];
    }
  }, []);

  const handleHomePhotoSelected = useCallback((item, file) => {
    const key = proofKeyFor(item);
    setPhotoProofFiles((prev) => {
      if (!file) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: file };
    });
  }, []);

  const handlePickHomePhoto = useCallback((item) => {
    const proofKey = proofKeyFor(item);
    proofInputRefs.current[proofKey]?.click();
  }, []);

  const handleHomeMarkDone = useCallback(async (item) => {
    const chore = choreFromAssignment(item);
    const choreId = chore.id ?? item.chore_id ?? item.id;
    const proofKey = proofKeyFor(item);
    const proofFile = photoProofFiles[proofKey];

    if (requiresPhotoForAssignment(item) && !proofFile) {
      handlePickHomePhoto(item);
      return;
    }

    setCompletingChoreId(choreId);
    try {
      if (proofFile) {
        const formData = new FormData();
        formData.append('file', proofFile);
        await api(`/api/chores/${choreId}/complete`, { method: 'POST', body: formData });
      } else {
        await api(`/api/chores/${choreId}/complete`, { method: 'POST' });
      }

      setPhotoProofFiles((prev) => {
        const next = { ...prev };
        delete next[proofKey];
        return next;
      });
      if (proofInputRefs.current[proofKey]) {
        proofInputRefs.current[proofKey].value = '';
      }
      await fetchData();
    } catch (err) {
      setError(err.message || 'Could not mark that chore done');
    } finally {
      setCompletingChoreId(null);
    }
  }, [fetchData, handlePickHomePhoto, photoProofFiles]);

  // ---- render ----

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  return (
    <div className={`max-w-2xl mx-auto space-y-5 quest-board-${boardTheme}`}>
      {/* Page-level ambient glow */}
      <QuestBoardPageGlow themeId={boardTheme} />

      {/* Header with status cards */}
      <div className="game-panel p-5 relative overflow-hidden">
        <QuestBoardOverlay themeId={boardTheme} />
        <QuestBoardParticles themeId={boardTheme} />
        <div className="relative z-10 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-muted text-xs font-medium">Today</p>
              <h1 className="text-cream text-2xl font-semibold leading-tight">My Day</h1>
            </div>
            <button
              type="button"
              onClick={() => setShowThemePicker((v) => !v)}
              aria-label="Change today look"
              className="flex items-center justify-center w-9 h-9 rounded-md border border-border hover:border-accent hover:bg-accent/10 text-cream transition-all text-base"
              title="Change look"
            >
              {BOARD_THEMES.find((t) => t.id === boardTheme)?.icon || '*'}
            </button>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <QuestBoardDecorations themeId={boardTheme} />
            {myStats?.rank && <RankBadge rank={myStats.rank} size="sm" />}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border border-gold/25 bg-gold/10 p-3">
              <p className="text-cream text-xs font-semibold mb-2">Points</p>
              <div className="flex items-center gap-2">
                <Star size={17} className="text-gold fill-gold" />
                <span className="text-gold text-xl font-bold tabular-nums">
                  {pointsBalance.toLocaleString()}
                </span>
              </div>
              <p className="text-muted text-xs mt-1">ready to spend</p>
            </div>

            <div className="rounded-md border border-orange-400/25 bg-orange-400/10 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className="text-cream text-xs font-semibold">Streak</p>
                {myStats?.streak_freeze_available && (
                  <span className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent">
                    <ShieldCheck size={10} />
                    Save ready
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <Flame size={18} className="text-orange-400 fill-orange-400/20" />
                <span className="text-orange-400 text-xl font-bold tabular-nums">
                  {currentStreak}
                </span>
              </div>
              <p className="text-muted text-xs mt-1">day streak</p>
            </div>
          </div>
        </div>
      </div>

      {/* Theme Picker */}
      {showThemePicker && (
        <div className="game-panel p-4">
          <h3 className="text-cream text-xs font-medium mb-3">Choose Today Look</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {BOARD_THEMES.map((theme) => (
              <button
                key={theme.id}
                type="button"
                onClick={() => changeBoardTheme(theme.id)}
                className={`flex items-center gap-2 p-3 rounded-md border transition-all text-left ${
                  boardTheme === theme.id
                    ? 'border-accent bg-accent/10'
                    : 'border-border/50 bg-surface-raised/30 hover:border-border-light'
                }`}
              >
                <span className="text-xl">{theme.icon}</span>
                <span className="text-cream text-xs font-medium">{theme.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="game-panel p-3 flex items-center gap-2 border-crimson/30 text-crimson text-sm">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Today overview */}
      <div className="game-panel p-4">
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <p className="text-muted text-xs font-medium">Today</p>
            <h2 className="text-cream text-lg font-semibold">Chores</h2>
          </div>
          {requiredComplete && (
            <span className="inline-flex items-center gap-1 rounded-md border border-emerald/30 bg-emerald/10 px-2 py-1 text-emerald text-xs font-semibold">
              <CheckCircle2 size={12} />
              Ready
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="rounded-md bg-surface-raised/60 border border-border p-3">
            <p className="text-emerald text-2xl font-bold tabular-nums">
              {dailyGroups.requiredDone}
            </p>
            <p className="text-muted text-xs">done</p>
          </div>
          <div className="rounded-md bg-surface-raised/60 border border-border p-3">
            <p className="text-gold text-2xl font-bold tabular-nums">
              {dailyGroups.requiredLeft}
            </p>
            <p className="text-muted text-xs">left</p>
          </div>
        </div>

        <div className="rounded-md border border-border bg-navy/50 p-3">
          <p className="text-muted text-xs font-medium mb-1">Next up</p>
          <p className="text-cream text-sm font-semibold">
            {dailyGroups.nextUp
              ? themedTitle(choreFromAssignment(dailyGroups.nextUp).title || dailyGroups.nextUp.title, colorTheme)
              : dailyGroups.requiredTotal === 0
              ? 'No required chores today'
              : 'All required chores are done'}
          </p>
        </div>
      </div>

      {/* Daily chore sections */}
      {displaySections.length > 0 ? (
        <div className="space-y-5">
          {displaySections.map((section) => (
            <section key={section.id} className="space-y-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-cream text-sm font-semibold">{section.title}</h2>
                <span className="text-muted text-xs">
                  {section.items.length}
                </span>
              </div>
              <div className="space-y-3">
                {section.items.map((assignment, idx) => {
                  const chore = choreFromAssignment(assignment);
                  const choreId = chore.id ?? assignment.chore_id ?? assignment.id;
                  const proofKey = proofKeyFor(assignment);

                  return (
                    <DailyChoreCard
                      key={`${section.id}-${proofKey}`}
                      item={assignment}
                      index={idx}
                      activeTheme={activeTheme}
                      colorTheme={colorTheme}
                      proofFile={photoProofFiles[proofKey]}
                      isCompleting={completingChoreId === choreId}
                      onMarkDone={handleHomeMarkDone}
                      onPhotoSelected={handleHomePhotoSelected}
                      onPickPhoto={handlePickHomePhoto}
                      setProofInputRef={setProofInputRef}
                    />
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <motion.div
          className="game-panel p-10 flex flex-col items-center gap-3 text-center"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Sparkles size={34} className="text-muted" />
          <p className="text-muted text-sm">
            {assignments.length === 0
              ? 'No chores are due today.'
              : dailyGroups.requiredTotal === 0
              ? 'No required chores today. Bonus chores are optional.'
              : 'All required chores are done.'}
          </p>
        </motion.div>
      )}

      {/* Done Today reward panel */}
      <div className="game-panel p-4">
        <div className="flex items-center gap-2 mb-3">
          <Gift size={17} className="text-gold" />
          <h2 className="text-cream text-sm font-semibold">Done Today</h2>
        </div>

        {dailyGroups.requiredTotal === 0 ? (
          <div className="rounded-md border border-border bg-surface-raised/40 p-3 text-sm text-muted">
            No required chores are due today.
          </div>
        ) : !requiredComplete ? (
          <div className="rounded-md border border-border bg-surface-raised/40 p-3 flex items-center gap-3">
            <LockKeyhole size={18} className="text-muted flex-shrink-0" />
            <p className="text-muted text-sm">
              {spin_wheel_enabled
                ? `Finish ${dailyGroups.requiredLeft} more to spin.`
                : `Finish ${dailyGroups.requiredLeft} more today.`}
            </p>
          </div>
        ) : spin_wheel_enabled ? (
          <SpinWheel
            availability={spinAvailability}
            onSpinComplete={() => {
              fetchData();
            }}
          />
        ) : (
          <div className="rounded-md border border-emerald/30 bg-emerald/10 p-3 text-sm text-emerald">
            All required chores are done today.
          </div>
        )}
      </div>
    </div>
  );
}
