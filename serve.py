"""Dev server for the site: serves ./public with caching disabled, so the browser never
mixes old and new CSS/JS after an edit.

    python serve.py [port]     (default 5181)
"""
import functools
import http.server
import os
import sys


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        # clean URLs like production (Vercel cleanUrls): /portfolio serves portfolio.html
        full = super().translate_path(path)
        if not os.path.exists(full) and os.path.exists(full + ".html"):
            return full + ".html"
        return full

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        self.send_header("Expires", "0")
        super().end_headers()


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5181
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "public")
    handler = functools.partial(NoCacheHandler, directory=root)
    print(f"Serving {root} on http://localhost:{port} (no cache)")
    http.server.ThreadingHTTPServer(("", port), handler).serve_forever()
