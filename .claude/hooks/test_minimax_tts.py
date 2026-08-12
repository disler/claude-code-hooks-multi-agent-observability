#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "python-dotenv",
#     "requests",
# ]
# ///

import importlib.util
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import Mock, patch

REPOSITORY_ROOT = Path(__file__).resolve().parents[2]
HOOK_ROOTS = [
    REPOSITORY_ROOT / ".claude" / "hooks",
    REPOSITORY_ROOT / "apps" / "demo-cc-agent" / ".claude" / "hooks",
]


def load_module(name, path):
    spec = importlib.util.spec_from_file_location(name, path)
    module = importlib.util.module_from_spec(spec)
    sys.path.insert(0, str(path.parent))
    try:
        spec.loader.exec_module(module)
    finally:
        sys.path.pop(0)
    return module


class MiniMaxSelectorTests(unittest.TestCase):
    def test_minimax_is_selected_by_every_tts_hook(self):
        for root_index, hook_root in enumerate(HOOK_ROOTS):
            for hook_name in ("notification", "stop", "subagent_stop"):
                with self.subTest(hook_root=hook_root, hook=hook_name):
                    module = load_module(
                        f"{hook_name}_{root_index}", hook_root / f"{hook_name}.py"
                    )
                    with patch.dict(
                        os.environ, {"MINIMAX_API_KEY": "test-key"}, clear=True
                    ):
                        selected = Path(module.get_tts_script_path())
                    self.assertEqual(selected.name, "minimax_tts.py")


class MiniMaxSynthesisTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.provider = load_module(
            "minimax_tts", HOOK_ROOTS[0] / "utils" / "tts" / "minimax_tts.py"
        )

    def test_synthesize_decodes_hex_audio(self):
        response = Mock()
        response.json.return_value = {
            "base_resp": {"status_code": 0},
            "data": {"audio": "494433", "status": 2},
        }
        with patch.object(
            self.provider.requests, "post", return_value=response
        ) as post:
            audio = self.provider.synthesize(
                "Done", "test-key", "https://example.test/v1/t2a_v2", "model", "voice"
            )

        self.assertEqual(audio, b"ID3")
        response.raise_for_status.assert_called_once_with()
        request = post.call_args.kwargs
        self.assertEqual(request["headers"]["Authorization"], "Bearer test-key")
        self.assertEqual(request["json"]["model"], "model")
        self.assertEqual(request["json"]["text"], "Done")
        self.assertEqual(request["json"]["output_format"], "hex")
        self.assertEqual(request["json"]["voice_setting"]["voice_id"], "voice")

    def test_synthesize_rejects_api_errors(self):
        response = Mock()
        response.json.return_value = {
            "base_resp": {"status_code": 1001, "status_msg": "rejected"},
            "data": None,
        }
        with patch.object(  # noqa: SIM117 - keep Python 3.8 compatibility
            self.provider.requests, "post", return_value=response
        ):
            with self.assertRaisesRegex(RuntimeError, "rejected"):
                self.provider.synthesize(
                    "Done",
                    "test-key",
                    "https://example.test/v1/t2a_v2",
                    "model",
                    "voice",
                )


if __name__ == "__main__":
    unittest.main()
