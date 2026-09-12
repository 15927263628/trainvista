import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';

process.env.PLAYWRIGHT_BROWSERS_PATH ??= resolve('.playwright');
const { chromium } = await import('playwright');

const base = process.env.TRAINVISTA_URL ?? 'http://127.0.0.1:5180';
mkdirSync('logs/screenshots', { recursive: true });
const browser = await chromium.launch({ headless: true, downloadsPath: resolve('logs/downloads') });
const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
const page = await context.newPage();
const errors = [];
const passed = [];
page.on('pageerror', error => errors.push(error.message));
const check = (name, value = true) => { assert.ok(value, name); passed.push(name); console.log(`PASS ${name}`); appendFileSync('logs/e2e.log', `PASS ${name}\n`); };
async function loaded() {
  await page.getByRole('heading', { name: '正在连接工作空间' }).waitFor({ state: 'hidden' });
}
async function screenshot(name) {
  await page.screenshot({ path: `logs/screenshots/${name}.png`, fullPage: true });
}
async function showRun(id) {
  await page.goto(`${base}/runs/${id}`);
  await loaded();
  await page.getByRole('heading', { name: 'AG News · DistilBERT', exact: true }).waitFor();
}
async function changeIdentity(id) {
  await page.getByLabel('演示身份', { exact: true }).selectOption(id);
  await page.waitForFunction(expected => document.querySelector('.context-bar select')?.value === expected && !document.querySelector('.context-bar select')?.disabled, id);
}
async function finishModal(action) {
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('浏览器集成验证操作');
  await dialog.getByRole('button', { name: `确认${action}`, exact: true }).click();
  await dialog.waitFor({ state: 'hidden' });
}
try {
  await page.goto(base);
  await page.getByRole('heading', { name: '训练工作台', exact: true }).waitFor();
  await loaded();
  check('overview contains workflow and demo distinction', await page.getByText('模拟数据', { exact: true }).isVisible());
  await screenshot('desktop-overview');
  check('desktop has no page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.getByRole('link', { name: '流水线运行', exact: true }).click();
  await page.getByLabel('筛选运行', { exact: true }).fill('TV-1046');
  check('run search filters results', await page.locator('tbody tr').count() === 1);
  await page.getByRole('link', { name: '查看 TV-1046', exact: true }).click();
  await page.locator('.react-flow__node').first().waitFor();
  check('DAG renders nine stage nodes', await page.locator('.react-flow__node').count() === 9);
  await screenshot('desktop-dag');
  await page.getByTestId('stage-train').click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: '尝试记录', exact: true }).click();
  check('stage attempts rendered', await page.getByText('Attempt 1', { exact: true }).isVisible());
  await page.getByRole('button', { name: '关闭对话框' }).click();
  await page.getByRole('button', { name: '重跑', exact: true }).click();
  await page.getByRole('dialog').getByRole('combobox').selectOption('train');
  await finishModal('重跑');
  check('rerun submitted from UI', await page.getByRole('status').isVisible());
  await showRun('TV-1047');
  await page.getByRole('button', { name: '终止', exact: true }).click();
  await finishModal('终止');
  await page.waitForFunction(() => document.querySelector('.run-meta .badge')?.textContent?.includes('已终止'), { timeout: 10000 });
  check('cancel UI settles only after backend acknowledgement');
  await showRun('TV-1048');
  check('operator cannot approve in UI', await page.getByRole('button', { name: '审批', exact: true }).isDisabled());
  await changeIdentity('zhou');
  await page.reload();
  await loaded();
  check('identity survives page reload', await page.getByLabel('演示身份', { exact: true }).inputValue() === 'zhou');
  await page.getByRole('button', { name: '审批', exact: true }).click();
  await finishModal('批准交付');
  await page.waitForFunction(() => document.querySelector('.run-meta .badge')?.textContent?.includes('已完成'), { timeout: 10000 });
  check('approval UI produces completed demo delivery');
  await page.getByRole('button', { name: '训练指标', exact: true }).click();
  await page.locator('.metric-chart canvas').waitFor();
  const pixels = await page.locator('.metric-chart canvas').evaluate(canvas => {
    const data = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let visible = 0;
    for (let i = 3; i < data.length; i += 4) if (data[i] > 0) visible++;
    return visible;
  });
  check('metric canvas is nonblank', pixels > 1000);
  await screenshot('desktop-metrics');
  await page.getByRole('button', { name: '输入与产物', exact: true }).click();
  await page.getByRole('button', { name: /evaluation-report.json/ }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByRole('button', { name: /model.safetensors/ }).click();
  check('artifact lineage follows upstream checkpoint', await dialog.getByRole('heading', { name: 'model.safetensors' }).isVisible());
  const downloadEvent = page.waitForEvent('download');
  await dialog.getByRole('button', { name: '下载元信息', exact: true }).click();
  const download = await downloadEvent;
  check('artifact download is labelled demo manifest', download.suggestedFilename().endsWith('demo-manifest.json'));
  await dialog.getByRole('button', { name: '关闭对话框' }).click();
  await page.getByRole('link', { name: '操作记录', exact: true }).click();
  check('operations visible in audit page', await page.locator('tbody tr').count() >= 3);
  await screenshot('desktop-audit');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(base);
  await loaded();
  await page.getByRole('heading', { name: '训练工作台', exact: true }).waitFor();
  check('mobile no page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await screenshot('mobile-overview');
  await page.getByRole('button', { name: '打开导航', exact: true }).click();
  await page.getByRole('link', { name: '产物仓库', exact: true }).click();
  await page.getByRole('heading', { name: '产物仓库', exact: true }).waitFor();
  check('mobile navigation opens artifacts');
  await showRun('TV-1045');
  check('mobile DAG no page overflow', await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await screenshot('mobile-run');
  await page.locator('.stage-row').filter({ hasText: '模型训练' }).click();
  await screenshot('mobile-stage');
  await page.getByRole('dialog').getByRole('button', { name: '关闭对话框' }).click();
  check('no browser runtime errors', errors.length === 0);
  writeFileSync('logs/e2e-results.json', JSON.stringify({ passed, errors }, null, 2));
  console.log(`\n${passed.length} browser checks passed.`);
} catch (error) {
  appendFileSync('logs/e2e.log', `FAIL ${error.stack}\n`);
  await screenshot('failure').catch(() => {});
  throw error;
} finally {
  await browser.close();
}
