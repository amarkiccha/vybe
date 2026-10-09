"""VYBE backend regression test suite covering auth, chat, stories, communities, broadcast and media."""
import os
import time
import uuid
import requests
import pytest
from conftest import API, PWD, auth_h, _login


# ---------------- auth ----------------
def _new_user(s):
    email = f"TEST_{uuid.uuid4().hex[:10]}@vybe.app"
    r = s.post(f"{API}/auth/register", json={"name": "T", "email": email, "password": PWD}, timeout=20)
    assert r.status_code == 201, r.text
    return email, r.json()["token"]


class TestAuth:
    def test_health_proxy_up(self, s):
        r = s.get(f"{API}/health", timeout=10)
        assert r.status_code == 200

    def test_me_requires_auth(self, s):
        assert s.get(f"{API}/auth/me").status_code == 401

    def test_register_login_me(self, s):
        email, tok = _new_user(s)
        me = s.get(f"{API}/auth/me", headers=auth_h(tok))
        assert me.status_code == 200
        assert me.json()["user"]["email"] == email.lower()

    def test_logout_revokes(self, s):
        _, tok = _new_user(s)
        assert s.post(f"{API}/auth/logout", headers=auth_h(tok)).status_code == 204
        assert s.get(f"{API}/auth/me", headers=auth_h(tok)).status_code == 401

    def test_lockout_after_5_bad_attempts(self, s):
        email, _ = _new_user(s)
        for _ in range(5):
            s.post(f"{API}/auth/login", json={"email": email, "password": "wrong!!"}, timeout=10)
        r = s.post(f"{API}/auth/login", json={"email": email, "password": PWD}, timeout=10)
        assert r.status_code == 423, r.text
        assert r.json().get("error") == "account_locked"

    def test_two_step_pin_flow(self, s):
        email, tok = _new_user(s)
        r = s.post(f"{API}/auth/two-step", headers=auth_h(tok), json={"enabled": True, "pin": "123456"})
        assert r.status_code == 200
        no_pin = s.post(f"{API}/auth/login", json={"email": email, "password": PWD})
        assert no_pin.status_code == 401
        assert no_pin.json().get("error") == "pin_required"
        bad = s.post(f"{API}/auth/login", json={"email": email, "password": PWD, "pin": "999999"})
        assert bad.status_code == 401
        ok = s.post(f"{API}/auth/login", json={"email": email, "password": PWD, "pin": "123456"})
        assert ok.status_code == 200


# ---------------- chats ----------------
class TestChats:
    def test_conversations_filters(self, s, demo_token):
        for f in ["all", "unread", "groups", "favorites", "requests", "archived"]:
            r = s.get(f"{API}/conversations?filter={f}", headers=auth_h(demo_token))
            assert r.status_code == 200, f"{f}: {r.text}"
            assert "conversations" in r.json()

    def test_direct_and_message_idempotent(self, s, demo_token, rohan_token):
        rid = s.get(f"{API}/auth/me", headers=auth_h(rohan_token)).json()["user"]["id"]
        c = s.post(f"{API}/conversations", headers=auth_h(demo_token), json={"type": "direct", "userId": rid}).json()["conversation"]
        cid = c["id"]
        cl = f"test-{uuid.uuid4().hex[:8]}"
        m1 = s.post(f"{API}/conversations/{cid}/messages", headers=auth_h(demo_token), json={"clientId": cl, "text": "hello"}).json()["message"]
        m2 = s.post(f"{API}/conversations/{cid}/messages", headers=auth_h(demo_token), json={"clientId": cl, "text": "hello"}).json()["message"]
        assert m1["id"] == m2["id"]
        # pagination
        before = s.get(f"{API}/conversations/{cid}/messages", headers=auth_h(demo_token))
        assert before.status_code == 200 and "messages" in before.json()
        since = s.get(f"{API}/conversations/{cid}/messages?since={m1['createdAt']}", headers=auth_h(demo_token))
        assert since.status_code == 200

    def test_edit_delete_react_forward_pin(self, s, demo_token, rohan_token):
        rid = s.get(f"{API}/auth/me", headers=auth_h(rohan_token)).json()["user"]["id"]
        cid = s.post(f"{API}/conversations", headers=auth_h(demo_token), json={"type": "direct", "userId": rid}).json()["conversation"]["id"]
        m = s.post(f"{API}/conversations/{cid}/messages", headers=auth_h(demo_token), json={"clientId": uuid.uuid4().hex, "text": "orig"}).json()["message"]
        mid = m["id"]
        # edit
        e = s.patch(f"{API}/messages/{mid}", headers=auth_h(demo_token), json={"text": "edited"})
        assert e.status_code == 200 and e.json()["message"]["text"] == "edited"
        # react
        rc = s.post(f"{API}/messages/{mid}/react", headers=auth_h(rohan_token), json={"emoji": "👍"})
        assert rc.status_code in (200, 204)
        # pin
        pin = s.post(f"{API}/conversations/{cid}/pin", headers=auth_h(demo_token), json={"messageId": mid})
        assert pin.status_code in (200, 204)
        # forward
        fw = s.post(f"{API}/messages/{mid}/forward", headers=auth_h(demo_token), json={"conversationIds": [cid]})
        assert fw.status_code in (200, 204)
        # forward max 5
        fw_many = s.post(f"{API}/messages/{mid}/forward", headers=auth_h(demo_token), json={"conversationIds": [cid] * 10})
        assert fw_many.status_code in (400, 422)
        # delete
        d = s.delete(f"{API}/messages/{mid}", headers=auth_h(demo_token))
        assert d.status_code in (200, 204)

    def test_typing_and_search(self, s, demo_token, rohan_token):
        rid = s.get(f"{API}/auth/me", headers=auth_h(rohan_token)).json()["user"]["id"]
        cid = s.post(f"{API}/conversations", headers=auth_h(demo_token), json={"type": "direct", "userId": rid}).json()["conversation"]["id"]
        t = s.post(f"{API}/conversations/{cid}/typing", headers=auth_h(demo_token), json={})
        assert t.status_code in (200, 204)
        q = s.get(f"{API}/messages/search?q=hello", headers=auth_h(demo_token))
        assert q.status_code == 200

    def test_group_create(self, s, demo_token, rohan_token, sneha_token):
        rid = s.get(f"{API}/auth/me", headers=auth_h(rohan_token)).json()["user"]["id"]
        sid = s.get(f"{API}/auth/me", headers=auth_h(sneha_token)).json()["user"]["id"]
        r = s.post(f"{API}/conversations", headers=auth_h(demo_token), json={"type": "group", "name": "TEST Group", "memberIds": [rid, sid]})
        assert r.status_code in (200, 201)
        assert r.json()["conversation"]["type"] == "group"

    def test_block_prevents_messaging(self, s):
        # Fresh accounts so we don't disrupt demo
        _, ta = _new_user(s)
        _, tb = _new_user(s)
        aid = s.get(f"{API}/auth/me", headers=auth_h(ta)).json()["user"]["id"]
        bid = s.get(f"{API}/auth/me", headers=auth_h(tb)).json()["user"]["id"]
        cid = s.post(f"{API}/conversations", headers=auth_h(ta), json={"type": "direct", "userId": bid}).json()["conversation"]["id"]
        assert s.post(f"{API}/users/{bid}/block", headers=auth_h(ta)).status_code in (200, 204)
        r = s.post(f"{API}/conversations/{cid}/messages", headers=auth_h(tb), json={"clientId": uuid.uuid4().hex, "text": "x"})
        assert r.status_code == 403

    def test_report_creates(self, s, demo_token):
        r = s.post(f"{API}/reports", headers=auth_h(demo_token), json={"targetType": "message", "targetId": "507f1f77bcf86cd799439011", "reason": "spam"})
        assert r.status_code in (200, 201)


# ---------------- stories ----------------
class TestStories:
    def test_feed_scopes(self, s, demo_token):
        for sc in ["all", "friends", "explore"]:
            r = s.get(f"{API}/stories/feed?scope={sc}", headers=auth_h(demo_token))
            assert r.status_code == 200
            body = r.json()
            assert any(k in body for k in ("feed", "stories", "groups"))

    def test_text_story_crud_and_viewers(self, s, demo_token, rohan_token):
        r = s.post(f"{API}/stories", headers=auth_h(demo_token), json={"type": "text", "text": "hi", "audience": "everyone"})
        assert r.status_code in (200, 201), r.text
        sid = r.json()["story"]["id"]
        v = s.post(f"{API}/stories/{sid}/view", headers=auth_h(rohan_token), json={})
        assert v.status_code in (200, 204)
        viewers = s.get(f"{API}/stories/{sid}/viewers", headers=auth_h(demo_token))
        assert viewers.status_code == 200
        not_owner = s.get(f"{API}/stories/{sid}/viewers", headers=auth_h(rohan_token))
        assert not_owner.status_code in (401, 403, 404)
        rc = s.post(f"{API}/stories/{sid}/react", headers=auth_h(rohan_token), json={"emoji": "❤️"})
        assert rc.status_code in (200, 204)
        rep = s.post(f"{API}/stories/{sid}/reply", headers=auth_h(rohan_token), json={"text": "nice"})
        assert rep.status_code in (200, 201)
        d = s.delete(f"{API}/stories/{sid}", headers=auth_h(demo_token))
        assert d.status_code in (200, 204)

    def test_close_friends_audience_hidden(self, s, demo_token, rohan_token):
        r = s.post(f"{API}/stories", headers=auth_h(demo_token), json={"type": "text", "text": "cf", "audience": "close_friends"})
        assert r.status_code in (200, 201)
        sid = r.json()["story"]["id"]
        feed = s.get(f"{API}/stories/feed?scope=all", headers=auth_h(rohan_token)).json()
        groups = feed.get("groups") or feed.get("feed") or feed.get("stories") or []
        found = False
        for g in groups:
            for st in g.get("stories", []):
                if st.get("id") == sid:
                    found = True
        assert not found, "close_friends story visible to non close-friend"
        s.delete(f"{API}/stories/{sid}", headers=auth_h(demo_token))


# ---------------- communities ----------------
class TestCommunities:
    def test_list_search(self, s, demo_token):
        r = s.get(f"{API}/communities", headers=auth_h(demo_token))
        assert r.status_code == 200 and "communities" in r.json()
        cat = s.get(f"{API}/communities?category=business", headers=auth_h(demo_token))
        assert cat.status_code == 200
        q = s.get(f"{API}/communities?q=kannada", headers=auth_h(demo_token))
        assert q.status_code == 200

    def test_private_hides_channels(self, s, ananya_token):
        comms = s.get(f"{API}/communities?category=business", headers=auth_h(ananya_token)).json()["communities"]
        priv = next((c for c in comms if c.get("isPrivate")), None)
        assert priv, "need a private community in seed"
        d = s.get(f"{API}/communities/{priv['id']}", headers=auth_h(ananya_token)).json()
        assert d["canRead"] is False and len(d.get("channels", [])) == 0

    def test_join_public_and_post(self, s):
        _, tok = _new_user(s)
        comms = s.get(f"{API}/communities", headers=auth_h(tok)).json()["communities"]
        pub = next((c for c in comms if not c.get("isPrivate")), None)
        assert pub
        j = s.post(f"{API}/communities/{pub['id']}/join", headers=auth_h(tok), json={})
        assert j.status_code in (200, 201)
        assert j.json().get("status") in ("active", None) or j.json().get("member", {}).get("status") == "active"
        detail = s.get(f"{API}/communities/{pub['id']}", headers=auth_h(tok)).json()
        chs = detail.get("channels", [])
        if chs:
            disc = next((c for c in chs if c.get("type") in ("discussion", "general") or c.get("name", "").lower().startswith("gen")), chs[0])
            msg = s.post(f"{API}/communities/channels/{disc['id']}/messages", headers=auth_h(tok), json={"clientId": uuid.uuid4().hex, "text": "hello community"})
            assert msg.status_code in (200, 201)

    def test_join_private_pending(self, s):
        _, tok = _new_user(s)
        comms = s.get(f"{API}/communities", headers=auth_h(tok)).json()["communities"]
        priv = next((c for c in comms if c.get("isPrivate")), None)
        if not priv:
            pytest.skip("no private community")
        j = s.post(f"{API}/communities/{priv['id']}/join", headers=auth_h(tok), json={})
        assert j.status_code in (200, 201)
        body = j.json()
        status = body.get("status") or body.get("myStatus") or (body.get("community") or {}).get("myStatus") or (body.get("member") or {}).get("status")
        assert status == "pending", f"expected pending, got: {body}"


# ---------------- broadcast ----------------
class TestBroadcast:
    def test_contact_crud_and_duplicate(self, s, demo_token):
        payload = {"name": "TEST Alice", "phone": f"+91{int(time.time())%10000000000:010d}", "consent": "opted_in"}
        c1 = s.post(f"{API}/broadcast/contacts", headers=auth_h(demo_token), json=payload)
        assert c1.status_code == 201, c1.text
        cid = c1.json()["contact"]["id"]
        dup = s.post(f"{API}/broadcast/contacts", headers=auth_h(demo_token), json=payload)
        assert dup.status_code == 409
        get = s.get(f"{API}/broadcast/contacts", headers=auth_h(demo_token))
        assert any(x["id"] == cid for x in get.json()["contacts"])
        d = s.delete(f"{API}/broadcast/contacts/{cid}", headers=auth_h(demo_token))
        assert d.status_code == 204

    def test_csv_preview_and_commit(self, s, demo_token):
        csv_body = "name,phone,consent\nTEST Bob,+919000000111,yes\nTEST Bad,,yes\n"
        p = s.post(f"{API}/broadcast/contacts/import", headers=auth_h(demo_token), json={"csv": csv_body, "commit": False})
        assert p.status_code == 200
        assert p.json()["summary"]["valid"] >= 1
        assert p.json()["summary"]["invalid"] >= 1
        assert p.json()["committed"] is False

    def test_template_and_segment(self, s, demo_token):
        tp = s.post(f"{API}/broadcast/templates", headers=auth_h(demo_token), json={"name": "TEST T", "body": "hello"})
        assert tp.status_code == 201
        sg = s.post(f"{API}/broadcast/segments", headers=auth_h(demo_token), json={"name": "TEST S", "tags": ["test-tag"]})
        assert sg.status_code == 201

    def test_campaign_create_submit_unsubscribe(self, s, demo_token, rohan_token):
        # Create opted-in contact matched to rohan (so delivery goes via vybe)
        rohan_email = "rohan@vybe.app"
        s.post(f"{API}/broadcast/contacts", headers=auth_h(demo_token), json={"name": "TEST Rohan", "email": rohan_email, "consent": "opted_in"})
        # also an external contact
        s.post(f"{API}/broadcast/contacts", headers=auth_h(demo_token), json={"name": "TEST Ext", "phone": "+919111222333", "consent": "opted_in"})
        # fetch contact ids
        contacts = s.get(f"{API}/broadcast/contacts", headers=auth_h(demo_token)).json()["contacts"]
        ids = [c["id"] for c in contacts if c["name"].startswith("TEST ")][:5]
        c = s.post(f"{API}/broadcast/campaigns", headers=auth_h(demo_token), json={"name": "TEST Camp", "type": "text", "body": "Hi there", "contactIds": ids})
        assert c.status_code == 201, c.text
        cid = c.json()["campaign"]["id"]
        sub = s.post(f"{API}/broadcast/campaigns/{cid}/submit", headers=auth_h(demo_token), json={"confirm": True})
        assert sub.status_code == 200, sub.text
        detail = s.get(f"{API}/broadcast/campaigns/{cid}", headers=auth_h(demo_token)).json()
        statuses = [d["status"] for d in detail["deliveries"]]
        assert "delivered" in statuses or "failed" in statuses
        # Non-VYBE contact should fail with external_provider_not_configured
        ext = [d for d in detail["deliveries"] if d["status"] == "failed"]
        if ext:
            assert any(d.get("error") == "external_provider_not_configured" for d in ext)
        # Unsubscribe
        rohan_convs = s.get(f"{API}/conversations", headers=auth_h(rohan_token)).json()["conversations"]
        msg_id = None
        for conv in rohan_convs:
            if conv.get("type") == "broadcast":
                msgs = s.get(f"{API}/conversations/{conv['id']}/messages", headers=auth_h(rohan_token)).json()["messages"]
                for m in msgs:
                    if m.get("campaign", {}).get("campaignId") == cid:
                        msg_id = m["id"]
                        break
            if msg_id:
                break
        if msg_id:
            u = s.post(f"{API}/broadcast/unsubscribe", headers=auth_h(rohan_token), json={"messageId": msg_id})
            assert u.status_code == 204

    def test_confirmation_required_over_threshold(self, s, demo_token):
        # Bulk create 55 opted-in contacts
        existing = s.get(f"{API}/broadcast/contacts", headers=auth_h(demo_token)).json()["contacts"]
        base = 999000000000
        ids = []
        for i in range(55):
            r = s.post(f"{API}/broadcast/contacts", headers=auth_h(demo_token), json={"name": f"TEST Bulk {i}", "phone": f"+91{base + i}", "consent": "opted_in"})
            if r.status_code == 201:
                ids.append(r.json()["contact"]["id"])
        if len(ids) < 51:
            pytest.skip("could not create >50 opted-in contacts")
        c = s.post(f"{API}/broadcast/campaigns", headers=auth_h(demo_token), json={"name": "TEST Big", "type": "text", "body": "hi", "contactIds": ids})
        cid = c.json()["campaign"]["id"]
        sub = s.post(f"{API}/broadcast/campaigns/{cid}/submit", headers=auth_h(demo_token), json={"confirm": False})
        assert sub.status_code == 409
        assert sub.json().get("error") == "confirmation_required"

    def test_analytics(self, s, demo_token):
        r = s.get(f"{API}/broadcast/analytics", headers=auth_h(demo_token))
        assert r.status_code == 200
        body = r.json()
        for k in ["campaigns", "deliveries", "contacts", "optedIn", "unsubscribed"]:
            assert k in body


# ---------------- media ----------------
class TestMedia:
    def test_upload_and_access_control(self, s, demo_token, ananya_token):
        files = {"file": ("hi.txt", b"hello", "text/plain")}
        r = requests.post(f"{API}/media/upload", headers={"Authorization": f"Bearer {demo_token}"}, files=files, timeout=30)
        # 25MB allow-list; txt may not be allowed. Accept 201 or 400.
        if r.status_code == 400:
            # retry with png bytes
            files = {"file": ("x.png", b"\x89PNG\r\n\x1a\n" + b"0" * 50, "image/png")}
            r = requests.post(f"{API}/media/upload", headers={"Authorization": f"Bearer {demo_token}"}, files=files, timeout=30)
        assert r.status_code == 201, r.text
        mid = r.json()["media"]["id"]
        # unattached media: should return 403 for other users (ownership check)
        other = requests.get(f"{API}/media/{mid}", headers={"Authorization": f"Bearer {ananya_token}"}, timeout=20)
        assert other.status_code in (401, 403, 404)
