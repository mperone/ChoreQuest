import unittest
from types import SimpleNamespace

from backend.services.approval_queue import collect_pending_approvals


class ApprovalQueueTests(unittest.TestCase):
    def _assignment(self, **kwargs):
        defaults = {
            "id": 1,
            "user_id": 10,
            "date": "2026-06-15",
            "status": "pending",
            "completed_at": None,
            "chore": SimpleNamespace(is_active=True),
        }
        defaults.update(kwargs)
        return SimpleNamespace(**defaults)

    def test_pending_approval_query_ignores_calendar_windows(self):
        rows = collect_pending_approvals([
            self._assignment(
                id=1,
                date="2026-06-08",
                status="completed",
                completed_at="2026-06-08T12:00:00",
            ),
            self._assignment(
                id=2,
                date="2026-06-15",
                status="completed",
                completed_at="2026-06-15T12:00:00",
            ),
            self._assignment(id=3, date="2026-06-15", status="pending"),
            self._assignment(id=4, date="2026-06-14", status="verified"),
            self._assignment(
                id=5,
                date="2026-06-15",
                status="completed",
                chore=SimpleNamespace(is_active=False),
            ),
            self._assignment(
                id=6,
                user_id=11,
                date="2026-06-13",
                status="completed",
                completed_at="2026-06-13T12:00:00",
            ),
        ])

        self.assertEqual([row.id for row in rows], [1, 6, 2])

    def test_pending_approval_query_can_filter_to_one_kid_without_date_limit(self):
        rows = collect_pending_approvals([
            self._assignment(
                id=1,
                user_id=10,
                date="2026-06-08",
                status="completed",
            ),
            self._assignment(
                id=2,
                user_id=10,
                date="2026-06-15",
                status="completed",
            ),
            self._assignment(
                id=3,
                user_id=11,
                date="2026-06-13",
                status="completed",
            ),
        ], kid_id=10)

        self.assertEqual([row.id for row in rows], [1, 2])


if __name__ == "__main__":
    unittest.main()
