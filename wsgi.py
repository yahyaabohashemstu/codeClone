"""
WSGI entry point.

Uses the application factory -- the monolith ``app.py`` is NO LONGER the
production entry point.
"""

from backend.app_factory import create_app

app = create_app()

if __name__ == "__main__":
    import logging
    import os

    try:
        from waitress import serve
    except ImportError:
        serve = None

    host = os.environ.get("BIND_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 5000))
    threads = int(os.environ.get("WAITRESS_THREADS", 8))

    if serve is None:
        # Refuse to silently serve production traffic on the Flask dev server:
        # a misbuilt environment (waitress missing) must fail loudly there.
        if (os.environ.get("FLASK_ENV") or "development").lower() == "production":
            raise RuntimeError(
                "waitress is not installed but FLASK_ENV=production. "
                "Install requirements.txt before serving production traffic."
            )
        logging.getLogger(__name__).warning(
            "waitress is not installed — falling back to the Flask development "
            "server. Do NOT use this for production traffic."
        )
        print(f"Starting server with flask (DEV ONLY) on http://{host}:{port}", flush=True)
        app.run(host=host, port=port, debug=False)
    else:
        print(f"Starting server with waitress on http://{host}:{port}", flush=True)
        serve(app, host=host, port=port, threads=threads)
