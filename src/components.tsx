import { useEffect, useRef, type ReactNode } from 'react';
import { Check, Circle, LoaderCircle, X, AlertTriangle, Clock3, Ban, PackageCheck } from 'lucide-react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { Run, Status } from './types';

echarts.use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

export const statusLabels: Record<Status, string> = {
  pending: '未开始', queued: '排队中', running: '运行中', awaiting: '待审批', succeeded: '已完成',
  failed: '失败', canceled: '已终止', canceling: '终止中', publishing: '交付中', rejected: '已拒绝', skipped: '已跳过',
};
export const actionLabels = { rerun: '重跑', cancel: '终止', approve: '批准交付', reject: '拒绝交付' };
export function StatusIcon({ status, size = 14 }: { status: Status; size?: number }) {
  const Icon = status === 'succeeded' ? Check : status === 'failed' ? X : status === 'awaiting' ? Clock3 :
    status === 'running' || status === 'canceling' ? LoaderCircle : status === 'publishing' ? PackageCheck :
      status === 'canceled' || status === 'rejected' ? Ban : Circle;
  return <Icon size={size} className={status === 'running' || status === 'canceling' ? 'spin' : ''} />;
}
export function Badge({ status }: { status: Status }) {
  return <span className={`badge ${status}`}><StatusIcon status={status} />{statusLabels[status]}</span>;
}
export function Time({ value }: { value: string }) {
  return <time dateTime={value}>{new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</time>;
}
export function elapsed(value: string, end?: string | null) {
  const mins = Math.max(0, Math.floor(((end ? Date.parse(end) : Date.now()) - Date.parse(value)) / 60000));
  return mins > 59 ? `${Math.floor(mins / 60)}h ${mins % 60}m` : `${mins}m`;
}
export function Empty({ title = '暂无记录', children }: { title?: string; children?: ReactNode }) {
  return <div className="empty"><Circle size={28} /><h3>{title}</h3>{children}</div>;
}
export function ErrorBox({ message }: { message: string }) {
  return <div role="alert" className="error-box"><AlertTriangle size={16} />{message}</div>;
}
export function Modal({ title, children, close }: { title: string; children: ReactNode; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus(); };
  }, []);
  return <dialog ref={ref} className="modal" onCancel={event => { event.preventDefault(); close(); }}>
    <div className="modal-head"><h2>{title}</h2><button className="icon-button" aria-label="关闭对话框" title="关闭" onClick={close}><X size={18} /></button></div>
    {children}
  </dialog>;
}
export function MetricChart({ run, metric = 'loss' }: { run: Run; metric?: 'loss' | 'throughput' | 'f1' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current || !run.metrics.length) return;
    const chart = echarts.init(ref.current);
    const colors = { loss: '#15745c', throughput: '#307ac0', f1: '#9d6730' };
    chart.setOption({
      animation: false, grid: { left: 42, right: 20, top: 24, bottom: 32 },
      tooltip: { trigger: 'axis', confine: true },
      xAxis: { type: 'category', data: run.metrics.map(m => m.step), axisLine: { lineStyle: { color: '#dde3df' } }, axisLabel: { color: '#7a8580', fontSize: 10 }, axisTick: { show: false } },
      yAxis: { type: 'value', min: metric === 'f1' ? .5 : undefined, splitNumber: 3, axisLabel: { color: '#7a8580', fontSize: 10 }, splitLine: { lineStyle: { color: '#eef1ee', type: 'dashed' } } },
      series: [{ type: 'line', smooth: .3, symbol: 'none', data: run.metrics.map(m => m[metric]), lineStyle: { color: colors[metric], width: 2 }, areaStyle: { color: colors[metric], opacity: .05 } }],
    });
    const observer = new ResizeObserver(() => chart.resize());
    observer.observe(ref.current);
    return () => { observer.disconnect(); chart.dispose(); };
  }, [run.metrics, metric]);
  return run.metrics.length ? <div ref={ref} className="metric-chart" role="img" aria-label={`${metric} 指标曲线，${run.metrics.length} 个模拟采样点`} /> : <Empty title="暂无指标采样" />;
}
