export type Status = 'pending' | 'queued' | 'running' | 'awaiting' | 'succeeded' | 'failed' | 'canceled' | 'canceling' | 'publishing' | 'rejected' | 'skipped';
export type Action = 'rerun' | 'cancel' | 'approve' | 'reject';
export type User = { id: string; name: string; role: string; label: string; initial: string };
export type Stage = {
  id: string; name: string; tool: string; status: Status; value: string | null;
  unit: string; dependencies: string[]; reused: boolean; duration: number;
  attempts: { number: number; status: Status; message: string; at: string }[];
};
export type Run = {
  id: string; name: string; version: string; status: Status; current: string;
  created_at: string; finished_at: string | null; updated_at: string; stale: boolean; owner: string; requester: string;
  revision: number; score: number | null; baseline: number; quality: string;
  code: string; dataset: string; config: string; checkpoint_digest: string; policy: string;
  stages: Stage[]; rerun_of: string | null; artifact_origins: Record<string, string>;
  approval: { status: string; requester: string; expires_at: string; digest: string; decided_by: string | null };
  metrics: { step: number; loss: number; throughput: number; f1: number }[];
  events: { at: string; title: string; detail: string; tone: string }[];
};
export type Artifact = { id: string; run_id: string; name: string; kind: string; size: string; stage: string; version: string; availability: string; digest: string; created_at: string; upstream: string[] };
export type Workspace = { mode: string; user: User; users: User[]; candidate_id: string; sources: { name: string; kind: string; status: string; latency: string | null }[] };
export type Audit = { id: string; at: string; actor: string; action: Action; target: string; reason: string };
export type Operation = { id: string; run_id: string; target_id: string; action: Action; status: string; actor: string; reason: string; at: string; result: string | null };
export type Preview = { token: string; run_id: string; revision: number; action: Action; scope: string; expires: number; dataset: string; code: string; checkpoint: string; stages: string[] };
