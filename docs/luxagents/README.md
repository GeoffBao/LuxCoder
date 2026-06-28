# LuxAgents

LuxAgents is an internal enterprise AI R&D workbench derived from Proma.

## Goals

- Enterprise AI agent desktop workbench
- Chat / Cowork / Code modes (matching Claude Desktop App pattern)
- Phase 1: Chat & Code share Claude Agent SDK (anthropic provider)
- Phase 2: Hermes provider for Chat (enterprise intranet HTTP API)
- Cowork: Teambition MCP + spec-kit + 6-phase kanban + dual review gates
- RAG / Skills / MCP governance
- Enterprise branding and auditability

## Upstream

This project is derived from Proma (ErlichLiu/Proma).

## Architecture

```
Claude Agent SDK (single engine)
    ├── provider: anthropic  →  Code mode (default)
    ├── provider: hermes     →  Chat mode (Phase 2)
    └── provider: deepseek   →  fallback
```

## Migration Phases

| Phase | Name | Branch | Scope | Est. |
|-------|------|--------|-------|------|
| P0 | Baseline | `luxagents/bootstrap` | Run Proma, code map | 1w |
| P1a | Branding | `luxagents/branding` | Name, theme, data dir, 3-mode tabs | 1w |
| P1b | Namespace | `luxagents/namespace` | `@proma/*` → `@luxagents/*` | 1w |
| P2 | Chat | `luxagents/chat` | Chat UI, keep Claude provider | 1w |
| P3 | Cowork | `luxagents/cowork` | TB MCP + 6-phase kanban + spec-kit | 4w |
| P4 | Code | `luxagents/code` | Rename Agent → Code | 0.5w |
| P5 | Enterprise | `luxagents/enterprise` | SSO, RBAC, Model Gateway, Hermes, Audit | 4w |

## Docs

- `00-baseline.md` — Codebase review with full branding checklist
- `01-code-map.md` — Proma file structure map for migration
- `02-migration-plan.md` — Detailed migration plan per phase
- `03-design-decisions.md` — 18 architecture decisions
