# Checkvist Web App

A responsive React PWA that sits on top of the [Checkvist REST API](https://checkvist.com/auth/api). Works on desktop browsers and Android/iOS mobile browsers.

## Setup

### Prerequisites

- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Install

```bash
pnpm install
```

### Development

```bash
pnpm dev
```

Open http://localhost:5173 in your browser.

### Production build

```bash
pnpm build
pnpm preview   # preview the production build locally
```

## Authentication

On first load you'll see a login screen. Enter:

- **Email** — your Checkvist account email
- **Remote key (OpenAPI key)** — found at checkvist.com/auth/profile under "Remote key"

The token is stored in localStorage and refreshed automatically (valid 1 day, refreshable for 90 days).

## PWA icons

Add two icon files before deploying:

- `public/icons/icon-192.png` — 192×192 px
- `public/icons/icon-512.png` — 512×512 px

These are referenced in the PWA manifest so "Add to Home Screen" produces a clean install on Android and iOS.

## Features (Phase 1)

- **Authentication** — email + OpenAPI key login, token auto-refresh, sign out
- **Checklist switcher** — switch between all your Checkvist checklists
- **Task list** — tasks grouped by due date (Overdue / Today / Tomorrow / This Week / Later / No Due Date), sorted ascending
- **Hierarchy (flat-by-date with opt-in expansion)** — every task appears at the top level in its own date bucket, sorted by due date. Tasks that have children show a `+`/`-` chevron; expanding reveals the full descendant subtree inline (ordered by Checkvist's `position`). A descendant with its own due date appears twice — once at the top in its bucket, once nested under an expanded ancestor — that duplication is intentional. Expanded/collapsed state persists across reloads.
- **Quick date picker** — tap any due-date pill to open a 3x3 tile picker (Today, Tomorrow, +1 Week, Saturday, Custom, Clear, Morning, Afternoon, Night)
- **Context menu** — right-click on desktop, long-press on mobile: set priority (1-10) or change due date
- **Task detail view** — `/:checklistId/tasks/:taskId` — editable title, Markdown body, full sub-task tree, add sub-tasks; desktop slide-in panel, mobile full-screen
- **Create task** — persistent input at top of list; FAB on mobile
- **PWA** — installable on Android/iOS home screens

## Keyboard shortcuts (desktop)

| Key | Action |
|-----|--------|
| `N` | Focus new-task input |
| `/` | Search (reserved for Phase 2) |

## Tech stack

| Concern | Library |
|---------|---------|
| Framework | React 18 + Vite |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| Server state | TanStack Query v5 |
| UI state | Zustand v5 |
| Routing | React Router v7 |
| HTTP | Axios |
| Dates | date-fns |
| Forms | react-hook-form + zod |
| Icons | lucide-react |
| Markdown | marked + DOMPurify |
| Virtualisation | @tanstack/react-virtual |
| PWA | vite-plugin-pwa |

## Project structure

```
src/
  api/             # axios client, typed endpoint wrappers, API types
  auth/            # login screen, token localStorage helpers, auth Zustand store
  features/
    checklists/    # checklist switcher, hooks
    tasks/
      list/        # task list view, task rows, virtualization, tree
      detail/      # task detail panel/page, sub-task tree, markdown renderer
      shared/      # context menu, quick date picker, priority picker, create-task
  components/      # generic UI (BottomSheet, Toast, Spinner, TaskSkeleton)
  lib/             # buildTaskTree, date sorting/grouping, date formatting
  app/             # router, providers, app shell layout
```

## Phase 2 stubs (not yet implemented)

The architecture is ready to add:

- Notes / comments on tasks
- Tags and tag-based filtering
- Reparenting tasks (drag-and-drop)
- Recurring tasks
- Multi-checklist views / create / delete checklists
- Bulk import
- Sharing / collaborators
- Search
- Customizable quick-date-picker tiles (long-press settings sheet)
