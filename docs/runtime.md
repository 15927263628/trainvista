# 运行与验收

## 当前交付

v0.1 实现了可运行的演示工作台和服务端控制协议，属于 P1 契约与页面验证，不是已经对接真实训练的完整生产系统。

| 范围 | 当前状态 |
| --- | --- |
| Leader 总览 | 待介入事项、指定候选、质量、审批、运行阶段和新鲜度 |
| 运行列表 | ID / 名称 / 版本搜索，状态和负责人筛选 |
| 流程图 | React Flow DAG、缩放、阶段选择、移动端阶段列表 |
| 阶段详情 | 上下游、输入输出、尝试记录和演示指标 |
| 指标 | ECharts loss、吞吐、Macro-F1 曲线；未采集值不补零 |
| 产物 | 不可变演示 ID、版本、摘要、上游下钻、模拟元信息下载 |
| 重跑 | 整条 / 训练 / 评测检查点，新运行、复用输入和血缘保留 |
| 终止 | accepted → canceling → 演示 canceled，保留已生成产物 |
| 审批 | 角色约束、禁止自批、证据检查、有效期、修订号冲突控制 |
| 请求可靠性 | 服务端预检、两分钟凭证、幂等键、异体冲突、单进程异步锁 |
| 审计 | 请求人、目标、理由、时间，JSON 行实时日志 |
| 真实数据库与连接器 | 未实现，live 模式拒绝启动 |

## 本机运行

项目根目录执行 `npm start`，启动器会核验 5180 和 8100 端口可用后启动。它不查询本地数据库，不自动创建云资源，不依赖 GitHub 登录。

- 前端：`http://127.0.0.1:5180`
- API：`http://127.0.0.1:8100`
- OpenAPI：`http://127.0.0.1:8100/docs`
- 健康检查：`GET /api/v1/health`
- 停止：`npm run stop`

Windows 安装依赖见 [README](../README.md)。可双击根目录 `start.cmd` / `stop.cmd`，或运行 `npm.cmd start` / `npm.cmd run stop`。Windows 手工启动后端使用 `.\.venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8100`，前端使用 `npm.cmd run dev`。

macOS / Linux 手工运行可分别执行 `npm run dev` 和 `.venv/bin/python -m uvicorn backend.app:app --host 127.0.0.1 --port 8100`。应用仅供本机使用；不要使用多个 API worker，共享状态尚未持久化。

## 验证与产物

| 命令 | 覆盖范围 | 输出 |
| --- | --- | --- |
| `npm run build` | TypeScript 严格检查、生产构建 | `dist/` |
| `npm run test:api` | 权限、跨站拒绝、幂等、过期预检、状态过渡、并发审批、血缘、live 禁用 | `logs/api-verification.log` |
| `npm run test:e2e` | 总览、筛选、DAG、重跑、终止、审批、图表非空、产物下钻/下载、桌面/移动端 | `logs/e2e-results.json`、`logs/screenshots/` |

API 集成验证使用 ASGI TestClient 和独立内存 store，不是本地数据库。浏览器验证使用项目安装的 Chromium，测试仅操作模拟任务；应使用新启动的演示实例，以避免已审批/已终止的初始记录影响重复运行。

## 关键实现

- `backend/fixtures.py`：模拟数据、组件定义、产物身份及来源绑定。
- `backend/app.py`：会话、读取接口、控制预检、幂等提交、异步模拟和审计。
- `src/App.tsx`：页面、导航、筛选、详情与身份切换。
- `src/RunGraph.tsx`：DAG 与节点。
- `src/OperationModal.tsx`：服务端预检、理由、提交和错误处理。
- `scripts/services.mjs`：本机进程启动和停止。

## 真实接入的必要依赖

需要提供以下资源的地址及获取权限的方法，而不是把密码或令牌粘贴到聊天或仓库：

1. 远程 PostgreSQL：专用数据库及迁移账户，允许的网络范围。
2. Prefect API：预建 deployment、worker/work pool，以及提交、取消、恢复所需的服务身份。
3. MLflow Tracking / Registry：远程地址及受控访问身份。
4. 远程对象存储：bucket、端点、对象 key 规范及最小权限身份。
5. 认证提供方：OIDC issuer/client，以及项目成员和审批角色映射。

## 尚未完成

P2/P3 仍需实现 SQLAlchemy/Alembic 持久化、事务 Outbox、连接器与状态对账、真实数据冻结和训练脚本、执行侧审批复核、资源停止核验、生产认证、恢复演练。当前内存幂等只适用于单进程演示，不能宣称支持重启后的 exactly-once 执行。

接入真实环境前还需完成 secret 管理、保留政策、容量实测和依赖安全复核。当前代码不接受远程执行配置、不读取生产数据、不把 HTTP 成功视为真实作业执行成功。
