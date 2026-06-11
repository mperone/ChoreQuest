import { useState, useEffect } from 'react';
import { api } from '../api/client';
import { useTheme } from '../hooks/useTheme';
import { themedTitle } from '../utils/questThemeText';
import { bulkToggleState } from '../utils/bulkToggleState';
import {
  DAY_NAMES,
  LAST_DAY_OF_MONTH,
  buildSchedulePreview,
  formatSchedulePreviewDate,
  formatScheduleSummary,
  monthDayFromISODate,
  normalizeMonthDay,
  normalizeScheduleDays,
  normalizeScheduleWeekdays,
  scheduleShowsPreview,
  todayISO,
} from '../utils/scheduleDays';
import Modal from './Modal';
import AvatarDisplay from './AvatarDisplay';
import {
  Star,
  RefreshCw,
  Camera,
  Users,
  ChevronDown,
  ChevronUp,
  RotateCw,
  Loader2,
  CalendarDays,
  Sparkles,
} from 'lucide-react';

const SCHEDULE_TYPE_OPTIONS = [
  { value: 'once', label: 'One time' },
  { value: 'daily', label: 'Every day' },
  { value: 'weekly', label: 'Every week' },
  { value: 'fortnightly', label: 'Every other week' },
  { value: 'monthly', label: 'Monthly' },
];
const ROTATION_CADENCE_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'fortnightly', label: 'Fortnightly' },
  { value: 'monthly', label: 'Monthly' },
];

const selectClass =
  'bg-navy-light border border-border text-cream p-2 rounded text-sm ' +
  'focus:border-accent focus:outline-none transition-colors';

const MONTH_DAY_OPTIONS = [
  ...Array.from({ length: 31 }, (_, idx) => ({
    value: idx + 1,
    label: `${idx + 1}`,
  })),
  { value: LAST_DAY_OF_MONTH, label: 'Last day' },
];

export default function QuestAssignModal({
  isOpen,
  onClose,
  onAssigned,
  chore,
  kids,
}) {
  const { colorTheme } = useTheme();

  // Per-kid: { [kidId]: { selected, requires_photo, is_optional } }
  const [kidConfigs, setKidConfigs] = useState({});
  const [expandedKid, setExpandedKid] = useState(null);

  // Shared schedule (applies to all selected kids)
  const [scheduleType, setScheduleType] = useState('once');
  const [scheduleStartDate, setScheduleStartDate] = useState(todayISO());
  const [scheduleWeekdays, setScheduleWeekdays] = useState([]);
  const [scheduleMonthDay, setScheduleMonthDay] = useState(monthDayFromISODate(todayISO()));

  // Rotation (2+ kids only)
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationCadence, setRotationCadence] = useState('daily');
  const [rotationFirstKid, setRotationFirstKid] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [hadExistingAssignments, setHadExistingAssignments] = useState(false);

  // Initialize
  useEffect(() => {
    if (!isOpen || !chore || !kids.length) return;

    // Fetch existing rules
    api(`/api/chores/${chore.id}/rules`)
      .then((rules) => {
        const rulesList = Array.isArray(rules) ? rules : [];
        const hasActive = rulesList.some((r) => r.is_active);
        setHadExistingAssignments(hasActive);

        // Build kid configs
        const configs = {};
        for (const kid of kids) {
          const existingRule = rulesList.find(
            (r) => r.user_id === kid.id && r.is_active
          );
          configs[kid.id] = {
            selected: !!existingRule,
            requires_photo: existingRule?.requires_photo || false,
            is_optional: existingRule?.is_optional || false,
          };
        }
        setKidConfigs(configs);

        const today = todayISO();

        // Derive shared schedule from first active rule
        const firstActive = rulesList.find((r) => r.is_active);
        if (firstActive) {
          const startDate = firstActive.start_date || today;
          const explicitType = firstActive.schedule_type;
          if (explicitType) {
            setScheduleType(explicitType);
            setScheduleStartDate(startDate);
            setScheduleWeekdays(
              normalizeScheduleWeekdays(explicitType, startDate, firstActive.weekdays) || []
            );
            setScheduleMonthDay(normalizeMonthDay(firstActive.month_day, startDate));
          } else if (firstActive.recurrence === 'custom' && firstActive.custom_days?.length) {
            setScheduleType('weekly');
            setScheduleStartDate(startDate);
            setScheduleWeekdays(normalizeScheduleDays(firstActive.custom_days));
            setScheduleMonthDay(monthDayFromISODate(startDate));
          } else {
            const legacyType = firstActive.recurrence || 'once';
            setScheduleType(legacyType);
            setScheduleStartDate(startDate);
            setScheduleWeekdays(
              normalizeScheduleWeekdays(
                legacyType,
                startDate,
                firstActive.weekdays || firstActive.custom_days
              ) || []
            );
            setScheduleMonthDay(normalizeMonthDay(firstActive.month_day, startDate));
          }
        } else {
          setScheduleType('once');
          setScheduleStartDate(today);
          setScheduleWeekdays([]);
          setScheduleMonthDay(monthDayFromISODate(today));
        }
      })
      .catch(() => {
        const configs = {};
        for (const kid of kids) {
          configs[kid.id] = {
            selected: false,
            requires_photo: false,
            is_optional: false,
          };
        }
        setKidConfigs(configs);
        setHadExistingAssignments(false);
        setScheduleType('once');
        setScheduleStartDate(todayISO());
        setScheduleWeekdays([]);
        setScheduleMonthDay(monthDayFromISODate(todayISO()));
      });

    // Fetch existing rotation
    api(`/api/chores/${chore.id}/rotation`)
      .then((rot) => {
        if (rot && rot.kid_ids && rot.kid_ids.length >= 2) {
          setRotationEnabled(true);
          setRotationCadence(rot.cadence || 'daily');
          const currentIdx = rot.current_index ?? 0;
          setRotationFirstKid(rot.kid_ids[currentIdx] ?? rot.kid_ids[0]);
        } else {
          setRotationEnabled(false);
          setRotationCadence('daily');
          setRotationFirstKid(null);
        }
      })
      .catch(() => {
        setRotationEnabled(false);
        setRotationCadence('daily');
        setRotationFirstKid(null);
      });

    setError('');
  }, [isOpen, chore, kids]);

  const selectedKids = Object.entries(kidConfigs).filter(([, c]) => c.selected);
  const selectedCount = selectedKids.length;
  const isUnassigningAll = hadExistingAssignments && selectedCount === 0;

  // Auto-default rotationFirstKid
  useEffect(() => {
    if (!rotationEnabled || selectedCount < 2) return;
    const selectedIds = selectedKids.map(([id]) => Number(id));
    if (rotationFirstKid == null || !selectedIds.includes(Number(rotationFirstKid))) {
      setRotationFirstKid(selectedIds[0]);
    }
  }, [rotationEnabled, selectedCount, kidConfigs]);

  const toggleKid = (kidId) => {
    setKidConfigs((prev) => ({
      ...prev,
      [kidId]: { ...prev[kidId], selected: !prev[kidId]?.selected },
    }));
  };

  const scheduleUsesWeekdays = scheduleType === 'weekly' || scheduleType === 'fortnightly';
  const scheduleUsesMonthDay = scheduleType === 'monthly';

  const handleScheduleTypeChange = (nextType) => {
    setScheduleType(nextType);
    setScheduleWeekdays((prev) => normalizeScheduleWeekdays(nextType, scheduleStartDate, prev) || []);
    if (nextType === 'monthly') {
      setScheduleMonthDay(
        scheduleType === 'monthly'
          ? (prev) => normalizeMonthDay(prev, scheduleStartDate)
          : monthDayFromISODate(scheduleStartDate)
      );
    }
  };

  const handleScheduleStartDateChange = (nextDate) => {
    setScheduleStartDate(nextDate);
  };

  const toggleScheduleDay = (dayIdx) => {
    setScheduleWeekdays((prev) =>
      prev.includes(dayIdx)
        ? (prev.length > 1 ? prev.filter((d) => d !== dayIdx) : prev)
        : normalizeScheduleDays([...prev, dayIdx])
    );
  };

  // Toggle photo proof for all selected kids
  const togglePhotoAll = () => {
    const newValue = bulkToggleState(Object.values(kidConfigs), 'requires_photo').nextValue;
    setKidConfigs((prev) => {
      const next = { ...prev };
      for (const [kidId, config] of Object.entries(next)) {
        if (config.selected) {
          next[kidId] = { ...config, requires_photo: newValue };
        }
      }
      return next;
    });
  };

  // Compute the canonical schedule plus legacy compatibility fields.
  const getEffectiveSchedule = () => {
    const startDate = scheduleStartDate || todayISO();
    const weekdays = normalizeScheduleWeekdays(scheduleType, startDate, scheduleWeekdays);
    const monthDay = scheduleType === 'monthly'
      ? normalizeMonthDay(scheduleMonthDay, startDate)
      : null;
    return {
      recurrence: scheduleType,
      custom_days: weekdays,
      schedule_type: scheduleType,
      start_date: startDate,
      weekdays,
      month_day: monthDay,
    };
  };

  const toggleOptionalAll = () => {
    const newValue = bulkToggleState(Object.values(kidConfigs), 'is_optional').nextValue;
    setKidConfigs((prev) => {
      const next = { ...prev };
      for (const [kidId, config] of Object.entries(next)) {
        if (config.selected) {
          next[kidId] = { ...config, is_optional: newValue };
        }
      }
      return next;
    });
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError('');

    const {
      recurrence,
      custom_days,
      schedule_type,
      start_date,
      weekdays,
      month_day,
    } = getEffectiveSchedule();

    let assignments = selectedKids.map(([kidId, config]) => ({
      user_id: Number(kidId),
      recurrence,
      custom_days,
      schedule_type,
      start_date,
      weekdays,
      month_day,
      requires_photo: config.requires_photo,
      is_optional: config.is_optional,
    }));

    const body = { assignments };

    if (rotationEnabled && selectedCount >= 2) {
      // Reorder so the chosen first kid is at index 0
      if (rotationFirstKid != null) {
        const firstIdx = assignments.findIndex((a) => a.user_id === Number(rotationFirstKid));
        if (firstIdx > 0) {
          const [first] = assignments.splice(firstIdx, 1);
          assignments.unshift(first);
        }
      }
      body.rotation = { enabled: true, cadence: rotationCadence };
    }

    try {
      await api(`/api/chores/${chore.id}/assign`, { method: 'POST', body });
      onAssigned();
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to assign quest.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!chore) return null;

  const photoBulkState = bulkToggleState(Object.values(kidConfigs), 'requires_photo');
  const optionalBulkState = bulkToggleState(Object.values(kidConfigs), 'is_optional');
  const effectiveSchedule = getEffectiveSchedule();
  const scheduleSummary = formatScheduleSummary(effectiveSchedule);
  const showSchedulePreview = scheduleShowsPreview(effectiveSchedule);
  const schedulePreview = showSchedulePreview
    ? buildSchedulePreview(effectiveSchedule, 6)
    : [];

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Quest Assignment Scroll"
      actions={[
        { label: 'Cancel', onClick: onClose, className: 'game-btn game-btn-blue' },
        {
          label: submitting
            ? 'Saving...'
            : isUnassigningAll
            ? 'Unassign All'
            : selectedCount === 0
            ? 'Save'
            : 'Assign Quest',
          onClick: handleSubmit,
          className: isUnassigningAll ? 'game-btn game-btn-red' : 'game-btn game-btn-gold',
          disabled: submitting,
        },
      ]}
    >
      <div className="space-y-4">
        {error && (
          <div className="p-2 rounded border border-crimson/40 bg-crimson/10 text-crimson text-sm">
            {error}
          </div>
        )}

        {/* Quest summary */}
        <div className="p-3 rounded-lg border border-border bg-surface-raised/30">
          <h3 className="text-cream font-bold text-base">{themedTitle(chore.title, colorTheme)}</h3>
          <div className="flex items-center gap-3 mt-1">
            <span className="flex items-center gap-1 text-gold text-sm font-bold">
              <Star size={12} className="fill-gold" />
              {chore.points} XP
            </span>
            <span className="text-muted text-xs capitalize">{chore.difficulty}</span>
            {chore.category && (
              <span className="text-muted text-xs">{chore.category.name || chore.category}</span>
            )}
          </div>
        </div>

        {/* Kid selector */}
        <div>
          <label className="flex items-center gap-2 text-cream text-sm font-medium mb-2">
            <Users size={14} />
            Select Heroes
          </label>
          <div className="space-y-2">
            {kids.map((kid) => {
              const config = kidConfigs[kid.id];
              if (!config) return null;
              const isSelected = config.selected;
              const isExpanded = expandedKid === kid.id && isSelected;

              return (
                <div
                  key={kid.id}
                  className={`rounded-lg border transition-colors ${
                    isSelected ? 'border-accent/40 bg-accent/5' : 'border-border'
                  }`}
                >
                  <div className="flex items-center gap-3 p-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleKid(kid.id)}
                      className="w-4 h-4 accent-accent flex-shrink-0"
                    />
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <AvatarDisplay
                        config={kid.avatar_config}
                        size="xs"
                        name={kid.display_name || kid.username}
                        animate
                      />
                      <span className="text-cream text-sm font-medium truncate">
                        {kid.display_name || kid.username}
                      </span>
                    </div>
                    {isSelected && config.requires_photo && (
                      <Camera size={14} className="text-accent flex-shrink-0" />
                    )}
                    {isSelected && config.is_optional && (
                      <Sparkles size={14} className="text-gold flex-shrink-0" />
                    )}
                    {isSelected && (
                      <button
                        type="button"
                        onClick={() => setExpandedKid(isExpanded ? null : kid.id)}
                        className="p-1 rounded hover:bg-surface-raised text-muted hover:text-cream transition-colors"
                      >
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>
                    )}
                  </div>

                  {/* Expanded: per-kid settings */}
                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-border/50 pt-3 ml-7 space-y-3">
                      <div className="flex items-center justify-between">
                        <label className="text-muted text-xs font-medium flex items-center gap-1.5">
                          <Camera size={12} />
                          Photo Proof
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setKidConfigs((prev) => ({
                              ...prev,
                              [kid.id]: { ...prev[kid.id], requires_photo: !config.requires_photo },
                            }))
                          }
                          className={`relative w-10 h-5 rounded-full border transition-colors ${
                            config.requires_photo
                              ? 'bg-accent/20 border-accent'
                              : 'bg-navy-light border-border'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
                              config.requires_photo
                                ? 'left-5 bg-accent'
                                : 'left-0.5 bg-muted'
                            }`}
                          />
                        </button>
                      </div>
                      <div className="flex items-center justify-between">
                        <label className="text-muted text-xs font-medium flex items-center gap-1.5">
                          <Sparkles size={12} />
                          Bonus Quest
                        </label>
                        <button
                          type="button"
                          onClick={() =>
                            setKidConfigs((prev) => ({
                              ...prev,
                              [kid.id]: { ...prev[kid.id], is_optional: !config.is_optional },
                            }))
                          }
                          className={`relative w-10 h-5 rounded-full border transition-colors ${
                            config.is_optional
                              ? 'bg-gold/20 border-gold'
                              : 'bg-navy-light border-border'
                          }`}
                        >
                          <div
                            className={`absolute top-0.5 w-3.5 h-3.5 rounded-full transition-all ${
                              config.is_optional
                                ? 'left-5 bg-gold'
                                : 'left-0.5 bg-muted'
                            }`}
                          />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Unassign warning */}
        {isUnassigningAll && (
          <div className="p-3 rounded-lg border border-crimson/30 bg-crimson/10 text-crimson text-sm">
            No heroes selected. Saving will remove all assignments from this quest.
          </div>
        )}

        {/* Schedule section — shown when 1+ kids selected */}
        {selectedCount > 0 && (
          <div className="p-3 rounded-lg border border-border bg-surface-raised/20 space-y-3">
            <label className="text-cream text-sm font-medium flex items-center gap-2">
              <CalendarDays size={14} />
              Schedule
            </label>

            {/* Repeat pattern */}
            <div>
              <label className="block text-muted text-xs font-medium mb-1">
                Repeats
              </label>
              <select
                value={scheduleType}
                onChange={(e) => handleScheduleTypeChange(e.target.value)}
                className={`${selectClass} w-full`}
              >
                {SCHEDULE_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Start date */}
            <div>
              <label className="block text-muted text-xs font-medium mb-1">
                {scheduleType === 'once' ? 'Date' : 'Starts'}
              </label>
              <input
                type="date"
                value={scheduleStartDate}
                onChange={(e) => handleScheduleStartDateChange(e.target.value)}
                className={`${selectClass} w-full`}
              />
            </div>

            {/* Weekday picker */}
            {scheduleUsesWeekdays && (
              <div>
                <label className="block text-muted text-xs font-medium mb-1">
                  Days
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {DAY_NAMES.map((day, idx) => (
                    <button
                      key={day}
                      type="button"
                      onClick={() => toggleScheduleDay(idx)}
                      className={`px-2.5 py-1.5 rounded border text-xs font-medium transition-colors ${
                        scheduleWeekdays.includes(idx)
                          ? 'border-accent bg-accent/20 text-accent'
                          : 'border-border text-muted hover:border-cream/30'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Month day picker */}
            {scheduleUsesMonthDay && (
              <div>
                <label className="block text-muted text-xs font-medium mb-1">
                  Day
                </label>
                <select
                  value={scheduleMonthDay}
                  onChange={(e) => setScheduleMonthDay(Number(e.target.value))}
                  className={`${selectClass} w-full`}
                >
                  {MONTH_DAY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <p className="text-accent text-xs font-medium">
              {scheduleSummary}
            </p>
            {showSchedulePreview && (
              <div className="rounded-md border border-border/70 bg-navy-light/40 p-2">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-muted text-[10px] font-semibold uppercase">
                    Next Dates
                  </span>
                  {rotationEnabled && selectedCount >= 2 && (
                    <span className="text-purple text-[10px] font-semibold">
                      Rotates
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {schedulePreview.map((date) => (
                    <span
                      key={date}
                      className="rounded-md border border-accent/30 bg-accent/10 px-2 py-1 text-[11px] font-medium text-accent"
                    >
                      {formatSchedulePreviewDate(date)}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Photo proof toggle */}
        {selectedCount > 0 && (
          <div className="p-3 rounded-lg border border-border bg-surface-raised/20">
            <div className="flex items-center justify-between">
              <label className="text-cream text-sm font-medium flex items-center gap-2">
                <Camera size={14} />
                Require Photo Proof
              </label>
              <button
                type="button"
                onClick={togglePhotoAll}
                aria-pressed={photoBulkState.all}
                className={`relative w-12 h-6 rounded-full border transition-colors ${
                  photoBulkState.all
                    ? 'bg-accent/20 border-accent'
                    : photoBulkState.mixed
                    ? 'bg-surface-raised border-accent/50'
                    : 'bg-navy-light border-border'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                    photoBulkState.all
                      ? 'left-6 bg-accent'
                      : photoBulkState.mixed
                      ? 'left-[14px] bg-accent/70'
                      : 'left-0.5 bg-muted'
                  }`}
                />
                {photoBulkState.mixed && (
                  <span className="absolute left-[18px] top-[10px] h-0.5 w-2 rounded-full bg-navy" />
                )}
              </button>
            </div>
            <p className="text-muted text-xs mt-1">
              {photoBulkState.all
                ? 'All heroes must attach a photo when completing this quest.'
                : photoBulkState.mixed
                ? 'Some heroes require photo proof. Tap to require it for everyone.'
                : 'Heroes can complete this quest without attaching a photo.'}
            </p>
          </div>
        )}

        {/* Optional quest toggle */}
        {selectedCount > 0 && (
          <div className="p-3 rounded-lg border border-border bg-surface-raised/20">
            <div className="flex items-center justify-between">
              <label className="text-cream text-sm font-medium flex items-center gap-2">
                <Sparkles size={14} />
                Bonus Quest
              </label>
              <button
                type="button"
                onClick={toggleOptionalAll}
                aria-pressed={optionalBulkState.all}
                className={`relative w-12 h-6 rounded-full border transition-colors ${
                  optionalBulkState.all
                    ? 'bg-gold/20 border-gold'
                    : optionalBulkState.mixed
                    ? 'bg-surface-raised border-gold/50'
                    : 'bg-navy-light border-border'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                    optionalBulkState.all
                      ? 'left-6 bg-gold'
                      : optionalBulkState.mixed
                      ? 'left-[14px] bg-gold/70'
                      : 'left-0.5 bg-muted'
                  }`}
                />
                {optionalBulkState.mixed && (
                  <span className="absolute left-[18px] top-[10px] h-0.5 w-2 rounded-full bg-navy" />
                )}
              </button>
            </div>
            <p className="text-muted text-xs mt-1">
              {optionalBulkState.all
                ? 'All selected heroes can complete this for extra XP, but it will not affect streaks.'
                : optionalBulkState.mixed
                ? 'Some selected heroes have this as a bonus quest. Tap to make it bonus for everyone.'
                : 'This quest is required for streaks and daily progress.'}
            </p>
          </div>
        )}

        {/* Rotation section — shown when 2+ kids selected */}
        {selectedCount >= 2 && (
          <div className="p-3 rounded-lg border border-border bg-surface-raised/20 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-cream text-sm font-medium flex items-center gap-2">
                <RotateCw size={14} />
                Kid Rotation
              </label>
              <button
                type="button"
                onClick={() => setRotationEnabled(!rotationEnabled)}
                className={`relative w-12 h-6 rounded-full border transition-colors ${
                  rotationEnabled
                    ? 'bg-purple/20 border-purple'
                    : 'bg-navy-light border-border'
                }`}
              >
                <div
                  className={`absolute top-0.5 w-4 h-4 rounded-full transition-all ${
                    rotationEnabled ? 'left-6 bg-purple' : 'left-0.5 bg-muted'
                  }`}
                />
              </button>
            </div>
            <p className="text-muted text-xs">
              Alternate which hero is assigned. The schedule above controls when the quest appears.
            </p>
            {rotationEnabled && (
              <div className="space-y-3">
                <div>
                  <label className="block text-muted text-xs font-medium mb-1">
                    Swap Every
                  </label>
                  <select
                    value={rotationCadence}
                    onChange={(e) => setRotationCadence(e.target.value)}
                    className={`${selectClass} w-full`}
                  >
                    {ROTATION_CADENCE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-muted text-xs font-medium mb-1">
                    Starts With
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {selectedKids.map(([kidId]) => {
                      const kid = kids.find((k) => k.id === Number(kidId));
                      if (!kid) return null;
                      const isFirst = Number(kidId) === Number(rotationFirstKid);
                      return (
                        <button
                          key={kidId}
                          type="button"
                          onClick={() => setRotationFirstKid(Number(kidId))}
                          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors text-sm ${
                            isFirst
                              ? 'border-purple bg-purple/15 text-purple'
                              : 'border-border text-muted hover:border-cream/30'
                          }`}
                        >
                          <AvatarDisplay
                            config={kid.avatar_config}
                            size="xs"
                            name={kid.display_name || kid.username}
                            animate
                          />
                          {kid.display_name || kid.username}
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-muted text-xs mt-1">
                    This hero gets the quest first, then it rotates.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
