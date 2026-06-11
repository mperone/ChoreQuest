import test from 'node:test';
import assert from 'node:assert/strict';

import {
  approvalDateLabel,
  assignmentActionState,
  assignmentStatusLabel,
  collectPendingApprovals,
  splitQuestAssignments,
} from './assignmentActions.js';

test('assignment action state only approves completed assignments', () => {
  assert.deepEqual(assignmentActionState({ status: 'completed' }), {
    canApprove: true,
    canSendBack: true,
    canSkip: false,
  });
});

test('assignment action state only skips pending assignments', () => {
  assert.deepEqual(assignmentActionState({ status: 'pending' }), {
    canApprove: false,
    canSendBack: false,
    canSkip: true,
  });
});

test('assignment action state disables actions for settled assignments', () => {
  assert.deepEqual(assignmentActionState({ status: 'verified' }), {
    canApprove: false,
    canSendBack: false,
    canSkip: false,
  });
  assert.deepEqual(assignmentActionState({ status: 'skipped' }), {
    canApprove: false,
    canSendBack: false,
    canSkip: false,
  });
});

test('assignment status label uses parent-facing language', () => {
  assert.equal(assignmentStatusLabel('completed'), 'Needs approval');
  assert.equal(assignmentStatusLabel('verified'), 'Approved');
  assert.equal(assignmentStatusLabel('pending'), 'Scheduled');
  assert.equal(assignmentStatusLabel('missed'), 'Missed');
});

test('splitQuestAssignments groups today, upcoming, and recent rows', () => {
  const groups = splitQuestAssignments(
    [
      { id: 1, date: '2026-06-09', status: 'verified' },
      { id: 2, date: '2026-06-10', status: 'pending' },
      { id: 3, date: '2026-06-11', status: 'pending' },
      { id: 4, date: '2026-06-08', status: 'completed' },
    ],
    '2026-06-10'
  );

  assert.deepEqual(groups.today.map((a) => a.id), [2]);
  assert.deepEqual(groups.upcoming.map((a) => a.id), [3]);
  assert.deepEqual(groups.recent.map((a) => a.id), [1, 4]);
});

test('collectPendingApprovals gathers completed assignments across calendar days', () => {
  const approvals = collectPendingApprovals({
    '2026-06-09': [
      { id: 3, status: 'completed', completed_at: '2026-06-09T19:00:00Z' },
      { id: 4, status: 'verified', completed_at: '2026-06-09T18:00:00Z' },
    ],
    '2026-06-10': [
      { id: 2, status: 'pending' },
      { id: 1, status: 'completed', completed_at: '2026-06-10T17:00:00Z' },
    ],
  });

  assert.deepEqual(approvals.map((a) => [a.id, a.date]), [
    [3, '2026-06-09'],
    [1, '2026-06-10'],
  ]);
});

test('approvalDateLabel keeps today and yesterday scannable', () => {
  assert.equal(approvalDateLabel({ date: '2026-06-10' }, '2026-06-10'), 'Today');
  assert.equal(approvalDateLabel({ date: '2026-06-09' }, '2026-06-10'), 'Yesterday');
  assert.equal(approvalDateLabel({ date: '2026-06-08' }, '2026-06-10'), 'Jun 8');
});
