import os
import pytest
import requests

BASE = os.environ.get("EXPO_PUBLIC_BACKEND_URL", "https://vybe-messenger-1.preview.emergentagent.com").rstrip("/")
API = f"{BASE}/api"
PWD = "VybeDemo123!"


@pytest.fixture(scope="session")
def api():
    return API


@pytest.fixture(scope="session")
def s():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


def _login(session, email, pin=None):
    body = {"email": email, "password": PWD}
    if pin:
        body["pin"] = pin
    r = session.post(f"{API}/auth/login", json=body, timeout=30)
    return r


@pytest.fixture(scope="session")
def demo_token(s):
    r = _login(s, "demo@vybe.app")
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def rohan_token(s):
    r = _login(s, "rohan@vybe.app")
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def ananya_token(s):
    r = _login(s, "ananya@vybe.app")
    assert r.status_code == 200, r.text
    return r.json()["token"]


@pytest.fixture(scope="session")
def sneha_token(s):
    r = _login(s, "sneha@vybe.app")
    assert r.status_code == 200, r.text
    return r.json()["token"]


def auth_h(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
