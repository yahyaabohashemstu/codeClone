"""
WSGI entry point.

Uses the application factory -- the monolith ``app.py`` is NO LONGER the
production entry point.
"""

from backend.app_factory import create_app

app = create_app()

if __name__ == "__main__":
    import os

    try:
        from waitress import serve
    except ImportError:
        serve = None

    host = os.environ.get("BIND_HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 5000))
    threads = int(os.environ.get("WAITRESS_THREADS", 8))
    server_label = "waitress" if serve is not None else "flask"
    print(f"Starting server with {server_label} on http://{host}:{port}", flush=True)
    if serve is not None:
        serve(app, host=host, port=port, threads=threads)
    else:
        app.run(host=host, port=port, debug=False)
