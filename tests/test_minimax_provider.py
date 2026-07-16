import json
import sys
import threading
import unittest
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path


LLM_DIR = Path(__file__).parents[1] / ".claude" / "hooks" / "utils" / "llm"
sys.path.insert(0, str(LLM_DIR))

import minimax


class CaptureHandler(BaseHTTPRequestHandler):
    requests = []

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8"))
        self.__class__.requests.append((self.path, body))
        if self.path.endswith("/chat/completions"):
            response = {"choices": [{"message": {"content": "OpenAI response"}}]}
        else:
            response = {"content": [{"type": "text", "text": "Anthropic response"}]}
        encoded = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format_string, *args):
        return


class MiniMaxProviderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        CaptureHandler.requests = []
        cls.server = HTTPServer(("127.0.0.1", 0), CaptureHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join()

    def test_registry_contains_target_models_and_endpoints(self):
        self.assertEqual(list(minimax.MODEL_REGISTRY), ["MiniMax-M3", "MiniMax-M2.7"])
        self.assertEqual(
            minimax.ENDPOINT_REGISTRY["global_en"]["anthropic_base_url"],
            "https://api.minimax.io/anthropic",
        )
        self.assertEqual(
            minimax.ENDPOINT_REGISTRY["cn_zh"]["anthropic_base_url"],
            "https://api.minimaxi.com/anthropic",
        )

    def test_openai_compatible_request_path(self):
        config = {
            "api_key": "test-key",
            "protocol": "openai",
            "model": "MiniMax-M3",
            "base_url": f"{self.base_url}/v1",
        }
        response = minimax.request_completion("hello", config=config)
        self.assertEqual(response, "OpenAI response")
        self.assertEqual(CaptureHandler.requests[-1][0], "/v1/chat/completions")
        self.assertEqual(CaptureHandler.requests[-1][1]["model"], "MiniMax-M3")

    def test_anthropic_compatible_request_path(self):
        config = {
            "api_key": "test-key",
            "protocol": "anthropic",
            "model": "MiniMax-M2.7",
            "base_url": f"{self.base_url}/anthropic",
        }
        response = minimax.request_completion("hello", config=config)
        self.assertEqual(response, "Anthropic response")
        self.assertEqual(CaptureHandler.requests[-1][0], "/anthropic/v1/messages")
        self.assertEqual(CaptureHandler.requests[-1][1]["model"], "MiniMax-M2.7")


if __name__ == "__main__":
    unittest.main()
