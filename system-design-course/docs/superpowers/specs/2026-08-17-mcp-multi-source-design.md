# Design Spec: MCP Multi-Source Server (GitHub + Notion + Linear)

**Date:** 2026-08-17  
**Status:** Approved  
**Location:** `system-design-course/projects/mcp-multi-source/`

---

## 1. Purpose

An MCP server that connects Claude to three real enterprise data sources — GitHub, Notion, and Linear — enabling a single natural-language query to synthesise a **project status rollup** across all three. Primary use case:

> "What's the state of the `auth-refactor` feature?"
> → Claude fetches open PRs from GitHub, the design doc from Notion, and linked tickets from Linear, then returns a unified summary.

This demonstrates the core technical architecture of enterprise AI deployments: parallel multi-source data access, per-source authentication, access control, and graceful degradation.

---

## 2. Project Location

New standalone folder, separate from the course content:

```
system-design-course/
└── projects/
    └── mcp-multi-source/       ← new project root
        ├── src/
        ├── config/
        ├── .env.example
        ├── package.json
        └── README.md
```

---

## 3. Technology Stack

- **Runtime:** TypeScript 5.x, Node 20 LTS
- **MCP SDK:** `@modelcontextprotocol/sdk`
- **HTTP clients:** Native `fetch` (Node 20 built-in)
- **Linear:** GraphQL via fetch (Linear's API is GraphQL-first)
- **Validation:** Zod (tool input schemas)
- **Package manager:** npm
- **Build:** `tsc` → `dist/`

---

## 4. Architecture

```
src/
├── index.ts                  # Server entry point, tool registration
├── access-control.ts         # Role → permission checker
├── connectors/
│   ├── github.ts             # GitHub REST API client + 3 tools
│   ├── notion.ts             # Notion API client + 3 tools
│   └── linear.ts             # Linear GraphQL client + 3 tools
├── tools/
│   └── status-rollup.ts      # Composite tool: parallel fetch + merge
└── types.ts                  # Shared types, Permission enum, DegradedResult

config/
└── roles.json                # Role → permitted tool list
```

### Data Flow (composite tool)

1. Claude calls `project_status_rollup({ project: "auth-refactor" })`
2. `access-control.ts` verifies caller role has `read:github`, `read:notion`, `read:linear`
3. Three connector calls fire via `Promise.allSettled` — fully parallel
4. Each result is either `{ source, data }` or `{ source, degraded: true, reason, ... }`
5. Merged response returned — partial results are valid; missing sources flagged with `_partial: true` and `_missing: string[]`

---

## 5. Tools & Permissions

| Tool | Permission required | Description |
|---|---|---|
| `github_get_prs` | `read:github` | List open PRs for a repo, filtered by branch or label |
| `github_get_issue` | `read:github` | Fetch a single issue by number |
| `github_search_code` | `read:github` | Search code in a repo by keyword |
| `notion_search_pages` | `read:notion` | Full-text search across a workspace |
| `notion_get_page` | `read:notion` | Fetch a page by Notion page ID or exact title match |
| `notion_get_database` | `read:notion` | Query a Notion database with filters |
| `linear_get_issues` | `read:linear` | List issues by project, team, or status |
| `linear_get_issue` | `read:linear` | Fetch a single issue by ID |
| `linear_create_issue` | `write:linear` | Create a new issue (write-gated) |
| `project_status_rollup` | `read:github` + `read:notion` + `read:linear` | Composite — all three in parallel |

---

## 6. Access Control

Role is set at server startup via the `MCP_ROLE` environment variable — there is no per-request identity in basic MCP. The role configures what the server instance is permitted to do, which maps to how teams deploy separate server instances with different permission levels. Checked on every tool call before any network request.

**`config/roles.json`:**
```json
{
  "readonly":  ["read:github", "read:notion", "read:linear"],
  "developer": ["read:github", "read:notion", "read:linear", "write:linear"],
  "admin":     ["read:github", "read:notion", "read:linear", "write:linear"]
}
```

If the caller's role lacks the required permission, the server returns a structured `PermissionDenied` error — no crash, no silent pass-through.

---

## 7. Error Handling & Graceful Degradation

Each connector wraps its HTTP/GraphQL call in an individual try/catch with a 5-second `AbortController` timeout. Failures never propagate upward to crash the server.

| Source | Scenario | Response |
|---|---|---|
| GitHub | Rate limited (403/429) | `{ degraded: true, reason: "rate_limited", retry_after: N }` |
| GitHub | Token invalid | `{ degraded: true, reason: "auth_failed" }` |
| Notion | Page not found (404) | `{ degraded: true, reason: "not_found" }` |
| Notion | Timeout (>5s) | `{ degraded: true, reason: "timeout" }` |
| Linear | GraphQL error | `{ degraded: true, reason: "graphql_error", message: "..." }` |
| Linear | Network unreachable | `{ degraded: true, reason: "unavailable" }` |

**Composite tool partial response shape:**
```json
{
  "github": { "prs": [...] },
  "notion": { "degraded": true, "reason": "timeout" },
  "linear": { "issues": [...] },
  "_partial": true,
  "_missing": ["notion"]
}
```

---

## 8. Configuration (`.env.example`)

```env
# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_DEFAULT_OWNER=your-org
GITHUB_DEFAULT_REPO=your-repo

# Notion
NOTION_TOKEN=secret_...
NOTION_WORKSPACE_ID=...

# Linear
LINEAR_API_KEY=lin_api_...
LINEAR_DEFAULT_TEAM=...

# Access control
MCP_ROLE=readonly
```

No secrets are committed. `.env` is in `.gitignore`. Only `.env.example` with placeholders ships.

---

## 9. README Structure

1. **What it does** — one paragraph, the status rollup use case
2. **Why these three sources** — structured (GitHub) + unstructured knowledge (Notion) + action-capable (Linear)
3. **Architecture diagram** — ASCII connector map
4. **Authentication** — how each token is obtained and scoped (least-privilege)
5. **Access control** — how roles.json works, how to add a new role
6. **What happens when a source is unavailable** — degradation table, `_partial` flag
7. **Running locally** — `npm install`, copy `.env.example`, `npm run build`, `npm start`
8. **Connecting to Claude Desktop** — `claude_desktop_config.json` snippet

---

## 10. Out of Scope

- Caching / response memoization (could be added later)
- OAuth flows — all auth is via long-lived API tokens scoped at the token level
- Web UI or dashboard
- More than one write tool (only `linear_create_issue` is write-capable in v1)
