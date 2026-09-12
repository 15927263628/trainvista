"""Deterministic, explicitly synthetic training records for the demo adapter."""

import hashlib
from datetime import datetime, timedelta, timezone


def stamp(minutes=0):
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat()


STAGES = [
    ("snapshot", "数据快照", "HF Datasets", "3,000", "样本", []),
    ("prepare", "清洗与冻结", "Datasets", "100%", "有效标签", ["snapshot"]),
    ("check", "数据检查", "Validation", "0", "跨集重复", ["prepare"]),
    ("train", "模型训练", "PyTorch", "0.284", "验证 loss", ["check"]),
    ("baseline", "基线训练", "scikit-learn", "0.842", "Macro-F1", ["check"]),
    ("evaluate", "离线评测", "scikit-learn", "0.876", "Macro-F1", ["train", "baseline"]),
    ("gate", "质量门禁", "TrainVista", "4 / 4", "检查通过", ["evaluate"]),
    ("approve", "人工审批", "TrainVista", "待批准", "交付审核", ["gate"]),
    ("publish", "模型交付", "MLflow", "v0.8", "候选版本", ["approve"]),
]

USERS = [
    {"id": "lin", "name": "林序", "role": "operator", "label": "项目负责人", "initial": "林"},
    {"id": "zhou", "name": "周宁", "role": "approver", "label": "交付审批人", "initial": "周"},
    {"id": "chen", "name": "陈默", "role": "viewer", "label": "只读观察者", "initial": "陈"},
]


def make_run(number, status, current, age, score=None, stale=False, owner="林序"):
    run_id = f"TV-{number}"
    stages = []
    order = [x[0] for x in STAGES]
    current_index = order.index(current)
    for i, (key, name, tool, value, unit, dependencies) in enumerate(STAGES):
        state = "succeeded" if i < current_index else "pending"
        if status == "succeeded":
            state = "succeeded"
        elif i == current_index:
            state = {"awaiting": "awaiting", "failed": "failed", "canceled": "canceled"}.get(status, "running")
        if key == "baseline" and current == "train":
            state = "succeeded"
        stages.append({
            "id": key, "name": name, "tool": tool, "status": state,
            "value": value if state == "succeeded" or state == "running" else None,
            "unit": unit, "dependencies": dependencies, "reused": False,
            "duration": [12, 18, 7, 326, 24, 32, 2, 0, 6][i] if state != "pending" else 0,
            "attempts": [{"number": 1, "status": state, "message": "演示事件", "at": stamp(max(age - i, 0))}],
        })
    if number == 1045:
        stages[3]["attempts"] = [
            {"number": 1, "status": "failed", "message": "训练进程退出：模拟 worker 资源不足", "at": stamp(16)},
            {"number": 2, "status": "running", "message": "Prefect 自动重试，绑定新 Attempt", "at": stamp(12)},
        ]
    digest = hashlib.sha256(f"{run_id}:train".encode()).hexdigest()
    return {
        "id": run_id, "name": "AG News · DistilBERT", "version": f"v0.{number - 1039}",
        "status": status, "current": current, "created_at": stamp(age),
        "finished_at": stamp(max(age - 12, 0)) if status in ("succeeded", "failed", "canceled") else None,
        "updated_at": stamp(18) if stale else stamp(), "stale": stale,
        "owner": owner, "requester": "lin", "revision": 1,
        "score": score, "baseline": 0.842, "quality": "passed" if score and score >= .832 else "not_evaluated",
        "code": "c4e8b21", "dataset": "ag-news@frozen-09", "config": "cfg-7c31",
        "checkpoint_digest": digest, "policy": "quality-v1",
        "stages": stages, "rerun_of": None,
        "artifact_origins": {key: run_id for key in order},
        "approval": {"status": "pending" if status == "awaiting" else "approved" if status == "succeeded" else "not_requested",
                     "requester": "lin", "expires_at": (datetime.now(timezone.utc) + timedelta(hours=24)).isoformat(),
                     "digest": digest, "decided_by": "zhou" if status == "succeeded" else None},
        "metrics": [{"step": i * 10, "loss": round(1.36 / (1 + i * .21) + (i % 3) * .018, 3),
                     "throughput": 38 + (i * 7 % 11), "f1": round(.61 + .267 * i / 24, 3)} for i in range(25)],
        "events": [
            {"at": stamp(age), "title": "运行已创建", "detail": "Prefect / ag-news-classification · 演示", "tone": "neutral"},
            {"at": stamp(max(age - 1, 0)), "title": "数据版本已冻结", "detail": "ag-news@frozen-09 · seed 42", "tone": "success"},
            {"at": stamp(max(age - 3, 0)), "title": "数据检查通过", "detail": "标签有效率 100% · 跨集重复 0", "tone": "success"},
        ],
    }


def fixtures():
    runs = [
        make_run(1048, "awaiting", "approve", 38, .876),
        make_run(1047, "running", "train", 22),
        make_run(1046, "failed", "train", 46, owner="许言"),
        make_run(1045, "running", "train", 18, owner="许言"),
        make_run(1044, "running", "evaluate", 52, stale=True),
        make_run(1043, "succeeded", "publish", 94, .861),
        make_run(1042, "succeeded", "publish", 153, .849),
        make_run(1041, "canceled", "train", 181),
    ]
    return {r["id"]: r for r in runs}


def artifacts_for(run):
    artifacts = []
    definitions = [
        ("snapshot", "source-manifest.json", "manifest", "18 KB", []),
        ("prepare", "ag-news-frozen.parquet", "dataset", "2.4 MB", ["snapshot"]),
        ("check", "data-quality.json", "report", "12 KB", ["prepare"]),
        ("train", "model.safetensors", "checkpoint", "268 MB", ["prepare", "check"]),
        ("baseline", "tfidf-baseline.json", "model", "420 KB", ["prepare"]),
        ("evaluate", "evaluation-report.json", "report", "32 KB", ["train", "baseline"]),
        ("publish", "model-card.json", "model_card", "8 KB", ["train", "evaluate"]),
    ]
    for stage_id, name, kind, size, upstream in definitions:
        stage = next(s for s in run["stages"] if s["id"] == stage_id)
        if stage["status"] != "succeeded":
            continue
        origin = run["artifact_origins"][stage_id]
        artifact_id = f"{origin}:{stage_id}"
        artifacts.append({
            "id": artifact_id, "run_id": origin, "name": name, "kind": kind, "size": size,
            "stage": stage_id, "version": "1", "availability": "available",
            "digest": hashlib.sha256(artifact_id.encode()).hexdigest(),
            "created_at": run["created_at"],
            "upstream": [f"{run['artifact_origins'][s]}:{s}" for s in upstream],
        })
    return artifacts
