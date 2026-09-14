# TrainVista

训练全流程可视化、产物追踪与受控操作服务。

TrainVista 将分散在调度、数据处理、训练、评测和模型管理工具中的信息，汇聚为同一次训练的完整视图：流程走到哪里、依赖什么、产出了什么、关键指标如何、哪里阻塞、谁来处理。

## 项目状态

- 已实现 v0.1 可运行演示：React 工作台 + FastAPI 操作 API，覆盖总览、DAG、阶段详情、指标、血缘、审批与审计。
- 本地项目名和建议仓库名：`trainvista`。
- GitHub：[15927263628/trainvista](https://github.com/15927263628/trainvista)，已创建私有仓库。
- 实验项目采用公开工具和数据；开源与许可证需另行确认。
- 重跑、终止和审批已在内存演示后端闭环；未接入真实 Prefect、MLflow、训练作业或数据库。

## 快速启动

推荐 Node.js 22+、Python 3.12+。安装后重新打开终端，确认 `node --version` 和 Python 命令可用。

### Windows（PowerShell / CMD）

在项目根目录首次执行：

```powershell
npm.cmd ci
py -3.12 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend/requirements.txt
.\start.cmd
```

已安装依赖后，可双击 `start.cmd` 启动，双击 `stop.cmd` 停止，也可使用 `npm.cmd start` / `npm.cmd run stop`。无需激活虚拟环境。若没有 `py` 启动器，可用 `python -m venv .venv`（确认 Python 3.12+）。使用 `npm.cmd` 可避免 PowerShell 对 `npm.ps1` 的执行策略限制。

### macOS / Linux

首次安装：

```sh
npm ci
python3 -m venv .venv
.venv/bin/pip install -r backend/requirements.txt
npm start
```

工作台：<http://127.0.0.1:5180>，API 文档：<http://127.0.0.1:8100/docs>。

`npm start` 启动本机后台开发服务，`npm run stop` 停止本项目记录的进程；端口被占用时不终止现有进程。运行、审计与测试日志写入 `logs/`。服务只监听 loopback，不应通过公网代理发布演示身份切换接口。

## 验证

```sh
npm run build
npm run test:api
npm run browser:install
npm run test:e2e
```

API 验证独立创建内存状态，不影响正在运行的服务。浏览器验证会操作当前演示服务，请从全新服务开始运行；需要重复验证时先 `npm run stop`，再 `npm start`。Playwright 使用项目内 `.playwright/` 中的隔离浏览器。

## 演示边界

- 所有模型、指标和产物均为模拟，下载的是明确标注 synthetic 的元信息，不是模型权重。
- 演示身份：林序可重跑/终止，周宁可审批，陈默只读。身份切换仅为本机交互验证，不是生产认证。
- 重跑自动演示后续阶段并等待审批；终止经历过渡状态；审批后演示交付完成。
- 内存状态和幂等记录在重启后清空，审计日志保留在文件中；不具备生产持久化或跨进程一致性。
- `TRAINVISTA_MODE=live` 会拒绝启动，绝不回落到本地数据库。真实接入依赖与后续工作见[运行与验收](docs/runtime.md)。

## 文档

| 文档 | 内容 |
| --- | --- |
| [产品方案](docs/product.md) | 用户、页面、阶段产物、关注点、MVP 和验收 |
| [技术架构](docs/architecture.md) | 数据模型、接入协议、状态语义、存储、安全与部署 |
| [决策与讨论](docs/decisions.md) | 推荐选择、待确认问题、风险与推进顺序 |
| [实验链路与操作设计](docs/experiment.md) | 公开工具选型、Leader 首屏、重跑、终止与审批协议 |
| [运行与验收](docs/runtime.md) | 当前实现范围、验证方式、远程接入依赖与剩余工作 |

## 核心原则

1. 观察和关联已有工具，受控操作委托调度器执行，不自建调度引擎。
2. 统一元信息和语义，不强行统一所有阶段的业务指标。
3. 控制依赖与数据依赖分别建模；产物必须定位到具体版本。
4. 执行状态、质量结论和采集新鲜度分别展示。
5. 汇总值必须能解释口径，并能下钻到来源。
6. 大文件留在原系统；平台优先存引用、摘要与血缘。
7. 连接远程数据库，不创建或查询本地数据库。

## 建议的首个闭环

采用公开数据的小模型文本分类实验：数据快照 → 清洗与冻结 → 训练 → 评测 → 人工审批 → 模型包交付。使用 Prefect 编排，Hugging Face Datasets / Transformers 与 PyTorch 处理和训练，MLflow 追踪实验，scikit-learn 计算评测指标。先以小数据和 CPU 验证闭环，GPU 不作为展示功能的前置条件。

Leader 首屏优先呈现待处理风险、候选模型交付就绪度、阶段进展与阻塞；完整 loss、吞吐和资源曲线留在阶段详情。

仓库不应包含密码、访问令牌、真实训练数据或内部系统凭据。设计文档是完整目标范围，不代表真实工具接入已经实现。
