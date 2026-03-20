# OpenClaw Evolution Plugin

A self-evolution plugin for OpenClaw that enables the AI assistant to learn from errors and improve itself over time.

## Features

- **Error-Driven Learning**: Automatically analyzes errors and generates improvement proposals
- **Periodic Analysis**: Scheduled framework and metrics analysis
- **Manual Triggers**: User can request evolution at any time
- **Risk-Based Approval**: Four-level system (L0-L3) for safe self-modification
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
| L0 | Auto | Execute without confirmation | Typo fixes, phrasing improvements |
| L1 | Ask | Show preview, ask for confirmation | New skills, instruction changes |
| L2 | Suggest | Generate report only | Deletions, behavior changes |
| L3 | Forbidden | Never modify | Secrets, auth data |

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
  "enabled": true,
  "triggers": {
    "error": { "threshold": 3, "cooldownMinutes": 30 },
    "timer": { "intervalHours": 24 }
  },
  "limits": {
    "L0": { "perHour": 10, "perDay": 50 },
    "L1": { "perHour": 5, "perDay": 20 }
  }
}
```

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
│   ├── executors/        # L0-L3 execution handlers
│   ├── storage/          # Error log, evolution log, metrics
│   └── safety/           # Path checker, rate limiter, rollback
├── skills/evolve/        # SKILL.md definition
├── config/               # Default configuration
└── dist/                 # Compiled output
```

## License

MIT
