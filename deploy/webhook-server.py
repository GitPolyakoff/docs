#!/usr/bin/env python3
import hashlib
import hmac
import json
import os
import subprocess
from http.server import BaseHTTPRequestHandler, HTTPServer

WEBHOOK_SECRET = os.environ.get("WEBHOOK_SECRET", "").encode()
DEPLOY_SCRIPT = os.environ.get("DEPLOY_SCRIPT", "/home/truckline/web_servers/docs/deploy/deploy.sh")
PORT = int(os.environ.get("PORT", "9000"))


def verify_signature(payload: bytes, signature: str) -> bool:
    if not WEBHOOK_SECRET:
        return False
    if not signature or not signature.startswith("sha256="):
        return False
    expected = hmac.new(WEBHOOK_SECRET, payload, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, signature[7:])


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhook/docs":
            self.send_response(404)
            self.end_headers()
            return

        content_length = int(self.headers.get("Content-Length", 0))
        payload = self.rfile.read(content_length)
        signature = self.headers.get("X-Hub-Signature-256", "")
        event = self.headers.get("X-GitHub-Event", "")

        if not verify_signature(payload, signature):
            self.send_response(401)
            self.end_headers()
            return

        if event != "push":
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b"ignored: not a push event")
            return

        try:
            data = json.loads(payload.decode("utf-8"))
            ref = data.get("ref", "")
            if ref != "refs/heads/main":
                self.send_response(200)
                self.end_headers()
                self.wfile.write(b"ignored: not main branch")
                return
        except json.JSONDecodeError:
            self.send_response(400)
            self.end_headers()
            return

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"deploy triggered")

        subprocess.Popen(
            ["bash", DEPLOY_SCRIPT],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
            start_new_session=True,
        )

    def log_message(self, format, *args):
        # Suppress default logging; use the deploy log instead
        pass


if __name__ == "__main__":
    if not WEBHOOK_SECRET:
        raise SystemExit("WEBHOOK_SECRET environment variable is required")

    server = HTTPServer(("0.0.0.0", PORT), Handler)
    print(f"Webhook server listening on port {PORT}")
    server.serve_forever()
