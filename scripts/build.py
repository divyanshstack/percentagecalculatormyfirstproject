import json
import os
import shutil
import base64
import binascii
from pathlib import Path
from urllib.parse import urlparse


ROOT = Path(__file__).resolve().parent.parent
OUTPUT = ROOT / "dist"
PUBLIC_FILES = (
    "index.html",
    "style.css",
    "script.js",
    "auth.js",
    "resources.js",
    "_redirects",
    "_headers",
)


def load_environment():
    values = dict(os.environ)
    env_file = ROOT / ".env"
    if env_file.exists():
        for line in env_file.read_text(encoding="utf-8").splitlines():
            item = line.strip()
            if not item or item.startswith("#") or "=" not in item:
                continue
            name, value = item.split("=", 1)
            values.setdefault(name.strip(), value.strip().strip("\"'"))
    return values


def main():
    environment = load_environment()
    project_url = environment.get("SUPABASE_URL", "").strip()
    public_key = environment.get("SUPABASE_ANON_KEY", "").strip()
    parsed_url = urlparse(project_url)
    if parsed_url.scheme != "https" or not parsed_url.hostname or not parsed_url.hostname.endswith(".supabase.co"):
        raise SystemExit("Set SUPABASE_URL to your HTTPS Supabase project URL.")
    is_publishable_key = public_key.startswith("sb_publishable_")
    is_legacy_anon_key = False
    try:
        jwt_payload = public_key.split(".")[1]
        padding = "=" * (-len(jwt_payload) % 4)
        claims = json.loads(base64.urlsafe_b64decode(jwt_payload + padding))
        is_legacy_anon_key = claims.get("role") == "anon"
    except (IndexError, ValueError, UnicodeDecodeError, binascii.Error):
        pass
    if not is_publishable_key and not is_legacy_anon_key:
        raise SystemExit("Set SUPABASE_ANON_KEY to the public anon/publishable key, never a secret key.")

    OUTPUT.mkdir(parents=True, exist_ok=True)
    for filename in PUBLIC_FILES:
        shutil.copy2(ROOT / filename, OUTPUT / filename)

    configuration = {
        "supabaseUrl": project_url.rstrip("/"),
        "supabaseAnonKey": public_key,
    }
    (OUTPUT / "config.js").write_text(
        "window.JEE_PHODENGE_CONFIG = "
        + json.dumps(configuration, ensure_ascii=True)
        + ";\n",
        encoding="utf-8",
    )
    vercel_config = ROOT / "vercel.json"
    if vercel_config.exists():
        shutil.copy2(vercel_config, OUTPUT / "vercel.json")
    print(f"Built the static site into {OUTPUT}")


if __name__ == "__main__":
    main()
