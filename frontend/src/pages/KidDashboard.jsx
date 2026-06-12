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
  Trophy,
} from 'lucide-react';
import { api } from '../api/client';
import { useAuth } from '../hooks/useAuth';
import { useBoardTheme } from '../hooks/useBoardTheme';
import { useSettings } from '../hooks/useSettings';
import { useTheme } from '../hooks/useTheme';
import { mondayWeekStart } from '../utils/calendarWeek';
import { todayISOInTimeZone } from '../utils/daytime';
import { summarizeTodayBadges } from '../utils/progressDashboard';
import {
  buildKidHomeThemeStyles,
  buildPrizeSpinStatus,
} from '../utils/kidHomeStatus';
import { themedTitle } from '../utils/questThemeText';
import {
  currentDaypartForDateInTimeZone,
  dailyDisplaySectionsForAssignments,
  groupDailyAssignments,
  kidCompletionLabelForAssignment,
} from '../utils/choreDayparts';
import SpinWheel from '../components/SpinWheel';
import RankBadge from '../components/RankBadge';
import Modal from '../components/Modal';
import { getTheme } from '../components/QuestBoardTheme';

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

function displayNameFor(user) {
  return user?.display_name || user?.username || 'Kid';
}

function initialForName(name) {
  return (name || 'K').trim().charAt(0).toUpperCase() || 'K';
}

function isoDateInTimeZone(value, timeZone) {
  if (!value) return '';
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date(value));
    const get = (type) => parts.find((part) => part.type === type)?.value;
    const year = get('year');
    const month = get('month');
    const day = get('day');
    return year && month && day ? `${year}-${month}-${day}` : '';
  } catch {
    return '';
  }
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

const SUMMARY_TONE_CLASSES = {
  emerald: 'border-emerald/25 bg-emerald/10 text-emerald',
  gold: 'border-gold/25 bg-gold/10 text-gold',
  accent: 'border-accent/25 bg-accent/10 text-accent',
  neutral: 'border-border bg-surface-raised/60 text-cream',
};

function HeaderStat({ icon: Icon, label, value, detail, toneClass, badge }) {
  return (
    <div className={`rounded-md border px-3 py-2 ${toneClass}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-cream">{label}</p>
        {badge}
      </div>
      <div className="flex items-center gap-2">
        <Icon size={15} className="flex-shrink-0" fill="currentColor" />
        <span className="text-lg font-bold tabular-nums leading-none">{value}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted leading-tight">{detail}</p>
    </div>
  );
}

function SummaryTile({ label, value, detail, tone = 'neutral', valueClassName = '' }) {
  return (
    <div className={`min-w-0 rounded-md border p-3 ${SUMMARY_TONE_CLASSES[tone]}`}>
      <p className="text-muted text-[11px] sm:text-xs mb-1">{label}</p>
      <p className={`font-bold leading-tight break-words ${valueClassName || 'text-xl tabular-nums'}`}>
        {value}
      </p>
      {detail && (
        <p className="mt-1 text-[11px] text-muted leading-tight">{detail}</p>
      )}
    </div>
  );
}

function PrizeSpinTile({ status, onOpen }) {
  const toneClass = status.state === 'ready'
    ? 'border-emerald/30 bg-emerald/10 text-emerald'
    : status.state === 'used' || status.state === 'complete'
    ? 'border-gold/25 bg-gold/10 text-gold'
    : 'border-border bg-surface-raised/60 text-muted';
  const Icon = status.state === 'locked' || status.state === 'idle' || status.state === 'off'
    ? LockKeyhole
    : Gift;

  return (
    <div className={`min-w-0 rounded-md border p-3 ${toneClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-muted text-[11px] sm:text-xs mb-1">{status.title}</p>
          <p className="text-cream text-xs font-semibold leading-snug">{status.detail}</p>
        </div>
        <Icon size={16} className="mt-0.5 flex-shrink-0" />
      </div>
      <button
        type="button"
        onClick={onOpen}
        disabled={!status.canOpen}
        className={`mt-2 w-full rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          status.canOpen
            ? 'border-emerald/30 bg-emerald text-navy hover:bg-emerald-light'
            : 'border-border bg-surface text-muted cursor-not-allowed'
        }`}
      >
        {status.buttonLabel}
      </button>
    </div>
  );
}

function DailyChoreCard({
  item,
  index,
  surfaceStyle,
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
      className="game-panel p-3.5 transition-all"
      style={surfaceStyle}
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      custom={index}
    >
      <div className="flex items-start gap-3">
        <div
          className="mt-0.5 w-1 h-12 rounded-full flex-shrink-0"
          style={{ backgroundColor: categoryColor }}
        />

        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
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

            <button
              type="button"
              onClick={() => isActionable && onMarkDone(item)}
              disabled={!isActionable || isCompleting}
              className={`game-btn w-full sm:w-auto sm:min-w-[8.75rem] flex items-center justify-center gap-1.5 shrink-0 !py-2 !px-3 !text-xs ${
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
        </div>
      </div>
    </motion.div>
  );
}

// ---------- component ----------

export default function KidDashboard() {
  const { user } = useAuth();
  const { boardTheme } = useBoardTheme();
  const { daily_rollover_timezone, spin_wheel_enabled } = useSettings();
  const { colorTheme } = useTheme();

  // data state
  const [assignments, setAssignments] = useState([]);
  const [spinAvailability, setSpinAvailability] = useState(null);
  const [myStats, setMyStats] = useState(null);
  const [todayAchievements, setTodayAchievements] = useState([]);

  // ui state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [completingChoreId, setCompletingChoreId] = useState(null);
  const [photoProofFiles, setPhotoProofFiles] = useState({});
  const [spinModalOpen, setSpinModalOpen] = useState(false);
  const [currentDaypart, setCurrentDaypart] = useState(() => (
    currentDaypartForDateInTimeZone(new Date(), daily_rollover_timezone)
  ));
  const familyDateRef = useRef(todayISO(daily_rollover_timezone));
  const proofInputRefs = useRef({});
  const spinReadySeenRef = useRef(null);

  // ---- data fetching ----

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const monday = getMondayOfThisWeek(daily_rollover_timezone);
      const today = todayISO(daily_rollover_timezone);

      const [
        calendarRes,
        spinRes,
        statsRes,
        achievementsRes,
      ] = await Promise.all([
        api(`/api/calendar?week_start=${monday}`),
        spin_wheel_enabled ? api('/api/spin/availability') : Promise.resolve(null),
        api('/api/stats/me'),
        api('/api/stats/achievements/all').catch(() => []),
      ]);

      setMyStats(statsRes);
      setTodayAchievements((Array.isArray(achievementsRes) ? achievementsRes : [])
        .filter((achievement) => (
          achievement.unlocked &&
          isoDateInTimeZone(achievement.unlocked_at, daily_rollover_timezone) === today
        )));

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
    familyDateRef.current = todayISO(daily_rollover_timezone);

    const refreshDaypartAndDate = () => {
      setCurrentDaypart(currentDaypartForDateInTimeZone(new Date(), daily_rollover_timezone));

      const familyDate = todayISO(daily_rollover_timezone);
      if (familyDateRef.current !== familyDate) {
        familyDateRef.current = familyDate;
        fetchData();
      }
    };

    refreshDaypartAndDate();
    const intervalId = window.setInterval(refreshDaypartAndDate, 60 * 1000);
    return () => window.clearInterval(intervalId);
  }, [daily_rollover_timezone, fetchData]);

  const dailyGroups = useMemo(() => (
    groupDailyAssignments(assignments, { currentDaypart })
  ), [assignments, currentDaypart]);
  const displaySections = useMemo(() => (
    dailyDisplaySectionsForAssignments(assignments, { currentDaypart })
  ), [assignments, currentDaypart]);
  const todayBadgeSummary = useMemo(() => (
    summarizeTodayBadges(todayAchievements)
  ), [todayAchievements]);
  const requiredComplete = dailyGroups.requiredTotal > 0 && dailyGroups.requiredLeft === 0;
  const activeTheme = getTheme(boardTheme);
  const themeStyles = useMemo(() => (
    buildKidHomeThemeStyles(activeTheme)
  ), [activeTheme]);
  const spinStatus = useMemo(() => (
    buildPrizeSpinStatus({
      spinEnabled: spin_wheel_enabled,
      requiredTotal: dailyGroups.requiredTotal,
      requiredLeft: dailyGroups.requiredLeft,
      requiredComplete,
      availability: spinAvailability,
    })
  ), [
    spin_wheel_enabled,
    dailyGroups.requiredTotal,
    dailyGroups.requiredLeft,
    requiredComplete,
    spinAvailability,
  ]);
  const kidName = displayNameFor(user);
  const kidInitial = initialForName(kidName);
  const homeSurfaceStyle = themeStyles.surfaceStyle;
  const kidInitialStyle = themeStyles.initialStyle;
  const pointsBalance = myStats?.points_balance ?? user?.points_balance ?? 0;
  const currentStreak = myStats?.current_streak ?? user?.current_streak ?? 0;
  const dailyProgressPercent = dailyGroups.requiredTotal > 0
    ? Math.round((dailyGroups.requiredDone / dailyGroups.requiredTotal) * 100)
    : 0;
  const nextUpTitle = dailyGroups.nextUp
    ? themedTitle(
        choreFromAssignment(dailyGroups.nextUp).title || dailyGroups.nextUp.title,
        colorTheme,
      )
    : dailyGroups.requiredTotal === 0
    ? 'No chores today'
    : 'All done';

  useEffect(() => {
    if (loading) return;

    const ready = spinStatus.state === 'ready';
    if (spinReadySeenRef.current === null) {
      spinReadySeenRef.current = ready;
      return;
    }

    if (ready && !spinReadySeenRef.current) {
      setSpinModalOpen(true);
    }
    spinReadySeenRef.current = ready;
  }, [loading, spinStatus.state]);

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
      <div className="game-panel p-4 sm:p-5 space-y-3" style={homeSurfaceStyle}>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <div
              className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md border border-accent/25 bg-accent/10 text-lg font-bold text-accent"
              style={kidInitialStyle}
              aria-hidden="true"
            >
              {kidInitial}
            </div>
            <div className="min-w-0">
              <div className="flex min-w-0 items-center gap-2">
                <h1 className="truncate text-xl font-bold text-cream">
                  {kidName}
                </h1>
                {myStats?.rank && <RankBadge rank={myStats.rank} size="sm" />}
              </div>
              <p className="text-muted text-xs">Keep the streak moving</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:w-[18rem]">
            <HeaderStat
              icon={Star}
              label="Points"
              value={pointsBalance.toLocaleString()}
              detail="ready to spend"
              toneClass="border-gold/25 bg-gold/10 text-gold"
            />
            <HeaderStat
              icon={Flame}
              label="Streak"
              value={currentStreak}
              detail="day streak"
              toneClass="border-orange-400/25 bg-orange-400/10 text-orange-400"
              badge={myStats?.streak_freeze_available ? (
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-accent/25 bg-accent/10 px-1.5 py-0.5 text-[10px] font-semibold text-accent"
                  title="A streak save can protect your streak if you miss a day."
                  aria-label="Streak save available"
                >
                  <ShieldCheck size={10} />
                  Save
                </span>
              ) : null}
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryTile
            label="done today"
            value={dailyGroups.requiredDone}
            tone="emerald"
          />
          <SummaryTile
            label="left to do"
            value={dailyGroups.requiredLeft}
            tone="gold"
          />
          <SummaryTile
            label="next up"
            value={nextUpTitle}
            tone="accent"
            valueClassName="text-sm text-cream font-semibold"
          />
          <PrizeSpinTile
            status={spinStatus}
            onOpen={() => {
              if (spinStatus.canOpen) setSpinModalOpen(true);
            }}
          />
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
            <span className="text-muted">Daily progress</span>
            <span className="text-cream font-semibold">
              {dailyGroups.requiredTotal === 0
                ? 'No required chores'
                : `${dailyGroups.requiredDone}/${dailyGroups.requiredTotal}`}
            </span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-navy border border-border/60">
            <div
              className={`h-full rounded-full transition-all ${
                requiredComplete ? 'bg-emerald' : 'bg-accent'
              }`}
              style={{ width: `${dailyProgressPercent}%` }}
            />
          </div>
        </div>

        {todayBadgeSummary.count > 0 && (
          <div className="border-t border-border/70 pt-2 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <Trophy size={15} className="text-gold flex-shrink-0" />
                <h2 className="truncate text-cream text-sm font-semibold">Today's Badges</h2>
              </div>
              <span className="flex-shrink-0 text-xs font-semibold text-gold">
                {todayBadgeSummary.label}
              </span>
            </div>
            <div
              className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
              role="list"
              aria-label="Badges earned today"
            >
              {todayBadgeSummary.items.map((achievement) => (
                <div
                  key={achievement.id}
                  className="flex min-w-[8.5rem] max-w-[10rem] flex-none items-center gap-2 rounded-md border border-gold/25 bg-gold/10 px-2.5 py-2"
                  role="listitem"
                  tabIndex={0}
                  title={achievement.tooltip}
                  aria-label={achievement.tooltip}
                >
                  <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-md border border-gold/25 bg-gold/10 text-gold">
                    <Trophy size={13} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-cream text-xs font-semibold">
                      {achievement.title}
                    </p>
                    <p className="text-gold text-[11px] font-semibold leading-tight">
                      +{achievement.points} XP
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="game-panel p-3 flex items-center gap-2 border-crimson/30 text-crimson text-sm">
          <AlertTriangle size={16} />
          <span>{error}</span>
        </div>
      )}

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
                      surfaceStyle={homeSurfaceStyle}
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
          style={homeSurfaceStyle}
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

      <Modal
        isOpen={spinModalOpen}
        onClose={() => setSpinModalOpen(false)}
        title="Today's Prize Spin"
      >
        <SpinWheel
          availability={spinAvailability}
          onSpinComplete={() => {
            fetchData();
          }}
        />
      </Modal>
    </div>
  );
}
