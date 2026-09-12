"""Local-only demo API. Live mode deliberately fails closed."""

import asyncio
import copy
import hashlib
import json
import logging
import os
import secrets
import time
from contextlib import asynccontextmanager
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Literal, Optional

from fastapi import Depends, FastAPI, Header, HTTPException, Request
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from backend.fixtures import STAGES, USERS, artifacts_for, fixtures, stamp

LOG_DIR = Path(os.environ.get("TRAINVISTA_LOG_DIR", "logs"))
LOG_DIR.mkdir(parents=True, exist_ok=True)
logger = logging.getLogger("trainvista")
logger.setLevel(logging.INFO)
if not logger.handlers:
    logger.addHandler(logging.FileHandler(LOG_DIR / "api.log", encoding="utf-8"))


class DemoStore:
    def __init__(self):
        self.runs = fixtures()
        self.operations = {}
        self.previews = {}
        self.idempotency = {}
        self.audit = []
        self.sessions = {}
        self.lock = asyncio.Lock()
        self.tasks = set()

    def record(self, actor, action, target, reason):
        event = {"id": secrets.token_hex(8), "at": stamp(), "actor": actor["name"],
                 "action": action, "target": target, "reason": reason, "mode": "demo"}
        self.audit.insert(0, event)
        logger.info(json.dumps(event, ensure_ascii=False))


store = DemoStore()


@asynccontextmanager
async def lifespan(_app):
    if os.environ.get("TRAINVISTA_MODE", "demo") != "demo":
        raise RuntimeError("Live mode is not implemented. Configure remote services and connectors first; no local database fallback.")
    yield
    tasks = list(store.tasks)
    for task in tasks:
        task.cancel()
    await asyncio.gather(*tasks, return_exceptions=True)


app = FastAPI(title="TrainVista Demo API", version="0.1.0", lifespan=lifespan)
app.add_middleware(TrustedHostMiddleware, allowed_hosts=["127.0.0.1", "localhost", "testserver"])


@app.middleware("http")
async def local_mutations(request: Request, call_next):
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        origin = request.headers.get("origin")
        allowed = {f"http://{host}:{port}" for host in ("localhost", "127.0.0.1") for port in ("5180", "8100")}
        if origin and origin not in allowed:
            return JSONResponse({"detail": "不允许的跨站操作"}, status_code=403)
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


def actor(request: Request):
    session = store.sessions.get(request.cookies.get("trainvista_session"))
    if not session or session["expires"] < time.time():
        raise HTTPException(401, "演示会话已失效，请刷新页面")
    return next(u for u in USERS if u["id"] == session["user"])


def run_or_404(run_id):
    run = store.runs.get(run_id)
    if not run:
        raise HTTPException(404, "运行不存在")
    return run


def authorize(user, action):
    required = "approver" if action in ("approve", "reject") else "operator"
    if user["role"] != required:
        raise HTTPException(403, "当前身份无权执行此操作")


class SessionInput(BaseModel):
    user_id: Literal["lin", "zhou", "chen"] = "lin"


@app.post("/api/v1/demo/session")
async def session(body: SessionInput):
    token = secrets.token_urlsafe(32)
    store.sessions[token] = {"user": body.user_id, "expires": time.time() + 86400}
    response = JSONResponse(next(u for u in USERS if u["id"] == body.user_id))
    response.set_cookie("trainvista_session", token, httponly=True, samesite="strict", max_age=86400)
    return response


@app.get("/api/v1/health")
def health():
    return {"status": "ok", "mode": "demo", "persistence": "memory", "live_enabled": False}


@app.get("/api/v1/workspace")
def workspace(user=Depends(actor)):
    return {"mode": "demo", "user": user, "users": USERS, "candidate_id": "TV-1048",
            "sources": [
                {"name": "Prefect", "kind": "流程编排", "status": "simulated", "latency": "30s"},
                {"name": "MLflow", "kind": "实验与产物", "status": "simulated", "latency": "30s"},
                {"name": "Object storage", "kind": "版本化文件", "status": "not_configured", "latency": None},
            ]}


@app.get("/api/v1/runs")
def runs(_user=Depends(actor)):
    return list(store.runs.values())


@app.get("/api/v1/runs/{run_id}")
def run_details(run_id: str, _user=Depends(actor)):
    return run_or_404(run_id)


@app.get("/api/v1/artifacts")
def artifacts(_user=Depends(actor)):
    unique = {}
    for run in store.runs.values():
        for item in artifacts_for(run):
            unique.setdefault(item["id"], item)
    return list(unique.values())


@app.get("/api/v1/artifacts/{artifact_id}/manifest")
def artifact_manifest(artifact_id: str, _user=Depends(actor)):
    all_items = {a["id"]: a for r in store.runs.values() for a in artifacts_for(r)}
    if artifact_id not in all_items:
        raise HTTPException(404, "产物不存在")
    return {"mode": "demo", "synthetic": True, "artifact": all_items[artifact_id],
            "note": "This is a synthetic metadata manifest, not an actual model or dataset."}


@app.get("/api/v1/audit")
def audit(_user=Depends(actor)):
    return store.audit


@app.get("/api/v1/operations")
def operations(_user=Depends(actor)):
    return list(reversed(list(store.operations.values())))


@app.get("/api/v1/operations/{operation_id}")
def operation_details(operation_id: str, _user=Depends(actor)):
    operation = store.operations.get(operation_id)
    if not operation:
        raise HTTPException(404, "操作记录不存在")
    return operation


class PreviewInput(BaseModel):
    action: Literal["rerun", "cancel", "approve", "reject"]
    scope: Literal["all", "train", "evaluate"] = "all"


class OperationInput(BaseModel):
    preview_token: str
    reason: str = Field(min_length=3, max_length=500)


def validate_action(run, action, scope, user):
    authorize(user, action)
    if run["stale"]:
        raise HTTPException(409, "来源数据已过期，无法核验当前状态")
    if action == "cancel" and run["status"] not in ("running", "awaiting"):
        raise HTTPException(409, "当前运行不可终止")
    if action == "rerun":
        if run["status"] in ("running", "queued", "canceling"):
            raise HTTPException(409, "活动运行不可重复启动，请等待完成或先终止")
        if any(r.get("rerun_of") == run["id"] and r["status"] in ("queued", "running", "awaiting")
               for r in store.runs.values()):
            raise HTTPException(409, "该运行已有活动重跑")
        required = {"train": "check", "evaluate": "train"}.get(scope)
        if required and next(s for s in run["stages"] if s["id"] == required)["status"] != "succeeded":
            raise HTTPException(409, "重跑所需的冻结输入或 checkpoint 不可用")
    if action in ("approve", "reject"):
        approval = run["approval"]
        if run["status"] != "awaiting" or approval["status"] != "pending":
            raise HTTPException(409, "审批申请已处理或当前状态不允许审批")
        if approval["requester"] == user["id"]:
            raise HTTPException(403, "不能审批自己的申请")
        if datetime.fromisoformat(approval["expires_at"]) <= datetime.now(timezone.utc):
            raise HTTPException(409, "审批申请已过期")
        if approval["digest"] != run["checkpoint_digest"] or run["quality"] != "passed":
            raise HTTPException(409, "证据已变化或质量门禁未通过")


@app.post("/api/v1/runs/{run_id}/operations/preview")
async def preview(run_id: str, body: PreviewInput, user=Depends(actor)):
    async with store.lock:
        run = run_or_404(run_id)
        validate_action(run, body.action, body.scope, user)
        token = secrets.token_urlsafe(24)
        start = {"all": 0, "train": 3, "evaluate": 5}[body.scope]
        data = {"token": token, "run_id": run_id, "actor": user["id"],
                "revision": run["revision"], "action": body.action, "scope": body.scope,
                "expires": time.time() + 120, "dataset": run["dataset"], "code": run["code"],
                "checkpoint": run["checkpoint_digest"],
                "stages": [s[1] for s in STAGES[start:]], "mode": "demo"}
        store.previews[token] = data
        return data


async def simulate_rerun(run_id):
    for stage_index in range(len(STAGES)):
        async with store.lock:
            run = store.runs[run_id]
            if run["status"] not in ("running", "queued"):
                return
            stage = run["stages"][stage_index]
            if stage["status"] == "succeeded":
                continue
            run["current"] = stage["id"]
            if stage["id"] == "approve":
                run["status"] = "awaiting"
                stage["status"] = "awaiting"
                run["approval"] = {
                    "status": "pending", "requester": run["requester"], "decided_by": None,
                    "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
                    "digest": run["checkpoint_digest"],
                }
                run["revision"] += 1
                return
            stage["status"] = "running"
            stage["attempts"] = [{"number": 1, "status": "running", "message": "演示执行", "at": stamp()}]
        await asyncio.sleep(1)
        async with store.lock:
            if run["status"] not in ("running", "queued"):
                return
            stage["status"] = "succeeded"
            stage["attempts"][-1]["status"] = "succeeded"
            stage["value"] = STAGES[stage_index][3]
            stage["duration"] = 1
            run["updated_at"] = stamp()
            run["revision"] += 1
            run["events"].append({"at": stamp(), "title": f"{stage['name']}完成", "detail": "模拟事件，不代表真实训练", "tone": "success"})
            if stage["id"] == "evaluate":
                run["score"] = .876
                run["quality"] = "passed"


async def settle(operation_id, run_id, action):
    await asyncio.sleep(2)
    async with store.lock:
        run = store.runs[run_id]
        op = store.operations[operation_id]
        if action == "cancel":
            run["status"] = "canceled"
            run["finished_at"] = stamp()
            for stage in run["stages"]:
                if stage["status"] in ("running", "awaiting"):
                    stage["status"] = "canceled"
            if run["approval"]["status"] == "pending":
                run["approval"]["status"] = "canceled"
        elif action == "rerun":
            run["status"] = "running"
            next(s for s in run["stages"] if s["id"] == run["current"])["status"] = "running"
        elif action == "approve":
            run["status"] = "succeeded"
            run["finished_at"] = stamp()
            run["current"] = "publish"
            run["stages"][-1]["status"] = "succeeded"
        run["revision"] += 1
        run["updated_at"] = stamp()
        op["status"] = "succeeded"
        op["result"] = "演示操作完成；未调用外部训练或调度服务"
        run["events"].append({"at": stamp(), "title": op["result"], "detail": operation_id, "tone": "success"})
        logger.info(json.dumps({"operation_id": operation_id, "result": op["result"]}, ensure_ascii=False))
    if action == "rerun":
        await simulate_rerun(run_id)


@app.post("/api/v1/runs/{run_id}/operations", status_code=202)
async def operate(run_id: str, body: OperationInput,
                  idempotency_key: Optional[str] = Header(None), user=Depends(actor)):
    if not idempotency_key or len(idempotency_key) > 128:
        raise HTTPException(400, "需要有效的 Idempotency-Key")
    if len(body.reason.strip()) < 3:
        raise HTTPException(422, "操作理由至少需要三个有效字符")
    fingerprint = hashlib.sha256(json.dumps([run_id, body.model_dump()], sort_keys=True).encode()).hexdigest()
    idem = (user["id"], idempotency_key)
    async with store.lock:
        prior = store.idempotency.get(idem)
        if prior:
            if prior["fingerprint"] != fingerprint:
                raise HTTPException(409, "同一幂等键不能用于不同请求")
            return store.operations[prior["operation_id"]]
        plan = store.previews.get(body.preview_token)
        if not plan or plan["actor"] != user["id"] or plan["run_id"] != run_id:
            raise HTTPException(403, "预检凭证无效")
        if plan["expires"] < time.time():
            raise HTTPException(409, "预检已过期，请重新确认")
        run = run_or_404(run_id)
        if run["revision"] != plan["revision"]:
            raise HTTPException(409, "运行状态已变化，请重新预检")
        action = plan["action"]
        validate_action(run, action, plan["scope"], user)
        target = run
        if action == "rerun":
            target = copy.deepcopy(run)
            target["id"] = f"TV-{max(int(k[3:]) for k in store.runs) + 1}"
            target.update(status="queued", revision=1, rerun_of=run_id, reuse_run=run_id,
                          created_at=stamp(), updated_at=stamp(), score=None, quality="not_evaluated",
                          metrics=[], events=[], stale=False, requester=user["id"], owner=user["name"], finished_at=None)
            target["approval"] = {"status": "not_requested", "requester": user["id"],
                                  "expires_at": stamp(), "digest": "", "decided_by": None}
            start = {"all": 0, "train": 3, "evaluate": 5}[plan["scope"]]
            target["current"] = STAGES[start][0]
            for i, stage in enumerate(target["stages"]):
                stage["reused"] = i < start
                if i >= start:
                    target["artifact_origins"][stage["id"]] = target["id"]
                stage["status"] = "succeeded" if i < start else "pending"
                stage["duration"] = 0
                stage["attempts"] = []
                if i >= start:
                    stage["value"] = None
            target["checkpoint_digest"] = hashlib.sha256(f"{target['artifact_origins']['train']}:train".encode()).hexdigest()
            store.runs[target["id"]] = target
        elif action == "cancel":
            run["status"] = "canceling"
        else:
            run["approval"].update(status="approved" if action == "approve" else "rejected",
                                   decided_by=user["id"], reason=body.reason.strip())
            run["stages"][-2]["status"] = "succeeded"
            run["stages"][-1]["status"] = "running" if action == "approve" else "skipped"
            run["current"] = "publish"
            run["status"] = "publishing" if action == "approve" else "rejected"
            if action == "reject":
                run["finished_at"] = stamp()
        run["revision"] += 1
        operation_id = "op-" + secrets.token_hex(6)
        op = {"id": operation_id, "run_id": run_id, "target_id": target["id"], "action": action,
              "status": "succeeded" if action == "reject" else "accepted", "actor": user["name"],
              "reason": body.reason.strip(), "at": stamp(), "mode": "demo", "result": None}
        store.operations[operation_id] = op
        store.idempotency[idem] = {"fingerprint": fingerprint, "operation_id": operation_id}
        store.record(user, action, run_id, body.reason.strip())
        if action != "reject":
            task = asyncio.create_task(settle(operation_id, target["id"], action))
            store.tasks.add(task)
            task.add_done_callback(store.tasks.discard)
        return op
