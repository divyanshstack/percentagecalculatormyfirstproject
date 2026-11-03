from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parent.parent
SITE_ROOT = ROOT / "dist" if (ROOT / "dist" / "index.html").is_file() else ROOT


class SinglePageHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(SITE_ROOT), **kwargs)

    def do_GET(self):
        requested_path = urlsplit(self.path).path
        parts = Path(requested_path).parts
        if any(part == ".git" or part == "supabase" or part == "scripts"
               or part == ".env" or part.startswith(".env.")
               for part in parts):
            self.send_error(404)
            return
        resolved_path = Path(self.translate_path(requested_path))
        if not resolved_path.is_file() and not Path(requested_path).suffix:
            self.path = "/index.html"
        super().do_GET()


if __name__ == "__main__":
    server = ThreadingHTTPServer(("127.0.0.1", 8765), SinglePageHandler)
    print("JEE PHODENGE development server: http://127.0.0.1:8765")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()
