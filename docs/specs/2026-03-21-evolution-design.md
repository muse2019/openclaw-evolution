# OpenClaw 自我进化系统 — 设计文档

**版本**: v0.2.0  
**日期**: 2026-03-21  
**状态**: 已批准

---

## 概述

将 openclaw-evolution 从"文本替换式进化"升级为"AI 驱动真实代码修改"，并新增反馈驱动进化层。系统通过三层机制实现真正的自我进化：

1. **错误驱动进化** — 错误阈值触发，Claude Code agent 分析根因并执行修复
2. **反馈驱动进化** — 用户自然语言反馈累积触发，Claude Code agent 生成改进
3. **手动进化** — 用户通过命令随时触发

---

## 三层进化架构

### 第一层：错误驱动进化

**触发条件**：
- 24 小时内同类错误出现 ≥3 次
- 或用户手动执行 `/evolve --error`

**执行流程**：
```
错误事件（after_tool_call hook）
  → ErrorTrigger 检测阈值
  → ErrorContext 打包（错误类型 + 文件内容 + 相关文件）
  → Spawn Claude Code agent（ACP, claude-code）
  → Agent 分析根因 → 生成修复 diff → 验证（build + test）
  → 成功 → 应用修改 → 更新 evolution log
  → 失败 → 指数退避（5m → 15m → 45m）→ 最多 3 次
```

**可修改范围**：
- `~/.openclaw/workspace/skills/**`
- `~/.openclaw/workspace/openclaw-evolution/**`

**禁止修改**：
- `~/.openclaw/auth/**`
- `~/.openclaw/secrets/**`
- `*.pem`、`*.key`、`.env`

---

### 第二层：反馈驱动进化

**触发条件**：
- 收集到 ≥10 条负面反馈（sentiment: negative）
- 或用户手动执行 `/feedback-evolve`

**反馈格式**：
```json
{
  "id": "fb-{timestamp}-{random}",
  "timestamp": "2026-03-21T00:06:00Z",
  "message": "这次回答太慢了",
  "sentiment": "negative",
  "context": {
    "skill": "某 skill 名",
    "action": "执行的操作",
    "sessionId": "会话 ID"
  }
}
```

**执行流程**：
```
用户自然语言反馈
  → FeedbackStore.record(message, sentiment, context)
  → FeedbackTrigger 检测 ≥10 条负面
  → Spawn Claude Code agent
  → 分析反馈模式（哪类操作/哪个 skill 被抱怨）
  → 生成改进报告 + 执行代码修改
```

**存储**：`~/.openclaw/evolution-data/feedback/`

---

### 第三层：手动进化

**命令**：
- `/evolve` — 错误驱动 + 反馈驱动全量检查
- `/evolve --error` — 仅错误驱动
- `/evolve --feedback` — 仅反馈驱动
- `/feedback-evolve` — 仅反馈驱动

---

## 核心组件

### 新增组件

| 组件 | 文件 | 职责 |
|------|------|------|
| `FeedbackStore` | `src/storage/feedback-store.ts` | 存储用户反馈 |
| `FeedbackTrigger` | `src/triggers/feedback-trigger.ts` | 检测负面反馈阈值 |
| `FeedbackAnalyzer` | `src/analyzers/feedback.ts` | 分析反馈模式 |
| `EvolutionExecutor` | `src/executors/evolution-executor.ts` | 统一 spawn Claude Code agent |

### 修改组件

| 组件 | 改动 |
|------|------|
| `engine.ts` | 新增 `spawnAgent()` 方法，统一 agent spawn 逻辑 |
| `index.ts` | 注册新命令（`/feedback-evolve`）+ 反馈收集 hook |
| `openclaw.plugin.json` | 新增 config schema |

---

## Claude Code Agent 任务格式

```json
{
  "task": "分析以下错误的根因并修复。\n\n错误：[errorMessage]\n文件：[filePath]\n相关文件：[relatedFiles]\n\n要求：\n1. 分析根因\n2. 生成修复 diff\n3. 运行 npm run build 验证\n4. 应用修改\n5. 报告结果",
  "runtime": "acp",
  "agentId": "claude-code",
  "thread": false,
  "mode": "run"
}
```

---

## 反馈情感判断

采用关键词匹配判断情感：

**负面关键词**：`慢`、`不行`、`错误`、`垃圾`、`差`、`糟糕`、`不对`、`不满意`、`失败`、`太久了`、`烦`

**正面关键词**：`好`、`不错`、`棒`、`赞`、`对`、`满意`、`快`、`有用`

未匹配到关键词 → 标记为 `neutral`，不计入阈值。

---

## 重试策略

| 尝试 | 等待时间 |
|------|---------|
| 第 1 次失败 | 5 分钟 |
| 第 2 次失败 | 15 分钟 |
| 第 3 次失败 | 放弃，记录到 `failed-evolutions/` |

3 次都失败 → 生成失败报告 → 通知用户人工介入。

---

## 配置项（openclaw.plugin.json）

```json
{
  "evolutionEnabled": true,
  "errorThreshold": 3,
  "errorCooldownMinutes": 30,
  "feedbackThreshold": 10,
  "feedbackCooldownHours": 6,
  "maxRetries": 3,
  "agentRuntime": "claude-code",
  "allowedPaths": ["skills/**", "openclaw-evolution/**"],
  "blockedPaths": ["auth/**", "secrets/**", "*.pem", "*.key", ".env"]
}
```

---

## 数据流

```
用户消息
  ├─ after_tool_call hook → ErrorLog → ErrorTrigger → [阈值?] → EvolutionExecutor → Claude Code
  │
  ├─ 反馈（"太慢了"）→ FeedbackStore → FeedbackTrigger → [≥10负面?] → EvolutionExecutor → Claude Code
  │
  └─ /evolve 命令 → Engine.runEvolution() → 触发 ErrorTrigger + FeedbackTrigger → EvolutionExecutor
```

---

## 验证策略

Agent 修复后必须通过：
1. `npm run build` — TypeScript 编译通过
2. `npm test`（如果存在）— 测试通过

验证不通过 → 不应用修改 → 报告失败原因。

---

## 文件结构

```
openclaw-evolution/
├── src/
│   ├── engine.ts              # 主调度器（修改：新增 spawnAgent）
│   ├── index.ts              # 插件入口（修改：新增命令）
│   ├── triggers/
│   │   ├── feedback-trigger.ts   # [新] 反馈触发器
│   │   ├── error-trigger.ts     # [已存在]
│   │   └── timer-trigger.ts     # [已存在]
│   ├── analyzers/
│   │   ├── feedback.ts          # [新] 反馈分析器
│   │   ├── root-cause.ts        # [已存在]
│   │   ├── framework.ts         # [已存在]
│   │   └── metrics.ts           # [已存在]
│   ├── executors/
│   │   ├── evolution-executor.ts # [新] Claude Code spawn 执行器
│   │   ├── auto.ts              # [已存在]
│   │   ├── ask.ts               # [已存在]
│   │   └── forbid.ts            # [已存在]
│   └── storage/
│       ├── feedback-store.ts     # [新] 反馈存储
│       ├── error-log.ts         # [已存在]
│       ├── evolution-log.ts      # [已存在]
│       └── metrics.ts           # [已存在]
├── docs/
│   └── specs/
│       └── 2026-03-21-evolution-design.md
├── openclaw.plugin.json          # [修改]
└── config/
    └── evolution-config.json     # [修改]
```

---

## 实现顺序

1. **FeedbackStore** — 反馈存储基础设施
2. **FeedbackTrigger** — 反馈阈值检测
3. **EvolutionExecutor** — Claude Code spawn 统一封装
4. **FeedbackAnalyzer** — 反馈模式分析
5. **Engine 修改** — 集成新组件
6. **index.ts** — 注册新命令 + 反馈 hook
7. **测试** — 端到端测试三种触发方式

---

## 风险与缓解

| 风险 | 缓解 |
|------|------|
| Claude Code 修改破坏现有功能 | 文件路径白名单 + 验证后才应用 |
| 反馈误判情感 | 关键词保守匹配，neutral 不触发 |
| agent 无限重试 | 严格 3 次上限 + 指数退避 |
| 用户隐私（反馈含敏感信息） | 反馈只存 skill 名 + 操作类型，不存对话内容 |
