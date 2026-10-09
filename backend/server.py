"""Thin gateway: the VYBE API is a Node.js/Express (TypeScript) service in ./node.
The platform supervisor runs this module on :8001; it launches the Node API on
NODE_API_PORT and forwards every /api/* request to it unchanged."""
import os
import subprocess
from pathlib import Path

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, Request, Response

ROOT = Path(__file__).parent
load_dotenv(ROOT / ".env")
NODE_PORT = os.environ["NODE_API_PORT"]
NODE_URL = f"http://127.0.0.1:{NODE_PORT}"
HOP = {"content-length", "transfer-encoding", "connection", "keep-alive", "host", "content-encoding"}

app = FastAPI()
client = httpx.AsyncClient(base_url=NODE_URL, timeout=120)
proc: subprocess.Popen | None = None


@app.on_event("startup")
async def start_node():
    global proc
    subprocess.run(["fuser", "-k", f"{NODE_PORT}/tcp"], capture_output=True)
    log = open("/var/log/supervisor/vybe-node.log", "a")
    proc = subprocess.Popen(["node", "src/server.ts"], cwd=ROOT / "node", env={**os.environ}, stdout=log, stderr=log)


@app.on_event("shutdown")
async def stop_node():
    if proc and proc.poll() is None:
        proc.terminate()


@app.api_route("/api/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
async def proxy(path: str, request: Request):
    headers = {k: v for k, v in request.headers.items() if k.lower() not in HOP}
    headers["x-forwarded-for"] = request.client.host if request.client else ""
    try:
        r = await client.request(request.method, f"/api/{path}", params=request.query_params, content=await request.body(), headers=headers)
    except httpx.ConnectError:
        return Response('{"error":"api_starting"}', status_code=503, media_type="application/json")
    return Response(r.content, status_code=r.status_code, headers={k: v for k, v in r.headers.items() if k.lower() not in HOP})
