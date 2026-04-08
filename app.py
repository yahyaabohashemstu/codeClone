"""
Module for code clone detection and analysis.
"""

import os
import re
import zipfile
import io
import base64
import json
import inspect
import threading
import hmac
import html as _html
import secrets
import warnings
import difflib
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor, as_completed
from tempfile import NamedTemporaryFile, TemporaryDirectory
import copy
import datetime

from flask import (
    Flask,
    request,
    has_request_context,
    render_template,
    jsonify,
    redirect,
    url_for,
    flash,
    session,
    send_from_directory,
    abort,
)
from flask_login import (
    LoginManager,
    UserMixin,
    login_user,
    login_required,
    logout_user,
    current_user,
)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy.sql import func
from werkzeug.exceptions import RequestEntityTooLarge
from werkzeug.security import generate_password_hash, check_password_hash
from tree_sitter_languages import get_parser
from rapidfuzz import fuzz
import networkx as nx
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from radon.raw import analyze
from radon.metrics import mi_visit, h_visit
from radon.complexity import cc_visit
from transformers import BertTokenizer, BertModel, AutoTokenizer, AutoModel, logging as transformers_logging
import numpy as np
import torch
try:
    from mistralai.client import Mistral
    MISTRAL_SDK_IMPORT_PATH = 'mistralai.client'
    MISTRAL_SDK_IMPORT_ERROR = None
except ImportError as mistral_client_import_error:
    try:
        from mistralai import Mistral
        MISTRAL_SDK_IMPORT_PATH = 'mistralai'
        MISTRAL_SDK_IMPORT_ERROR = None
    except ImportError as mistral_root_import_error:
        Mistral = None
        MISTRAL_SDK_IMPORT_PATH = None
        MISTRAL_SDK_IMPORT_ERROR = mistral_root_import_error or mistral_client_import_error
import pandas as pd
import markdown2
import subprocess

os.environ["KMP_DUPLICATE_LIB_OK"] = "TRUE"

warnings.filterwarnings(
    "ignore",
    message=r"Language\(path, name\) is deprecated\. Use Language\(ptr, name\) instead\.",
    category=FutureWarning,
)
transformers_logging.set_verbosity_error()

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIST_DIR = os.path.join(BASE_DIR, 'code-sleuth-react-ui', 'dist')
FRONTEND_INDEX_PATH = os.path.join(FRONTEND_DIST_DIR, 'index.html')
SNAPSHOT_SCHEMA_VERSION = 1
INSECURE_DEFAULT_ADMIN_PASSWORDS = {'admin123', 'admin', 'password', '123456', '12345678'}
MAX_ANALYSIS_REQUEST_BYTES = 110 * 1024 * 1024
MAX_SOURCE_UPLOAD_BYTES = 2 * 1024 * 1024
MAX_SPREADSHEET_UPLOAD_BYTES = 5 * 1024 * 1024
MAX_SPREADSHEET_ARCHIVE_BYTES = 25 * 1024 * 1024

# Per-user analysis progress tracking for long-running analyses
analysis_progress = {}
analysis_progress_lock = threading.Lock()

app = Flask(__name__, static_url_path='/static', static_folder='static')
os.makedirs(app.instance_path, exist_ok=True)


def load_or_create_secret_key():
    env_secret = os.environ.get("FLASK_SECRET_KEY")
    if env_secret:
        return env_secret

    secret_path = os.path.join(app.instance_path, "secret_key")
    if os.path.exists(secret_path):
        with open(secret_path, "r", encoding="utf-8") as secret_file:
            return secret_file.read().strip()

    secret_key = secrets.token_hex(32)
    fd = os.open(secret_path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as secret_file:
        secret_file.write(secret_key)
    return secret_key


def load_mistral_api_key():
    env_key = os.environ.get("MISTRAL_API_KEY")
    if env_key:
        return env_key.strip()

    key_path = os.path.join(app.instance_path, "mistral_api_key")
    if os.path.exists(key_path):
        with open(key_path, "r", encoding="utf-8") as key_file:
            return key_file.read().strip()

    return None


def update_analysis_progress(user_id, stage, progress=None):
    if not user_id:
        return
    with analysis_progress_lock:
        analysis_progress[user_id] = {
            'stage': stage,
            'progress': progress,
            'timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
        }


def get_analysis_progress_for_user(user_id):
    if not user_id:
        return {'stage': 'idle', 'progress': 0, 'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'}
    with analysis_progress_lock:
        # Clean stale entries older than 5 minutes
        cutoff = (datetime.datetime.utcnow() - datetime.timedelta(minutes=5)).isoformat() + 'Z'
        stale_keys = [k for k, v in analysis_progress.items()
                      if v.get('timestamp', '') < cutoff]
        for k in stale_keys:
            del analysis_progress[k]
        return analysis_progress.get(user_id, {'stage': 'idle', 'progress': 0, 'timestamp': datetime.datetime.utcnow().isoformat() + 'Z'})


def clear_analysis_progress(user_id):
    if not user_id:
        return
    with analysis_progress_lock:
        analysis_progress.pop(user_id, None)


def set_current_user_progress(stage, progress=None, user_id=None):
    uid = user_id
    if uid is None and has_request_context() and getattr(current_user, 'is_authenticated', False):
        uid = current_user.id
    if uid:
        update_analysis_progress(uid, stage, progress)



app.config['SECRET_KEY'] = load_or_create_secret_key()
app.config['UPLOAD_FOLDER'] = os.path.join(BASE_DIR, 'uploads')
app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(app.instance_path, 'clonedetector.db')}"
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['MAX_CONTENT_LENGTH'] = MAX_ANALYSIS_REQUEST_BYTES
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.environ.get('FLASK_ENV') == 'production'
app.config['PERMANENT_SESSION_LIFETIME'] = datetime.timedelta(hours=12)

db = SQLAlchemy(app)
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

login_manager = LoginManager(app)
login_manager.login_view = 'login'

limiter = Limiter(
    app=app,
    key_func=get_remote_address,
    default_limits=[],
    storage_uri="memory://",
)


@app.after_request
def set_security_headers(response):
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['X-XSS-Protection'] = '1; mode=block'
    response.headers['Permissions-Policy'] = 'camera=(), microphone=(), geolocation=()'
    return response


MISTRAL_API_KEY = load_mistral_api_key()
MISTRAL_MODEL = os.environ.get('MISTRAL_MODEL', 'mistral-small-latest')
mistral_client = None
mistral_backend = None
mistral_client_init_error = None


def create_mistral_client(api_key):
    if Mistral is None:
        raise ImportError(f'Mistral SDK import failed: {MISTRAL_SDK_IMPORT_ERROR}')

    signature = inspect.signature(Mistral)
    constructor_parameters = signature.parameters
    base_kwargs = {'api_key': api_key}

    if 'timeout_ms' in constructor_parameters:
        base_kwargs['timeout_ms'] = 60000
    elif 'timeout' in constructor_parameters:
        base_kwargs['timeout'] = 60

    return Mistral(**base_kwargs)

if MISTRAL_API_KEY:
    try:
        mistral_client = create_mistral_client(MISTRAL_API_KEY)
        mistral_backend = 'mistral'
        mistral_client_init_error = None
    except Exception as exc:
        mistral_client = None
        mistral_backend = None
        mistral_client_init_error = str(exc)
        app.logger.warning('Failed to initialize Mistral client: %s', mistral_client_init_error)

# Database Models
class User(UserMixin, db.Model):
    """User model for authentication."""
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(80), unique=True, nullable=False)
    password_hash = db.Column(db.String(128), nullable=False)
    is_admin = db.Column(db.Boolean, nullable=False, default=False)
    analyses = db.relationship('Analysis', backref='user', lazy=True)

    def set_password(self, password):
        """Set password hash."""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Check password against hash."""
        return check_password_hash(self.password_hash, password)

class Analysis(db.Model):
    """Analysis model for storing analysis results."""
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    operation = db.Column(db.String(80), nullable=False)
    result = db.Column(db.String(20), nullable=False)
    language = db.Column(db.String(30), nullable=False)
    similarity = db.Column(db.Float, nullable=True)
    code1 = db.Column(db.Text, nullable=False)
    code2 = db.Column(db.Text, nullable=False)
    metrics = db.Column(db.Text, nullable=True)  # Stored as JSON
    analysis_text = db.Column(db.Text, nullable=True)
    snapshot_json = db.Column(db.Text, nullable=True)
    date_created = db.Column(db.DateTime(timezone=True), server_default=func.now())

@login_manager.user_loader
def load_user(user_id):
    """Load user by user_id."""
    try:
        return db.session.get(User, int(user_id))
    except (ValueError, TypeError):
        return None


@login_manager.unauthorized_handler
def handle_unauthorized():
    accepts_json = 'application/json' in (request.headers.get('Accept', '') or '')
    wants_json = request.path.startswith('/api/') or request.is_json or accepts_json
    if wants_json:
        return jsonify({'authenticated': False, 'message': 'Authentication required.'}), 401
    return redirect(url_for('login'))


def frontend_build_available():
    return os.path.exists(FRONTEND_INDEX_PATH)


def serve_frontend_app():
    if frontend_build_available():
        return send_from_directory(FRONTEND_DIST_DIR, 'index.html')

    if current_user.is_authenticated:
        latest_analysis = Analysis.query.filter_by(user_id=current_user.id).order_by(Analysis.date_created.desc()).first()
        return render_template(
            'home.html',
            total_analyses=Analysis.query.count(),
            languages_supported=len(clone_detectors),
            latest_analysis_id=latest_analysis.id if latest_analysis else None,
        )

    return render_template('login.html')


def serialize_user(user):
    if not user:
        return None
    return {
        'id': user.id,
        'username': user.username,
        'is_admin': bool(user.is_admin),
    }


def derive_source_label(code, fallback):
    for line in (code or '').splitlines():
        cleaned = re.sub(r'\s+', ' ', line.strip())
        if cleaned:
            return cleaned[:72]
    return fallback


_UNSAFE_URL_RE = re.compile(
    r'(href|src)\s*=\s*["\']?\s*(javascript|data|vbscript)\s*:[^"\'>]*["\']?',
    re.IGNORECASE,
)


def render_analysis_markdown(text):
    if not text:
        return ''

    html = markdown2.markdown(
        text,
        safe_mode='escape',
        extras=['fenced-code-blocks', 'tables', 'code-friendly', 'break-on-newline', 'cuddled-lists'],
    )
    # Strip dangerous URL protocols that markdown may generate from link targets
    html = _UNSAFE_URL_RE.sub(r'\1="#"', html)
    return html


def json_dumps_compact(payload):
    return json.dumps(payload, ensure_ascii=False, separators=(',', ':'))


def json_loads_safe(raw_value, fallback):
    if raw_value in (None, ''):
        return fallback

    try:
        parsed = json.loads(raw_value)
    except (TypeError, ValueError, json.JSONDecodeError):
        return fallback

    return parsed if isinstance(parsed, type(fallback)) else fallback


def build_error_response_payload(message, **extra):
    payload = {
        'success': False,
        'message': message,
        'error_message': message,
    }
    payload.update(extra)
    return payload


def ensure_analysis_snapshot_column():
    with db.engine.begin() as connection:
        column_names = {column[1] for column in connection.exec_driver_sql("PRAGMA table_info(analysis)").fetchall()}
        if 'snapshot_json' not in column_names:
            connection.exec_driver_sql("ALTER TABLE analysis ADD COLUMN snapshot_json TEXT")


def ensure_user_is_admin_column():
    with db.engine.begin() as connection:
        column_names = {column[1] for column in connection.exec_driver_sql("PRAGMA table_info(user)").fetchall()}
        if 'is_admin' not in column_names:
            connection.exec_driver_sql("ALTER TABLE user ADD COLUMN is_admin BOOLEAN NOT NULL DEFAULT 0")


def get_csrf_token():
    token = session.get('_csrf_token')
    if not token:
        token = secrets.token_urlsafe(32)
        session['_csrf_token'] = token
    return token


@app.context_processor
def inject_csrf_token():
    return {'csrf_token': get_csrf_token()}


# Endpoints that must be accessible before the user has a CSRF token in their session.
_CSRF_EXEMPT_ENDPOINTS = frozenset({'api_login', 'api_session', 'health_check'})


@app.before_request
def validate_csrf_token():
    if request.method not in {'POST', 'PUT', 'PATCH', 'DELETE'}:
        return None

    # Allow login and session endpoints (unauthenticated users have no CSRF token yet)
    if request.endpoint in _CSRF_EXEMPT_ENDPOINTS:
        return None

    sent_token = (request.headers.get('X-CSRF-Token') or '').strip() or (request.form.get('csrf_token') or '').strip()
    expected_token = (session.get('_csrf_token') or '').strip()

    # Reject if either token is missing — prevents bypass when session has no token
    if not sent_token or not expected_token:
        wants_json = request.is_json or bool(request.headers.get('X-CSRF-Token'))
        if wants_json:
            return jsonify({"success": False, "message": "Missing CSRF token"}), 400
        flash('Invalid request token. Please try again.', 'danger')
        return redirect(request.referrer or url_for('index'))

    if hmac.compare_digest(sent_token, expected_token):
        return None

    wants_json = request.is_json or bool(request.headers.get('X-CSRF-Token'))
    if wants_json:
        return jsonify({"success": False, "message": "Invalid CSRF token"}), 400

    flash('Invalid request token. Please try again.', 'danger')
    return redirect(request.referrer or url_for('index'))


@app.errorhandler(RequestEntityTooLarge)
def handle_request_too_large(_exc):
    limit_mb = MAX_ANALYSIS_REQUEST_BYTES // (1024 * 1024)
    return jsonify({"success": False, "message": f"Upload exceeds the {limit_mb} MB request limit."}), 413


def rotate_legacy_default_admin_password():
    allow_legacy_admin = (os.environ.get('ALLOW_LEGACY_DEFAULT_ADMIN') or '').strip().lower() in {'1', 'true', 'yes'}
    if allow_legacy_admin:
        return

    legacy_admin = User.query.filter_by(username='admin').first()
    if not legacy_admin or not legacy_admin.check_password('admin123'):
        return

    replacement_password = os.environ.get('DEFAULT_ADMIN_PASSWORD') or ''
    if not replacement_password:
        raise RuntimeError(
            'Detected the insecure legacy admin/admin123 credential. Configure a strong DEFAULT_ADMIN_PASSWORD to rotate it safely, '
            'or temporarily set ALLOW_LEGACY_DEFAULT_ADMIN=1 only for a short migration window.'
        )
    if len(replacement_password) < 12 or replacement_password.lower() in INSECURE_DEFAULT_ADMIN_PASSWORDS:
        raise RuntimeError(
            'Refusing to rotate the insecure legacy admin credential to a weak DEFAULT_ADMIN_PASSWORD. '
            'Configure a strong password with at least 12 characters.'
        )

    legacy_admin.set_password(replacement_password)
    db.session.add(legacy_admin)
    db.session.commit()
    app.logger.warning('Rotated the insecure legacy admin password using DEFAULT_ADMIN_PASSWORD.')


def ensure_default_admin():
    if User.query.count() > 0:
        return

    username = (os.environ.get('DEFAULT_ADMIN_USERNAME') or '').strip()
    password = os.environ.get('DEFAULT_ADMIN_PASSWORD') or ''

    if not username or not password:
        app.logger.info('Skipping bootstrap admin creation because DEFAULT_ADMIN_USERNAME and DEFAULT_ADMIN_PASSWORD are not configured.')
        return

    if len(password) < 12 or password.lower() in INSECURE_DEFAULT_ADMIN_PASSWORDS:
        raise RuntimeError(
            'Refusing to create a bootstrap admin with an insecure DEFAULT_ADMIN_PASSWORD. Configure a strong password with at least 12 characters.'
        )

    admin_user = User(username=username, is_admin=True)
    admin_user.set_password(password)
    db.session.add(admin_user)
    db.session.commit()


def initialize_database():
    with app.app_context():
        db.create_all()
        ensure_analysis_snapshot_column()
        ensure_user_is_admin_column()
        rotate_legacy_default_admin_password()
        ensure_default_admin()


# ──────────────────────────────────────────────────────────────────────────────
# In-memory LRU analysis cache
#
# Stores the most recent analysis result and context for up to _MAX_CACHED_USERS
# users. OrderedDict provides O(1) LRU eviction: when the cache exceeds the
# limit, the oldest (least-recently-used) entry is discarded.
#
# Thread safety: all reads/writes are guarded by `results_lock`.
#
# Limitations (single-instance only):
#   - Data is lost on server restart
#   - Not shared across multiple server processes/instances
#   - Memory usage: ~2-5 MB per cached user (code + base64 chart images)
#   - At 200 users: up to ~1 GB worst case
#
# Production upgrade path (Redis):
#   1. pip install redis
#   2. Replace OrderedDict with Redis HASH (HSET/HGET per user)
#   3. Use Redis EXPIRE for automatic TTL (e.g., 1 hour)
#   4. Set maxmemory-policy to allkeys-lru for automatic eviction
#   5. Configure via REDIS_URL environment variable
#   6. This enables multi-instance deployments behind a load balancer
# ──────────────────────────────────────────────────────────────────────────────
_MAX_CACHED_USERS = 200
user_results: OrderedDict = OrderedDict()
user_analysis_contexts: OrderedDict = OrderedDict()
results_lock = threading.Lock()

# Background analysis task tracking
_analysis_tasks: dict[str, dict] = {}
_analysis_tasks_lock = threading.Lock()
_analysis_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="bg-analysis")


def _run_analysis_background(task_id: str, user_id: int, code1: str, code2: str, language: str):
    """Execute analysis in a background thread."""
    try:
        with app.app_context():
            context = build_analysis_context(code1, code2, language, persist_analysis=True, _bg_user_id=user_id)
            with _analysis_tasks_lock:
                _analysis_tasks[task_id] = {
                    'status': 'completed',
                    'result': context,
                    'user_id': user_id,
                    'completed_at': datetime.datetime.utcnow(),
                }
    except Exception as exc:
        app.logger.error("Background analysis failed: %s", exc, exc_info=True)
        with _analysis_tasks_lock:
            _analysis_tasks[task_id] = {
                'status': 'failed',
                'error': 'An error occurred during analysis. Please try again.',
                'user_id': user_id,
                'completed_at': datetime.datetime.utcnow(),
            }
    finally:
        clear_analysis_progress(user_id)


@app.route('/login', methods=['GET'])
def login():
    """React entry point for authentication."""
    return serve_frontend_app()

@app.route('/logout', methods=['POST'])
@login_required
def logout():
    """User logout route — POST only to prevent CSRF-based forced logout."""
    invalidate_cached_analysis_for_user(current_user.id)
    logout_user()
    return redirect(url_for('login'))

@app.route('/account')
@login_required
def account():
    """Legacy account route kept as a redirect to the React history page."""
    return redirect('/history')

@app.route('/delete_analysis/<int:analysis_id>', methods=['POST'])
@limiter.limit("10 per minute")
@login_required
def delete_analysis(analysis_id):
    """Delete a saved analysis."""
    analysis = Analysis.query.filter_by(id=analysis_id, user_id=current_user.id).first()
    
    if analysis:
        db.session.delete(analysis)
        db.session.commit()
        invalidate_cached_analysis_for_user(current_user.id, analysis_id)
        return jsonify({"success": True})

    return jsonify({"success": False, "message": "Analysis not found"}), 404

@app.route('/save_analysis', methods=['POST'])
@login_required
def save_analysis():
    """Save the current analysis to the database using the live analysis context."""
    with results_lock:
        current_context = user_analysis_contexts.get(current_user.id)

    if not current_context:
        return jsonify({"success": False, "message": "No current analysis found"}), 404

    try:
        language = current_context.get('language', 'unknown')
        code1 = current_context.get('code1', '')
        code2 = current_context.get('code2', '')
        similarity_items = current_context.get('similarity_items', [])
        combined_sim = next(
            (item['value'] for item in similarity_items if item.get('name') == 'Combined Similarity'),
            0,
        )
        snapshot_payload = build_analysis_snapshot(current_context)
        analysis = Analysis(
            user_id=current_user.id,
            operation='code clone analysis',
            result='successful',
            language=language,
            code1=code1,
            code2=code2,
            metrics=json_dumps_compact({
                'metrics1': ensure_dict(current_context.get('metrics1')),
                'metrics2': ensure_dict(current_context.get('metrics2')),
            }),
            similarity=round(float(combined_sim), 1),
            analysis_text=current_context.get('analysis_text', ''),
            snapshot_json=json_dumps_compact(snapshot_payload),
        )
        db.session.add(analysis)
        db.session.commit()
        return jsonify({"success": True, "message": "Analysis saved successfully", "id": analysis.id})
    except Exception as exc:
        app.logger.error('Error saving analysis: %s', exc)
        return jsonify({"success": False, "message": "An internal error occurred while saving the analysis."}), 500

def get_overall_similarity(analysis_data):
    """Extract the overall similarity percentage from the analysis data."""
    try:
        similarity_data = analysis_data.get("Similarity Section", [])
        for item in similarity_data:
            if item[0] == "Combined Similarity":
                return round(item[1], 1)
        return 0
    except Exception:
        return 0


def normalize_datetime(value):
    if not value:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.timezone.utc)
    return value


def serialize_history_summary(analysis):
    similarity = round(float(analysis.similarity or 0), 1)
    if similarity >= 80:
        severity = 'high'
    elif similarity >= 50:
        severity = 'moderate'
    else:
        severity = 'low'

    created_at = normalize_datetime(analysis.date_created)
    return {
        'id': analysis.id,
        'operation': analysis.operation,
        'result': analysis.result,
        'language': analysis.language,
        'similarity': similarity,
        'severity': severity,
        'dateCreated': created_at.isoformat() if created_at else None,
        'dateDisplay': analysis.date_created.strftime('%Y-%m-%d %H:%M:%S') if analysis.date_created else '',
        'sourceA': derive_source_label(analysis.code1, 'Source A'),
        'sourceB': derive_source_label(analysis.code2, 'Source B'),
    }


def build_history_stats(analyses):
    items = list(analyses)
    now = datetime.datetime.now(datetime.timezone.utc)
    recent_cutoff = now - datetime.timedelta(days=7)
    return {
        'totalAnalyses': len(items),
        'highSimilarity': sum(1 for analysis in items if (analysis.similarity or 0) >= 80),
        'languagesUsed': len({analysis.language for analysis in items if analysis.language}),
        'last7Days': sum(
            1
            for analysis in items
            if normalize_datetime(analysis.date_created) and normalize_datetime(analysis.date_created) >= recent_cutoff
        ),
    }

class AIAnalyzer:
    def __init__(self):
        self.tokenizer = AutoTokenizer.from_pretrained("microsoft/graphcodebert-base")
        self.model = AutoModel.from_pretrained("microsoft/graphcodebert-base", add_pooling_layer=False)

    def get_embedding(self, code):
        inputs = self.tokenizer(
            code, return_tensors='pt', truncation=True, padding='max_length', max_length=512
        )
        with torch.no_grad():
            outputs = self.model(**inputs)
        embedding = outputs.last_hidden_state.mean(dim=1).squeeze().numpy()
        return embedding

    def cosine_similarity(self, vec1, vec2):
        norm_product = np.linalg.norm(vec1) * np.linalg.norm(vec2)
        if norm_product == 0.0:
            return 0.0
        similarity = np.dot(vec1, vec2) / norm_product
        return float(np.clip(similarity, 0.0, 1.0))

    def analyze_similarity(self, code1, code2):
        emb1 = self.get_embedding(code1)
        emb2 = self.get_embedding(code2)
        similarity = self.cosine_similarity(emb1, emb2)
        return similarity

ai_analyzer = None
ai_analyzer_lock = threading.Lock()


def get_ai_analyzer():
    global ai_analyzer
    if ai_analyzer is None:
        with ai_analyzer_lock:
            if ai_analyzer is None:
                ai_analyzer = AIAnalyzer()
    return ai_analyzer

class CloneDetector:
    """Class for detecting code clones."""

    _LANGUAGE_KEYWORDS = {
        'python': {
            'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await',
            'break', 'class', 'continue', 'def', 'del', 'elif', 'else', 'except',
            'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is',
            'lambda', 'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try',
            'while', 'with', 'yield',
        },
        'java': {
            'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch',
            'char', 'class', 'const', 'continue', 'default', 'do', 'double',
            'else', 'enum', 'extends', 'final', 'finally', 'float', 'for', 'goto',
            'if', 'implements', 'import', 'instanceof', 'int', 'interface', 'long',
            'native', 'new', 'package', 'private', 'protected', 'public', 'return',
            'short', 'static', 'strictfp', 'super', 'switch', 'synchronized',
            'this', 'throw', 'throws', 'transient', 'try', 'void', 'volatile', 'while',
        },
        'javascript': {
            'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
            'default', 'delete', 'do', 'else', 'export', 'extends', 'false',
            'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
            'let', 'new', 'null', 'return', 'static', 'super', 'switch', 'this',
            'throw', 'true', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
        },
        'typescript': {
            'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
            'default', 'delete', 'do', 'else', 'enum', 'export', 'extends', 'false',
            'finally', 'for', 'function', 'if', 'import', 'in', 'instanceof',
            'interface', 'let', 'new', 'null', 'return', 'static', 'super', 'switch',
            'this', 'throw', 'true', 'try', 'type', 'typeof', 'var', 'void',
            'while', 'with', 'yield',
        },
        'c': {
            'auto', 'break', 'case', 'char', 'const', 'continue', 'default', 'do',
            'double', 'else', 'enum', 'extern', 'float', 'for', 'goto', 'if',
            'include', 'inline', 'int', 'long', 'register', 'restrict', 'return',
            'short', 'signed', 'sizeof', 'static', 'struct', 'switch', 'typedef',
            'union', 'unsigned', 'void', 'volatile', 'while',
        },
        'go': {
            'break', 'case', 'chan', 'const', 'continue', 'default', 'defer', 'else',
            'fallthrough', 'for', 'func', 'go', 'goto', 'if', 'import', 'interface',
            'map', 'package', 'range', 'return', 'select', 'struct', 'switch',
            'type', 'var',
        },
        'rust': {
            'as', 'break', 'const', 'continue', 'crate', 'else', 'enum', 'extern',
            'false', 'fn', 'for', 'if', 'impl', 'in', 'let', 'loop', 'match', 'mod',
            'move', 'mut', 'pub', 'ref', 'return', 'self', 'Self', 'static', 'struct',
            'super', 'trait', 'true', 'type', 'unsafe', 'use', 'where', 'while',
        },
        'kotlin': {
            'as', 'break', 'class', 'continue', 'do', 'else', 'false', 'for', 'fun',
            'if', 'in', 'interface', 'is', 'null', 'object', 'package', 'return',
            'super', 'this', 'throw', 'true', 'try', 'typealias', 'typeof', 'val',
            'var', 'when', 'while',
        },
        'ruby': {
            '__ENCODING__', '__LINE__', '__FILE__', 'BEGIN', 'END', 'alias', 'and',
            'begin', 'break', 'case', 'class', 'def', 'defined', 'do', 'else', 'elsif',
            'end', 'ensure', 'false', 'for', 'if', 'in', 'module', 'next', 'nil', 'not',
            'or', 'redo', 'rescue', 'retry', 'return', 'self', 'super', 'then', 'true',
            'undef', 'unless', 'until', 'when', 'while', 'yield',
        },
        'php': {
            'abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch',
            'class', 'clone', 'const', 'continue', 'declare', 'default', 'die', 'do',
            'echo', 'else', 'elseif', 'empty', 'enddeclare', 'endfor', 'endforeach',
            'endif', 'endswitch', 'endwhile', 'eval', 'exit', 'extends', 'final',
            'finally', 'fn', 'for', 'foreach', 'function', 'global', 'goto', 'if',
            'implements', 'include', 'include_once', 'instanceof', 'insteadof',
            'interface', 'isset', 'list', 'match', 'namespace', 'new', 'or', 'print',
            'private', 'protected', 'public', 'readonly', 'require', 'require_once',
            'return', 'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use',
            'var', 'while', 'xor', 'yield',
        },
    }
    _DEFAULT_KEYWORDS = {
        'if', 'else', 'for', 'while', 'return', 'int', 'float', 'double',
        'char', 'void', 'include', 'break', 'continue', 'class', 'new',
        'true', 'false', 'null', 'this',
    }

    def __init__(self, language):
        """Initialize CloneDetector with parser for the given language."""
        self.language = language
        self.parser = get_parser(language)

    def parse_code(self, code, with_order=False):
        """Parse code into tokens."""
        tree = self.parser.parse(bytes(code, "utf8"))
        root_node = tree.root_node
        tokens = []

        def traverse(node):
            if node.child_count == 0:
                tokens.append(node.type)
            for child in node.children:
                traverse(child)

        traverse(root_node)
        if with_order:
            return tokens
        tokens.sort()
        return tokens

    def remove_comments_and_whitespace(self, code):
        """Remove comments and whitespace from code."""
        tree = self.parser.parse(bytes(code, "utf8"))
        root_node = tree.root_node

        def extract_text(node):
            if node.type in ('comment', 'whitespace'):
                return ''
            if node.child_count == 0:
                return node.text.decode('utf8')
            return ''.join([extract_text(child) for child in node.children])

        return extract_text(root_node)

    def text_similarity(self, code1, code2):
        """Compute text similarity between two code snippets."""
        return fuzz.ratio(code1, code2) / 100

    def token_similarity(self, code1, code2, with_order=False):
        """Compute token similarity between two code snippets."""
        tokens1 = self.parse_code(code1, with_order)
        tokens2 = self.parse_code(code2, with_order)
        return fuzz.ratio(' '.join(tokens1), ' '.join(tokens2)) / 100

    def is_exact_clone(self, code1, code2):
        """Check if two code snippets are exact clones."""
        return code1.strip() == code2.strip()

    def renamed_clone_similarity(self, code1, code2):
        """Compute similarity for renamed clones."""
        keywords = self._LANGUAGE_KEYWORDS.get(self.language, self._DEFAULT_KEYWORDS)

        def extract_identifiers(code):
            identifiers = re.findall(r'\b[a-zA-Z_][a-zA-Z0-9_]*\b', code)
            return {ident for ident in identifiers if ident not in keywords}
        ids1 = extract_identifiers(code1)
        ids2 = extract_identifiers(code2)
        return len(ids1 & ids2) / len(ids1 | ids2) if (ids1 | ids2) else 0

    def near_miss_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for near miss clones."""
        text_sim = self.text_similarity(code1, code2)
        token_sim = self.token_similarity(code1, code2)
        token_sim_without_comments = self.token_similarity(
            self.remove_comments_and_whitespace(code1),
            self.remove_comments_and_whitespace(code2)
        )
        return text_sim > threshold or token_sim > threshold or token_sim_without_comments > threshold

    def parameterized_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for parameterized clones."""
        return self.near_miss_clone_similarity(code1, code2, threshold)

    def function_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for function clones."""
        return self.near_miss_clone_similarity(code1, code2, threshold)

    def non_contiguous_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for non-contiguous clones."""
        token_sim_without_order = self.token_similarity(code1, code2, with_order=False)
        token_sim_with_order = self.token_similarity(code1, code2, with_order=True)
        return token_sim_without_order > threshold or token_sim_with_order > threshold

    def structural_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for structural clones."""
        return self.token_similarity(code1, code2, with_order=True) > threshold

    def reordered_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for reordered clones."""
        return self.token_similarity(code1, code2, with_order=False) > threshold

    def function_reordered_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for function reordered clones."""
        return self.reordered_clone_similarity(code1, code2, threshold)

    def gapped_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for gapped clones."""
        tokens1 = self.parse_code(code1)
        tokens2 = self.parse_code(code2)
        match_ratio = fuzz.ratio(' '.join(tokens1), ' '.join(tokens2)) / 100
        return match_ratio > threshold

    def intertwined_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for intertwined clones."""
        tokens1 = self.parse_code(code1)
        tokens2 = self.parse_code(code2)
        match_ratio = fuzz.partial_ratio(' '.join(tokens1), ' '.join(tokens2)) / 100
        return match_ratio > threshold

    def semantic_clone_similarity(self, code1, code2, threshold=0.8):
        """Check for semantic clones."""
        text_sim = self.text_similarity(code1, code2)
        token_sim = self.token_similarity(code1, code2)
        return (text_sim + token_sim) / 2 > threshold

    def code_to_graph(self, code):
        """Convert code to a graph representation."""
        tree = self.parser.parse(bytes(code, "utf8"))
        root_node = tree.root_node
        graph = nx.DiGraph()

        def add_nodes(node, parent=None):
            graph.add_node(
                node.id, type=node.type, start=node.start_point, end=node.end_point
            )
            if parent:
                graph.add_edge(parent.id, node.id)
            for child in node.children:
                add_nodes(child, node)

        add_nodes(root_node)
        return graph

    def calculate_graph_metrics(self, graph):
        """Calculate graph metrics."""
        num_nodes = graph.number_of_nodes()
        num_edges = graph.number_of_edges()
        if num_nodes == 0:
            return 0, 0, 0
        avg_degree = sum(dict(graph.degree()).values()) / num_nodes
        return num_nodes, num_edges, avg_degree

    def graph_similarity(self, code1, code2):
        """Compute graph similarity between two code snippets."""
        graph1 = self.code_to_graph(code1)
        graph2 = self.code_to_graph(code2)
        metrics1 = self.calculate_graph_metrics(graph1)
        metrics2 = self.calculate_graph_metrics(graph2)
        max_nodes = max(metrics1[0], metrics2[0])
        node_sim = 1.0 if max_nodes == 0 else 1 - abs(metrics1[0] - metrics2[0]) / max_nodes
        max_edges = max(metrics1[1], metrics2[1])
        edge_sim = 1.0 if max_edges == 0 else 1 - abs(metrics1[1] - metrics2[1]) / max_edges
        max_degree = max(metrics1[2], metrics2[2])
        degree_sim = 1.0 if max_degree == 0 else 1 - abs(metrics1[2] - metrics2[2]) / max_degree
        return (node_sim + edge_sim + degree_sim) / 3

    def combined_similarity(self, code1, code2):
        """Compute combined similarity."""
        text_sim = self.text_similarity(code1, code2)
        token_sim = self.token_similarity(code1, code2)
        graph_sim = self.graph_similarity(code1, code2)
        return (text_sim + token_sim + graph_sim) / 3

    def calculate_raw_metrics(self, code):
        """Calculate raw metrics of code."""
        raw_metrics = analyze(code)
        return {
            'loc': raw_metrics.loc,
            'lloc': raw_metrics.lloc,
            'sloc': raw_metrics.sloc,
            'comments': raw_metrics.comments,
            'multi': raw_metrics.multi,
            'blank': raw_metrics.blank,
        }

    def calculate_halstead_metrics(self, code):
        """Calculate Halstead metrics."""
        halstead_metrics = h_visit(code)
        if halstead_metrics:
            return halstead_metrics[0]._asdict()
        return {}

    def calculate_cyclomatic_complexity(self, code):
        """Calculate cyclomatic complexity."""
        complexity = cc_visit(code)
        if complexity:
            return sum([block.complexity for block in complexity]) / len(complexity)
        return 0

    def calculate_maintainability_index(self, code):
        """Calculate maintainability index."""
        return mi_visit(code, True)

    def _universal_metrics(self, code):
        """Extract language-agnostic metrics from source code using tree-sitter."""
        lines = code.splitlines()
        loc = len(lines)
        blank = sum(1 for l in lines if not l.strip())
        comment_prefixes = ('//', '#', '--', ';', '%')
        comment_lines = sum(1 for l in lines if l.strip().startswith(comment_prefixes))
        sloc = loc - blank - comment_lines

        # Token-based metrics from the existing tokenizer
        try:
            tokens = self.parse_code(code, with_order=True)
            token_count = len(tokens)
            unique_tokens = len(set(tokens))
            token_density = round(token_count / max(sloc, 1), 2)
        except Exception:
            token_count = unique_tokens = 0
            token_density = 0.0

        # Nesting depth via AST
        max_nesting = 0
        function_count = 0
        class_count = 0
        try:
            tree = self.parser.parse(bytes(code, 'utf-8'))
            nesting_types = {
                'block', 'function_body', 'compound_statement', 'body',
                'statement_block', 'do_block', 'class_body',
            }
            function_types = {
                'function_definition', 'function_declaration', 'method_definition',
                'method_declaration', 'arrow_function', 'function_item',
                'def', 'fun_declaration',
            }
            class_types = {
                'class_definition', 'class_declaration', 'class_body',
                'struct_item', 'impl_item',
            }

            def walk(node, depth):
                nonlocal max_nesting, function_count, class_count
                if node.type in nesting_types:
                    depth += 1
                    max_nesting = max(max_nesting, depth)
                if node.type in function_types:
                    function_count += 1
                if node.type in class_types:
                    class_count += 1
                for child in node.children:
                    walk(child, depth)

            walk(tree.root_node, 0)
        except Exception:
            pass

        avg_line_length = round(
            sum(len(l) for l in lines if l.strip()) / max(sloc, 1), 1
        )

        return {
            'loc': loc,
            'sloc': sloc,
            'blank_lines': blank,
            'comment_lines': comment_lines,
            'token_count': token_count,
            'unique_tokens': unique_tokens,
            'token_density': token_density,
            'max_nesting_depth': max_nesting,
            'function_count': function_count,
            'class_count': class_count,
            'avg_line_length': avg_line_length,
        }

    def get_metrics(self, code, language):
        """Get code metrics."""
        universal = self._universal_metrics(code)

        if language != 'python':
            return {
                'universal': universal,
                'raw': None,
                'halstead': None,
                'cyclomatic_complexity': None,
                'maintainability_index': None,
            }

        raw_metrics = self.calculate_raw_metrics(code)
        halstead_metrics = self.calculate_halstead_metrics(code)
        cyclomatic_complexity = self.calculate_cyclomatic_complexity(code)
        maintainability_index = self.calculate_maintainability_index(code)

        return {
            'universal': universal,
            'raw': raw_metrics,
            'halstead': halstead_metrics,
            'cyclomatic_complexity': cyclomatic_complexity,
            'maintainability_index': maintainability_index,
        }

    def ai_based_similarity(self, code1, code2):
        """Compute AI-based similarity."""
        try:
            return get_ai_analyzer().analyze_similarity(code1, code2)
        except Exception:
            return 0.0

class CodeSmellAnalyzer:

    @staticmethod
    def python_code_smell_analysis(code1, file1, code2, file2):
        def analyze_code(code, file):
            if not code and not file:
                return 'Please provide code or upload a file.'

            temp_file_path = None
            try:
                if code:
                    code = code.replace('\r\n', '\n').replace('\r', '\n')
                    with NamedTemporaryFile(delete=False, suffix=".py", mode='w', encoding='utf-8') as temp_file:
                        temp_file.write(code)
                        temp_file_path = temp_file.name
                elif file:
                    file_content = file.read().decode('utf-8').replace('\r\n', '\n').replace('\r', '\n')
                    with NamedTemporaryFile(delete=False, suffix='.py', mode='w', encoding='utf-8') as tmp:
                        tmp.write(file_content)
                        temp_file_path = tmp.name

                try:
                    pylint_json_command = ['pylint', temp_file_path, '--output-format=json']
                    pylint_text_command = ['pylint', temp_file_path, '--output-format=text']
                    try:
                        process_json = subprocess.run(
                            pylint_json_command,
                            shell=False,
                            capture_output=True,
                            text=True,
                            encoding='utf-8',
                            timeout=30,
                        )
                        process_text = subprocess.run(
                            pylint_text_command,
                            shell=False,
                            capture_output=True,
                            text=True,
                            encoding='utf-8',
                            timeout=30,
                        )
                    except FileNotFoundError:
                        return 'Unable to generate quality report because pylint is not installed on the server.'
                    except subprocess.TimeoutExpired:
                        return 'Quality analysis timed out while running pylint.'

                    result_lines = []
                    json_stdout = (process_json.stdout or '').strip()
                    if json_stdout:
                        try:
                            parsed_messages = json.loads(json_stdout)
                        except json.JSONDecodeError:
                            parsed_messages = None
                        if isinstance(parsed_messages, list):
                            for message in parsed_messages:
                                if not isinstance(message, dict):
                                    continue
                                message_type = str(message.get('type') or 'info').capitalize()
                                symbol = str(message.get('symbol') or 'unknown')
                                text = str(message.get('message') or 'No message provided')
                                line = message.get('line')
                                column = message.get('column')
                                location = []
                                if line is not None:
                                    location.append(f'Line {line}')
                                if column is not None:
                                    location.append(f'Column {column}')
                                location_suffix = f" ({', '.join(location)})" if location else ''
                                result_lines.append(f'{message_type} [{symbol}]: {text}{location_suffix}')

                    rating_line = ''
                    for line in reversed((process_text.stdout or '').splitlines()):
                        if 'Your code has been rated at' in line:
                            rating_line = line.strip()
                            break

                    stderr_output = '\n'.join(
                        part.strip()
                        for part in [process_json.stderr or '', process_text.stderr or '']
                        if part and part.strip()
                    )

                    if not result_lines:
                        if stderr_output:
                            result_lines.append(f'Pylint did not return structured issue data. Details: {stderr_output}')
                        elif process_json.returncode == 0:
                            result_lines.append('No pylint issues were reported.')
                        else:
                            result_lines.append('Pylint completed without structured issue output.')

                    if rating_line:
                        result_lines.extend(['', rating_line])

                    return '\n'.join(result_lines).strip()
                finally:
                    if temp_file_path and os.path.exists(temp_file_path):
                        os.remove(temp_file_path)

            except Exception as e:
                app.logger.error("Unable to generate quality report: %s", e, exc_info=True)
                return 'Unable to generate quality report.'

        result_code1 = analyze_code(code1, file1)
        result_code2 = analyze_code(code2, file2)

        return {
            "code1_analysis": result_code1,
            "code2_analysis": result_code2
        }


def create_similarity_chart(values_list):
    """Create a similarity chart."""
    labels = [item[0] for item in values_list]
    values = [item[1] for item in values_list]

    fig, ax = plt.subplots(figsize=(10, 6))
    try:
        bars = ax.barh(labels, values, color='purple')
        ax.set_xlabel('Similarity Ratio')
        ax.set_title('Code Similarity Metrics')
        fig.subplots_adjust(left=0.3)

        for label in ax.get_yticklabels():
            label.set_fontsize(10)

        for bar in bars:
            width = bar.get_width()
            ax.text(
                width, bar.get_y() + bar.get_height() / 2,
                f'{width:.2f}%', ha='left', va='center'
            )

        buf = io.BytesIO()
        fig.savefig(buf, format='png')
        buf.seek(0)
        return buf
    finally:
        plt.close(fig)

_ZIP_MAX_UNCOMPRESSED_BYTES = 25 * 1024 * 1024  # 25 MB per member
_ZIP_MAX_TOTAL_BYTES = 50 * 1024 * 1024          # 50 MB total across all members
_ZIP_MAX_FILE_COUNT = 200


def get_uploaded_stream(uploaded_file):
    return getattr(uploaded_file, 'stream', uploaded_file)


def rewind_uploaded_stream(uploaded_file):
    stream = get_uploaded_stream(uploaded_file)
    try:
        stream.seek(0)
    except (AttributeError, OSError, ValueError):
        pass
    return stream


def uploaded_file_size(uploaded_file):
    stream = get_uploaded_stream(uploaded_file)
    fallback_size = getattr(uploaded_file, 'content_length', None)
    try:
        current_position = stream.tell()
    except (AttributeError, OSError, ValueError):
        current_position = None
    try:
        stream.seek(0, os.SEEK_END)
        size = stream.tell()
    except (AttributeError, OSError, ValueError):
        size = fallback_size
    finally:
        try:
            if current_position is not None:
                stream.seek(current_position)
            else:
                stream.seek(0)
        except (AttributeError, OSError, ValueError):
            pass
    return int(size or 0)


def ensure_uploaded_file_within_limit(uploaded_file, max_bytes, label):
    size_bytes = uploaded_file_size(uploaded_file)
    if size_bytes and size_bytes > max_bytes:
        max_mb = max_bytes / (1024 * 1024)
        raise ValueError(f'{label} exceeds the {max_mb:.0f} MB upload limit.')


def ensure_zip_like_upload_within_limit(uploaded_file, max_total_bytes, label):
    stream = rewind_uploaded_stream(uploaded_file)
    if not zipfile.is_zipfile(stream):
        rewind_uploaded_stream(uploaded_file)
        return
    rewind_uploaded_stream(uploaded_file)
    total_bytes = 0
    with zipfile.ZipFile(stream, 'r') as zip_ref:
        for member in zip_ref.infolist():
            total_bytes += member.file_size
            if total_bytes > max_total_bytes:
                max_mb = max_total_bytes / (1024 * 1024)
                raise ValueError(f'{label} expands beyond the {max_mb:.0f} MB processing limit.')
    rewind_uploaded_stream(uploaded_file)


def extract_zip(zip_file):
    """Extract files from a ZIP archive, guarded against Zip Slip and zip bombs.

    All files are extracted into a per-request temporary directory, read into
    memory, and then removed automatically before returning.
    """
    extracted_files = []
    zip_stream = rewind_uploaded_stream(zip_file)

    with TemporaryDirectory(prefix='zip_extract_', dir=app.config['UPLOAD_FOLDER']) as extract_to:
        real_extract_to = os.path.realpath(extract_to)
        with zipfile.ZipFile(zip_stream, 'r') as zip_ref:
            members = zip_ref.infolist()
            if len(members) > _ZIP_MAX_FILE_COUNT:
                raise ValueError(f'ZIP archive contains too many files ({len(members)} > {_ZIP_MAX_FILE_COUNT}).')
            total_bytes = 0
            for member in members:
                if member.file_size > _ZIP_MAX_UNCOMPRESSED_BYTES:
                    raise ValueError(f'ZIP member {member.filename!r} exceeds the per-file size limit.')
                total_bytes += member.file_size
                if total_bytes > _ZIP_MAX_TOTAL_BYTES:
                    raise ValueError('ZIP archive total uncompressed size exceeds the allowed limit.')
                member_path = os.path.realpath(os.path.join(extract_to, member.filename))
                try:
                    is_within_extract_dir = os.path.commonpath([real_extract_to, member_path]) == real_extract_to
                except ValueError:
                    is_within_extract_dir = False
                if not is_within_extract_dir:
                    raise ValueError(f'Zip Slip detected: {member.filename}')
                zip_ref.extract(member, extract_to)
            for file_name in zip_ref.namelist():
                full_path = os.path.join(extract_to, file_name)
                if not os.path.isfile(full_path):
                    continue
                with open(full_path, 'r', encoding='utf-8', errors='replace') as file:
                    extracted_files.append(file.read())
    return extracted_files


def read_spreadsheet_code(excel_file, excel_row=None):
    ensure_uploaded_file_within_limit(excel_file, MAX_SPREADSHEET_UPLOAD_BYTES, 'Spreadsheet upload')
    ensure_zip_like_upload_within_limit(excel_file, MAX_SPREADSHEET_ARCHIVE_BYTES, 'Spreadsheet upload')
    row_number = 1
    if excel_row not in (None, ''):
        try:
            row_number = int(excel_row)
        except (TypeError, ValueError) as exc:
            raise ValueError('Spreadsheet row must be a whole number.') from exc

    if row_number < 1:
        raise ValueError('Spreadsheet row numbers start at 1.')

    spreadsheet_stream = rewind_uploaded_stream(excel_file)
    filename = (getattr(excel_file, 'filename', '') or '').lower()
    extension = os.path.splitext(filename)[1]

    try:
        if extension == '.csv':
            dataframe = pd.read_csv(spreadsheet_stream, dtype=str)
        else:
            dataframe = pd.read_excel(spreadsheet_stream, dtype=str)
    except Exception as exc:
        raise ValueError("Error processing spreadsheet file. Ensure the file is a valid CSV or Excel document.") from exc

    if dataframe.empty or dataframe.shape[1] == 0:
        raise ValueError('Spreadsheet file does not contain any readable rows or columns.')

    if row_number > len(dataframe.index):
        raise ValueError(
            f'Spreadsheet row {row_number} is out of range. The file contains {len(dataframe.index)} data rows.'
        )

    value = dataframe.iloc[row_number - 1, 0]
    if pd.isna(value):
        raise ValueError(f'Spreadsheet row {row_number} does not contain code in the first column.')

    return str(value)

languages = [
    'python', 'c', 'java', 'javascript', 'ruby', 'go',
    'typescript', 'php', 'kotlin', 'r', 'rust',
    'scala', 'elixir', 'haskell', 'perl'
]

clone_detectors = {language: CloneDetector(language) for language in languages}

def analyze_code_pairs(detector, code_pairs):
    """Analyze pairs of code snippets."""
    results = []
    with ThreadPoolExecutor() as executor:
        future_to_pair = {
            executor.submit(analyze_similarities, detector, code1, code2): (code1, code2)
            for code1, code2 in code_pairs
        }
        for future in as_completed(future_to_pair):
            code1, code2 = future_to_pair[future]
            try:
                similarity = future.result()
                results.append((code1, code2, similarity))
            except Exception as e:
                results.append((code1, code2, str(e)))
    return results

def analyze_similarities(detector, code1, code2, clean_code1=None, clean_code2=None, _bg_user_id=None):
    """Analyze similarities between two code snippets."""
    set_current_user_progress('Similarity analysis: preprocessing', 5, user_id=_bg_user_id)

    try:
        if clean_code1 is None:
            clean_code1 = detector.remove_comments_and_whitespace(code1)
        if clean_code2 is None:
            clean_code2 = detector.remove_comments_and_whitespace(code2)

        set_current_user_progress('Similarity analysis: computing base similarity scores', 20, user_id=_bg_user_id)
        text_sim = detector.text_similarity(code1, code2)
        token_sim = detector.token_similarity(code1, code2)
        token_sim_without_comments = detector.token_similarity(clean_code1, clean_code2)
        token_sim_with_order = detector.token_similarity(code1, code2, with_order=True)
        token_sim_with_order_without_comments = detector.token_similarity(
            clean_code1, clean_code2, with_order=True
        )
        exact_clone_result = detector.is_exact_clone(code1, code2)
        renamed_clone_sim = detector.renamed_clone_similarity(code1, code2)
        near_miss_clone_result = detector.near_miss_clone_similarity(code1, code2)
        parameterized_clone_result = detector.parameterized_clone_similarity(code1, code2)
        function_clone_result = detector.function_clone_similarity(code1, code2)
        non_contiguous_clone_result = detector.non_contiguous_clone_similarity(code1, code2)
        structural_clone_result = detector.structural_clone_similarity(code1, code2)
        reordered_clone_result = detector.reordered_clone_similarity(code1, code2)
        function_reordered_clone_result = detector.function_reordered_clone_similarity(code1, code2)
        gapped_clone_result = detector.gapped_clone_similarity(code1, code2)
        intertwined_clone_result = detector.intertwined_clone_similarity(code1, code2)

        set_current_user_progress('Similarity analysis: advanced clone metrics', 60, user_id=_bg_user_id)
        semantic_clone_result = detector.semantic_clone_similarity(code1, code2)
        graph_sim = detector.graph_similarity(code1, code2)

        set_current_user_progress('Similarity analysis: combining metrics', 75, user_id=_bg_user_id)
        combined_similarity = detector.combined_similarity(code1, code2)

        set_current_user_progress('Similarity analysis: AI similarity scoring', 85, user_id=_bg_user_id)
        ai_similarity_score = detector.ai_based_similarity(code1, code2)

        set_current_user_progress('Similarity analysis: finished calculations', 90, user_id=_bg_user_id)
        return {
            "text_sim": text_sim,
            "token_sim": token_sim,
            "token_sim_without_comments": token_sim_without_comments,
            "token_sim_with_order": token_sim_with_order,
            "token_sim_with_order_without_comments": token_sim_with_order_without_comments,
            "exact_clone_result": exact_clone_result,
            "renamed_clone_sim": renamed_clone_sim,
            "near_miss_clone_result": near_miss_clone_result,
            "parameterized_clone_result": parameterized_clone_result,
            "function_clone_result": function_clone_result,
            "non_contiguous_clone_result": non_contiguous_clone_result,
            "structural_clone_result": structural_clone_result,
            "reordered_clone_result": reordered_clone_result,
            "function_reordered_clone_result": function_reordered_clone_result,
            "gapped_clone_result": gapped_clone_result,
            "intertwined_clone_result": intertwined_clone_result,
            "semantic_clone_result": semantic_clone_result,
            "graph_sim": graph_sim,
            "combined_similarity": combined_similarity,
            "ai_similarity_score": ai_similarity_score,
        }
    except Exception as exc:
        app.logger.error("Error during similarity analysis: %s", exc, exc_info=True)
        return {"error": "An internal error occurred during similarity analysis."}

_MAX_SINGLE_FILE_BYTES = 5 * 1024 * 1024   # 5 MB
_MAX_PASTE_BYTES = 1 * 1024 * 1024          # 1 MB

def read_uploaded_code(existing_code, uploaded_file=None, uploaded_zip=None, excel_file=None, excel_row=None):
    code = existing_code or ''
    if code and len(code.encode('utf-8', errors='ignore')) > _MAX_PASTE_BYTES:
        max_mb = _MAX_PASTE_BYTES / (1024 * 1024)
        raise ValueError(f'Pasted source code exceeds the {max_mb:.0f} MB input limit.')

    if uploaded_zip and getattr(uploaded_zip, 'filename', ''):
        zip_stream = rewind_uploaded_stream(uploaded_zip)
        if not zipfile.is_zipfile(zip_stream):
            raise ValueError('Uploaded archive must be a valid ZIP file.')
        rewind_uploaded_stream(uploaded_zip)
        code = "\n".join(extract_zip(uploaded_zip))
    elif uploaded_file and uploaded_file.filename:
        ensure_uploaded_file_within_limit(uploaded_file, MAX_SOURCE_UPLOAD_BYTES, 'Source upload')
        file_stream = rewind_uploaded_stream(uploaded_file)
        raw = file_stream.read(_MAX_SINGLE_FILE_BYTES + 1)
        if len(raw) > _MAX_SINGLE_FILE_BYTES:
            max_mb = _MAX_SINGLE_FILE_BYTES / (1024 * 1024)
            raise ValueError(f'Uploaded file exceeds the {max_mb:.0f} MB limit.')
        code = raw.decode('utf-8', errors='replace')
    elif excel_file and getattr(excel_file, 'filename', ''):
        code = read_spreadsheet_code(excel_file, excel_row)

    return code


def extract_mistral_text(response):
    try:
        content = response.choices[0].message.content
    except Exception:
        return ''

    if isinstance(content, str):
        return content.strip()

    if isinstance(content, list):
        text_parts = []
        for item in content:
            if isinstance(item, str):
                text_parts.append(item)
            elif isinstance(item, dict) and item.get('type') == 'text':
                text_parts.append(item.get('text', ''))
            else:
                text_value = getattr(item, 'text', None)
                if text_value:
                    text_parts.append(text_value)
        return '\n'.join(part for part in text_parts if part).strip()

    return str(content).strip()


def get_request_app_language():
    if not has_request_context():
        return 'en'

    explicit_language = (request.headers.get('X-App-Language') or '').strip().lower()
    if explicit_language in {'en', 'ar'}:
        return explicit_language

    accept_language = (request.headers.get('Accept-Language') or '').strip().lower()
    for language_token in accept_language.split(','):
        normalized = language_token.split(';', 1)[0].strip()
        primary = normalized.split('-', 1)[0]
        if primary in {'en', 'ar'}:
            return primary

    return 'en'


def localize_ui_message(english_message, arabic_message):
    return arabic_message if get_request_app_language() == 'ar' else english_message


def get_ai_response_language_name():
    return 'Arabic' if get_request_app_language() == 'ar' else 'English'


def classify_ai_health_error(error_text):
    lowered_error = error_text.lower()
    if '401' in error_text or 'unauthorized' in lowered_error:
        return {
            'status': 'unauthorized',
            'message': localize_ui_message(
                'AI analysis is temporarily unavailable because the configured Mistral key was rejected by the API. Verify the key and try again.',
                'تحليل الذكاء الاصطناعي غير متاح مؤقتًا لأن مفتاح Mistral المهيأ تم رفضه من الواجهة البرمجية. تحقّق من المفتاح ثم أعد المحاولة.',
            ),
        }
    if '429' in error_text or 'rate limit' in lowered_error or 'quota' in lowered_error:
        return {
            'status': 'rate_limited',
            'message': localize_ui_message(
                'AI analysis is temporarily unavailable because the configured Mistral key has reached its current rate or quota limit. Try again later.',
                'تحليل الذكاء الاصطناعي غير متاح مؤقتًا لأن مفتاح Mistral المهيأ بلغ حد المعدل أو الحصة الحالية. حاول مرة أخرى لاحقًا.',
            ),
        }
    return {
        'status': 'error',
        'message': localize_ui_message(
            'AI analysis is temporarily unavailable. Please try again later.',
            'تحليل الذكاء الاصطناعي غير متاح مؤقتًا. يرجى المحاولة مرة أخرى لاحقًا.',
        ),
    }


def check_ai_health(run_live_check=True):
    if not MISTRAL_API_KEY:
        return {
            'provider': 'mistral',
            'model': MISTRAL_MODEL,
            'status': 'not_configured',
            'live_check': False,
            'message': localize_ui_message(
                'MISTRAL_API_KEY is not configured.',
                'المتغير MISTRAL_API_KEY غير مضبوط.',
            ),
        }

    if mistral_backend != 'mistral' or mistral_client is None:
        reason = mistral_client_init_error or (
            f'Mistral SDK import failed via {MISTRAL_SDK_IMPORT_PATH or "unknown import path"}.'
            if MISTRAL_SDK_IMPORT_ERROR
            else 'The Mistral client could not be initialized.'
        )
        return {
            'provider': 'mistral',
            'model': MISTRAL_MODEL,
            'status': 'client_unavailable',
            'live_check': False,
            'message': localize_ui_message(
                f'The Mistral client is unavailable. {reason}',
                f'عميل Mistral غير متاح. {reason}',
            ),
        }

    if not run_live_check:
        return {
            'provider': 'mistral',
            'model': MISTRAL_MODEL,
            'status': 'ready',
            'live_check': False,
            'message': localize_ui_message(
                'The Mistral client is configured and ready for a live check.',
                'عميل Mistral مهيأ وجاهز لاختبار مباشر.',
            ),
        }

    try:
        response = mistral_client.chat.complete(
            model=MISTRAL_MODEL,
            messages=[{'role': 'user', 'content': 'Reply with exactly OK.'}],
        )
        response_text = extract_mistral_text(response)
        return {
            'provider': 'mistral',
            'model': MISTRAL_MODEL,
            'status': 'ok',
            'live_check': True,
            'message': localize_ui_message(
                'The configured Mistral key is valid and the API responded successfully.',
                'مفتاح Mistral المهيأ صالح وقد استجابت الواجهة البرمجية بنجاح.',
            ),
            'sample_response': response_text or '',
        }
    except Exception as exc:
        classified_error = classify_ai_health_error(str(exc))
        return {
            'provider': 'mistral',
            'model': MISTRAL_MODEL,
            'live_check': True,
            **classified_error,
        }


def generate_ai_text(prompt):
    health = check_ai_health(run_live_check=False)
    if health['status'] == 'not_configured':
        return localize_ui_message(
            'AI analysis is unavailable because MISTRAL_API_KEY is not configured.',
            'تحليل الذكاء الاصطناعي غير متاح لأن MISTRAL_API_KEY غير مضبوط.',
        )
    if health['status'] == 'client_unavailable':
        return health.get('message') or localize_ui_message(
            'AI analysis is unavailable because the Mistral client is not available.',
            'تحليل الذكاء الاصطناعي غير متاح لأن عميل Mistral غير متوفر.',
        )

    try:
        response = mistral_client.chat.complete(
            model=MISTRAL_MODEL,
            messages=[{'role': 'user', 'content': prompt}],
        )
        response_text = extract_mistral_text(response)
        return response_text or localize_ui_message(
            'AI analysis returned an empty response.',
            'أعاد الذكاء الاصطناعي استجابة فارغة.',
        )
    except Exception as exc:
        return classify_ai_health_error(str(exc))['message']


def generate_textual_analysis_ai(code1, code2, results):
    # Compatibility name retained so the surrounding analysis flow stays unchanged.
    # Returns a tuple: (prose_text: str, structured: dict | None)
    results_text = []
    for metric, value in results:
        if isinstance(value, float):
            results_text.append(f"{metric}: {value:.2f}%")
        else:
            results_text.append(f"{metric}: {value}")

    joined_results = "\n".join(results_text)
    response_language = get_ai_response_language_name()

    prompt = (
        f"Respond in {response_language}. Keep code identifiers, rule names, and metric labels in their original form.\n"
        "Analyze the code similarity results below. Return ONLY a valid JSON object with exactly these fields "
        "(no markdown code fences, no extra text outside the JSON):\n"
        "{\n"
        '  "risk_level": "critical" | "high" | "moderate" | "low" | "none",\n'
        '  "summary": "<1-2 sentence executive summary>",\n'
        '  "findings": [\n'
        '    { "title": "<short title>", "severity": "critical" | "high" | "medium" | "low" | "info", "description": "<explanation>" }\n'
        "  ],\n"
        '  "refactoring_suggestion": "<concrete advice for reducing duplication or risk>",\n'
        '  "verdict": "<final one-sentence assessment>",\n'
        '  "report": "<full markdown analysis covering purpose, structure, maintainability, security, and recommendations>"\n'
        "}\n\n"
        f"Similarity Results:\n{joined_results}\n\n"
        f"Code 1:\n{code1}\n\n"
        f"Code 2:\n{code2}"
    )

    raw = generate_ai_text(prompt)
    if not raw or raw.startswith('Unable') or raw.startswith('لا يمكن'):
        return raw, None

    # Strip accidental markdown code fences
    cleaned = raw.strip()
    if cleaned.startswith('```'):
        cleaned = re.sub(r'^```[a-z]*\n?', '', cleaned)
        cleaned = re.sub(r'\n?```$', '', cleaned)
        cleaned = cleaned.strip()

    try:
        structured = json.loads(cleaned)
        prose = structured.get('report') or raw
        return prose, structured
    except (json.JSONDecodeError, ValueError):
        return raw, None


def build_similarity_sections(values_list1, values_list2):
    description_list1 = ''
    description_list2 = ''

    for metric_name, metric_value in values_list1:
        safe_name = _html.escape(str(metric_name))
        safe_pct = f'{metric_value:.2f}'
        color_class = ''
        if metric_value < 40:
            color_class = 'color1'
        elif metric_value < 50:
            color_class = 'color2'
        elif metric_value < 60:
            color_class = 'color3'
        elif metric_value < 70:
            color_class = 'color4'
        elif metric_value < 80:
            color_class = 'color5'
        elif metric_value < 90:
            color_class = 'color6'
        else:
            color_class = 'color7'

        description_list1 += f'''
                <div class="result-item">
                    <div class="result-label">{safe_name}:</div>
                    <div class="circle-container {color_class}" data-percentage="{safe_pct}">
                        <svg>
                            <circle class="circle-bg" cx="50" cy="50" r="45"></circle>
                            <circle class="circle hover-effect" cx="50" cy="50" r="45"></circle>
                        </svg>
                        <div class="circle-text">{safe_pct}%</div>
                    </div>
                </div>
                '''

    for metric_name, metric_value in values_list2:
        safe_metric_name = _html.escape(str(metric_name))
        safe_metric_value = _html.escape(str(metric_value))
        status_class = 'true' if metric_value is True else 'false'
        description_list2 += f'''
            <div class="result-item">
                <div class="result-label">{safe_metric_name}:</div>
                <div class="toggle-container {status_class}">
                    <div class="toggle-switch"></div>
                    <div class="toggle-status">{safe_metric_value}</div>
                </div>
            </div>
            '''

    return description_list1, description_list2


def ensure_dict(value, fallback=None):
    if isinstance(value, dict):
        return value
    return {} if fallback is None else fallback


def ensure_list(value):
    return value if isinstance(value, list) else []


def stringify_report_text(value, fallback=''):
    if value is None:
        return fallback

    if isinstance(value, str):
        return value if value.strip() else fallback

    if isinstance(value, dict):
        preferred_message = value.get('error') or value.get('message') or value.get('error_message')
        if preferred_message:
            return f"Unable to generate quality report: {preferred_message}"
        try:
            return json.dumps(value, ensure_ascii=False, indent=2)
        except TypeError:
            return str(value)

    if isinstance(value, list):
        try:
            return json.dumps(value, ensure_ascii=False, indent=2)
        except TypeError:
            return str(value)

    return str(value)


def normalize_code_smell_payload(value):
    payload = ensure_dict(value, {'code1_analysis': '', 'code2_analysis': ''})
    return {
        'code1_analysis': stringify_report_text(payload.get('code1_analysis'), ''),
        'code2_analysis': stringify_report_text(payload.get('code2_analysis'), ''),
    }


def ensure_graph_payload(value):
    if isinstance(value, list):
        return value

    if isinstance(value, dict):
        nodes = value.get('nodes')
        edges = value.get('edges')
        if isinstance(nodes, list) and isinstance(edges, list):
            return {
                'nodes': nodes,
                'edges': edges,
            }

        elements = value.get('elements')
        if isinstance(elements, dict):
            nested_nodes = elements.get('nodes')
            nested_edges = elements.get('edges')
            if isinstance(nested_nodes, list) and isinstance(nested_edges, list):
                return {
                    'nodes': nested_nodes,
                    'edges': nested_edges,
                }

    return {
        'nodes': [],
        'edges': [],
    }


def graph_payload_has_content(value):
    graph_payload = ensure_graph_payload(value)
    if isinstance(graph_payload, list):
        return len(graph_payload) > 0

    return bool(graph_payload.get('nodes')) or bool(graph_payload.get('edges'))


def normalize_similarity_items(items):
    normalized = []
    for item in ensure_list(items):
        if not isinstance(item, dict):
            continue
        name = item.get('name')
        value = item.get('value')
        if not name:
            continue
        try:
            numeric_value = float(value)
        except (TypeError, ValueError):
            continue
        normalized.append({'name': str(name), 'value': numeric_value})
    return normalized


def normalize_clone_items(items):
    normalized = []
    for item in ensure_list(items):
        if not isinstance(item, dict):
            continue
        name = item.get('name')
        if not name:
            continue
        normalized.append({'name': str(name), 'detected': bool(item.get('detected'))})
    return normalized


def similarity_pairs_from_items(items):
    return [[item['name'], item['value']] for item in normalize_similarity_items(items)]


def clone_pairs_from_items(items):
    return [[item['name'], item['detected']] for item in normalize_clone_items(items)]


def parse_analysis_metrics(raw_metrics):
    payload = json_loads_safe(raw_metrics, {})
    if not isinstance(payload, dict):
        return {}, {}

    metrics1 = payload.get('metrics1')
    metrics2 = payload.get('metrics2')
    if isinstance(metrics1, dict) or isinstance(metrics2, dict):
        return ensure_dict(metrics1), ensure_dict(metrics2)

    return payload, {}


def build_chart_url_from_similarity_items(similarity_items):
    values_list1 = similarity_pairs_from_items(similarity_items)
    if not values_list1:
        return None

    buf = create_similarity_chart(values_list1)
    return base64.b64encode(buf.getvalue()).decode('utf-8')


def build_cached_analysis_data(context):
    return {
        'Similarity Section': similarity_pairs_from_items(context.get('similarity_items')),
        'Cloning Section': clone_pairs_from_items(context.get('clone_items')),
        'Code 1 Graph': ensure_graph_payload(context.get('graph_json1')),
        'Code 2 Graph': ensure_graph_payload(context.get('graph_json2')),
        'Code Metrics for Code 1': ensure_dict(context.get('metrics1')),
        'Code Metrics for Code 2': ensure_dict(context.get('metrics2')),
        'Inter-Code Analysis': context.get('analysis_text') or '',
    }


def cache_analysis_context_for_user(user_id, context):
    if not user_id:
        return

    if db.session.get(User, user_id) is None:
        return

    cached_data = build_cached_analysis_data(context)
    with results_lock:
        # Move-to-end (most-recently-used) or insert fresh.
        user_results.pop(user_id, None)
        user_analysis_contexts.pop(user_id, None)

        user_results[user_id] = cached_data
        user_analysis_contexts[user_id] = context

        # Evict least-recently-used entries when the cap is exceeded.
        while len(user_results) > _MAX_CACHED_USERS:
            user_results.popitem(last=False)
        while len(user_analysis_contexts) > _MAX_CACHED_USERS:
            user_analysis_contexts.popitem(last=False)


def invalidate_cached_analysis_for_user(user_id, analysis_id=None):
    if not user_id:
        return

    with results_lock:
        if analysis_id is None:
            user_results.pop(user_id, None)
            user_analysis_contexts.pop(user_id, None)
            return

        cached_context = user_analysis_contexts.get(user_id)
        if not isinstance(cached_context, dict):
            return

        cached_summary = ensure_dict(cached_context.get('summary'))
        cached_analysis_id = cached_context.get('saved_analysis_id')

        if cached_analysis_id == analysis_id or cached_summary.get('id') == analysis_id:
            user_results.pop(user_id, None)
            user_analysis_contexts.pop(user_id, None)


def build_analysis_snapshot(context):
    code_smell = normalize_code_smell_payload(context.get('code_smell'))
    return {
        'snapshot_version': SNAPSHOT_SCHEMA_VERSION,
        'language': context.get('language'),
        'code1': context.get('code1') or '',
        'code2': context.get('code2') or '',
        'source_labels': ensure_dict(context.get('source_labels')),
        'similarity_items': normalize_similarity_items(context.get('similarity_items')),
        'clone_items': normalize_clone_items(context.get('clone_items')),
        'chart_url': context.get('chart_url'),
        'graph_json1': ensure_graph_payload(context.get('graph_json1')),
        'graph_json2': ensure_graph_payload(context.get('graph_json2')),
        'metrics1': ensure_dict(context.get('metrics1')),
        'metrics2': ensure_dict(context.get('metrics2')),
        'analysis_text': context.get('analysis_text') or '',
        'analysis_html': context.get('analysis_html') or '',
        'analysis_structured': context.get('analysis_structured'),
        'excel_analysis_results': ensure_list(context.get('excel_analysis_results')),
        'code_smell': code_smell,
        'similarities': None,
    }


def persist_snapshot_to_analysis_record(analysis, context):
    analysis.metrics = json_dumps_compact({
        'metrics1': ensure_dict(context.get('metrics1')),
        'metrics2': ensure_dict(context.get('metrics2')),
    })
    analysis.analysis_text = context.get('analysis_text') or analysis.analysis_text
    analysis.snapshot_json = json_dumps_compact(build_analysis_snapshot(context))
    db.session.add(analysis)
    db.session.commit()


def build_minimal_saved_analysis_context(analysis, fallback_error=None):
    metrics1, metrics2 = parse_analysis_metrics(analysis.metrics)
    similarity_items = []
    if analysis.similarity is not None:
        similarity_items.append({'name': 'Combined Similarity', 'value': round(float(analysis.similarity), 1)})

    description_list1, description_list2 = build_similarity_sections(
        similarity_pairs_from_items(similarity_items),
        [],
    )

    analysis_text = analysis.analysis_text or ''
    context = {
        'language': analysis.language,
        'supported_languages': languages,
        'code1': analysis.code1,
        'code2': analysis.code2,
        'source_labels': {
            'code1': derive_source_label(analysis.code1, 'Source A'),
            'code2': derive_source_label(analysis.code2, 'Source B'),
        },
        'description_list1': description_list1,
        'description_list2': description_list2,
        'similarity_items': similarity_items,
        'clone_items': [],
        'chart_url': build_chart_url_from_similarity_items(similarity_items),
        'graph_json1': [],
        'graph_json2': [],
        'metrics1': metrics1,
        'metrics2': metrics2,
        'analysis_text': analysis_text,
        'analysis_html': render_analysis_markdown(analysis_text),
        'analysis_structured': None,
        'excel_analysis_results': [],
        'code_smell': {
            'code1_analysis': 'Stored snapshot fallback view. Run a re-analysis to regenerate the full quality report.',
            'code2_analysis': 'Stored snapshot fallback view. Run a re-analysis to regenerate the full quality report.',
        },
        'similarities': None,
        'error_message': fallback_error,
        'has_results': True,
        'saved_analysis_id': analysis.id,
        'summary': serialize_history_summary(analysis),
    }
    cache_analysis_context_for_user(getattr(current_user, 'id', None), context)
    return context


def build_analysis_context_from_snapshot(analysis, snapshot_payload):
    similarity_items = normalize_similarity_items(snapshot_payload.get('similarity_items'))
    clone_items = normalize_clone_items(snapshot_payload.get('clone_items'))
    description_list1, description_list2 = build_similarity_sections(
        similarity_pairs_from_items(similarity_items),
        clone_pairs_from_items(clone_items),
    )

    legacy_metrics1, legacy_metrics2 = parse_analysis_metrics(analysis.metrics)
    metrics1 = ensure_dict(snapshot_payload.get('metrics1')) or legacy_metrics1
    metrics2 = ensure_dict(snapshot_payload.get('metrics2')) or legacy_metrics2
    analysis_text = snapshot_payload.get('analysis_text') or analysis.analysis_text or ''
    source_labels = ensure_dict(snapshot_payload.get('source_labels'))
    code_smell = normalize_code_smell_payload(snapshot_payload.get('code_smell'))
    context = {
        'language': snapshot_payload.get('language') or analysis.language,
        'supported_languages': languages,
        'code1': snapshot_payload.get('code1') or analysis.code1,
        'code2': snapshot_payload.get('code2') or analysis.code2,
        'source_labels': {
            'code1': source_labels.get('code1') or derive_source_label(snapshot_payload.get('code1') or analysis.code1, 'Source A'),
            'code2': source_labels.get('code2') or derive_source_label(snapshot_payload.get('code2') or analysis.code2, 'Source B'),
        },
        'description_list1': description_list1,
        'description_list2': description_list2,
        'similarity_items': similarity_items,
        'clone_items': clone_items,
        'chart_url': snapshot_payload.get('chart_url') or build_chart_url_from_similarity_items(similarity_items),
        'graph_json1': ensure_graph_payload(snapshot_payload.get('graph_json1')),
        'graph_json2': ensure_graph_payload(snapshot_payload.get('graph_json2')),
        'metrics1': metrics1,
        'metrics2': metrics2,
        'analysis_text': analysis_text,
        'analysis_html': render_analysis_markdown(analysis_text),
        'analysis_structured': snapshot_payload.get('analysis_structured'),
        'excel_analysis_results': ensure_list(snapshot_payload.get('excel_analysis_results')),
        'code_smell': code_smell,
        'similarities': None,
        'error_message': None,
        'has_results': True,
        'saved_analysis_id': analysis.id,
        'summary': serialize_history_summary(analysis),
    }
    cache_analysis_context_for_user(getattr(current_user, 'id', None), context)
    return context


def build_analysis_context(code1, code2, language, persist_analysis, analysis_text_override=None, snapshot_target_analysis=None, _bg_user_id=None):
    set_current_user_progress('Starting analysis', 0, user_id=_bg_user_id)
    detector = clone_detectors.get(language)
    if not detector:
        set_current_user_progress('Unsupported language', 0, user_id=_bg_user_id)
        return {
            'language': language,
            'code1': code1,
            'code2': code2,
            'error_message': 'Unsupported language selected.',
            'has_results': False,
        }

    if not code1 or not code2:
        return {
            'language': language,
            'code1': code1,
            'code2': code2,
            'error_message': 'Please provide both code inputs before running the analysis.',
            'has_results': False,
        }

    try:
        clean_code1 = detector.remove_comments_and_whitespace(code1)
        clean_code2 = detector.remove_comments_and_whitespace(code2)
        similarities = analyze_similarities(detector, code1, code2, clean_code1, clean_code2, _bg_user_id=_bg_user_id)
    except Exception as exc:
        set_current_user_progress('Error during analysis', 0, user_id=_bg_user_id)
        return {
            'language': language,
            'code1': code1,
            'code2': code2,
            'error_message': 'An error occurred during analysis. Please try again.',
            'has_results': False,
        }

    if 'error' in similarities:
        return {
            'language': language,
            'code1': code1,
            'code2': code2,
            'error_message': similarities['error'],
            'has_results': False,
        }

    text_sim = float(similarities['text_sim'] * 100)
    token_sim = float(similarities['token_sim'] * 100)
    token_sim_without_comments = float(similarities['token_sim_without_comments'] * 100)
    token_sim_with_order = float(similarities['token_sim_with_order'] * 100)
    token_sim_with_order_without_comments = float(similarities['token_sim_with_order_without_comments'] * 100)
    exact_clone_result = similarities['exact_clone_result']
    renamed_clone_sim = float(similarities['renamed_clone_sim'] * 100)
    near_miss_clone_result = similarities['near_miss_clone_result']
    parameterized_clone_result = similarities['parameterized_clone_result']
    function_clone_result = similarities['function_clone_result']
    non_contiguous_clone_result = similarities['non_contiguous_clone_result']
    structural_clone_result = similarities['structural_clone_result']
    reordered_clone_result = similarities['reordered_clone_result']
    function_reordered_clone_result = similarities['function_reordered_clone_result']
    gapped_clone_result = similarities['gapped_clone_result']
    intertwined_clone_result = similarities['intertwined_clone_result']
    semantic_clone_result = similarities['semantic_clone_result']
    graph_sim = similarities['graph_sim']
    combined_similarity = similarities['combined_similarity']
    ai_similarity_score = float(similarities['ai_similarity_score'] * 100)

    set_current_user_progress('Computing code metrics', 70, user_id=_bg_user_id)
    metrics1 = detector.get_metrics(code1, language)
    metrics2 = detector.get_metrics(code2, language)

    if language == 'python':
        if metrics1.get('cyclomatic_complexity') is not None:
            metrics1['cyclomatic_complexity'] = round(metrics1['cyclomatic_complexity'], 3)
        if metrics1.get('maintainability_index') is not None:
            metrics1['maintainability_index'] = round(metrics1['maintainability_index'], 3)
        if metrics1.get('halstead'):
            for key in metrics1['halstead']:
                metrics1['halstead'][key] = round(metrics1['halstead'][key], 3)
        if metrics2.get('cyclomatic_complexity') is not None:
            metrics2['cyclomatic_complexity'] = round(metrics2['cyclomatic_complexity'], 3)
        if metrics2.get('maintainability_index') is not None:
            metrics2['maintainability_index'] = round(metrics2['maintainability_index'], 3)
        if metrics2.get('halstead'):
            for key in metrics2['halstead']:
                metrics2['halstead'][key] = round(metrics2['halstead'][key], 3)

        code_smell = CodeSmellAnalyzer.python_code_smell_analysis(code1, None, code2, None)
    else:
        code_smell = {
            'code1_analysis': 'Code smell analysis is currently available for Python only.',
            'code2_analysis': 'Code smell analysis is currently available for Python only.',
        }

    code_smell = normalize_code_smell_payload(code_smell)

    values_list1 = [
        ['Text Similarity', text_sim],
        ['Token Similarity (ordered)', token_sim_with_order],
        ['Token Similarity (ordered, excluding comments and whitespace)', token_sim_with_order_without_comments],
        ['Token Similarity (unordered, with comments and whitespace)', token_sim],
        ['Token Similarity (unordered, excluding comments and whitespace)', token_sim_without_comments],
        ['Renamed Clone Similarity', renamed_clone_sim],
        ['Graph-Based Similarity', graph_sim * 100],
        ['Combined Similarity', combined_similarity * 100],
        ['AI Similarity', ai_similarity_score],
    ]

    values_list2 = [
        ['Exact Clone', exact_clone_result],
        ['Near Miss Clone', near_miss_clone_result],
        ['Parameterized Clone', parameterized_clone_result],
        ['Function Clone', function_clone_result],
        ['Non-Contiguous Clone', non_contiguous_clone_result],
        ['Structural Clone', structural_clone_result],
        ['Reordered Clone', reordered_clone_result],
        ['Function Reordered Clone', function_reordered_clone_result],
        ['Gapped Clone', gapped_clone_result],
        ['Intertwined Clone', intertwined_clone_result],
        ['Semantic Clone', semantic_clone_result],
    ]

    description_list1, description_list2 = build_similarity_sections(values_list1, values_list2)
    buf = create_similarity_chart(values_list1)
    chart_url = base64.b64encode(buf.getvalue()).decode('utf-8')

    set_current_user_progress('Generating code graph data', 80, user_id=_bg_user_id)
    graph_json1 = []
    if code1:
        graph_json1 = nx.cytoscape_data(detector.code_to_graph(code1))['elements']

    graph_json2 = []
    if code2:
        graph_json2 = nx.cytoscape_data(detector.code_to_graph(code2))['elements']

    set_current_user_progress('Generating AI analysis text', 90, user_id=_bg_user_id)
    analysis_structured = None
    if analysis_text_override is not None:
        analysis_text = analysis_text_override
    else:
        analysis_text, analysis_structured = generate_textual_analysis_ai(code1, code2, values_list1 + values_list2)
    analysis_html = render_analysis_markdown(analysis_text)

    response_context = {
        'language': language,
        'supported_languages': languages,
        'code1': code1,
        'code2': code2,
        'source_labels': {
            'code1': derive_source_label(code1, 'Source A'),
            'code2': derive_source_label(code2, 'Source B'),
        },
        'description_list1': description_list1,
        'description_list2': description_list2,
        'similarity_items': [
            {'name': metric_name, 'value': metric_value}
            for metric_name, metric_value in values_list1
        ],
        'clone_items': [
            {'name': metric_name, 'detected': bool(metric_value)}
            for metric_name, metric_value in values_list2
        ],
        'chart_url': chart_url,
        'graph_json1': graph_json1,
        'graph_json2': graph_json2,
        'metrics1': metrics1,
        'metrics2': metrics2,
        'analysis_text': analysis_text,
        'analysis_html': analysis_html,
        'analysis_structured': analysis_structured,
        'excel_analysis_results': [],
        'code_smell': code_smell,
        'similarities': similarities,
        'error_message': None,
        'has_results': True,
        'saved_analysis_id': None,
    }

    _effective_user_id = _bg_user_id or (current_user.id if getattr(current_user, 'is_authenticated', False) else None)

    if persist_analysis:
        snapshot_payload = build_analysis_snapshot(response_context)
        analysis = Analysis(
            user_id=_effective_user_id,
            operation='code clone analysis',
            result='successful',
            language=language,
            code1=code1,
            code2=code2,
            metrics=json_dumps_compact({'metrics1': metrics1, 'metrics2': metrics2}),
            similarity=round(combined_similarity * 100, 1),
            analysis_text=analysis_text,
            snapshot_json=json_dumps_compact(snapshot_payload),
        )
        db.session.add(analysis)
        db.session.commit()
        response_context['saved_analysis_id'] = analysis.id
    elif snapshot_target_analysis is not None:
        persist_snapshot_to_analysis_record(snapshot_target_analysis, response_context)
        response_context['saved_analysis_id'] = snapshot_target_analysis.id

    if response_context.get('saved_analysis_id'):
        summary_analysis = db.session.get(Analysis, response_context['saved_analysis_id'])
        response_context['summary'] = serialize_history_summary(summary_analysis) if summary_analysis else None
    else:
        response_context['summary'] = None

    if _effective_user_id:
        cache_analysis_context_for_user(_effective_user_id, response_context)

    set_current_user_progress('Analysis complete', 100, user_id=_bg_user_id)

    return response_context


def restore_saved_analysis_context(analysis, allow_backfill=True):
    snapshot_payload = json_loads_safe(analysis.snapshot_json, {})
    if snapshot_payload:
        if (
            graph_payload_has_content(snapshot_payload.get('graph_json1'))
            or graph_payload_has_content(snapshot_payload.get('graph_json2'))
            or not allow_backfill
        ):
            return build_analysis_context_from_snapshot(analysis, snapshot_payload)

    if not allow_backfill:
        return build_minimal_saved_analysis_context(analysis)

    rebuilt_context = build_analysis_context(
        analysis.code1,
        analysis.code2,
        analysis.language,
        persist_analysis=False,
        analysis_text_override=analysis.analysis_text,
        snapshot_target_analysis=analysis,
    )
    if rebuilt_context.get('has_results'):
        rebuilt_context['saved_analysis_id'] = analysis.id
        rebuilt_context['summary'] = serialize_history_summary(analysis)
        if getattr(current_user, 'is_authenticated', False):
            cache_analysis_context_for_user(current_user.id, rebuilt_context)
        return rebuilt_context

    return build_minimal_saved_analysis_context(analysis, rebuilt_context.get('error_message'))


def load_saved_analysis_context(analysis_id):
    previous_analysis = Analysis.query.filter_by(id=analysis_id, user_id=current_user.id).first()
    if not previous_analysis:
        return {
            'error_message': 'Analysis not found.',
            'has_results': False,
        }

    return restore_saved_analysis_context(previous_analysis)


@app.route('/')
def index():
    return serve_frontend_app()


@app.route('/analysis', methods=['GET'])
def analysis():
    return serve_frontend_app()


@app.route('/results', methods=['GET'])
def results_page():
    return serve_frontend_app()


@app.route('/history', methods=['GET'])
def history_page():
    return serve_frontend_app()


@app.route('/help', methods=['GET'])
def help_page():
    return serve_frontend_app()


@app.route('/auth', methods=['GET'])
def auth_page():
    return serve_frontend_app()


@app.route('/chat', methods=['GET'])
def chat_page():
    return serve_frontend_app()


@app.route('/api/session', methods=['GET'])
def api_session():
    health = check_ai_health(run_live_check=False)
    return jsonify({
        'authenticated': current_user.is_authenticated,
        'user': serialize_user(current_user) if current_user.is_authenticated else None,
        'csrfToken': get_csrf_token(),
        'supportedLanguages': languages,
        'ai': health,
    })


@app.route('/api/analysis/progress', methods=['GET'])
@login_required
def api_analysis_progress():
    progress = get_analysis_progress_for_user(current_user.id)

    # Check for active/completed/failed background tasks for this user
    with _analysis_tasks_lock:
        for tid, task in _analysis_tasks.items():
            if task.get('user_id') == current_user.id:
                progress['taskId'] = tid
                progress['taskStatus'] = task['status']
                break

    return jsonify(progress)


@app.route('/api/analysis/task/<task_id>', methods=['GET'])
@login_required
def api_analysis_task(task_id):
    with _analysis_tasks_lock:
        task = _analysis_tasks.get(task_id)

    if not task or task.get('user_id') != current_user.id:
        return jsonify({'error': 'Task not found.'}), 404

    if task['status'] == 'running':
        return jsonify({'status': 'running'}), 202

    if task['status'] == 'failed':
        with _analysis_tasks_lock:
            _analysis_tasks.pop(task_id, None)
        return jsonify({'status': 'failed', 'error': task.get('error', 'Analysis failed.')}), 200

    # Completed -- return result and clean up
    result = task.get('result', {})
    with _analysis_tasks_lock:
        _analysis_tasks.pop(task_id, None)
    return jsonify(result), 200


@app.route('/api/home', methods=['GET'])
def api_home():
    latest_analysis = None
    user_analysis_count = 0
    if current_user.is_authenticated:
        latest_analysis = Analysis.query.filter_by(user_id=current_user.id).order_by(Analysis.date_created.desc()).first()
        user_analysis_count = Analysis.query.filter_by(user_id=current_user.id).count()

    return jsonify({
        'totalAnalyses': Analysis.query.count(),
        'userAnalyses': user_analysis_count,
        'languagesSupported': len(clone_detectors),
        'latestAnalysisId': latest_analysis.id if latest_analysis else None,
        'latestAnalysisSummary': serialize_history_summary(latest_analysis) if latest_analysis else None,
        'supportedLanguages': languages,
    })


@app.route('/api/auth/login', methods=['POST'])
@limiter.limit("10 per minute")
def api_login():
    payload = request.get_json(silent=True) or request.form
    username = (payload.get('username') or '').strip()
    password = payload.get('password') or ''

    if not username or not password:
        return jsonify({'success': False, 'message': 'Username and password are required.'}), 400

    user = User.query.filter_by(username=username).first()
    if not user or not user.check_password(password):
        return jsonify({'success': False, 'message': 'Invalid credentials.'}), 401

    login_user(user)
    return jsonify({
        'success': True,
        'user': serialize_user(user),
        'csrfToken': get_csrf_token(),
    })


@app.route('/api/auth/register', methods=['POST'])
@limiter.limit("5 per minute")
@login_required
def api_register():
    if not current_user.is_admin:
        return jsonify({'success': False, 'message': 'Admin access required.'}), 403
    payload = request.get_json(silent=True) or request.form
    username = (payload.get('username') or '').strip()
    password = payload.get('password') or ''

    if not username or not password:
        return jsonify({'success': False, 'message': 'Username and password are required.'}), 400

    if len(username) > 80 or not re.match(r'^[a-zA-Z0-9_.\-]+$', username):
        return jsonify({'success': False, 'message': 'Username must be 1-80 characters and contain only letters, digits, underscores, dots, or hyphens.'}), 400

    if len(password) < 8:
        return jsonify({'success': False, 'message': 'Password must be at least 8 characters.'}), 400
    if password.lower() in INSECURE_DEFAULT_ADMIN_PASSWORDS:
        return jsonify({'success': False, 'message': 'Password is too common. Choose a stronger password.'}), 400

    existing_user = User.query.filter_by(username=username).first()
    if existing_user:
        return jsonify({'success': False, 'message': 'Username already exists.'}), 409

    user = User(username=username)
    user.set_password(password)
    db.session.add(user)
    db.session.commit()
    return jsonify({
        'success': True,
        'user': serialize_user(user),
        'csrfToken': get_csrf_token(),
    }), 201


@app.route('/api/auth/logout', methods=['POST'])
@login_required
def api_logout():
    invalidate_cached_analysis_for_user(current_user.id)
    logout_user()
    return jsonify({'success': True})


@app.route('/api/analysis', methods=['POST'])
@limiter.limit("20 per minute")
@login_required
def api_analysis():
    language = request.form.get('language', 'python')
    code1 = request.form.get('code1', '')
    code2 = request.form.get('code2', '')

    try:
        code1 = read_uploaded_code(
            code1,
            uploaded_file=request.files.get('file1'),
            uploaded_zip=request.files.get('zip1'),
            excel_file=request.files.get('excel_file1'),
            excel_row=request.form.get('excel_row1'),
        )
        code2 = read_uploaded_code(
            code2,
            uploaded_file=request.files.get('file2'),
            uploaded_zip=request.files.get('zip2'),
            excel_file=request.files.get('excel_file2'),
            excel_row=request.form.get('excel_row2'),
        )
    except ValueError as exc:
        return jsonify(build_error_response_payload(
            str(exc),
            language=language,
            code1=code1,
            code2=code2,
            has_results=False,
        )), 400

    # Validate language
    if language not in clone_detectors:
        return jsonify(build_error_response_payload(
            'Unsupported language selected.',
            language=language,
            code1=code1,
            code2=code2,
            has_results=False,
        )), 400

    # Validate that both code inputs are provided
    if not code1 or not code2:
        return jsonify(build_error_response_payload(
            'Please provide both code inputs before running the analysis.',
            language=language,
            code1=code1,
            code2=code2,
            has_results=False,
        )), 400

    # Clean up stale background tasks (older than 30 minutes)
    cutoff = datetime.datetime.utcnow() - datetime.timedelta(minutes=30)
    with _analysis_tasks_lock:
        stale = [k for k, v in _analysis_tasks.items() if v.get('completed_at') and v['completed_at'] < cutoff]
        for k in stale:
            del _analysis_tasks[k]

    user_id = current_user.id
    task_id = secrets.token_hex(16)

    with _analysis_tasks_lock:
        _analysis_tasks[task_id] = {'status': 'running', 'user_id': user_id}

    set_current_user_progress('Starting analysis...', 0)
    _analysis_executor.submit(_run_analysis_background, task_id, user_id, code1, code2, language)

    return jsonify({'success': True, 'taskId': task_id, 'status': 'accepted'}), 202


@app.route('/api/analysis/current', methods=['GET'])
@login_required
def api_current_analysis():
    with results_lock:
        current_context = copy.deepcopy(user_analysis_contexts.get(current_user.id))

    if isinstance(current_context, dict):
        cached_analysis_id = current_context.get('saved_analysis_id')
        if cached_analysis_id and db.session.get(Analysis, cached_analysis_id) is None:
            invalidate_cached_analysis_for_user(current_user.id, cached_analysis_id)
            current_context = None

    if current_context:
        return jsonify(current_context)

    latest_analysis = Analysis.query.filter_by(user_id=current_user.id).order_by(Analysis.date_created.desc()).first()
    if not latest_analysis:
        return jsonify({'message': 'No analysis is currently available.'}), 404

    context = restore_saved_analysis_context(latest_analysis)
    return jsonify(context)


@app.route('/api/analysis/diff', methods=['GET'])
@login_required
def api_analysis_diff():
    """Return line-level diff blocks for the current analysis context."""
    analysis_id = request.args.get('analysisId', type=int)

    code1 = code2 = None
    if analysis_id:
        analysis = Analysis.query.filter_by(id=analysis_id, user_id=current_user.id).first()
        if analysis:
            code1, code2 = analysis.code1, analysis.code2
    else:
        with results_lock:
            ctx = copy.deepcopy(user_analysis_contexts.get(current_user.id))
        if ctx:
            code1, code2 = ctx.get('code1'), ctx.get('code2')

    if not code1 or not code2:
        return jsonify({'error': 'No analysis context found.'}), 404

    lines_a = code1.splitlines()
    lines_b = code2.splitlines()
    matcher = difflib.SequenceMatcher(None, lines_a, lines_b, autojunk=False)

    blocks = []
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        blocks.append({
            'type': tag,
            'lines_a': lines_a[i1:i2],
            'lines_b': lines_b[j1:j2],
            'start_a': i1,
            'start_b': j1,
        })

    return jsonify({
        'blocks': blocks,
        'match_ratio': round(matcher.ratio() * 100, 2),
        'total_lines_a': len(lines_a),
        'total_lines_b': len(lines_b),
    })


@app.route('/api/analysis/<int:analysis_id>', methods=['GET'])
@app.route('/api/history/<int:analysis_id>', methods=['GET'])
@login_required
def api_analysis_detail(analysis_id):
    analysis = Analysis.query.filter_by(id=analysis_id, user_id=current_user.id).first()
    if not analysis:
        return jsonify({'message': 'Analysis not found.'}), 404

    context = restore_saved_analysis_context(analysis)
    return jsonify(context)


@app.route('/api/analytics', methods=['GET'])
@login_required
def api_analytics():
    """Return aggregated analytics for the authenticated user."""
    analyses = Analysis.query.filter_by(user_id=current_user.id).order_by(Analysis.date_created.asc()).all()

    # Analyses per day – last 30 days
    today = datetime.date.today()
    day_counts: dict = {}
    for i in range(29, -1, -1):
        day = today - datetime.timedelta(days=i)
        day_counts[day.isoformat()] = 0

    for a in analyses:
        if a.date_created:
            d = a.date_created.date() if hasattr(a.date_created, 'date') else datetime.date.fromisoformat(str(a.date_created)[:10])
            key = d.isoformat()
            if key in day_counts:
                day_counts[key] += 1

    activity = [{'date': k, 'count': v} for k, v in day_counts.items()]

    # Language distribution
    lang_counts: dict = {}
    for a in analyses:
        lang = a.language or 'unknown'
        lang_counts[lang] = lang_counts.get(lang, 0) + 1
    language_dist = [{'language': k, 'count': v} for k, v in sorted(lang_counts.items(), key=lambda x: -x[1])]

    # Similarity distribution (buckets: 0-25, 25-50, 50-75, 75-100)
    buckets = {'0-25': 0, '25-50': 0, '50-75': 0, '75-100': 0}
    for a in analyses:
        s = a.similarity or 0
        if s < 25:
            buckets['0-25'] += 1
        elif s < 50:
            buckets['25-50'] += 1
        elif s < 75:
            buckets['50-75'] += 1
        else:
            buckets['75-100'] += 1
    similarity_dist = [{'range': k, 'count': v} for k, v in buckets.items()]

    # Clone type frequency – parse from snapshot_json
    clone_freq: dict = {}
    for a in analyses:
        if not a.snapshot_json:
            continue
        try:
            snap = json.loads(a.snapshot_json)
            for item in snap.get('clone_items', []):
                if item.get('detected'):
                    name = item.get('name', 'Unknown')
                    clone_freq[name] = clone_freq.get(name, 0) + 1
        except (json.JSONDecodeError, TypeError):
            continue
    clone_dist = [{'name': k, 'count': v} for k, v in sorted(clone_freq.items(), key=lambda x: -x[1])]

    # Top analyses by similarity
    top_analyses = sorted(analyses, key=lambda a: a.similarity or 0, reverse=True)[:5]

    return jsonify({
        'total': len(analyses),
        'activity': activity,
        'language_dist': language_dist,
        'similarity_dist': similarity_dist,
        'clone_dist': clone_dist,
        'top_analyses': [serialize_history_summary(a) for a in top_analyses],
    })


@app.route('/api/history', methods=['GET'])
@login_required
def api_history():
    analyses = Analysis.query.filter_by(user_id=current_user.id).order_by(Analysis.date_created.desc()).all()
    return jsonify({
        'items': [serialize_history_summary(analysis) for analysis in analyses],
        'stats': build_history_stats(analyses),
    })


@app.route('/api/history/<int:analysis_id>/rerun', methods=['POST'])
@limiter.limit("10 per minute")
@login_required
def api_rerun_analysis(analysis_id):
    analysis = Analysis.query.filter_by(id=analysis_id, user_id=current_user.id).first()
    if not analysis:
        return jsonify({'message': 'Analysis not found.'}), 404

    context = build_analysis_context(
        analysis.code1,
        analysis.code2,
        analysis.language,
        persist_analysis=False,
    )
    context['saved_analysis_id'] = analysis.id
    context['summary'] = serialize_history_summary(analysis)
    if getattr(current_user, 'is_authenticated', False):
        cache_analysis_context_for_user(current_user.id, context)
    return jsonify(context)


@app.route('/api/history/<int:analysis_id>', methods=['DELETE'])
@login_required
def api_delete_analysis(analysis_id):
    analysis = Analysis.query.filter_by(id=analysis_id, user_id=current_user.id).first()
    if not analysis:
        return jsonify({'success': False, 'message': 'Analysis not found.'}), 404

    db.session.delete(analysis)
    db.session.commit()
    invalidate_cached_analysis_for_user(current_user.id, analysis_id)
    return jsonify({'success': True})


@app.route('/health')
def health_check():
    try:
        db.session.execute(db.text('SELECT 1'))
        return jsonify({'status': 'healthy', 'database': 'connected'}), 200
    except Exception:
        return jsonify({'status': 'unhealthy', 'database': 'disconnected'}), 503


@app.route('/health-ai', methods=['GET'])
@app.route('/api/health-ai', methods=['GET'])
@limiter.limit("5 per minute")
@login_required
def health_ai():
    live_param = (request.args.get('live', '1') or '1').strip().lower()
    run_live_check = live_param not in {'0', 'false', 'no'}
    health = check_ai_health(run_live_check=run_live_check)
    status_map = {
        'ok': 200,
        'ready': 200,
        'not_configured': 503,
        'client_unavailable': 503,
        'unauthorized': 502,
        'rate_limited': 429,
        'error': 502,
    }
    return jsonify(health), status_map.get(health.get('status'), 500)


@app.route('/chat', methods=['POST'])
@app.route('/api/chat', methods=['POST'])
@limiter.limit("10 per minute")
@login_required
def chat():
    payload = request.get_json(silent=True) or {}
    user_message = (payload.get('message') or '').strip()
    if not user_message:
        return jsonify({'response': localize_ui_message('Please enter a message.', 'يرجى إدخال رسالة.')}), 400

    if len(user_message) > 10000:
        return jsonify({'error': 'Message is too long. Maximum 10,000 characters.'}), 400

    with results_lock:
        analysis_data = copy.deepcopy(user_results.get(current_user.id, {}))

    response_language = get_ai_response_language_name()
    system_content = (
        f"Respond in {response_language}. Keep code identifiers, filenames, metrics, and rule IDs in their original form when needed.\n"
    )

    health = check_ai_health(run_live_check=False)
    if health['status'] in ('not_configured', 'client_unavailable'):
        return jsonify({'response': health.get('message', 'AI is unavailable.')})

    messages = [{'role': 'system', 'content': system_content}]
    if analysis_data:
        messages.append({'role': 'user', 'content': '[Analysis Context]\n' + json.dumps(analysis_data, ensure_ascii=False, indent=2)})
        messages.append({'role': 'assistant', 'content': 'I have reviewed the analysis context. How can I help?'})
    messages.append({'role': 'user', 'content': user_message})

    try:
        response = mistral_client.chat.complete(
            model=MISTRAL_MODEL,
            messages=messages,
        )
        response_text = extract_mistral_text(response) or localize_ui_message(
            'AI analysis returned an empty response.',
            'أعاد الذكاء الاصطناعي استجابة فارغة.',
        )
    except Exception as exc:
        response_text = classify_ai_health_error(str(exc))['message']
    return jsonify({'response': response_text})


@app.route('/<path:path>', methods=['GET'])
def spa_catch_all(path):
    if path.startswith('api/'):
        abort(404)

    if frontend_build_available():
        candidate = os.path.join(FRONTEND_DIST_DIR, path)
        if not os.path.realpath(candidate).startswith(os.path.realpath(FRONTEND_DIST_DIR)):
            abort(404)
        if os.path.isfile(candidate):
            return send_from_directory(os.path.dirname(candidate), os.path.basename(candidate))

    return serve_frontend_app()


# Import and register API blueprint if it exists locally.
api_path = os.path.join(BASE_DIR, 'api.py')
if os.path.exists(api_path):
    try:
        from api import api_bp
        app.register_blueprint(api_bp)
    except ImportError:
        pass


initialize_database()


def run_local_server():
    host = os.environ.get('HOST', '127.0.0.1')
    preferred_port = int(os.environ.get('PORT', '5000'))
    candidate_ports = [preferred_port, 5000, 5001, 5002, 8080, 8081, 8082]
    tried_ports = set()

    try:
        from waitress import serve
    except ImportError:
        serve = None

    last_error = None
    for port in candidate_ports:
        if port in tried_ports:
            continue
        tried_ports.add(port)
        try:
            server_label = 'waitress' if serve is not None else 'flask'
            print(f'Starting server with {server_label} on http://{host}:{port}', flush=True)
            if serve is not None:
                serve(app, host=host, port=port, threads=8)
            else:
                app.run(host=host, port=port, debug=False)
            return
        except OSError as exc:
            last_error = exc
            print(f'Port {port} is unavailable on {host}; trying another port...')

    if last_error is not None:
        raise last_error


if __name__ == '__main__':
    run_local_server()
