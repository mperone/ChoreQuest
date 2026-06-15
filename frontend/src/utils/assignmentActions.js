import { compareDailyItems } from './choreDayparts.js';

const STATUS_LABELS = {
  pending: 'Scheduled',
  assigned: 'Scheduled',
  completed: 'Needs approval',
  verified: 'Approved',
  skipped: 'Skipped',
  missed: 'Missed',
};
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function assignmentActionState(assignment) {
  const status = assignment?.status || 'pending';
  return {
    canApprove: status === 'completed',
    canSendBack: status === 'completed' || status === 'verified',
    canSkip: status === 'pending' || status === 'assigned',
  };
}

export function assignmentStatusLabel(status) {
  return STATUS_LABELS[status] || status || 'Scheduled';
}

export function splitQuestAssignments(assignments, todayISO) {
  const rows = Array.isArray(assignments) ? assignments : [];
  const today = [];
  const upcoming = [];
  const recent = [];

  for (const assignment of rows) {
    if (assignment.date === todayISO) {
      today.push(assignment);
    } else if (assignment.date > todayISO) {
      upcoming.push(assignment);
    } else {
      recent.push(assignment);
    }
  }

  today.sort((a, b) => compareDailyItems(a, b) || Number(a.id) - Number(b.id));
  upcoming.sort((a, b) => (
    String(a.date).localeCompare(String(b.date))
    || compareDailyItems(a, b)
    || Number(a.id) - Number(b.id)
  ));
  recent.sort((a, b) => (
    String(b.date).localeCompare(String(a.date))
    || compareDailyItems(a, b)
    || Number(b.id) - Number(a.id)
  ));

  return { today, upcoming, recent };
}

export function collectPendingApprovals(calendarDays) {
  const approvals = [];

  for (const [date, assignments] of Object.entries(calendarDays || {})) {
    for (const assignment of assignments || []) {
      if (assignment?.status === 'completed') {
        approvals.push({
          ...assignment,
          date: assignment.date || date,
        });
      }
    }
  }

  approvals.sort((a, b) => (
    String(a.date).localeCompare(String(b.date)) ||
    String(a.completed_at || '').localeCompare(String(b.completed_at || '')) ||
    Number(a.id || 0) - Number(b.id || 0)
  ));

  return approvals;
}

function addDays(isoDate, days) {
  const [year, month, day] = String(isoDate || '').split('-').map(Number);
  if (!year || !month || !day) return '';

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  const nextYear = date.getUTCFullYear();
  const nextMonth = String(date.getUTCMonth() + 1).padStart(2, '0');
  const nextDay = String(date.getUTCDate()).padStart(2, '0');
  return `${nextYear}-${nextMonth}-${nextDay}`;
}

export function approvalDateLabel(assignment, todayISO) {
  const date = assignment?.date;
  if (!date) return '';
  if (date === todayISO) return 'Today';
  if (date === addDays(todayISO, -1)) return 'Yesterday';

  const [, month, day] = String(date).split('-').map(Number);
  if (!month || !day) return date;
  return `${MONTH_NAMES[month - 1]} ${day}`;
}
