# OpenClaw Evolution Plugin

A self-evolution plugin for OpenClaw that enables the AI assistant to learn from errors and improve itself over time.

## Features

- **Error-Driven Learning**: Automatically analyzes errors and generates improvement proposals
- **Periodic Analysis**: Scheduled framework and metrics analysis
- **Manual Triggers**: User can request evolution at any time
- **Risk-Based Approval**: Three-level system (🟢🟡🔴) for safe self-modification
- **Global Switch**: Master toggle to enable/disable evolution system
- **Rollback Support**: Every change can be undone

## Installation

```bash
cd ~/.openclaw/plugins
git clone <repository-url> openclaw-evolution
cd openclaw-evolution
npm install
npm run build
```

Then add to your OpenClaw config:

```json
{
  "plugins": ["openclaw-evolution"]
}
```

## Usage

### Manual Evolution

```
User: 进化一下
User: 自我改进
User: /evolve
```

### Check Status

```
User: 进化状态
User: /evolution_status
```

### Rollback

```
User: 回滚上一个进化
User: /evolution_rollback <id> <reason>
```

## Risk Levels

| Level | Name | Behavior | Examples |
|-------|------|----------|----------|
| 🟢 | Auto | Execute without confirmation | Typo fixes, phrasing improvements |
| 🟡 | Ask | Show preview, ask for confirmation | New skills, instruction changes |
| 🔴 | Forbid | Generate report only, never auto-execute | Deletions, behavior changes, secrets |

## Safety Mechanisms

### Path Restrictions

- **Allowed**: skills, preferences, memory
- **Blocked**: auth, secrets, .env files

### Rate Limits

Prevents excessive modifications per hour/day.

### Rollback

Every evolution records before/after snapshots for easy rollback.

## Configuration

Edit `config/evolution-config.json`:

```json
{
  "evolutionEnabled": true,
  "triggers": {
    "error": { "enabled": true, "threshold": 3, "cooldownMinutes": 30 },
    "timer": { "enabled": true, "intervalHours": 24 },
    "manual": { "enabled": true }
  },
  "limits": {
    "auto": { "perHour": 10, "perDay": 50 },
    "ask": { "perHour": 5, "perDay": 20 },
    "forbid": { "perHour": 20, "perDay": 100 }
  }
}
```

### Global Switch

Set `evolutionEnabled: false` to disable the entire evolution system.

## Architecture

```
openclaw-evolution/
├── src/
│   ├── index.ts          # Plugin entry
│   ├── engine.ts         # Core orchestrator
│   ├── types.ts          # Type definitions
│   ├── triggers/         # Error, timer, manual triggers
│   ├── analyzers/        # Root cause, framework, metrics
│   ├── classifiers/      # Risk classification
│   ├── executors/        # 🟢🟡🔴 execution handlers
│   ├── storage/          # Error log, evolution log, metrics
│   └── safety/           # Path checker, rate limiter, rollback
├── skills/evolve/        # SKILL.md definition
├── config/               # Default configuration
└── dist/                 # Compiled output
```

## License

MIT
