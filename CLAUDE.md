# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Structure

All application code lives in `checkvist-app/`. The `Plan/` directory contains planning documents. Run all commands from inside `checkvist-app/`.

## Project Overview

**Checkvist Web App** is a responsive React PWA that integrates with the Checkvist REST API. It provides a task management interface optimized for both desktop and mobile browsers, featuring:

- Email + OpenAPI key authentication with token auto-refresh
- Task lists grouped by due date (Overdue, Today, Tomorrow, This Week, Later, No Due Date)
- Hierarchical task tree with inline expansion
- Quick date picker, priority setter, and context menu
- Task detail view with Markdown support and sub-task management
- Installable PWA for Android/iOS

This is **Phase 1 implementation** with Phase 2 features stubbed (notes, tags, drag-and-drop, recurring tasks, search, etc.).

## Commands

All run from `checkvist-app/`:

```bash
pnpm install
pnpm dev        # Dev server at http://localhost:5173
pnpm build      # TypeScript check + Vite bundle → dist/
pnpm preview    # Preview production build locally
pnpm lint       # ESLint (TypeScript strict mode)
```

## Architecture

### Source Layout

```
checkvist-app/src/
  api/              # Axios HTTP client, endpoints, types (CheckvistTask, CheckvistChecklist)
  auth/             # Zustand auth store, JWT token persistence, LoginScreen, AuthGuard
  features/
    checklists/     # Checklist switcher, active checklist state, hooks
    tasks/
      list/         # Task list view, virtualization, grouping by date
      detail/       # Task detail panel/page, markdown renderer, sub-task tree
      shared/       # Reusable pickers (date, priority), context menu, create-task input
  components/       # Generic UI primitives (BottomSheet, Toast, Spinner, TaskSkeleton)
  lib/              # Utilities: task tree building, date sorting/grouping, date formatting
  app/              # Router, layout (desktop/mobile), providers (React Query, Zustand)
```

### State Management

Two-layer state:
- **Server state** (TanStack Query): Checkvist API data, automatic caching/invalidation
  - Query keys: `['tasks', checklistId]`, `['task', checklistId, taskId]`, `['checklists']`
  - Stale time: 2 minutes for task lists, 30 seconds for single tasks
- **UI state** (Zustand): Authentication, active checklist, expanded/collapsed task rows
  - `useAuth` store: token, user, login/logout, init from localStorage
  - Active checklist persisted to localStorage

### Task Tree Model

The **flat-by-date with hierarchy** approach allows every task to appear at the top level in its date bucket while supporting nested expansion:

1. `buildTaskTree(flatTasks)` in `src/lib/taskTree.ts` — constructs parent→children tree, filters to open tasks (`status === 0`), returns `{ allNodes, roots, getById }` for O(1) lookup
2. `groupTasksByDate(allNodes)` in `src/lib/dateSort.ts` — buckets into 6 date groups sorted ascending by due date; a child with its own due date appears both at top level AND nested under parent (intentional duplication)
3. `VirtualTaskList` → `TaskGroup` → `TaskRow`/`TaskTree` — renders groups with `@tanstack/react-virtual` (only visible rows rendered); expand/collapse state in Zustand

### API Integration

- **Axios client** (`src/api/client.ts`): Token injected as query param on every request; 401 triggers token refresh with queue-and-retry (multiple concurrent requests wait for single refresh, then all retry)
- **Typed endpoints** (`src/api/endpoints.ts`): Login, fetch/create/update/close tasks, fetch checklists
- **Types** (`src/api/types.ts`): `CheckvistTask`, `CheckvistChecklist`, `CreateTaskPayload`, `UpdateTaskPayload`

### Routing & Layout

- React Router v7; dynamic mobile/desktop layout detection
- **Desktop**: Two-pane split (task list + detail slide-in)
- **Mobile**: Full-screen task list with task detail overlaying on top
- Routes: `/login`, `/:checklistId/tasks/:taskId`

### Authentication Flow

1. Login calls `POST /auth/login.json` → JWT token stored in localStorage via `tokenStore.ts`
2. `AuthInitializer` restores token from storage on mount
3. Axios interceptor detects 401 → calls `POST /auth/refresh_token.json` → queued requests retry
4. Logout clears localStorage and redirects to `/login`

### Styling

- **Tailwind CSS v4** with `@tailwindcss/vite` plugin; all styles via JSX classes
- `lucide-react` for icons
- `react-hook-form` + Zod for type-safe forms (LoginScreen, inline task editing)

## Key Data Flow

```
useTasksQuery(checklistId)
  → Axios client → Checkvist API
  → TanStack Query cache
  → buildTaskTree() → groupTasksByDate()
  → VirtualTaskList (virtualized rendering)
  → TaskRow mutations: useCreateTask / useUpdateTask / useCloseTask
    → invalidate ['tasks', checklistId] cache on success
```

## Build Config

- TypeScript 6.0 strict mode, ES2023 target, path alias `@/*` → `src/*`
- Vite 8 with `@vitejs/plugin-react`, `@tailwindcss/vite`, `vite-plugin-pwa`
- PWA: Workbox service worker, theme color `#E8632A`, standalone mode
- Icons needed before deploy: `public/icons/icon-192.png` and `public/icons/icon-512.png`

## Phase 2 Stubs (not yet implemented)

Notes/comments, tag filtering, drag-and-drop reparenting, recurring tasks, multi-checklist management, bulk import, sharing/collaborators, search (`/` shortcut reserved).
