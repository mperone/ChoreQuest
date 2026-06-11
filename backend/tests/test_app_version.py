import json
import tempfile
import unittest
from pathlib import Path

from backend.app_version import DEFAULT_COMPAT_VERSION, load_compat_version


class AppVersionTests(unittest.TestCase):
    def test_loads_compat_version_from_json_file(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "app_compat.json"
            path.write_text(
                json.dumps({"compat_version": "test-release-v1"}),
                encoding="utf-8",
            )

            self.assertEqual(load_compat_version(path), "test-release-v1")

    def test_uses_default_when_file_is_missing_or_invalid(self):
        with tempfile.TemporaryDirectory() as tmp:
            missing = Path(tmp) / "missing.json"
            invalid = Path(tmp) / "invalid.json"
            invalid.write_text("not-json", encoding="utf-8")

            self.assertEqual(load_compat_version(missing), DEFAULT_COMPAT_VERSION)
            self.assertEqual(load_compat_version(invalid), DEFAULT_COMPAT_VERSION)


if __name__ == "__main__":
    unittest.main()
