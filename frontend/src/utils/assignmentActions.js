const STATUS_LABELS = {
  pending: 'Scheduled',
  assigned: 'Scheduled',
  completed: 'Needs approval',
  verified: 'Approved',
  skipped: 'Skipped',
  missed: 'Missed',
};

export function assignmentActionState(assignment) {
  const status = assignment?.status || 'pending';
  return {
    canApprove: status === 'completed',
    canSendBack: status === 'completed',
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

  upcoming.sort((a, b) => (
    String(a.date).localeCompare(String(b.date)) || Number(a.id) - Number(b.id)
  ));
  recent.sort((a, b) => (
    String(b.date).localeCompare(String(a.date)) || Number(b.id) - Number(a.id)
  ));

  return { today, upcoming, recent };
}
