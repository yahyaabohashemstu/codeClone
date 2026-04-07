from app import app

try:
    from waitress import serve
except ImportError:
    serve = None

if __name__ == "__main__":
    host = "0.0.0.0"
    port = 8080
    server_label = "waitress" if serve is not None else "flask"
    print(f"Starting server with {server_label} on http://127.0.0.1:{port}", flush=True)
    if serve is not None:
        serve(app, host=host, port=port, threads=8)
    else:
        app.run(host=host, port=port, debug=False)
