import unittest
from types import SimpleNamespace

from backend.services.optional_quests import (
    assignment_counts_for_required_progress,
    assignment_completion_advances_streak,
)


def assignment(**kwargs):
    defaults = {
        "status": "pending",
        "is_optional": False,
    }
    defaults.update(kwargs)
    return SimpleNamespace(**defaults)


class OptionalQuestPolicyTests(unittest.TestCase):
    def test_required_assignments_count_for_progress(self):
        self.assertTrue(assignment_counts_for_required_progress(assignment()))

    def test_optional_assignments_do_not_count_for_required_progress(self):
        self.assertFalse(
            assignment_counts_for_required_progress(assignment(is_optional=True))
        )

    def test_required_completed_assignment_advances_streak(self):
        self.assertTrue(
            assignment_completion_advances_streak(assignment(status="completed"))
        )
        self.assertTrue(
            assignment_completion_advances_streak(assignment(status="verified"))
        )

    def test_optional_completed_assignment_does_not_advance_streak(self):
        self.assertFalse(
            assignment_completion_advances_streak(
                assignment(status="completed", is_optional=True)
            )
        )
        self.assertFalse(
            assignment_completion_advances_streak(
                assignment(status="verified", is_optional=True)
            )
        )

    def test_pending_required_assignment_does_not_advance_streak(self):
        self.assertFalse(assignment_completion_advances_streak(assignment()))


if __name__ == "__main__":
    unittest.main()
