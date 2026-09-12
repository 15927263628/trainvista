"""API integration checks against an isolated in-memory ASGI application."""

import concurrent.futures
import os
import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend import app as module


checks = []


def check(name, condition):
    assert condition, name
    checks.append(name)
    print(f"PASS {name}", flush=True)
    with Path("logs/api-verification.log").open("a") as log:
        log.write(f"PASS {name}\n")


def login(client, identity):
    response = client.post("/api/v1/demo/session", json={"user_id": identity})
    assert response.status_code == 200


def preview(client, run_id, action, scope="all"):
    response = client.post(f"/api/v1/runs/{run_id}/operations/preview", json={"action": action, "scope": scope})
    assert response.status_code == 200, response.text
    return response.json()["token"]


def submit(client, run_id, token, key, reason="integration verification"):
    return client.post(f"/api/v1/runs/{run_id}/operations", json={"preview_token": token, "reason": reason}, headers={"Idempotency-Key": key})


module.store = module.DemoStore()
with TestClient(module.app) as client:
    check("unauthenticated access rejected", client.get("/api/v1/runs").status_code == 401)
    check("health explicitly reports memory demo", client.get("/api/v1/health").json()["persistence"] == "memory")
    check("cross-origin mutation rejected", client.post("/api/v1/demo/session", json={"user_id": "lin"}, headers={"Origin": "https://other.example"}).status_code == 403)
    login(client, "chen")
    check("viewer cannot rerun", client.post("/api/v1/runs/TV-1046/operations/preview", json={"action": "rerun"}).status_code == 403)
    login(client, "lin")
    check("operator cannot approve", client.post("/api/v1/runs/TV-1048/operations/preview", json={"action": "approve"}).status_code == 403)
    check("stale source cannot cancel", client.post("/api/v1/runs/TV-1044/operations/preview", json={"action": "cancel"}).status_code == 409)
    check("missing checkpoint blocks partial rerun", client.post("/api/v1/runs/TV-1046/operations/preview", json={"action": "rerun", "scope": "evaluate"}).status_code == 409)
    token = preview(client, "TV-1046", "rerun", "train")
    check("blank reason rejected", submit(client, "TV-1046", token, "blank", "   ").status_code == 422)
    response = submit(client, "TV-1046", token, "rerun")
    check("rerun accepted", response.status_code == 202)
    operation = response.json()
    check("duplicate request returns same operation", submit(client, "TV-1046", token, "rerun").json()["id"] == operation["id"])
    check("idempotency body conflict rejected", submit(client, "TV-1046", token, "rerun", "different reason").status_code == 409)
    child = client.get(f"/api/v1/runs/{operation['target_id']}").json()
    check("rerun creates distinct lineage", child["rerun_of"] == "TV-1046" and child["id"] != "TV-1046")
    check("reused data origin preserved", child["artifact_origins"]["prepare"] == "TV-1046")
    check("old run still failed", client.get("/api/v1/runs/TV-1046").json()["status"] == "failed")
    check("concurrent duplicate rerun rejected", client.post("/api/v1/runs/TV-1046/operations/preview", json={"action": "rerun"}).status_code == 409)
    token = preview(client, "TV-1047", "cancel")
    module.store.previews[token]["expires"] = 0
    check("expired preview rejected", submit(client, "TV-1047", token, "expired").status_code == 409)
    token = preview(client, "TV-1047", "cancel")
    check("cancel accepted", submit(client, "TV-1047", token, "cancel").status_code == 202)
    check("cancel remains transitional before acknowledgement", client.get("/api/v1/runs/TV-1047").json()["status"] == "canceling")
    time.sleep(2.2)
    check("cancel eventually settles", client.get("/api/v1/runs/TV-1047").json()["status"] == "canceled")
    login(client, "zhou")
    saved_requester = module.store.runs["TV-1048"]["approval"]["requester"]
    module.store.runs["TV-1048"]["approval"]["requester"] = "zhou"
    check("self-approval rejected", client.post("/api/v1/runs/TV-1048/operations/preview", json={"action": "approve"}).status_code == 403)
    module.store.runs["TV-1048"]["approval"]["requester"] = saved_requester
    saved_digest = module.store.runs["TV-1048"]["checkpoint_digest"]
    module.store.runs["TV-1048"]["checkpoint_digest"] = "changed"
    check("changed approval evidence rejected", client.post("/api/v1/runs/TV-1048/operations/preview", json={"action": "approve"}).status_code == 409)
    module.store.runs["TV-1048"]["checkpoint_digest"] = saved_digest
    approve_token = preview(client, "TV-1048", "approve")
    reject_token = preview(client, "TV-1048", "reject")
    with concurrent.futures.ThreadPoolExecutor() as pool:
        results = list(pool.map(lambda args: submit(client, "TV-1048", *args), [(approve_token, "decision-a"), (reject_token, "decision-b")]))
    check("approval race accepts exactly one decision", sorted(r.status_code for r in results) == [202, 409])
    check("audit contains actual actor", any(e["actor"] == "周宁" for e in client.get("/api/v1/audit").json()))
    check("unknown artifact rejected", client.get("/api/v1/artifacts/missing/manifest").status_code == 404)
    artifact = client.get("/api/v1/artifacts").json()[0]
    check("download explicitly synthetic", client.get(f"/api/v1/artifacts/{artifact['id']}/manifest").json()["synthetic"] is True)
    time.sleep(6)
    check("rerun progresses to approval", client.get(f"/api/v1/runs/{operation['target_id']}").json()["status"] == "awaiting")
    all_artifacts = client.get("/api/v1/artifacts").json()
    checkpoint = next(a for a in all_artifacts if a["id"] == f"{operation['target_id']}:train")
    check("new checkpoint consumes original frozen input", "TV-1046:prepare" in checkpoint["upstream"])

os.environ["TRAINVISTA_MODE"] = "live"
try:
    with TestClient(module.app):
        raise AssertionError("Live mode unexpectedly started")
except RuntimeError as error:
    check("live mode fails closed", "not implemented" in str(error))
finally:
    os.environ.pop("TRAINVISTA_MODE")
print(f"\n{len(checks)} API integration checks passed.", flush=True)
