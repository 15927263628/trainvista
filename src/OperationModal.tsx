import { useEffect, useState } from 'react';
import { ArrowRight, ShieldCheck, TriangleAlert } from 'lucide-react';
import { api } from './api';
import { actionLabels, ErrorBox, Modal } from './components';
import type { Action, Operation, Preview, Run } from './types';

export function OperationModal({ run, action, close, done }: { run: Run; action: Action; close: () => void; done: (op: Operation) => Promise<void> }) {
  const [scope, setScope] = useState('all');
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<Preview>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [key] = useState(() => crypto.randomUUID());
  useEffect(() => {
    const controller = new AbortController();
    setPreview(undefined);
    setError('');
    api<Preview>(`/runs/${run.id}/operations/preview`, { method: 'POST', body: JSON.stringify({ action, scope }), signal: controller.signal })
      .then(setPreview).catch(e => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [run.id, action, scope]);
  async function submit() {
    if (!preview || busy) return;
    setBusy(true);
    setError('');
    try {
      const op = await api<Operation>(`/runs/${run.id}/operations`, {
        method: 'POST', headers: { 'Idempotency-Key': key },
        body: JSON.stringify({ preview_token: preview.token, reason: reason.trim() }),
      });
      await done(op);
      close();
    } catch (e) { setError((e as Error).message); }
    finally { setBusy(false); }
  }
  const destructive = action === 'cancel' || action === 'reject';
  return <Modal title={`${actionLabels[action]} · ${run.id}`} close={() => { if (!busy) close(); }}>
    <div className="modal-body">
      <div className={`notice ${destructive ? 'warning' : ''}`}><TriangleAlert size={17} /><span>演示模式 · 本次操作不调用真实训练服务</span></div>
      {action === 'rerun' && <label className="field">执行范围<select value={scope} onChange={e => setScope(e.target.value)} disabled={busy}>
        <option value="all">整条流水线</option><option value="train">从模型训练开始</option><option value="evaluate">从离线评测开始</option>
      </select></label>}
      <div className="plan-facts"><div><span>目标版本</span><strong>{run.version}</strong></div><div><span>状态修订</span><code>revision {run.revision}</code></div><div><span>冻结数据</span><code>{run.dataset}</code></div><div><span>代码版本</span><code>{run.code}</code></div></div>
      {action === 'rerun' && preview && <div className="execution-scope">{preview.stages.map((s, i) => <span key={s}>{i > 0 && <ArrowRight size={12} />}{s}</span>)}</div>}
      {(action === 'approve' || action === 'reject') && <div className="evidence"><ShieldCheck size={18} /><div><strong>审批证据已锁定</strong><p>Macro-F1 {run.score?.toFixed(3)} · {run.policy}</p><code>{run.checkpoint_digest.slice(0, 28)}…</code></div></div>}
      {action === 'cancel' && <p className="muted">终止范围：整条运行。已生成产物保留，下游未执行阶段不再启动。</p>}
      <label className="field">操作理由<textarea value={reason} maxLength={500} onChange={e => setReason(e.target.value)} rows={3} placeholder="填写本次操作的原因" disabled={busy} /></label>
      {error && <ErrorBox message={error} />}
      {!preview && !error && <p className="muted" role="status">正在核验权限和状态…</p>}
    </div>
    <div className="modal-footer"><button className="button" onClick={close} disabled={busy}>取消</button>
      <button className={`button ${destructive ? 'danger' : 'primary'}`} disabled={!preview || busy || reason.trim().length < 3} onClick={submit}>{busy ? '提交中…' : `确认${actionLabels[action]}`}</button></div>
  </Modal>;
}
