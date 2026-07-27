"""Persisted chat conversations (``backend/api/v1/chat.py`` + ``models/chat.py``).

Locks in the feature contract:

  * POST /chat with no ``conversationId`` creates a conversation, stores BOTH
    transcript rows, and derives a listing title from the opening message;
  * POST /chat with ``conversationId`` resumes it, replays the saved transcript
    to the model (real server-side memory), and grounds on the conversation's
    OWN analysis — a client cannot re-point an existing thread;
  * ownership is enforced on every conversation endpoint (foreign -> 404);
  * list/detail/rename/delete behave, and the message-count subquery is right;
  * GDPR: hard_delete_user erases conversations + messages, and the account
    export includes the transcripts.
"""

from __future__ import annotations

import pytest

from backend.extensions import db
from backend.models import Analysis, ChatConversation, ChatMessage
from backend.models.user import User


@pytest.fixture(autouse=True)
def _cleanup(app):
    """Remove conversations/messages/analyses created by each test so the
    shared session-scoped DB stays clean for other suites."""
    with app.app_context():
        conv_before = {r[0] for r in db.session.query(ChatConversation.id).all()}
        analysis_before = {r[0] for r in db.session.query(Analysis.id).all()}
    yield
    with app.app_context():
        new_convs = [r[0] for r in db.session.query(ChatConversation.id).all()
                     if r[0] not in conv_before]
        if new_convs:
            ChatMessage.query.filter(ChatMessage.conversation_id.in_(new_convs)).delete(
                synchronize_session=False)
            ChatConversation.query.filter(ChatConversation.id.in_(new_convs)).delete(
                synchronize_session=False)
        new_analyses = [r[0] for r in db.session.query(Analysis.id).all()
                        if r[0] not in analysis_before]
        if new_analyses:
            Analysis.query.filter(Analysis.id.in_(new_analyses)).delete(synchronize_session=False)
        db.session.commit()


def _make_user(app, name):
    with app.app_context():
        user = User(username=name, email=f"{name}@example.com")
        user.set_password("Str0ng-passw0rd!")
        db.session.add(user)
        db.session.commit()
        return user.id


def _login(client, name):
    resp = client.post("/api/v1/auth/login",
                       json={"username": name, "password": "Str0ng-passw0rd!"})
    assert resp.status_code == 200 and resp.get_json()["success"] is True


def _make_analysis(app, user_id) -> int:
    with app.app_context():
        analysis = Analysis(user_id=user_id, language="python", similarity=88.0,
                            code1="def a(): pass", code2="def b(): pass",
                            analysis_text="stored analysis text")
        db.session.add(analysis)
        db.session.commit()
        return analysis.id


@pytest.fixture()
def fake_ai(monkeypatch):
    """Make the model deterministic and capture what it was shown."""
    calls = []

    def _fake_generate(messages):
        calls.append(messages)
        return f"analyst-reply-{len(calls)}"

    import backend.api.v1.chat as chat_module
    monkeypatch.setattr(chat_module, "generate_ai_chat", _fake_generate)
    monkeypatch.setattr(chat_module, "check_ai_health",
                        lambda run_live_check=False: {"status": "ok"})
    return calls


# ── create ────────────────────────────────────────────────────────────────────

def test_first_send_creates_conversation_and_stores_both_rows(app, client, fake_ai):
    _make_user(app, "chat_alice")
    _login(client, "chat_alice")

    resp = client.post("/api/v1/chat", json={"message": "Why is the similarity high?\nsecond line"})
    body = resp.get_json()
    assert resp.status_code == 200
    assert body["stored"] is True and body["response"] == "analyst-reply-1"
    conv_id = body["conversationId"]
    assert isinstance(conv_id, int)
    assert body["userMessage"]["role"] == "user"
    assert body["assistantMessage"]["role"] == "assistant"

    with app.app_context():
        conv = db.session.get(ChatConversation, conv_id)
        # Title = first line of the opening message, not the whole text.
        assert conv.title == "Why is the similarity high?"
        rows = conv.messages.all()
        assert [m.role for m in rows] == ["user", "assistant"]
        assert rows[1].content == "analyst-reply-1"


def test_resume_replays_history_to_the_model(app, client, fake_ai):
    _make_user(app, "chat_bob")
    _login(client, "chat_bob")

    first = client.post("/api/v1/chat", json={"message": "opening question"}).get_json()
    conv_id = first["conversationId"]
    second = client.post("/api/v1/chat",
                         json={"message": "follow-up", "conversationId": conv_id}).get_json()
    assert second["conversationId"] == conv_id and second["stored"] is True

    # The second model call must contain the saved first exchange, in order,
    # before the new question — that is the server-side memory contract.
    replay = [(m["role"], m["content"]) for m in fake_ai[1]]
    assert ("user", "opening question") in replay
    assert ("assistant", "analyst-reply-1") in replay
    assert replay[-1] == ("user", "follow-up")
    assert replay.index(("user", "opening question")) < replay.index(("assistant", "analyst-reply-1")) < len(replay) - 1

    with app.app_context():
        assert db.session.get(ChatConversation, conv_id).messages.count() == 4


def test_resumed_thread_grounds_on_its_own_analysis_not_the_request(app, client, fake_ai):
    uid = _make_user(app, "chat_carol")
    _login(client, "chat_carol")
    own_analysis = _make_analysis(app, uid)

    started = client.post("/api/v1/chat", json={
        "message": "about my analysis", "analysisId": own_analysis}).get_json()
    assert started["grounded"] is True
    conv_id = started["conversationId"]

    # Try to re-point the SAME thread at a different analysis id — it must keep
    # grounding on the stored one (context replayed again, same grounded flag).
    other = client.post("/api/v1/chat", json={
        "message": "again", "conversationId": conv_id, "analysisId": 999999}).get_json()
    assert other["grounded"] is True
    with app.app_context():
        assert db.session.get(ChatConversation, conv_id).analysis_id == own_analysis
    # The context block was attached on the resumed call as well.
    assert any("[Analysis Context]" in m["content"] for m in fake_ai[1])


def test_foreign_analysis_never_grounds_a_new_thread(app, client, fake_ai):
    owner = _make_user(app, "chat_dave")
    foreign_analysis = _make_analysis(app, owner)
    _make_user(app, "chat_eve")
    _login(client, "chat_eve")

    body = client.post("/api/v1/chat", json={
        "message": "peek", "analysisId": foreign_analysis}).get_json()
    assert body["grounded"] is False
    with app.app_context():
        conv = db.session.get(ChatConversation, body["conversationId"])
        assert conv.analysis_id is None  # the foreign id was NOT stored


# ── conversation management ──────────────────────────────────────────────────

def test_list_detail_rename_delete_and_ownership(app, client, fake_ai):
    _make_user(app, "chat_frank")
    _login(client, "chat_frank")
    conv_id = client.post("/api/v1/chat", json={"message": "hello"}).get_json()["conversationId"]

    items = client.get("/api/v1/chat/conversations").get_json()["items"]
    assert [c["id"] for c in items] == [conv_id]
    assert items[0]["messageCount"] == 2

    detail = client.get(f"/api/v1/chat/conversations/{conv_id}").get_json()
    assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]

    renamed = client.patch(f"/api/v1/chat/conversations/{conv_id}", json={"title": "My thread"})
    assert renamed.get_json()["conversation"]["title"] == "My thread"
    assert client.patch(f"/api/v1/chat/conversations/{conv_id}", json={"title": "  "}).status_code == 400

    # Another user can neither read, rename, nor delete it.
    _make_user(app, "chat_mallory")
    _login(client, "chat_mallory")
    assert client.get(f"/api/v1/chat/conversations/{conv_id}").status_code == 404
    assert client.patch(f"/api/v1/chat/conversations/{conv_id}", json={"title": "x"}).status_code == 404
    assert client.delete(f"/api/v1/chat/conversations/{conv_id}").status_code == 404
    assert client.post("/api/v1/chat", json={
        "message": "hijack", "conversationId": conv_id}).status_code == 404

    _login(client, "chat_frank")
    assert client.delete(f"/api/v1/chat/conversations/{conv_id}").get_json()["success"] is True
    with app.app_context():
        assert db.session.get(ChatConversation, conv_id) is None
        assert ChatMessage.query.filter_by(conversation_id=conv_id).count() == 0


def test_list_filters_by_analysis_id(app, client, fake_ai):
    uid = _make_user(app, "chat_grace")
    _login(client, "chat_grace")
    analysis_id = _make_analysis(app, uid)

    grounded_conv = client.post("/api/v1/chat", json={
        "message": "grounded", "analysisId": analysis_id}).get_json()["conversationId"]
    client.post("/api/v1/chat", json={"message": "free-floating"})

    all_items = client.get("/api/v1/chat/conversations").get_json()["items"]
    assert len(all_items) == 2
    filtered = client.get(
        f"/api/v1/chat/conversations?analysisId={analysis_id}").get_json()["items"]
    assert [c["id"] for c in filtered] == [grounded_conv]


# ── GDPR ─────────────────────────────────────────────────────────────────────

def test_export_includes_transcripts_and_erasure_removes_them(app, client, fake_ai):
    uid = _make_user(app, "chat_henry")
    _login(client, "chat_henry")
    conv_id = client.post("/api/v1/chat", json={"message": "private question"}).get_json()["conversationId"]

    export = client.get("/api/v1/account/export").get_json()["data"]
    convs = export["chatConversations"]
    assert convs and convs[0]["id"] == conv_id
    assert [m["role"] for m in convs[0]["messages"]] == ["user", "assistant"]
    assert convs[0]["messages"][0]["content"] == "private question"

    # Clear the login session BEFORE erasing the row — mirroring the production
    # delete route — so the shared test client never carries a deleted user.
    client.post("/api/v1/auth/logout")

    from backend.services.gdpr_service import hard_delete_user
    with app.app_context():
        hard_delete_user(uid)
        assert ChatConversation.query.filter_by(user_id=uid).count() == 0
        assert ChatMessage.query.filter_by(conversation_id=conv_id).count() == 0
