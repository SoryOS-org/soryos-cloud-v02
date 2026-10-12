# SoryOS-Code

**Describe an app. Watch an agent build it — live.**

![VERSION](https://img.shields.io/badge/VERSION-3.0-F38020?style=for-the-badge&labelColor=333333)
[![NODE](https://img.shields.io/badge/NODE-20+-339933?style=for-the-badge&logo=node.js&logoColor=white&labelColor=333333)](https://nodejs.org/)
[![NEXT.JS](https://img.shields.io/badge/NEXT.JS-16-000000?style=for-the-badge&logo=next.js&logoColor=white&labelColor=333333)](https://nextjs.org/)
[![REACT](https://img.shields.io/badge/REACT-19-61DAFB?style=for-the-badge&logo=react&logoColor=white&labelColor=333333)](https://react.dev/)

---

SoryOS-Code is an AI coding workbench powered by an extensible **Sandbox Provider Architecture**. You describe what you want in natural language; an autonomous AI agent plans, writes files, runs commands, and verifies the result inside an isolated Sandbox Provider — while you follow every step in a Cursor-style interface.

No code generation in chat bubbles. Real files. Real terminal. Real preview.

## Multi-Provider Sandbox Architecture

SoryOS-Code abstracts code execution behind a unified `SandboxProvider` contract. You can seamlessly switch providers from a single interface:

- ☁️ **E2B** (`e2b`) — Remote cloud sandbox for complete development, terminal, processes, and builds.
- ☁️ **Vercel Sandbox** (`vercel`) — Cloud execution, builds, files, and commands.
- ☁️ **Google Cloud Run** (`google-cloud-run`) — Cloud execution & long-running build jobs (`cargo build`, `cmake`, `gcc`, ISO generation, cross-compilation).
- ☁️ **GitHub Codespaces** (`github-codespaces`) — Cloud development environment workspace.
- 💻 **Local** (`local`) — Local machine execution directly on the user's system.

## Stack

| Layer   | Tech                                                |
| ------- | --------------------------------------------------- |
| Web     | Next.js 16, React 19, Tailwind 4, shadcn/ui, Monaco |
| API     | FastAPI, SQLAlchemy + SQLite, SSE streaming         |
| Agent   | LangGraph, DeepSeek (`langchain-deepseek`)          |
| Runtime | E2B code interpreter sandboxes                      |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web          Landing + chat UI + preview panel        │
└────────────────────────────┬────────────────────────────────┘
                             │ REST + SSE
┌────────────────────────────▼────────────────────────────────┐
│  apps/api          FastAPI routes + agent runtime           │
│    ├── LangGraph ReAct agent (tools → E2BSandbox)         │
│    ├── SQLite (sessions, messages)                        │
│    └── SSE stream (text, tools, preview, files_changed)     │
└────────────────────────────┬────────────────────────────────┘
                             │
┌────────────────────────────▼────────────────────────────────┐
│  E2B Sandbox       /home/user/<project>                     │
│    Next.js dev server → preview URL (0.0.0.0:3000)        │
└─────────────────────────────────────────────────────────────┘
```

**Request flow**

1. User creates a session with an initial prompt → stored in SQLite.
2. `POST /api/sessions/:id/run` starts the agent via SSE.
3. Agent uses sandbox tools; UI streams text and tool events in real time.
4. On completion, assistant + tool rows are saved; reload restores full history.
5. Demo tab calls `GET /preview` to ensure the dev server is up.

## Quick start

**Prerequisites:** Node 20+, Python 3.9+, [pnpm](https://pnpm.io/), [E2B](https://e2b.dev/) and [DeepSeek](https://platform.deepseek.com/) API keys.

```bash
git clone <repo-url> soryos-code && cd soryos-code
make setup        # install deps + copy .env.example → .env
```

Add your keys to `.env`:

```env
DEEPSEEK_API_KEY=...
E2B_API_KEY=...
```

```bash
make dev          # web → :3000  |  api → :8000
```

Open [http://localhost:3000](http://localhost:3000), describe an app, and follow the agent in the workspace.

## Environment

| Variable              | Description                                           |
| --------------------- | ----------------------------------------------------- |
| `DEEPSEEK_API_KEY`    | DeepSeek API key                                      |
| `E2B_API_KEY`         | E2B sandbox API key                                   |
| `E2B_TEMPLATE`        | Sandbox template (default: `code-interpreter-v1`)     |
| `MODEL`               | LLM model (default: `deepseek-chat`)                  |
| `CORS_ORIGIN`         | Allowed web origin (default: `http://localhost:3000`) |
| `NEXT_PUBLIC_API_URL` | API base URL for the web app                          |

## API

| Method | Path                            | Purpose                                        |
| ------ | ------------------------------- | ---------------------------------------------- |
| `GET`  | `/api/sessions`                 | List sessions                                  |
| `POST` | `/api/sessions`                 | Create session (+ optional first message)      |
| `GET`  | `/api/sessions/:id`             | Session state + UI messages (with tool blocks) |
| `POST` | `/api/sessions/:id/run`         | Resume agent on last user message (SSE)        |
| `POST` | `/api/sessions/:id/messages`    | New user turn (SSE)                            |
| `POST` | `/api/sessions/:id/abort`       | Stop running agent                             |
| `GET`  | `/api/sessions/:id/files`       | Project file tree from sandbox                 |
| `GET`  | `/api/sessions/:id/files/:path` | Read file content                              |
| `GET`  | `/api/sessions/:id/preview`     | Ensure dev server; return preview URL          |
| `POST` | `/api/sessions/:id/terminal`    | Run shell command in sandbox                   |

SSE events: `status`, `text`, `tool_start`, `tool_end`, `preview`, `files_changed`, `done`, `error`.

## Project structure

```
soryos-code/
├── apps/
│   ├── web/                 Next.js frontend
│   │   ├── app/             Landing + /chat/[id]
│   │   ├── components/      Chat, preview, terminal, sidebar
│   │   └── lib/             API client, chat blocks, types
│   └── api/                 FastAPI backend
│       └── src/soryos-code/
│           ├── agent/       LangGraph graph, tools, prompts
│           ├── agent_runtime.py
│           ├── sandbox.py   E2B integration
│           ├── db.py        SQLite models
│           └── main.py      Routes
├── data/                    SQLite database (created at runtime)
├── .env.example
├── Makefile
└── package.json             pnpm + turbo monorepo
```

## Development

```bash
make dev          # web + api
make web          # frontend only
make api          # backend only
make lint         # eslint
make typecheck    # tsc
```

Agent self-check:

```bash
cd apps/api/src && PYTHONPATH=. ../venv/bin/python -m soryos-code.agent.self_check
```
