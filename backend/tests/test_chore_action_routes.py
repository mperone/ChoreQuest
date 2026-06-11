import unittest

from backend.routers.chores import router


def route_methods():
    return {
        (route.path, method)
        for route in router.routes
        for method in getattr(route, "methods", set())
    }


class ChoreActionRouteTests(unittest.TestCase):
    def test_assignment_action_routes_are_available(self):
        routes = route_methods()

        self.assertIn(("/api/chores/assignments/{assignment_id}/approve", "POST"), routes)
        self.assertIn(("/api/chores/assignments/{assignment_id}/needs-work", "POST"), routes)
        self.assertIn(("/api/chores/assignments/{assignment_id}/skip", "POST"), routes)

    def test_legacy_assignment_action_aliases_still_work(self):
        routes = route_methods()

        self.assertIn(("/api/chores/assignments/{assignment_id}/verify", "POST"), routes)
        self.assertIn(("/api/chores/assignments/{assignment_id}/uncomplete", "POST"), routes)

    def test_chore_assignment_list_route_is_available(self):
        routes = route_methods()

        self.assertIn(("/api/chores/{chore_id}/assignments", "GET"), routes)


if __name__ == "__main__":
    unittest.main()
