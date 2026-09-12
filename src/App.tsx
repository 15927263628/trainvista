import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import {
  Activity, ArrowDownToLine, ArrowLeft, ArrowRight, Bell, Box, Check, ChevronDown, ChevronRight,
  CircleCheck, Clock3, Database, FileJson, FlaskConical, GitBranch, LayoutDashboard,
  ListFilter, LoaderCircle, Menu, MoreHorizontal, Network, RefreshCw, RotateCcw, Search,
  Settings2, ShieldCheck, Square, Terminal, TriangleAlert, X, Zap,
} from 'lucide-react';
import { api, ApiError, downloadJSON } from './api';
import { actionLabels, Badge, elapsed, Empty, ErrorBox, MetricChart, Modal, StatusIcon, statusLabels, Time } from './components';
import { RunGraph } from './RunGraph';
import { OperationModal } from './OperationModal';
import type { Action, Artifact, Audit, Operation, Run, Stage, Workspace } from './types';

type Data = { runs: Run[]; artifacts: Artifact[]; workspace: Workspace; audit: Audit[]; operations: Operation[] };
type PageProps = Data & { onAction: (run: Run, action: Action) => void; refresh: () => Promise<void> };

export default function App() {
  const [data, setData] = useState<Data>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [mobileNav, setMobileNav] = useState(false);
  const [operation, setOperation] = useState<{ run: Run; action: Action }>();
  const [toast, setToast] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');
  const [switching, setSwitching] = useState(false);
  const navigate = useNavigate();
  const refresh = useCallback(async () => {
    try {
      const [runs, artifacts, workspace, audit, operations] = await Promise.all([
        api<Run[]>('/runs'), api<Artifact[]>('/artifacts'), api<Workspace>('/workspace'), api<Audit[]>('/audit'), api<Operation[]>('/operations'),
      ]);
      setData({ runs, artifacts, workspace, audit, operations });
      setError('');
    } catch (e) { setError((e as Error).message); }
  }, []);
  useEffect(() => {
    let canceled = false;
    async function init() {
      try {
        try {
          await api('/workspace');
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 401) throw e;
          await api('/demo/session', { method: 'POST', body: JSON.stringify({ user_id: 'lin' }) });
        }
        if (!canceled) await refresh();
      } catch (e) { if (!canceled) setError((e as Error).message); }
    }
    void init();
    const timer = setInterval(() => { void refresh(); }, 5000);
    return () => { canceled = true; clearInterval(timer); };
  }, [refresh]);
  useEffect(() => { if (toast) { const timer = setTimeout(() => setToast(''), 5000); return () => clearTimeout(timer); } }, [toast]);
  async function changeUser(user_id: string) {
    setSwitching(true);
    try { await api('/demo/session', { method: 'POST', body: JSON.stringify({ user_id }) }); await refresh(); }
    catch (e) { setError((e as Error).message); }
    finally { setSwitching(false); }
  }
  const nav = [
    { to: '/', label: '项目总览', icon: LayoutDashboard },
    { to: '/runs', label: '流水线运行', icon: GitBranch },
    { to: '/artifacts', label: '产物仓库', icon: Box },
    { to: '/approvals', label: '交付审批', icon: ShieldCheck },
    { to: '/audit', label: '操作记录', icon: Activity },
  ];
  const pending = data?.runs.filter(r => r.status === 'awaiting').length ?? 0;
  const props = data ? { ...data, refresh, onAction: (run: Run, action: Action) => setOperation({ run, action }) } : undefined;
  return <div className="app-shell">
    {mobileNav && <button className="nav-scrim" aria-label="关闭导航" onClick={() => setMobileNav(false)} />}
    <aside className={`sidebar ${mobileNav ? 'open' : ''}`}>
      <Link to="/" className="brand"><span className="brand-mark"><Network size={22} /></span><span>TrainVista<small>TRAINING WORKSPACE</small></span></Link>
      <div className="workspace-switch"><span className="workspace-avatar">N</span><div><strong>NLP Research</strong><small>实验工作空间</small></div><ChevronDown size={14} /></div>
      <span className="nav-label">工作空间</span>
      <nav>{nav.map(({ to, label, icon: Icon }) => <NavLink key={to} to={to} end={to === '/'} onClick={() => setMobileNav(false)}><Icon size={18} /><span>{label}</span>{to === '/approvals' && pending > 0 && <b className="nav-count">{pending}</b>}</NavLink>)}</nav>
      <span className="nav-label second">管理</span>
      <nav><NavLink to="/sources" onClick={() => setMobileNav(false)}><Database size={18} /><span>数据源连接</span></NavLink><NavLink to="/settings" onClick={() => setMobileNav(false)}><Settings2 size={18} /><span>工作空间设置</span></NavLink></nav>
      <div className="sidebar-bottom"><div className="env-status"><span className="dot amber" />演示环境<span>v0.1</span></div>
        <div className="profile"><span className="avatar">{data?.workspace.user.initial ?? '林'}</span><div><strong>{data?.workspace.user.name ?? '林序'}</strong><small>{data?.workspace.user.label ?? '项目负责人'}</small></div><MoreHorizontal size={18} /></div>
      </div>
    </aside>
    <div className="main-shell">
      <header className="topbar"><div className="breadcrumbs"><button className="icon-button mobile-menu" aria-label="打开导航" onClick={() => setMobileNav(true)}><Menu size={20} /></button><span>NLP Research</span><ChevronRight size={13} /><strong>AG News 分类实验</strong></div>
        <div className="topbar-actions"><form className="global-search" onSubmit={e => { e.preventDefault(); navigate(`/runs?q=${encodeURIComponent(globalSearch)}`); }}><Search size={15} /><input aria-label="搜索运行" placeholder="搜索运行或版本…" value={globalSearch} onChange={e => setGlobalSearch(e.target.value)} /><kbd>↵</kbd></form>
          <span className="demo-label"><FlaskConical size={13} />模拟数据</span>
          <button className="icon-button notification" title="待处理审批" aria-label="待处理审批" onClick={() => navigate('/approvals')}><Bell size={18} />{pending > 0 && <i />}</button>
        </div>
      </header>
      <main>
        <div className="context-bar"><span><span className="dot green" />公开实验 · DistilBERT / AG News</span><div><span>演示身份</span><select aria-label="演示身份" value={data?.workspace.user.id ?? 'lin'} onChange={e => void changeUser(e.target.value)} disabled={switching}>{(data?.workspace.users ?? []).map(u => <option key={u.id} value={u.id}>{u.name} · {u.label}</option>)}</select></div></div>
        {error && <ErrorBox message={`${error}。${data ? '当前显示最后一次成功读取的数据。' : '请确认 API 服务已启动。'}`} />}
        {!data ? <div className="loading-state"><LoaderCircle className="spin" size={26} /><h2>正在连接工作空间</h2>{error && <button className="button" onClick={() => window.location.reload()}>重新连接</button>}</div> : props && <>
          <Routes>
            <Route path="/" element={<Overview {...props} />} />
            <Route path="/runs" element={<RunsPage {...props} />} />
            <Route path="/runs/:id" element={<RunDetail {...props} />} />
            <Route path="/artifacts" element={<ArtifactsPage {...props} />} />
            <Route path="/approvals" element={<ApprovalsPage {...props} />} />
            <Route path="/audit" element={<AuditPage {...props} />} />
            <Route path="/sources" element={<SourcesPage {...props} />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Empty title="页面不存在"><Link to="/">返回总览</Link></Empty>} />
          </Routes>
          <footer className="page-footer"><span>TrainVista <span className="footer-separator">/</span> NLP Research</span><button onClick={async () => { setBusy(true); await refresh(); setBusy(false); }}><RefreshCw size={12} className={busy ? 'spin' : ''} />{busy ? '刷新中' : '刷新数据'}<span className="dot green" /></button></footer>
        </>}
      </main>
    </div>
    {operation && <OperationModal run={operation.run} action={operation.action} close={() => setOperation(undefined)} done={async op => { setToast(`${actionLabels[op.action]}已提交 · ${op.target_id} · 演示`); await refresh(); }} />}
    {toast && <div className="toast" role="status"><CircleCheck size={18} />{toast}<button className="icon-button" aria-label="关闭提示" onClick={() => setToast('')}><X size={15} /></button></div>}
  </div>;
}

function PageHeading({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return <div className="page-heading"><div><div className="eyebrow">{eyebrow}</div><h1>{title}</h1></div>{right}</div>;
}
function StageStrip({ run }: { run: Run }) {
  return <div className="stage-strip" aria-label={run.stages.map(s => `${s.name} ${statusLabels[s.status]}`).join('，')}>{run.stages.map(s => <span key={s.id} className={s.status} title={`${s.name} · ${statusLabels[s.status]}`} />)}</div>;
}
function RunTable({ runs }: { runs: Run[] }) {
  return <div className="table-scroll"><table className="run-table"><thead><tr><th>运行 / 模型版本</th><th>执行状态</th><th>流程进展</th><th>Macro-F1</th><th>已用时</th><th>负责人</th><th /></tr></thead><tbody>{runs.map(run => <tr key={run.id}>
    <td><Link className="run-name" to={`/runs/${run.id}`}>{run.id}<span>{run.version}</span></Link><small>{run.name}{run.rerun_of && ` · 重跑自 ${run.rerun_of}`}</small></td>
    <td><Badge status={run.status} />{run.stale && <small className="stale"><TriangleAlert size={11} />数据更新中断</small>}</td>
    <td><StageStrip run={run} /><small>{run.stages.find(s => s.id === run.current)?.name} <span className="muted">· {run.stages.filter(s => s.status === 'succeeded').length}/9</span></small></td>
    <td><span className="mono score">{run.score?.toFixed(3) ?? '—'}</span>{run.score && <small className="positive">+{((run.score - run.baseline) * 100).toFixed(1)} pp</small>}</td>
    <td className="mono">{elapsed(run.created_at, run.finished_at)}</td><td><span className="owner-avatar">{run.owner[0]}</span>{run.owner}</td>
    <td><Link className="icon-button" to={`/runs/${run.id}`} aria-label={`查看 ${run.id}`}><ChevronRight size={16} /></Link></td>
  </tr>)}</tbody></table>{!runs.length && <Empty title="没有匹配的运行" />}</div>;
}

function Overview(props: PageProps) {
  const { runs, workspace, onAction } = props;
  const candidate = runs.find(r => r.id === workspace.candidate_id)!;
  const failures = runs.filter(r => r.status === 'failed');
  const awaiting = runs.filter(r => r.status === 'awaiting');
  const stale = runs.filter(r => r.stale);
  const risks = [...failures, ...awaiting, ...stale];
  const [status, setStatus] = useState(localStorage.getItem('trainvista-focus') === 'on' ? 'attention' : 'all');
  const active = runs.filter(r => ['running', 'queued', 'publishing', 'canceling'].includes(r.status));
  const visible = status === 'all' ? runs : status === 'active' ? active : risks;
  return <>
    <PageHeading eyebrow="WORKSPACE OVERVIEW" title="训练工作台" right={<div className="heading-actions"><span className="date-label"><Clock3 size={14} />最近 24 小时 + 活跃运行</span><button className="button" onClick={() => downloadJSON({ mode: 'demo', runs }, 'trainvista-overview.json')}><ArrowDownToLine size={15} />导出快照</button></div>} />
    <div className="summary-band">
      <div className="summary-intro"><span className="summary-symbol"><Activity size={22} /></span><div><strong>全流程脉搏</strong><span>AG News 分类实验</span></div></div>
      <div className="summary-stat"><span>待介入事项 <TriangleAlert size={13} /></span><strong>{risks.length.toString().padStart(2, '0')}<small className="negative">{failures.length} 项阻塞</small></strong></div>
      <div className="summary-stat"><span>活跃运行 <Zap size={13} /></span><strong>{active.length.toString().padStart(2, '0')}<small>跨 9 个阶段</small></strong></div>
      <div className="summary-stat"><span>候选质量 <ShieldCheck size={13} /></span><strong>{candidate.score?.toFixed(3)}<small className="positive">+3.4 pp</small></strong></div>
      <div className="summary-stat"><span>待交付审批 <Clock3 size={13} /></span><strong>{awaiting.length.toString().padStart(2, '0')}<small>质量门禁已通过</small></strong></div>
    </div>
    <div className="overview-columns">
      <section className="attention-section"><div className="section-title"><h2><span className="section-dot red" />需要关注 <span className="count">{risks.length}</span></h2><Link to="/runs">查看全部<ArrowRight size={14} /></Link></div>
        <div className="attention-list">{risks.map(run => <Link className={`attention-item ${run.status === 'failed' ? 'critical' : ''}`} key={run.id} to={`/runs/${run.id}`}>
          <span className={`attention-icon ${run.status === 'failed' ? 'red' : run.stale ? 'blue' : 'amber'}`}>{run.status === 'failed' ? <TriangleAlert size={17} /> : run.stale ? <Database size={17} /> : <ShieldCheck size={17} />}</span>
          <div><strong>{run.status === 'failed' ? '模型训练失败，下游评测阻塞' : run.stale ? '来源更新中断，运行状态待核验' : '候选模型已就绪，等待交付审批'}</strong><p><code>{run.id}</code><span>·</span>{run.owner}<span>·</span>{run.stale ? `${elapsed(run.updated_at)} 未更新` : `${elapsed(run.created_at, run.finished_at)} 已用时`}</p></div><ChevronRight size={15} />
        </Link>)}</div>
      </section>
      <section className="candidate-section"><div className="section-title"><h2><Box size={17} />候选交付</h2><span className="tag">指定候选</span></div>
        <div className="candidate-title"><span className="model-symbol"><Box size={24} /></span><div><h3>DistilBERT <span>{candidate.version}</span></h3><Link to={`/runs/${candidate.id}`}>{candidate.id} <ArrowRight size={12} /></Link></div><Badge status={candidate.status} /></div>
        <div className="readiness">{[['质量门禁', true], ['产物完整', true], ['审批通过', candidate.approval.status === 'approved'], ['来源核验', !candidate.stale]].map(([label, pass]) => <div key={String(label)}><span className={pass ? 'check-circle' : 'wait-circle'}>{pass ? <Check size={11} /> : <Clock3 size={11} />}</span>{label}</div>)}</div>
        <div className="candidate-footer"><span>Macro-F1 <strong>{candidate.score?.toFixed(3)}</strong><small>门槛 ≥ 0.800</small></span>{candidate.status === 'awaiting' ? <button className="button small primary" onClick={() => onAction(candidate, 'approve')} disabled={workspace.user.role !== 'approver'} title={workspace.user.role !== 'approver' ? '需切换到审批人身份' : '审核候选'}>审核交付<ArrowRight size={13} /></button> : <Link className="button small" to={`/runs/${candidate.id}`}>查看结果</Link>}</div>
      </section>
    </div>
    <section className="runs-section"><div className="section-title"><h2>流水线运行 <span className="count">{runs.length}</span></h2><div className="legend"><span><i className="green" />已完成</span><span><i className="blue" />运行中</span><span><i className="amber" />待处理</span></div></div>
      <div className="table-toolbar"><div className="tabs compact">{[['all', '全部运行'], ['active', '活跃运行'], ['attention', '需要关注']].map(([value, label]) => <button key={value} className={status === value ? 'active' : ''} onClick={() => setStatus(value)}>{label}</button>)}</div><Link className="text-link" to="/runs"><ListFilter size={14} />筛选运行</Link></div>
      <RunTable runs={visible.slice(0, 6)} /><div className="table-footer"><span>显示 {Math.min(visible.length, 6)} / {visible.length} 条运行</span><Link to="/runs">所有运行<ArrowRight size={13} /></Link></div>
    </section>
  </>;
}

function RunsPage({ runs }: PageProps) {
  const [search, setSearch] = useState(new URLSearchParams(location.search).get('q') ?? '');
  const [status, setStatus] = useState('all');
  const [owner, setOwner] = useState('all');
  const filtered = runs.filter(r => `${r.id} ${r.name} ${r.version}`.toLowerCase().includes(search.toLowerCase()) && (status === 'all' || r.status === status) && (owner === 'all' || r.owner === owner));
  return <><PageHeading eyebrow="PIPELINE RUNS" title="流水线运行" right={<span className="muted">{runs.length} 条运行 · 1 条流水线</span>} /><div className="filters"><div className="search-input"><Search size={16} /><input aria-label="筛选运行" value={search} onChange={e => setSearch(e.target.value)} placeholder="搜索 ID、模型或版本" /></div><select aria-label="执行状态" value={status} onChange={e => setStatus(e.target.value)}><option value="all">所有执行状态</option>{Object.entries(statusLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select><select aria-label="负责人" value={owner} onChange={e => setOwner(e.target.value)}><option value="all">所有负责人</option>{[...new Set(runs.map(r => r.owner))].map(o => <option key={o}>{o}</option>)}</select><button className="icon-button" title="重置筛选" aria-label="重置筛选" onClick={() => { setSearch(''); setStatus('all'); setOwner('all'); }}><RotateCcw size={16} /></button></div><RunTable runs={filtered} /></>;
}

function RunDetail(props: PageProps) {
  const { id } = useParams();
  const run = props.runs.find(r => r.id === id);
  const [tab, setTab] = useState('flow');
  const [selected, setSelected] = useState<string>();
  const [metric, setMetric] = useState<'loss' | 'throughput' | 'f1'>('loss');
  useEffect(() => { setSelected(undefined); setTab('flow'); }, [id]);
  if (!run) return <Empty title="运行不存在"><Link to="/runs">返回运行列表</Link></Empty>;
  const stage = run.stages.find(s => s.id === selected);
  const operator = props.workspace.user.role === 'operator';
  const approver = props.workspace.user.role === 'approver';
  const artifacts = props.artifacts.filter(a => a.run_id === run.artifact_origins[a.stage]);
  return <>
    <Link className="back-link" to="/runs"><ArrowLeft size={14} />流水线运行</Link>
    <PageHeading eyebrow={`${run.id} / ${run.version}`} title="AG News · DistilBERT" right={<div className="heading-actions"><button className="button" disabled={!operator || ['running', 'queued', 'canceling', 'publishing'].includes(run.status)} onClick={() => props.onAction(run, 'rerun')}><RotateCcw size={15} />重跑</button><button className="button danger-outline" disabled={!operator || !['running', 'awaiting'].includes(run.status)} onClick={() => props.onAction(run, 'cancel')}><Square size={13} />终止</button>{run.status === 'awaiting' && <button className="button primary" disabled={!approver} onClick={() => props.onAction(run, 'approve')}><ShieldCheck size={15} />审批</button>}</div>} />
    <div className="run-meta"><Badge status={run.status} /><span>负责人 <strong>{run.owner}</strong></span><span>已用时 <strong className="mono">{elapsed(run.created_at, run.finished_at)}</strong></span><span>代码 <code>{run.code}</code></span><span>更新于 <Time value={run.updated_at} /></span>{run.stale && <span className="negative"><TriangleAlert size={13} />数据过期</span>}</div>
    <div className="tabs detail-tabs">{[['flow', '流程与依赖'], ['metrics', '训练指标'], ['artifacts', '输入与产物'], ['events', '事件时间线']].map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
    {tab === 'flow' && <><div className="graph-heading"><h2><GitBranch size={16} />执行流程 <span className="muted">9 个节点 · 控制依赖</span></h2><span className="tag">Prefect / demo</span></div><RunGraph run={run} selected={selected} onSelect={setSelected} /><div className="stage-list"><div className="section-title"><h2>阶段明细</h2><span className="muted">输入版本 · 指标 · 尝试记录</span></div>{run.stages.map(s => <button key={s.id} className="stage-row" onClick={() => setSelected(s.id)}><span className={`stage-order ${s.status}`}><StatusIcon status={s.status} /></span><strong>{s.name}</strong><span className="stage-tool">{s.tool}</span><span className="stage-value">{s.value ?? '—'} <small>{s.value ? s.unit : ''}</small></span><Badge status={s.status} /><ChevronRight size={14} /></button>)}</div></>}
    {tab === 'metrics' && <><div className="metric-summary"><div><span>Macro-F1</span><strong>{run.score?.toFixed(3) ?? '未评测'}</strong><small>固定测试集 · 500 条样本</small></div><div><span>基线 Macro-F1</span><strong>{run.baseline.toFixed(3)}</strong><small>TF-IDF + LogisticRegression</small></div><div><span>质量门禁</span><strong>{run.quality === 'passed' ? '通过' : '未评估'}</strong><small>{run.policy}</small></div></div><div className="section-title"><h2>训练曲线</h2><select aria-label="指标" value={metric} onChange={e => setMetric(e.target.value as typeof metric)}><option value="loss">验证 loss</option><option value="throughput">吞吐 · samples/s</option><option value="f1">验证 Macro-F1</option></select></div><MetricChart run={run} metric={metric} /><p className="muted chart-footnote">模拟采样 · step 0–240 · 所有曲线均为演示数据</p></>}
    {tab === 'artifacts' && <><div className="input-version"><Database size={20} /><div><span>冻结输入版本</span><strong>{run.dataset}</strong></div><code>seed=42 · max_length=128 · epoch=1</code></div><ArtifactTable artifacts={artifacts} allArtifacts={props.artifacts} /></>}
    {tab === 'events' && <div className="timeline">{[...run.events].reverse().map((event, i) => <div className="timeline-event" key={`${event.at}-${i}`}><span className={`timeline-dot ${event.tone}`} /><time><Time value={event.at} /></time><div><strong>{event.title}</strong><p>{event.detail}</p></div></div>)}</div>}
    {stage && <StageModal stage={stage} run={run} artifacts={artifacts} close={() => setSelected(undefined)} />}
  </>;
}

function StageModal({ stage, run, artifacts, close }: { stage: Stage; run: Run; artifacts: Artifact[]; close: () => void }) {
  const [tab, setTab] = useState('overview');
  const outputs = artifacts.filter(a => a.stage === stage.id);
  const inputs = artifacts.filter(a => stage.dependencies.includes(a.stage));
  return <Modal title={stage.name} close={close}><div className="modal-body"><div className="stage-modal-meta"><Badge status={stage.status} /><span>{stage.tool}</span><code>{run.id}/{stage.id}</code></div><div className="tabs">{[['overview', '概览'], ['io', '输入输出'], ['attempts', '尝试记录']].map(([value, label]) => <button key={value} className={tab === value ? 'active' : ''} onClick={() => setTab(value)}>{label}</button>)}</div>
    {tab === 'overview' && <><div className="metric-summary"><div><span>{stage.unit}</span><strong>{stage.value ?? '未采集'}</strong></div><div><span>执行耗时</span><strong>{stage.duration ? `${stage.duration}s` : '—'}</strong></div></div><dl className="key-values"><dt>依赖阶段</dt><dd>{stage.dependencies.map(d => run.stages.find(s => s.id === d)?.name).join('、') || '无上游依赖'}</dd><dt>数据新鲜度</dt><dd>{run.stale ? '已过期' : '演示快照'}</dd><dt>输入模式</dt><dd>{stage.reused ? '复用冻结版本' : '当前运行'}</dd><dt>来源</dt><dd>{stage.tool} · 模拟连接器</dd></dl>{stage.id === 'train' && <MetricChart run={run} />}</>}
    {tab === 'io' && <><h3>输入引用</h3>{inputs.length ? inputs.map(a => <div className="artifact-line" key={a.id}><Database size={17} /><span>{a.name}<small>{a.id}</small></span><code>v{a.version}</code></div>) : <Empty title="暂无已绑定输入产物" />}<h3>输出产物</h3>{outputs.length ? outputs.map(a => <div className="artifact-line" key={a.id}><Box size={17} /><span>{a.name}<small>{a.id}</small></span><code>v{a.version}</code></div>) : <Empty title="暂无已完成产物" />}</>}
    {tab === 'attempts' && (stage.attempts.length ? stage.attempts.map(attempt => <div className="attempt-row" key={attempt.number}><Badge status={attempt.status} /><div><strong>Attempt {attempt.number}</strong><p>{attempt.message}</p></div><Time value={attempt.at} /></div>) : <Empty title="尚未执行" />)}
    </div></Modal>;
}

function ArtifactTable({ artifacts, allArtifacts }: { artifacts: Artifact[]; allArtifacts: Artifact[] }) {
  const [selected, setSelected] = useState<Artifact>();
  const [error, setError] = useState('');
  async function download(item: Artifact) {
    try { downloadJSON(await api(`/artifacts/${encodeURIComponent(item.id)}/manifest`), `${item.run_id}-${item.stage}-demo-manifest.json`); }
    catch (e) { setError((e as Error).message); }
  }
  return <>{error && <ErrorBox message={error} />}<div className="table-scroll"><table><thead><tr><th>产物名称</th><th>类型</th><th>来源运行</th><th>版本 / 体积</th><th>血缘</th><th /></tr></thead><tbody>{artifacts.map(a => <tr key={a.id}><td><button className="artifact-name" onClick={() => setSelected(a)}><span className="artifact-icon"><FileJson size={18} /></span><span>{a.name}<small>{a.digest.slice(0, 12)}</small></span></button></td><td><span className="tag">{a.kind}</span></td><td><Link className="text-link mono" to={`/runs/${a.run_id}`}>{a.run_id}</Link></td><td><strong className="mono">v{a.version}</strong><small>{a.size}</small></td><td><button className="text-link" onClick={() => setSelected(a)}><GitBranch size={14} />{a.upstream.length} 上游</button></td><td><button className="icon-button" title="下载模拟元信息清单" aria-label={`下载 ${a.id} 元信息`} onClick={() => void download(a)}><ArrowDownToLine size={16} /></button></td></tr>)}</tbody></table>{!artifacts.length && <Empty title="暂无可用产物" />}</div>
    {selected && <Modal title={selected.name} close={() => setSelected(undefined)}><div className="modal-body"><span className="demo-label">模拟产物 · 不包含真实模型文件</span><dl className="key-values"><dt>产物 ID</dt><dd>{selected.id}</dd><dt>版本</dt><dd>{selected.version}</dd><dt>SHA-256</dt><dd className="break-word mono">{selected.digest}</dd><dt>来源</dt><dd><Link to={`/runs/${selected.run_id}`} onClick={() => setSelected(undefined)}>{selected.run_id}</Link></dd></dl><h3>上游产物</h3>{selected.upstream.length ? selected.upstream.map(id => { const artifact = allArtifacts.find(a => a.id === id); return <button className="lineage-item" key={id} disabled={!artifact} onClick={() => artifact && setSelected(artifact)}><GitBranch size={16} /><span>{artifact?.name ?? '来源待解析'}<small>{id}</small></span><ArrowRight size={14} /></button>; }) : <Empty title="源数据，无上游产物" />}</div><div className="modal-footer"><button className="button" onClick={() => void download(selected)}><ArrowDownToLine size={15} />下载元信息</button></div></Modal>}
  </>;
}
function ArtifactsPage({ artifacts }: PageProps) {
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState('all');
  return <><PageHeading eyebrow="ARTIFACT REGISTRY" title="产物仓库" right={<span className="muted">{artifacts.length} 个版本化产物 · 演示</span>} /><div className="filters"><div className="search-input"><Search size={16} /><input aria-label="搜索产物" placeholder="搜索产物名称或运行 ID" value={query} onChange={e => setQuery(e.target.value)} /></div><select aria-label="产物类型" value={kind} onChange={e => setKind(e.target.value)}><option value="all">所有产物类型</option>{[...new Set(artifacts.map(a => a.kind))].map(k => <option key={k}>{k}</option>)}</select></div><ArtifactTable artifacts={artifacts.filter(a => `${a.name} ${a.run_id}`.toLowerCase().includes(query.toLowerCase()) && (kind === 'all' || a.kind === kind))} allArtifacts={artifacts} /></>;
}
function ApprovalsPage({ runs, workspace, onAction }: PageProps) {
  const [tab, setTab] = useState('pending');
  const approvals = runs.filter(r => tab === 'pending' ? r.approval.status === 'pending' : ['approved', 'rejected', 'canceled'].includes(r.approval.status));
  return <><PageHeading eyebrow="DELIVERY APPROVALS" title="交付审批" right={<span className="tag"><ShieldCheck size={13} />证据版本锁定</span>} /><div className="tabs detail-tabs"><button className={tab === 'pending' ? 'active' : ''} onClick={() => setTab('pending')}>待审批</button><button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>审批历史</button></div>
    {approvals.length ? approvals.map(run => <section className="approval-item" key={run.id}><div className="approval-heading"><span className="model-symbol"><Box size={24} /></span><div><h2>DistilBERT {run.version}</h2><Link to={`/runs/${run.id}`}>{run.id} · {run.owner} 申请</Link></div><Badge status={run.status} /></div><div className="approval-evidence"><div><span>候选 Macro-F1</span><strong>{run.score?.toFixed(3)}</strong></div><div><span>相对基线</span><strong className="positive">+{(((run.score ?? 0) - run.baseline) * 100).toFixed(1)} pp</strong></div><div><span>质量策略</span><strong>{run.policy}</strong></div><div><span>证据摘要</span><code>{run.checkpoint_digest.slice(0, 16)}</code></div></div><div className="approval-actions"><span className="muted">数据版本 {run.dataset}</span>{run.approval.status === 'pending' && <div><button className="button danger-outline" disabled={workspace.user.role !== 'approver'} onClick={() => onAction(run, 'reject')}>拒绝</button><button className="button primary" disabled={workspace.user.role !== 'approver'} onClick={() => onAction(run, 'approve')}><ShieldCheck size={15} />批准交付</button></div>}</div></section>) : <Empty title="暂无审批记录" />}</>;
}
function AuditPage({ audit, operations }: PageProps) {
  return <><PageHeading eyebrow="OPERATIONS & AUDIT" title="操作记录" right={<button className="button" onClick={() => downloadJSON({ mode: 'demo', audit, operations }, 'trainvista-audit.json')}><ArrowDownToLine size={15} />导出记录</button>} /><div className="table-scroll"><table><thead><tr><th>操作</th><th>目标运行</th><th>提交人</th><th>结果</th><th>时间</th><th>理由</th></tr></thead><tbody>{operations.map(op => <tr key={op.id}><td><strong>{actionLabels[op.action]}</strong><small className="mono">{op.id}</small></td><td><Link className="text-link" to={`/runs/${op.target_id}`}>{op.target_id}</Link></td><td>{op.actor}</td><td><span className={`tag ${op.status === 'succeeded' ? 'positive' : ''}`}>{op.status === 'succeeded' ? '演示完成' : '处理中'}</span></td><td><Time value={op.at} /></td><td className="reason-cell">{op.reason}</td></tr>)}</tbody></table>{!operations.length && <Empty title="尚无操作记录"><p className="muted">本次演示会话未提交操作</p></Empty>}</div></>;
}
function SourcesPage({ workspace }: PageProps) {
  return <><PageHeading eyebrow="DATA CONNECTIONS" title="数据源连接" /><div className="notice"><FlaskConical size={18} /><span>演示模式 · 未连接远程训练服务</span></div><div className="source-list">{workspace.sources.map(source => <div className="source-row" key={source.name}><span className="source-icon"><Database size={22} /></span><div><h2>{source.name}</h2><p>{source.kind}</p></div><span className="tag">{source.status === 'simulated' ? '模拟连接器' : '未配置'}</span><span className="muted">{source.latency ? `${source.latency} 采集周期` : '远程存储待接入'}</span></div>)}</div><h2 className="subheading">真实执行依赖</h2><dl className="key-values"><dt>元数据</dt><dd>远程 PostgreSQL</dd><dt>工作流</dt><dd>Prefect deployment + 在线 worker</dd><dt>实验追踪</dt><dd>远程 MLflow Tracking / Registry</dd><dt>产物存储</dt><dd>远程 S3 兼容存储</dd><dt>访问控制</dt><dd>OIDC 与项目角色</dd></dl></>;
}
function SettingsPage() {
  const [focus, setFocus] = useState(() => localStorage.getItem('trainvista-focus') === 'on');
  return <><PageHeading eyebrow="WORKSPACE SETTINGS" title="工作空间设置" /><div className="settings-section"><h2>工作空间</h2><dl className="key-values"><dt>名称</dt><dd>NLP Research</dd><dt>项目</dt><dd>AG News 分类实验</dd><dt>运行模式</dt><dd>演示 · 内存状态 · 服务重启后恢复初始数据</dd><dt>数据库</dt><dd>未连接，不使用本地数据库</dd></dl></div><div className="settings-section"><h2>个人关注</h2><label className="setting-row"><span><strong>总览默认只看关注运行</strong><small>个人偏好 · 当前浏览器</small></span><input type="checkbox" checked={focus} onChange={e => { setFocus(e.target.checked); localStorage.setItem('trainvista-focus', e.target.checked ? 'on' : 'off'); }} /></label><div className="notice"><Terminal size={17} /><span>应用版本 0.1.0 · 接入规范 v1</span></div></div></>;
}
