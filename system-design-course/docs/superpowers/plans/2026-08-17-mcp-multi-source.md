# MCP Multi-Source Server Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a TypeScript MCP server that connects Claude to GitHub, Notion, and Linear with tool-level access control and per-source graceful degradation.

**Architecture:** A stdio-based MCP server exposing 10 tools (3 per source + 1 composite). Each connector wraps its API in a 5-second timeout with structured error returns. The composite `project_status_rollup` tool calls all three in parallel via `Promise.allSettled` and returns partial results when a source is unavailable.

**Tech Stack:** TypeScript 5.x, Node 20 LTS, `@modelcontextprotocol/sdk`, Zod, dotenv, Vitest

## Global Constraints

- Node 20+ required — uses native `fetch` (no node-fetch)
- ESM throughout — `"type": "module"` in package.json, `.js` extensions in all imports
- `tsconfig.json` must use `"module": "NodeNext"` and `"moduleResolution": "NodeNext"`
- Never commit `.env` — only `.env.example` with placeholder values ships
- All imports inside `src/` use `.js` suffix (TypeScript resolves to `.ts` at build time)
- Tests use Vitest with `vi.stubGlobal("fetch", vi.fn())` to mock HTTP calls
- Working directory for all commands: `projects/mcp-multi-source/`

---

## File Map

```
projects/mcp-multi-source/
├── src/
│   ├── types.ts                    # Permission enum + all shared interfaces
│   ├── access-control.ts           # Role loader + permission checker
│   ├── connectors/
│   │   ├── github.ts               # GitHub REST: getPRs, getIssue, searchCode
│   │   ├── notion.ts               # Notion API: searchPages, getPage, getDatabase
│   │   └── linear.ts               # Linear GraphQL: getIssues, getIssue, createIssue
│   ├── tools/
│   │   └── status-rollup.ts        # Composite: Promise.allSettled across all 3
│   └── index.ts                    # MCP server: tool registration + stdio transport
├── tests/
│   ├── access-control.test.ts
│   ├── connectors/
│   │   ├── github.test.ts
│   │   ├── notion.test.ts
│   │   └── linear.test.ts
│   └── tools/
│       └── status-rollup.test.ts
├── config/
│   └── roles.json
├── .env.example
├── .gitignore
├── package.json
├── tsconfig.json
└── README.md
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `projects/mcp-multi-source/package.json`
- Create: `projects/mcp-multi-source/tsconfig.json`
- Create: `projects/mcp-multi-source/.env.example`
- Create: `projects/mcp-multi-source/.gitignore`
- Create: `projects/mcp-multi-source/config/roles.json`

**Interfaces:**
- Produces: npm scripts `build`, `start`, `test`; role definitions consumed by Task 3

- [ ] **Step 1: Create the project directory**

```bash
mkdir -p projects/mcp-multi-source/src/connectors
mkdir -p projects/mcp-multi-source/src/tools
mkdir -p projects/mcp-multi-source/tests/connectors
mkdir -p projects/mcp-multi-source/tests/tools
mkdir -p projects/mcp-multi-source/config
```

- [ ] **Step 2: Create `package.json`**

```json
{
  "name": "mcp-multi-source",
  "version": "1.0.0",
  "description": "MCP server connecting Claude to GitHub, Notion, and Linear",
  "type": "module",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.0",
    "dotenv": "^16.4.5",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/node": "^20.14.0",
    "tsx": "^4.15.7",
    "typescript": "^5.5.2",
    "vitest": "^2.0.2"
  }
}
```

- [ ] **Step 3: Create `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 4: Create `.env.example`**

```env
# GitHub — create a fine-grained PAT at https://github.com/settings/tokens
# Required scopes: Contents (read), Pull Requests (read), Issues (read)
GITHUB_TOKEN=ghp_your_token_here
GITHUB_DEFAULT_OWNER=your-org-or-username
GITHUB_DEFAULT_REPO=your-repo-name

# Notion — create an integration at https://www.notion.so/my-integrations
# Share each page/database you want to access with the integration
NOTION_TOKEN=secret_your_notion_integration_token

# Linear — create an API key at https://linear.app/settings/api
LINEAR_API_KEY=lin_api_your_key_here
LINEAR_DEFAULT_TEAM=your-team-key

# Access control — one of: readonly, developer, admin
MCP_ROLE=readonly
```

- [ ] **Step 5: Create `.gitignore`**

```
node_modules/
dist/
.env
*.env.local
```

- [ ] **Step 6: Create `config/roles.json`**

```json
{
  "readonly":  ["read:github", "read:notion", "read:linear"],
  "developer": ["read:github", "read:notion", "read:linear", "write:linear"],
  "admin":     ["read:github", "read:notion", "read:linear", "write:linear"]
}
```

- [ ] **Step 7: Install dependencies**

```bash
cd projects/mcp-multi-source
npm install
```

Expected: `node_modules/` created, `package-lock.json` generated. No errors.

- [ ] **Step 8: Verify TypeScript compiles an empty file**

```bash
echo "export {};" > src/index.ts
npm run build
```

Expected: `dist/index.js` created with no errors.

- [ ] **Step 9: Commit**

```bash
git add projects/mcp-multi-source/
git commit -m "feat: scaffold mcp-multi-source project"
```

---

## Task 2: Shared Types

**Files:**
- Create: `projects/mcp-multi-source/src/types.ts`

**Interfaces:**
- Produces: `Permission`, `DegradedResult`, `SourceResult<T>`, `GitHubPR`, `GitHubIssue`, `NotionPage`, `LinearIssue`, `RollupResult` — consumed by every subsequent task

- [ ] **Step 1: Write `src/types.ts`**

```typescript
export type Permission =
  | "read:github"
  | "read:notion"
  | "read:linear"
  | "write:linear";

export interface DegradedResult {
  degraded: true;
  reason:
    | "rate_limited"
    | "auth_failed"
    | "not_found"
    | "timeout"
    | "graphql_error"
    | "unavailable";
  retry_after?: number;
  message?: string;
}

export interface SourceSuccess<T> {
  degraded?: false;
  data: T;
}

export type SourceResult<T> = DegradedResult | SourceSuccess<T>;

export interface GitHubPR {
  number: number;
  title: string;
  url: string;
  state: string;
  author: string;
  labels: string[];
  created_at: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  url: string;
  state: string;
  body: string;
  labels: string[];
}

export interface NotionPage {
  id: string;
  title: string;
  url: string;
  last_edited: string;
}

export interface LinearIssue {
  id: string;
  title: string;
  url: string;
  state: string;
  priority: number;
  team: string;
}

export interface RollupResult {
  github: SourceResult<{ prs: GitHubPR[] }> | null;
  notion: SourceResult<{ pages: NotionPage[] }> | null;
  linear: SourceResult<{ issues: LinearIssue[] }> | null;
  _partial?: boolean;
  _missing?: string[];
}
```

- [ ] **Step 2: Build to verify no type errors**

```bash
npm run build
```

Expected: `dist/types.js` emitted, zero errors.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat: add shared types and interfaces"
```

---

## Task 3: Access Control

**Files:**
- Create: `projects/mcp-multi-source/src/access-control.ts`
- Create: `projects/mcp-multi-source/tests/access-control.test.ts`

**Interfaces:**
- Consumes: `Permission` from `./types.js`; `config/roles.json` at runtime
- Produces: `checkPermission(tool, required[], role)` — throws `PermissionDeniedError` if denied; `getPermissionsForRole(role)` — consumed by Task 8

- [ ] **Step 1: Write the failing tests**

`tests/access-control.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { checkPermission, getPermissionsForRole, PermissionDeniedError } from "../src/access-control.js";

// Mock fs to avoid reading actual config/roles.json in tests
vi.mock("fs", () => ({
  readFileSync: vi.fn(() =>
    JSON.stringify({
      readonly:  ["read:github", "read:notion", "read:linear"],
      developer: ["read:github", "read:notion", "read:linear", "write:linear"],
    })
  ),
}));

describe("getPermissionsForRole", () => {
  it("returns permissions for a known role", () => {
    const perms = getPermissionsForRole("readonly");
    expect(perms).toContain("read:github");
    expect(perms).toContain("read:notion");
    expect(perms).toContain("read:linear");
  });

  it("returns empty array for unknown role", () => {
    const perms = getPermissionsForRole("unknown-role");
    expect(perms).toEqual([]);
  });
});

describe("checkPermission", () => {
  it("does not throw when role has the required permission", () => {
    expect(() =>
      checkPermission("github_get_prs", ["read:github"], "readonly")
    ).not.toThrow();
  });

  it("throws PermissionDeniedError when role lacks permission", () => {
    expect(() =>
      checkPermission("linear_create_issue", ["write:linear"], "readonly")
    ).toThrow(PermissionDeniedError);
  });

  it("throws with a descriptive message naming the tool and permission", () => {
    expect(() =>
      checkPermission("linear_create_issue", ["write:linear"], "readonly")
    ).toThrow("linear_create_issue");
  });

  it("passes for developer role with write:linear", () => {
    expect(() =>
      checkPermission("linear_create_issue", ["write:linear"], "developer")
    ).not.toThrow();
  });

  it("throws on first missing permission when multiple required", () => {
    expect(() =>
      checkPermission("project_status_rollup", ["read:github", "write:linear"], "readonly")
    ).toThrow(PermissionDeniedError);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../src/access-control.js'`

- [ ] **Step 3: Write `src/access-control.ts`**

```typescript
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import type { Permission } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export class PermissionDeniedError extends Error {
  constructor(tool: string, permission: Permission, role: string) {
    super(
      `Tool '${tool}' requires '${permission}' but role '${role}' does not have it`
    );
    this.name = "PermissionDeniedError";
  }
}

type RolesConfig = Record<string, Permission[]>;

function loadRoles(): RolesConfig {
  const configPath = join(__dirname, "..", "config", "roles.json");
  return JSON.parse(readFileSync(configPath, "utf-8")) as RolesConfig;
}

export function getPermissionsForRole(role: string): Permission[] {
  const roles = loadRoles();
  return roles[role] ?? [];
}

export function checkPermission(
  tool: string,
  required: Permission[],
  role: string
): void {
  const granted = getPermissionsForRole(role);
  for (const perm of required) {
    if (!granted.includes(perm)) {
      throw new PermissionDeniedError(tool, perm, role);
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All 5 access-control tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/access-control.ts tests/access-control.test.ts
git commit -m "feat: add tool-level access control with role-based permissions"
```

---

## Task 4: GitHub Connector

**Files:**
- Create: `projects/mcp-multi-source/src/connectors/github.ts`
- Create: `projects/mcp-multi-source/tests/connectors/github.test.ts`

**Interfaces:**
- Consumes: `DegradedResult`, `GitHubPR`, `GitHubIssue`, `SourceResult` from `../types.js`
- Produces:
  - `getPRs(owner, repo, label?, branch?): Promise<SourceResult<{ prs: GitHubPR[] }>>`
  - `getIssue(owner, repo, issueNumber): Promise<SourceResult<{ issue: GitHubIssue }>>`
  - `searchCode(owner, repo, query): Promise<SourceResult<{ items: Array<{ path, url, score }> }>>`

- [ ] **Step 1: Write the failing tests**

`tests/connectors/github.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getPRs, getIssue, searchCode } from "../../src/connectors/github.js";

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  process.env.GITHUB_TOKEN = "test-token";
});

function mockResponse(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
    headers: { get: (key: string) => headers[key] ?? null },
  });
}

describe("getPRs", () => {
  it("returns mapped PRs on 200", async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(200, [
        {
          number: 42,
          title: "Add auth",
          html_url: "https://github.com/org/repo/pull/42",
          state: "open",
          user: { login: "alice" },
          labels: [{ name: "feature" }],
          created_at: "2024-01-01T00:00:00Z",
        },
      ])
    );
    const result = await getPRs("org", "repo");
    expect(result).toEqual({
      data: {
        prs: [
          {
            number: 42,
            title: "Add auth",
            url: "https://github.com/org/repo/pull/42",
            state: "open",
            author: "alice",
            labels: ["feature"],
            created_at: "2024-01-01T00:00:00Z",
          },
        ],
      },
    });
  });

  it("returns rate_limited on 429", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(429, {}, { "retry-after": "30" }));
    const result = await getPRs("org", "repo");
    expect(result).toEqual({ degraded: true, reason: "rate_limited", retry_after: 30 });
  });

  it("returns auth_failed on 401", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(401, {}));
    const result = await getPRs("org", "repo");
    expect(result).toMatchObject({ degraded: true, reason: "auth_failed" });
  });

  it("returns timeout when fetch is aborted", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const result = await getPRs("org", "repo");
    expect(result).toEqual({ degraded: true, reason: "timeout" });
  });

  it("returns unavailable on network error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const result = await getPRs("org", "repo");
    expect(result).toEqual({ degraded: true, reason: "unavailable" });
  });
});

describe("getIssue", () => {
  it("returns mapped issue on 200", async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(200, {
        number: 7,
        title: "Bug in auth",
        html_url: "https://github.com/org/repo/issues/7",
        state: "open",
        body: "It crashes",
        labels: [{ name: "bug" }],
      })
    );
    const result = await getIssue("org", "repo", 7);
    expect(result).toEqual({
      data: {
        issue: {
          number: 7,
          title: "Bug in auth",
          url: "https://github.com/org/repo/issues/7",
          state: "open",
          body: "It crashes",
          labels: ["bug"],
        },
      },
    });
  });

  it("returns not_found on 404", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(404, {}));
    const result = await getIssue("org", "repo", 999);
    expect(result).toEqual({ degraded: true, reason: "not_found" });
  });
});

describe("searchCode", () => {
  it("returns mapped items on 200", async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(200, {
        items: [{ path: "src/auth.ts", html_url: "https://github.com/org/repo/blob/main/src/auth.ts", score: 1.5 }],
      })
    );
    const result = await searchCode("org", "repo", "auth");
    expect(result).toEqual({
      data: { items: [{ path: "src/auth.ts", url: "https://github.com/org/repo/blob/main/src/auth.ts", score: 1.5 }] },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/connectors/github.js'`

- [ ] **Step 3: Write `src/connectors/github.ts`**

```typescript
import type { DegradedResult, GitHubPR, GitHubIssue, SourceResult } from "../types.js";

const BASE = "https://api.github.com";
const TIMEOUT_MS = 5000;

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubFetch(url: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { headers: authHeaders(), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function checkDegraded(res: Response): DegradedResult | null {
  if (res.status === 401) return { degraded: true, reason: "auth_failed" };
  if (res.status === 429 || res.status === 403) {
    const retry = parseInt(res.headers.get("retry-after") ?? "60", 10);
    return { degraded: true, reason: "rate_limited", retry_after: retry };
  }
  return null;
}

export async function getPRs(
  owner: string,
  repo: string,
  label?: string,
  branch?: string
): Promise<SourceResult<{ prs: GitHubPR[] }>> {
  try {
    const params = new URLSearchParams({ state: "open", per_page: "20" });
    if (label) params.set("labels", label);
    if (branch) params.set("head", `${owner}:${branch}`);
    const res = await githubFetch(`${BASE}/repos/${owner}/${repo}/pulls?${params}`);
    const degraded = checkDegraded(res);
    if (degraded) return degraded;
    const json = (await res.json()) as Record<string, unknown>[];
    return {
      data: {
        prs: json.map((pr) => ({
          number: pr.number as number,
          title: pr.title as string,
          url: pr.html_url as string,
          state: pr.state as string,
          author: (pr.user as { login: string }).login,
          labels: (pr.labels as { name: string }[]).map((l) => l.name),
          created_at: pr.created_at as string,
        })),
      },
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { degraded: true, reason: "timeout" };
    }
    return { degraded: true, reason: "unavailable" };
  }
}

export async function getIssue(
  owner: string,
  repo: string,
  issueNumber: number
): Promise<SourceResult<{ issue: GitHubIssue }>> {
  try {
    const res = await githubFetch(`${BASE}/repos/${owner}/${repo}/issues/${issueNumber}`);
    const degraded = checkDegraded(res);
    if (degraded) return degraded;
    if (res.status === 404) return { degraded: true, reason: "not_found" };
    const json = (await res.json()) as Record<string, unknown>;
    return {
      data: {
        issue: {
          number: json.number as number,
          title: json.title as string,
          url: json.html_url as string,
          state: json.state as string,
          body: (json.body as string) ?? "",
          labels: (json.labels as { name: string }[]).map((l) => l.name),
        },
      },
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { degraded: true, reason: "timeout" };
    }
    return { degraded: true, reason: "unavailable" };
  }
}

export async function searchCode(
  owner: string,
  repo: string,
  query: string
): Promise<SourceResult<{ items: Array<{ path: string; url: string; score: number }> }>> {
  try {
    const params = new URLSearchParams({ q: `${query} repo:${owner}/${repo}`, per_page: "10" });
    const res = await githubFetch(`${BASE}/search/code?${params}`);
    const degraded = checkDegraded(res);
    if (degraded) return degraded;
    const json = (await res.json()) as { items: Record<string, unknown>[] };
    return {
      data: {
        items: json.items.map((item) => ({
          path: item.path as string,
          url: item.html_url as string,
          score: item.score as number,
        })),
      },
    };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { degraded: true, reason: "timeout" };
    }
    return { degraded: true, reason: "unavailable" };
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test
```

Expected: All GitHub connector tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/github.ts tests/connectors/github.test.ts
git commit -m "feat: add GitHub connector with getPRs, getIssue, searchCode"
```

---

## Task 5: Notion Connector

**Files:**
- Create: `projects/mcp-multi-source/src/connectors/notion.ts`
- Create: `projects/mcp-multi-source/tests/connectors/notion.test.ts`

**Interfaces:**
- Consumes: `NotionPage`, `SourceResult` from `../types.js`
- Produces:
  - `searchPages(query): Promise<SourceResult<{ pages: NotionPage[] }>>`
  - `getPage(pageId): Promise<SourceResult<{ page: NotionPage }>>`
  - `getDatabase(databaseId, filter?): Promise<SourceResult<{ results: unknown[] }>>`

- [ ] **Step 1: Write the failing tests**

`tests/connectors/notion.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { searchPages, getPage, getDatabase } from "../../src/connectors/notion.js";

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  process.env.NOTION_TOKEN = "test-secret";
});

function mockResponse(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
}

const notionPage = {
  id: "page-id-123",
  url: "https://notion.so/page-id-123",
  last_edited_time: "2024-06-01T12:00:00Z",
  properties: {
    Name: { type: "title", title: [{ plain_text: "Auth Design" }] },
  },
};

describe("searchPages", () => {
  it("returns mapped pages on 200", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(200, { results: [notionPage] }));
    const result = await searchPages("auth");
    expect(result).toEqual({
      data: {
        pages: [
          {
            id: "page-id-123",
            title: "Auth Design",
            url: "https://notion.so/page-id-123",
            last_edited: "2024-06-01T12:00:00Z",
          },
        ],
      },
    });
  });

  it("returns auth_failed on 401", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(401, {}));
    const result = await searchPages("auth");
    expect(result).toEqual({ degraded: true, reason: "auth_failed" });
  });

  it("returns timeout on AbortError", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const result = await searchPages("auth");
    expect(result).toEqual({ degraded: true, reason: "timeout" });
  });
});

describe("getPage", () => {
  it("returns mapped page on 200", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(200, notionPage));
    const result = await getPage("page-id-123");
    expect(result).toEqual({
      data: {
        page: {
          id: "page-id-123",
          title: "Auth Design",
          url: "https://notion.so/page-id-123",
          last_edited: "2024-06-01T12:00:00Z",
        },
      },
    });
  });

  it("returns not_found on 404", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(404, {}));
    const result = await getPage("bad-id");
    expect(result).toEqual({ degraded: true, reason: "not_found" });
  });
});

describe("getDatabase", () => {
  it("returns results array on 200", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(200, { results: [{ id: "row1" }] }));
    const result = await getDatabase("db-id-456");
    expect(result).toEqual({ data: { results: [{ id: "row1" }] } });
  });

  it("sends filter in request body when provided", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(200, { results: [] }));
    await getDatabase("db-id", { property: "Status", select: { equals: "Done" } });
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.filter).toEqual({ property: "Status", select: { equals: "Done" } });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/connectors/notion.js'`

- [ ] **Step 3: Write `src/connectors/notion.ts`**

```typescript
import type { NotionPage, SourceResult } from "../types.js";

const BASE = "https://api.notion.com/v1";
const NOTION_VERSION = "2022-06-28";
const TIMEOUT_MS = 5000;

function authHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.NOTION_TOKEN}`,
    "Notion-Version": NOTION_VERSION,
    "Content-Type": "application/json",
  };
}

async function notionFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, headers: authHeaders(), signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function extractTitle(page: Record<string, unknown>): string {
  const props = page.properties as Record<string, unknown> | undefined;
  if (!props) return "Untitled";
  for (const prop of Object.values(props)) {
    const p = prop as Record<string, unknown>;
    if (p.type === "title") {
      const titles = p.title as Array<{ plain_text: string }>;
      return titles?.[0]?.plain_text ?? "Untitled";
    }
  }
  return "Untitled";
}

function mapPage(p: Record<string, unknown>): NotionPage {
  return {
    id: p.id as string,
    title: extractTitle(p),
    url: p.url as string,
    last_edited: p.last_edited_time as string,
  };
}

export async function searchPages(
  query: string
): Promise<SourceResult<{ pages: NotionPage[] }>> {
  try {
    const res = await notionFetch(`${BASE}/search`, {
      method: "POST",
      body: JSON.stringify({
        query,
        filter: { property: "object", value: "page" },
        page_size: 10,
      }),
    });
    if (res.status === 401) return { degraded: true, reason: "auth_failed" };
    if (!res.ok) return { degraded: true, reason: "unavailable" };
    const json = (await res.json()) as { results: Record<string, unknown>[] };
    return { data: { pages: json.results.map(mapPage) } };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { degraded: true, reason: "timeout" };
    }
    return { degraded: true, reason: "unavailable" };
  }
}

export async function getPage(
  pageId: string
): Promise<SourceResult<{ page: NotionPage }>> {
  try {
    const res = await notionFetch(`${BASE}/pages/${pageId}`);
    if (res.status === 401) return { degraded: true, reason: "auth_failed" };
    if (res.status === 404) return { degraded: true, reason: "not_found" };
    if (!res.ok) return { degraded: true, reason: "unavailable" };
    const p = (await res.json()) as Record<string, unknown>;
    return { data: { page: mapPage(p) } };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { degraded: true, reason: "timeout" };
    }
    return { degraded: true, reason: "unavailable" };
  }
}

export async function getDatabase(
  databaseId: string,
  filter?: Record<string, unknown>
): Promise<SourceResult<{ results: unknown[] }>> {
  try {
    const body: Record<string, unknown> = { page_size: 20 };
    if (filter) body.filter = filter;
    const res = await notionFetch(`${BASE}/databases/${databaseId}/query`, {
      method: "POST",
      body: JSON.stringify(body),
    });
    if (res.status === 401) return { degraded: true, reason: "auth_failed" };
    if (res.status === 404) return { degraded: true, reason: "not_found" };
    if (!res.ok) return { degraded: true, reason: "unavailable" };
    const json = (await res.json()) as { results: unknown[] };
    return { data: { results: json.results } };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { degraded: true, reason: "timeout" };
    }
    return { degraded: true, reason: "unavailable" };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All Notion connector tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/notion.ts tests/connectors/notion.test.ts
git commit -m "feat: add Notion connector with searchPages, getPage, getDatabase"
```

---

## Task 6: Linear Connector

**Files:**
- Create: `projects/mcp-multi-source/src/connectors/linear.ts`
- Create: `projects/mcp-multi-source/tests/connectors/linear.test.ts`

**Interfaces:**
- Consumes: `LinearIssue`, `DegradedResult`, `SourceResult` from `../types.js`
- Produces:
  - `getIssues(teamKey?, status?): Promise<SourceResult<{ issues: LinearIssue[] }>>`
  - `getIssue(issueId): Promise<SourceResult<{ issue: LinearIssue }>>`
  - `createIssue(title, teamId, description?): Promise<SourceResult<{ issue: { id, url } }>>`

- [ ] **Step 1: Write the failing tests**

`tests/connectors/linear.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { getIssues, getIssue, createIssue } from "../../src/connectors/linear.js";

const mockFetch = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", mockFetch);
  mockFetch.mockReset();
  process.env.LINEAR_API_KEY = "lin_api_test";
});

function mockResponse(status: number, body: unknown) {
  return Promise.resolve({
    status,
    ok: status >= 200 && status < 300,
    json: () => Promise.resolve(body),
  });
}

const linearIssueNode = {
  id: "issue-abc",
  title: "Fix login bug",
  url: "https://linear.app/team/issue/issue-abc",
  priority: 1,
  state: { name: "In Progress" },
  team: { name: "Engineering" },
};

describe("getIssues", () => {
  it("returns mapped issues on success", async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(200, { data: { issues: { nodes: [linearIssueNode] } } })
    );
    const result = await getIssues();
    expect(result).toEqual({
      data: {
        issues: [
          {
            id: "issue-abc",
            title: "Fix login bug",
            url: "https://linear.app/team/issue/issue-abc",
            state: "In Progress",
            priority: 1,
            team: "Engineering",
          },
        ],
      },
    });
  });

  it("returns graphql_error when response contains errors", async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(200, { errors: [{ message: "Unauthorized" }] })
    );
    const result = await getIssues();
    expect(result).toEqual({
      degraded: true,
      reason: "graphql_error",
      message: "Unauthorized",
    });
  });

  it("returns auth_failed on 401", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(401, {}));
    const result = await getIssues();
    expect(result).toEqual({ degraded: true, reason: "auth_failed" });
  });

  it("returns timeout on AbortError", async () => {
    mockFetch.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "AbortError" }));
    const result = await getIssues();
    expect(result).toEqual({ degraded: true, reason: "timeout" });
  });
});

describe("getIssue", () => {
  it("returns mapped issue on success", async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(200, { data: { issue: linearIssueNode } })
    );
    const result = await getIssue("issue-abc");
    expect(result).toEqual({
      data: {
        issue: {
          id: "issue-abc",
          title: "Fix login bug",
          url: "https://linear.app/team/issue/issue-abc",
          state: "In Progress",
          priority: 1,
          team: "Engineering",
        },
      },
    });
  });

  it("returns not_found when issue is null", async () => {
    mockFetch.mockReturnValueOnce(mockResponse(200, { data: { issue: null } }));
    const result = await getIssue("bad-id");
    expect(result).toEqual({ degraded: true, reason: "not_found" });
  });
});

describe("createIssue", () => {
  it("returns created issue id and url", async () => {
    mockFetch.mockReturnValueOnce(
      mockResponse(200, {
        data: { issueCreate: { issue: { id: "new-id", url: "https://linear.app/issue/new-id" } } },
      })
    );
    const result = await createIssue("New bug", "team-id", "Details here");
    expect(result).toEqual({
      data: { issue: { id: "new-id", url: "https://linear.app/issue/new-id" } },
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/connectors/linear.js'`

- [ ] **Step 3: Write `src/connectors/linear.ts`**

```typescript
import type { DegradedResult, LinearIssue, SourceResult } from "../types.js";

const LINEAR_API = "https://api.linear.app/graphql";
const TIMEOUT_MS = 5000;

function authHeaders(): Record<string, string> {
  return {
    Authorization: process.env.LINEAR_API_KEY ?? "",
    "Content-Type": "application/json",
  };
}

async function graphql(
  query: string,
  variables?: Record<string, unknown>
): Promise<SourceResult<Record<string, unknown>>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(LINEAR_API, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({ query, variables }),
      signal: controller.signal,
    });
    if (res.status === 401) return { degraded: true, reason: "auth_failed" };
    if (!res.ok) return { degraded: true, reason: "unavailable" };
    const json = (await res.json()) as { data?: Record<string, unknown>; errors?: { message: string }[] };
    if (json.errors?.length) {
      return { degraded: true, reason: "graphql_error", message: json.errors[0].message };
    }
    return { data: json.data ?? {} };
  } catch (err: unknown) {
    if (err instanceof Error && err.name === "AbortError") {
      return { degraded: true, reason: "timeout" };
    }
    return { degraded: true, reason: "unavailable" };
  } finally {
    clearTimeout(timer);
  }
}

function mapIssue(issue: Record<string, unknown>): LinearIssue {
  return {
    id: issue.id as string,
    title: issue.title as string,
    url: issue.url as string,
    state: ((issue.state as Record<string, string>)?.name) ?? "Unknown",
    priority: (issue.priority as number) ?? 0,
    team: ((issue.team as Record<string, string>)?.name) ?? "Unknown",
  };
}

export async function getIssues(
  teamKey?: string,
  status?: string
): Promise<SourceResult<{ issues: LinearIssue[] }>> {
  const filters: string[] = [];
  if (teamKey) filters.push(`team: { key: { eq: "${teamKey}" } }`);
  if (status) filters.push(`state: { name: { eq: "${status}" } }`);
  const filterArg = filters.length ? `(filter: { ${filters.join(", ")} })` : "";

  const query = `query {
    issues${filterArg} {
      nodes { id title url priority state { name } team { name } }
    }
  }`;

  const result = await graphql(query);
  if ("degraded" in result && result.degraded) return result as DegradedResult;
  const nodes = ((result.data.issues as Record<string, unknown>).nodes as Record<string, unknown>[]);
  return { data: { issues: nodes.map(mapIssue) } };
}

export async function getIssue(
  issueId: string
): Promise<SourceResult<{ issue: LinearIssue }>> {
  const query = `query($id: String!) {
    issue(id: $id) { id title url priority state { name } team { name } }
  }`;
  const result = await graphql(query, { id: issueId });
  if ("degraded" in result && result.degraded) return result as DegradedResult;
  if (!result.data.issue) return { degraded: true, reason: "not_found" };
  return { data: { issue: mapIssue(result.data.issue as Record<string, unknown>) } };
}

export async function createIssue(
  title: string,
  teamId: string,
  description?: string
): Promise<SourceResult<{ issue: { id: string; url: string } }>> {
  const query = `mutation($input: IssueCreateInput!) {
    issueCreate(input: $input) { issue { id url } }
  }`;
  const input: Record<string, string> = { title, teamId };
  if (description) input.description = description;
  const result = await graphql(query, { input });
  if ("degraded" in result && result.degraded) return result as DegradedResult;
  const created = ((result.data.issueCreate as Record<string, unknown>).issue as { id: string; url: string });
  return { data: { issue: created } };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All Linear connector tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/connectors/linear.ts tests/connectors/linear.test.ts
git commit -m "feat: add Linear GraphQL connector with getIssues, getIssue, createIssue"
```

---

## Task 7: Status Rollup Tool

**Files:**
- Create: `projects/mcp-multi-source/src/tools/status-rollup.ts`
- Create: `projects/mcp-multi-source/tests/tools/status-rollup.test.ts`

**Interfaces:**
- Consumes: `getPRs` from `../connectors/github.js`; `searchPages` from `../connectors/notion.js`; `getIssues` from `../connectors/linear.js`; `RollupResult` from `../types.js`
- Produces: `projectStatusRollup(project, owner, repo, linearTeam?): Promise<RollupResult>`

- [ ] **Step 1: Write the failing tests**

`tests/tools/status-rollup.test.ts`:
```typescript
import { describe, it, expect, vi } from "vitest";
import { projectStatusRollup } from "../../src/tools/status-rollup.js";

vi.mock("../../src/connectors/github.js", () => ({
  getPRs: vi.fn(),
}));
vi.mock("../../src/connectors/notion.js", () => ({
  searchPages: vi.fn(),
}));
vi.mock("../../src/connectors/linear.js", () => ({
  getIssues: vi.fn(),
}));

import { getPRs } from "../../src/connectors/github.js";
import { searchPages } from "../../src/connectors/notion.js";
import { getIssues } from "../../src/connectors/linear.js";

const mockPRs = vi.mocked(getPRs);
const mockPages = vi.mocked(searchPages);
const mockIssues = vi.mocked(getIssues);

describe("projectStatusRollup", () => {
  it("returns data from all three sources when all succeed", async () => {
    mockPRs.mockResolvedValueOnce({ data: { prs: [{ number: 1, title: "PR", url: "", state: "open", author: "a", labels: [], created_at: "" }] } });
    mockPages.mockResolvedValueOnce({ data: { pages: [{ id: "p1", title: "Doc", url: "", last_edited: "" }] } });
    mockIssues.mockResolvedValueOnce({ data: { issues: [{ id: "i1", title: "Issue", url: "", state: "Todo", priority: 0, team: "Eng" }] } });

    const result = await projectStatusRollup("auth", "org", "repo");

    expect(result._partial).toBeUndefined();
    expect(result._missing).toBeUndefined();
    expect(result.github).toMatchObject({ data: { prs: expect.any(Array) } });
    expect(result.notion).toMatchObject({ data: { pages: expect.any(Array) } });
    expect(result.linear).toMatchObject({ data: { issues: expect.any(Array) } });
  });

  it("marks _partial and _missing when one source is degraded", async () => {
    mockPRs.mockResolvedValueOnce({ data: { prs: [] } });
    mockPages.mockResolvedValueOnce({ degraded: true, reason: "timeout" });
    mockIssues.mockResolvedValueOnce({ data: { issues: [] } });

    const result = await projectStatusRollup("auth", "org", "repo");

    expect(result._partial).toBe(true);
    expect(result._missing).toEqual(["notion"]);
  });

  it("marks all three as missing when all fail", async () => {
    mockPRs.mockResolvedValueOnce({ degraded: true, reason: "unavailable" });
    mockPages.mockResolvedValueOnce({ degraded: true, reason: "auth_failed" });
    mockIssues.mockResolvedValueOnce({ degraded: true, reason: "graphql_error", message: "err" });

    const result = await projectStatusRollup("auth", "org", "repo");

    expect(result._partial).toBe(true);
    expect(result._missing).toEqual(["github", "notion", "linear"]);
  });

  it("handles a rejected promise from one connector gracefully", async () => {
    mockPRs.mockRejectedValueOnce(new Error("unexpected crash"));
    mockPages.mockResolvedValueOnce({ data: { pages: [] } });
    mockIssues.mockResolvedValueOnce({ data: { issues: [] } });

    const result = await projectStatusRollup("auth", "org", "repo");

    expect(result._partial).toBe(true);
    expect(result._missing).toContain("github");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../../src/tools/status-rollup.js'`

- [ ] **Step 3: Write `src/tools/status-rollup.ts`**

```typescript
import { getPRs } from "../connectors/github.js";
import { searchPages } from "../connectors/notion.js";
import { getIssues } from "../connectors/linear.js";
import type { RollupResult, SourceResult, GitHubPR, NotionPage, LinearIssue } from "../types.js";

export async function projectStatusRollup(
  project: string,
  owner: string,
  repo: string,
  linearTeam?: string
): Promise<RollupResult> {
  const [githubSettled, notionSettled, linearSettled] = await Promise.allSettled([
    getPRs(owner, repo, project),
    searchPages(project),
    getIssues(linearTeam),
  ]);

  function resolve<T>(
    settled: PromiseSettledResult<SourceResult<T>>
  ): SourceResult<T> {
    if (settled.status === "fulfilled") return settled.value;
    return { degraded: true, reason: "unavailable" };
  }

  const github = resolve(githubSettled as PromiseSettledResult<SourceResult<{ prs: GitHubPR[] }>>);
  const notion = resolve(notionSettled as PromiseSettledResult<SourceResult<{ pages: NotionPage[] }>>);
  const linear = resolve(linearSettled as PromiseSettledResult<SourceResult<{ issues: LinearIssue[] }>>);

  const missing: string[] = [];
  if ("degraded" in github && github.degraded) missing.push("github");
  if ("degraded" in notion && notion.degraded) missing.push("notion");
  if ("degraded" in linear && linear.degraded) missing.push("linear");

  const result: RollupResult = { github, notion, linear };
  if (missing.length > 0) {
    result._partial = true;
    result._missing = missing;
  }
  return result;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All status-rollup tests PASS. Full suite should now be 20+ tests, all green.

- [ ] **Step 5: Commit**

```bash
git add src/tools/status-rollup.ts tests/tools/status-rollup.test.ts
git commit -m "feat: add composite status rollup tool with Promise.allSettled"
```

---

## Task 8: MCP Server Entry Point

**Files:**
- Create: `projects/mcp-multi-source/src/index.ts` (replaces the empty placeholder from Task 1)

**Interfaces:**
- Consumes: `checkPermission`, `PermissionDeniedError` from `./access-control.js`; all connector exports; `projectStatusRollup` from `./tools/status-rollup.js`
- Produces: Running MCP server on stdio; no return value (process runs until killed)

- [ ] **Step 1: Write `src/index.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { config } from "dotenv";
import { checkPermission, PermissionDeniedError } from "./access-control.js";
import * as github from "./connectors/github.js";
import * as notion from "./connectors/notion.js";
import * as linear from "./connectors/linear.js";
import { projectStatusRollup } from "./tools/status-rollup.js";

config();

const ROLE = process.env.MCP_ROLE ?? "readonly";
const DEFAULT_OWNER = process.env.GITHUB_DEFAULT_OWNER ?? "";
const DEFAULT_REPO = process.env.GITHUB_DEFAULT_REPO ?? "";
const DEFAULT_TEAM = process.env.LINEAR_DEFAULT_TEAM;

const server = new McpServer({ name: "mcp-multi-source", version: "1.0.0" });

function denied(err: unknown): { content: Array<{ type: "text"; text: string }> } {
  if (err instanceof PermissionDeniedError) {
    return { content: [{ type: "text", text: `Permission denied: ${err.message}` }] };
  }
  throw err;
}

// ── GitHub ──────────────────────────────────────────────────────────────────

server.tool(
  "github_get_prs",
  "List open pull requests for a repository",
  {
    owner: z.string().optional().describe("GitHub org or user (defaults to GITHUB_DEFAULT_OWNER)"),
    repo: z.string().optional().describe("Repository name (defaults to GITHUB_DEFAULT_REPO)"),
    label: z.string().optional().describe("Filter by label name"),
    branch: z.string().optional().describe("Filter by head branch name"),
  },
  async ({ owner, repo, label, branch }) => {
    try { checkPermission("github_get_prs", ["read:github"], ROLE); } catch (e) { return denied(e); }
    const result = await github.getPRs(owner ?? DEFAULT_OWNER, repo ?? DEFAULT_REPO, label, branch);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "github_get_issue",
  "Fetch a GitHub issue by number",
  {
    issue_number: z.number().int().positive().describe("Issue number"),
    owner: z.string().optional(),
    repo: z.string().optional(),
  },
  async ({ issue_number, owner, repo }) => {
    try { checkPermission("github_get_issue", ["read:github"], ROLE); } catch (e) { return denied(e); }
    const result = await github.getIssue(owner ?? DEFAULT_OWNER, repo ?? DEFAULT_REPO, issue_number);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "github_search_code",
  "Search code in a GitHub repository by keyword",
  {
    query: z.string().describe("Search keyword"),
    owner: z.string().optional(),
    repo: z.string().optional(),
  },
  async ({ query, owner, repo }) => {
    try { checkPermission("github_search_code", ["read:github"], ROLE); } catch (e) { return denied(e); }
    const result = await github.searchCode(owner ?? DEFAULT_OWNER, repo ?? DEFAULT_REPO, query);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Notion ───────────────────────────────────────────────────────────────────

server.tool(
  "notion_search_pages",
  "Full-text search across a Notion workspace",
  { query: z.string().describe("Search query") },
  async ({ query }) => {
    try { checkPermission("notion_search_pages", ["read:notion"], ROLE); } catch (e) { return denied(e); }
    const result = await notion.searchPages(query);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "notion_get_page",
  "Fetch a Notion page by its page ID (UUID format)",
  { page_id: z.string().describe("Notion page ID") },
  async ({ page_id }) => {
    try { checkPermission("notion_get_page", ["read:notion"], ROLE); } catch (e) { return denied(e); }
    const result = await notion.getPage(page_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "notion_get_database",
  "Query a Notion database with optional filters",
  {
    database_id: z.string().describe("Notion database ID"),
    filter: z.record(z.unknown()).optional().describe("Notion filter object (see Notion API docs)"),
  },
  async ({ database_id, filter }) => {
    try { checkPermission("notion_get_database", ["read:notion"], ROLE); } catch (e) { return denied(e); }
    const result = await notion.getDatabase(database_id, filter);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Linear ───────────────────────────────────────────────────────────────────

server.tool(
  "linear_get_issues",
  "List Linear issues filtered by team and/or status",
  {
    team_key: z.string().optional().describe("Linear team key (e.g. ENG)"),
    status: z.string().optional().describe("Issue status name (e.g. 'In Progress', 'Todo')"),
  },
  async ({ team_key, status }) => {
    try { checkPermission("linear_get_issues", ["read:linear"], ROLE); } catch (e) { return denied(e); }
    const result = await linear.getIssues(team_key, status);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "linear_get_issue",
  "Fetch a single Linear issue by its ID",
  { issue_id: z.string().describe("Linear issue ID") },
  async ({ issue_id }) => {
    try { checkPermission("linear_get_issue", ["read:linear"], ROLE); } catch (e) { return denied(e); }
    const result = await linear.getIssue(issue_id);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

server.tool(
  "linear_create_issue",
  "Create a new Linear issue (requires write:linear permission)",
  {
    title: z.string().describe("Issue title"),
    team_id: z.string().describe("Linear team ID"),
    description: z.string().optional().describe("Issue description (markdown)"),
  },
  async ({ title, team_id, description }) => {
    try { checkPermission("linear_create_issue", ["write:linear"], ROLE); } catch (e) { return denied(e); }
    const result = await linear.createIssue(title, team_id, description);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Composite ────────────────────────────────────────────────────────────────

server.tool(
  "project_status_rollup",
  "Get a unified status report across GitHub PRs, Notion docs, and Linear tickets for a project keyword",
  {
    project: z.string().describe("Project name or keyword to search across all three sources"),
    owner: z.string().optional().describe("GitHub owner (defaults to GITHUB_DEFAULT_OWNER)"),
    repo: z.string().optional().describe("GitHub repo (defaults to GITHUB_DEFAULT_REPO)"),
    linear_team: z.string().optional().describe("Linear team key (defaults to LINEAR_DEFAULT_TEAM)"),
  },
  async ({ project, owner, repo, linear_team }) => {
    try {
      checkPermission("project_status_rollup", ["read:github", "read:notion", "read:linear"], ROLE);
    } catch (e) {
      return denied(e);
    }
    const result = await projectStatusRollup(
      project,
      owner ?? DEFAULT_OWNER,
      repo ?? DEFAULT_REPO,
      linear_team ?? DEFAULT_TEAM
    );
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  }
);

// ── Start ─────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(`mcp-multi-source running (role: ${ROLE})`);
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
```

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: `dist/index.js` (and all `dist/*.js` files) produced with zero TypeScript errors.

- [ ] **Step 3: Smoke-test the server starts**

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}' | node dist/index.js
```

Expected: JSON response listing all 10 tools. The server starts, responds, then exits (stdio closes).

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: All tests pass. Zero failures.

- [ ] **Step 5: Commit**

```bash
git add src/index.ts
git commit -m "feat: wire MCP server with all 10 tools and stdio transport"
```

---

## Task 9: README

**Files:**
- Create: `projects/mcp-multi-source/README.md`

**Interfaces:**
- Consumes: nothing from code; documents the system end-to-end
- Produces: the portfolio artifact — the document that tells the story

- [ ] **Step 1: Write `README.md`**

````markdown
# MCP Multi-Source Server

A [Model Context Protocol](https://modelcontextprotocol.io) server that connects Claude to **GitHub**, **Notion**, and **Linear** simultaneously. Ask Claude a single question and it synthesises an answer from all three sources.

## What it does

**Primary use case — project status rollup:**
> "What's the state of the `auth-refactor` feature?"

Claude calls `project_status_rollup("auth-refactor")` and the server:
1. Fetches open PRs from GitHub filtered by the keyword
2. Searches Notion for matching pages (design docs, specs, notes)
3. Queries Linear for linked issues

All three requests fire in parallel. The response is a merged JSON object. If one source is unavailable, the other two still return — the response is flagged `_partial: true` with a `_missing` list.

## Why these three sources

| Source | Role | Why it matters |
|--------|------|----------------|
| GitHub | Structured code/project data | Open PRs, issues, code search |
| Notion | Unstructured knowledge | Design docs, meeting notes, specs |
| Linear | Action-capable ticketing | Issue state, create new tickets |

This triad covers the three categories that appear in every enterprise AI deployment: a structured data source, an unstructured knowledge store, and an action-capable system. The server demonstrates how to wire all three behind a single interface.

## Architecture

```
Claude Desktop / Claude CLI
        │
        │  MCP (stdio)
        ▼
┌─────────────────────────────┐
│     mcp-multi-source        │
│                             │
│  ┌─────────────────────┐   │
│  │   Access Control    │   │
│  │  (roles.json + env) │   │
│  └──────────┬──────────┘   │
│             │               │
│    Promise.allSettled()     │
│    ┌────────┼────────┐      │
│    ▼        ▼        ▼      │
│  GitHub  Notion   Linear    │
│  REST    REST     GraphQL   │
└─────────────────────────────┘
```

## Authentication

Each source uses a long-lived API token. Set them in `.env` (copied from `.env.example`):

| Variable | How to obtain | Minimum required scope |
|----------|--------------|----------------------|
| `GITHUB_TOKEN` | [github.com/settings/tokens](https://github.com/settings/tokens) → Fine-grained PAT | Contents: read, Pull Requests: read, Issues: read |
| `NOTION_TOKEN` | [notion.so/my-integrations](https://www.notion.so/my-integrations) → New integration | Read content; share pages with the integration |
| `LINEAR_API_KEY` | [linear.app/settings/api](https://linear.app/settings/api) → Personal API keys | Read access (write only needed for `linear_create_issue`) |

Tokens are read from environment variables at startup. **Never commit `.env`** — only `.env.example` (with placeholder values) ships in the repo.

## Access control

The server role is set via `MCP_ROLE` in `.env`. Each tool has a required permission; if the role doesn't have it, the server returns a `PermissionDenied` error without making any network request.

**`config/roles.json`:**
```json
{
  "readonly":  ["read:github", "read:notion", "read:linear"],
  "developer": ["read:github", "read:notion", "read:linear", "write:linear"],
  "admin":     ["read:github", "read:notion", "read:linear", "write:linear"]
}
```

To add a new role: add an entry to `roles.json`. To deploy a read-only instance: set `MCP_ROLE=readonly`. To allow ticket creation: set `MCP_ROLE=developer`.

## What happens when a source is unavailable

Each connector has a 5-second timeout and handles failures independently. The server never crashes because one source is slow or down.

| Scenario | Response |
|----------|----------|
| GitHub rate limited | `{ degraded: true, reason: "rate_limited", retry_after: N }` |
| Notion timeout | `{ degraded: true, reason: "timeout" }` |
| Linear GraphQL error | `{ degraded: true, reason: "graphql_error", message: "..." }` |
| Any source unreachable | `{ degraded: true, reason: "unavailable" }` |

For `project_status_rollup`, partial results are valid:
```json
{
  "github": { "data": { "prs": [...] } },
  "notion": { "degraded": true, "reason": "timeout" },
  "linear": { "data": { "issues": [...] } },
  "_partial": true,
  "_missing": ["notion"]
}
```

## Running locally

```bash
# 1. Install dependencies
npm install

# 2. Configure environment
cp .env.example .env
# Fill in your tokens in .env

# 3. Build
npm run build

# 4. Start
npm start
```

The server communicates over stdio — it's intended to be launched by a MCP host (Claude Desktop, Claude CLI), not run as a standalone HTTP server.

## Running tests

```bash
npm test
```

Tests mock all HTTP calls using `vi.stubGlobal("fetch", ...)` — no real API credentials needed to run the test suite.

## Connecting to Claude Desktop

Add this to your `claude_desktop_config.json` (usually at `~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "multi-source": {
      "command": "node",
      "args": ["/absolute/path/to/projects/mcp-multi-source/dist/index.js"],
      "env": {
        "GITHUB_TOKEN": "ghp_...",
        "GITHUB_DEFAULT_OWNER": "your-org",
        "GITHUB_DEFAULT_REPO": "your-repo",
        "NOTION_TOKEN": "secret_...",
        "LINEAR_API_KEY": "lin_api_...",
        "LINEAR_DEFAULT_TEAM": "ENG",
        "MCP_ROLE": "readonly"
      }
    }
  }
}
```

Restart Claude Desktop after saving. The 10 tools will appear in Claude's tool list.
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add full README with architecture, auth, access control, and degradation guide"
```

---

## Self-Review Checklist

- [x] **Spec section 1 (Purpose/use case):** Covered by Task 9 README + composite tool in Task 8
- [x] **Spec section 5 (all 10 tools):** All 10 tools registered in Task 8 index.ts
- [x] **Spec section 6 (access control):** Task 3 + enforced in every tool handler in Task 8
- [x] **Spec section 7 (error handling table):** All 6 failure scenarios handled in Tasks 4–6
- [x] **Spec section 7 (_partial/_missing):** Task 7 status-rollup
- [x] **Spec section 8 (.env.example):** Task 1
- [x] **Spec section 9 (README sections 1–8):** Task 9
- [x] **No placeholders:** Every step has complete code
- [x] **Type consistency:** `SourceResult<T>`, `DegradedResult`, `RollupResult` defined in Task 2 and used consistently in Tasks 4–7
- [x] **Function names consistent:** `getPRs` (Tasks 4, 7, 8), `searchPages` (Tasks 5, 7, 8), `getIssues` (Tasks 6, 7, 8)
