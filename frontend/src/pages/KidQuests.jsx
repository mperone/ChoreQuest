import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Loader2,
  Star,
  Flame,
  CheckCircle2,
  XCircle,
  Clock,
  Camera,
  Swords,
  SkipForward,
  Sparkles,
} from 'lucide-react';
import { api } from '../api/client';
import { useTheme } from '../hooks/useTheme';
import { themedTitle, themedDescription } from '../utils/questThemeText';
import { assignmentActionState } from '../utils/assignmentActions';
import AvatarDisplay from '../components/AvatarDisplay';

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: 'text-muted', icon: Clock },
  completed: { label: 'Awaiting Approval', color: 'text-gold', icon: Clock },
  verified: { label: 'Approved', color: 'text-emerald', icon: CheckCircle2 },
  skipped: { label: 'Skipped', color: 'text-muted/50', icon: SkipForward },
};

export default function KidQuests() {
  const { kidId } = useParams();
  const navigate = useNavigate();
  const { colorTheme } = useTheme();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState({});

  const fetchData = useCallback(async () => {
    try {
      setError('');
      const res = await api(`/api/stats/family/${kidId}`);
      setData(res);
    } catch (err) {
      setError(err.message || 'Failed to load kid data');
    } finally {
      setLoading(false);
    }
  }, [kidId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener('ws:message', handler);
    return () => window.removeEventListener('ws:message', handler);
  }, [fetchData]);

  const setActionBusy = (key, busy) => {
    setActionLoading((prev) => ({ ...prev, [key]: busy }));
  };

  const handleApprove = async (assignmentId) => {
    const key = `approve-${assignmentId}`;
    setActionBusy(key, true);
    try {
      await api(`/api/chores/assignments/${assignmentId}/approve`, { method: 'POST' });
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to approve quest');
    } finally {
      setActionBusy(key, false);
    }
  };

  const handleNeedsWork = async (assignmentId) => {
    const key = `needs-work-${assignmentId}`;
    setActionBusy(key, true);
    try {
      await api(`/api/chores/assignments/${assignmentId}/needs-work`, { method: 'POST' });
      await fetchData();
    } catch (err) {
      setError(err.message || 'Failed to send quest back');
    } finally {
      setActionBusy(key, false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-accent" size={24} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="max-w-2xl mx-auto py-6">
        <div className="game-panel p-8 text-center">
          <XCircle size={36} className="mx-auto text-crimson mb-3" />
          <p className="text-cream text-base font-semibold mb-2">Error</p>
          <p className="text-muted text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!data) return null;

  const { kid, assignments } = data;
  const todayAssignments = Array.isArray(assignments) ? assignments : [];
  const pendingApprovals = Array.isArray(data.pending_approvals)
    ? data.pending_approvals
    : [];
  const pendingApprovalIds = new Set(pendingApprovals.map((a) => a.id));
  const displayAssignments = [
    ...pendingApprovals,
    ...todayAssignments.filter((a) => !pendingApprovalIds.has(a.id)),
  ];
  const requiredAssignments = todayAssignments.filter((a) => !a.is_optional);
  const completedCount = requiredAssignments.filter(
    (a) => a.status === 'completed' || a.status === 'verified'
  ).length;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      {/* Kid header */}
      <div className="game-panel p-3 sm:p-4">
        <div className="flex items-center gap-3">
          <AvatarDisplay
            config={kid.avatar_config}
            size="md"
            name={kid.display_name}
            animate
          />
          <div className="min-w-0 flex-1">
            <h1 className="text-cream text-sm sm:text-base font-semibold truncate">
              {kid.display_name}'s Quests
            </h1>
            <div className="flex items-center gap-3 mt-1">
              <span className="inline-flex items-center gap-1 text-gold text-xs sm:text-sm font-semibold">
                <Star size={13} fill="currentColor" />
                {kid.points_balance.toLocaleString()} XP
              </span>
              {kid.current_streak > 0 && (
                <span className="inline-flex items-center gap-1 text-orange-400 text-xs sm:text-sm font-semibold">
                  <Flame size={13} fill="currentColor" />
                  {kid.current_streak} day streak
                </span>
              )}
            </div>
            <p className="text-muted text-xs mt-1">
              {requiredAssignments.length > 0
                ? `${completedCount}/${requiredAssignments.length} required quests done today`
                : 'No required quests today'}
            </p>
          </div>
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="game-panel p-3 border-crimson/30 text-crimson text-sm">
          {error}
        </div>
      )}

      {/* Quest list */}
      {displayAssignments.length === 0 ? (
        <div className="game-panel p-10 text-center">
          <Swords size={40} className="mx-auto text-muted mb-4" />
          <p className="text-muted text-sm">
            No quests assigned for today.
          </p>
        </div>
      ) : (
        <div className="space-y-2.5">
          {displayAssignments.map((a, idx) => {
            const cfg = STATUS_CONFIG[a.status] || STATUS_CONFIG.pending;
            const StatusIcon = cfg.icon;
            const isVerified = a.status === 'verified';
            const actions = assignmentActionState(a);
            const approveKey = `approve-${a.id}`;
            const needsWorkKey = `needs-work-${a.id}`;
            const isApproving = actionLoading[approveKey];
            const isSendingBack = actionLoading[needsWorkKey];
            const isBusy = isApproving || isSendingBack;
            const hasParentActions = actions.canApprove || actions.canSendBack;

            return (
              <div
                key={a.id}
                className="game-panel p-3 sm:p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div
                    className="min-w-0 flex-1 cursor-pointer"
                    onClick={() => navigate(`/chores/${a.chore_id}`)}
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <h3
                        className="text-cream text-sm font-medium break-words"
                        title={themedTitle(a.chore.title, colorTheme)}
                      >
                        {themedTitle(a.chore.title, colorTheme)}
                      </h3>
                      {(a.requires_photo || a.chore.requires_photo) && (
                        <Camera size={12} className="text-accent flex-shrink-0" />
                      )}
                    </div>
                    {a.chore.description && (
                      <p className="text-muted text-xs line-clamp-1 mb-1.5">
                        {themedDescription(a.chore.title, a.chore.description, colorTheme)}
                      </p>
                    )}
                    <div className="flex items-center flex-wrap gap-3">
                      <span className="flex items-center gap-1 text-gold text-xs font-semibold">
                        <Star size={11} fill="currentColor" />
                        {a.chore.points} XP
                      </span>
                      {a.is_optional && (
                        <span className="flex items-center gap-1 text-gold text-xs font-semibold">
                          <Sparkles size={11} />
                          Bonus
                        </span>
                      )}
                      {a.chore.category && (
                        <span className="text-muted text-xs capitalize">
                          {a.chore.category}
                        </span>
                      )}
                      {a.date && (
                        <span className="text-muted text-xs">
                          {a.date}
                        </span>
                      )}
                      <span className={`flex items-center gap-1 text-xs font-medium ${cfg.color}`}>
                        <StatusIcon size={12} />
                        {cfg.label}
                      </span>
                    </div>
                  </div>

                  {/* Parent approval buttons */}
                  {hasParentActions && (
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {actions.canApprove && (
                        <button
                          className="game-btn game-btn-blue !px-3 !py-2"
                          disabled={isBusy}
                          onClick={() => handleApprove(a.id)}
                          title="Approve"
                        >
                          {isApproving ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <CheckCircle2 size={16} />
                          )}
                        </button>
                      )}
                      {actions.canSendBack && (
                        <button
                          className="game-btn game-btn-red !px-3 !py-2"
                          disabled={isBusy}
                          onClick={() => handleNeedsWork(a.id)}
                          title="Needs work"
                        >
                          {isSendingBack ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <XCircle size={16} />
                          )}
                        </button>
                      )}
                    </div>
                  )}

                  {/* Verified checkmark */}
                  {isVerified && !hasParentActions && (
                    <CheckCircle2 size={20} className="text-emerald flex-shrink-0" />
                  )}
                </div>

                {/* Photo proof */}
                {a.photo_proof_path && (
                  <div className="mt-3">
                    <img
                      src={`/api/uploads/${a.photo_proof_path}`}
                      alt="Photo proof"
                      className="rounded-md max-h-48 object-cover border border-border"
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
