# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Checkvist Web App** is a responsive React PWA that integrates with the [Checkvist REST API](https://checkvist.com/auth/api). It provides a task management interface optimized for both desktop and mobile browsers, featuring:

- Email + OpenAPI key authentication with token auto-refresh
- Task lists grouped by due date (Overdue, Today, Tomorrow, This Week, Later, No Due Date)
- Hierarchical task tree with inline expansion
- Quick date picker, priority setter, and context menu
- Task detail vi shortcut on the mindmap view is not working. ew with Markdown support and sub-task management
- Installable PWA for Android/iOS

This is **Phase 1 implementation** with Phase 2 features stubbed (notes, tags, drag-and-drop, recurring tasks, search, etc.).

## Quick Start

### Prerequisites
- Node.js 18+
- pnpm (`npm install -g pnpm`)

### Development
```bash
pnpm install
pnpm dev
# Open http://localhost:5173
```

### Production Build
```bash
pnpm build    # TypeScript check + Vite bundle
pnpm preview  # Preview production build locally
```

### Code Quality
```bash
pnpm lint     # ESLint (TypeScript strict mode enabled)
```

## Architecture

### High-Level Structure

```
src/
  api/              # Axios HTTP client, API endpoints, types (CheckvistTask, CheckvistChecklist)
  auth/             # Zustand auth store, JWT token persistence, LoginScreen, AuthGuard
  features/         # Feature-scoped components organized by domain
    checklists/     # Checklist switcher, active checklist state, hooks
    tasks/
      list/         # Task list view, virtualization, grouping by date
      detail/       # Task detail panel/page, markdown renderer, sub-task tree
      shared/       # Reusable pickers (date, priority), context menu, create-task input
  components/       # Generic UI primitives (BottomSheet, Toast, Spinner, TaskSkeleton)
  lib/              # Utilities: task tree building, date sorting/grouping, date formatting
  app/              # Router, layout (desktop/mobile), providers (React Query, Zustand)
```

### Key Architectural Patterns

#### State Management

**Two-layer state**:
- **Server state** (TanStack Query): Checkvist API data, automatic caching/invalidation
  - Query keys: `['tasks', checklistId]`, `['task', checklistId, taskId]`, `['checklists']`
  - Stale time: 2 minutes for task lists, 30 seconds for single tasks
- **UI state** (Zustand): Authentication, active checklist, expanded/collapsed task rows
  - Zustand store: `useAuth` (token, user, login/logout, init from localStorage)
  - Active checklist persisted to localStorage

#### Task Tree Model

The **flat-by-date with hierarchy** approach allows every task to appear at the top level in its date bucket while supporting nested expansion:

1. `buildTaskTree(flatTasks: CheckvistTask[]): TaskTreeResult` constructs a parent→children tree
   - Filters to open tasks only (`status === 0`)
   - Returns `{ allNodes, roots, getById }` for O(1) lookup
   - Children sorted by Checkvist `position` field (manual order preservation)

2. `groupTasksByDate(allNodes)` buckets tasks into 6 date groups (Overdue, Today, Tomorrow, This Week, Later, No Due Date)
   - Sorted ascending by due date within each group
   - A child task with its own due date appears both at top level AND nested under parent (intentional duplication)

3. **UI rendering**: VirtualTaskList iterates `groups` → TaskGroup → TaskRow/TaskTree(children)
   - Virtualization via `@tanstack/react-virtual` for performance (only visible rows rendered)
   - Expanded/collapsed state persisted in a Zustand store

#### API Integration

- **Axios client** (`src/api/client.ts`):
  - Token injected as query param on every request (except login/refresh)
  - 401 response triggers token refresh with queue-and-retry pattern (multiple concurrent requests wait for single refresh)
  - Failed refresh redirects to `/login`
- **Typed endpoints** (`src/api/endpoints.ts`): Login, fetch/create/update/close tasks, fetch checklists
- **Types** (`src/api/types.ts`): `CheckvistTask`, `CheckvistChecklist`, `CreateTaskPayload`, `UpdateTaskPayload`

#### Routing & Layout

- React Router v7 with dynamic mobile/desktop layout detection
- **Desktop**: Two-pane split (task list + detail slide-in)
- **Mobile**: Full-screen task list with task detail overlaying on top
- Routes: `/login`, `/:checklistId/tasks/:taskId` (detail view)

#### Form & Validation

- `react-hook-form` + Zod for type-safe forms
- Used in LoginScreen and inline task editing (contentEditable + blur-to-save)

#### Styling

- **Tailwind CSS v4** with `@tailwindcss/vite` plugin
- No custom CSS needed; all utilities in JSX classes
- `lucide-react` for 24px icons (CheckSquare, Plus, LogOut, ArrowLeft, X, Calendar, Tag, ChevronRight, etc.)

### Component Patterns

**Hook-based data fetching**:
- `useTasksQuery(checklistId)`: Fetch task list, enabled only when authenticated + checklist selected
- `useCreateTask(checklistId)`: Mutation with automatic cache invalidation on success
- `useUpdateTask(checklistId)`: Mutation for title/due date/priority/status updates
- `useCloseTask(checklistId)`: Mutation to mark task done (status=1)
- `useChecklists()`: Fetch all checklists
- `useActiveChecklist()`: Get/set active checklist from Zustand store

**Interactive Components**:
- `TaskDetailView`: Shows single task with editable title (contentEditable), due date/priority pickers, sub-task tree, markdown body
- `CreateTaskInput`: Text input with keyboard handler (Ctrl+Enter to submit)
- `QuickDatePicker`: 3x3 tile grid (Today, Tomorrow, +1 Week, Saturday, Custom, Clear, Morning, Afternoon, Night) with mobile bottom-sheet vs desktop positioned popup
- `PriorityPicker`: Grid of priority levels 1–10, color-coded badge
- `ContextMenu`: Right-click/long-press to set priority or due date
- `TaskTree`: Inline sub-task tree with expand/collapse chevron, recursive rendering

### Authentication Flow

1. User lands on `/login`, enters email + remote key
2. `useAuth.login()` calls `POST /auth/login.json` → receives JWT token
3. Token stored in localStorage via `tokenStore.ts` (getter/setter/clear)
4. **App initialization**: `AuthInitializer` component calls `useAuth.initFromStorage()` on mount to restore token
5. **Token refresh**: Axios response interceptor detects 401, calls `POST /auth/refresh_token.json` with current token
6. Multiple concurrent requests during refresh are queued; all retry after refresh completes
7. Logout clears localStorage and redirects to `/login`

## TypeScript & Build Config

- **TypeScript 6.0** (strict mode): All strict checks enabled (`strict: true`)
- **Target**: ES2023, modules: ESNext
- **Path aliases**: `@/*` → `src/*`
- **ESLint**: Recommended + React Hooks + React Refresh checks
- **Vite plugins**:
  - `@vitejs/plugin-react`: JSX transform + hot module reload
  - `@tailwindcss/vite`: Tailwind CSS compilation
  - `vite-plugin-pwa`: Workbox-based service worker + install prompt

## Common Development Tasks

### Adding a New Feature

1. Create feature folder in `src/features/<domain>/`
2. Use hooks from `useTasksQuery`, `useChecklists`, etc. for data
3. Use Zustand `useAuth` for auth state
4. Add route to `src/app/router.tsx` if needed
5. Leverage existing components (BottomSheet, Toast, Spinner) for consistency

### Modifying Task Display

- Task grouping logic: `src/lib/dateSort.ts` (`classifyTask`, `groupTasksByDate`)
- Tree building: `src/lib/taskTree.ts` (`buildTaskTree`)
- Rendering: `src/features/tasks/list/TaskListView.tsx` → `VirtualTaskList` → `TaskGroup` → `TaskRow`/`TaskTree`

### Updating Due Date or Priority UI

- Pickers located in `src/features/tasks/shared/` (QuickDatePicker, PriorityPicker)
- Both handle mobile (bottom-sheet) vs desktop (positioned popup) layouts
- Date utilities: `src/lib/dateUtils.ts` (parsing, humanizing, color classes)

### Keyboard Shortcuts

Currently hardcoded: `N` focuses new-task input, `/` is reserved for Phase 2 search.
Add new shortcuts in Layout or AppRouter with global event listeners.

### Testing Task Mutations

1. Open browser DevTools Network tab
2. Perform action (create/update/close task)
3. Verify request method, payload, response
4. Check TanStack Query cache updates (React Query DevTools extension helpful)

## Deployment & PWA

- **Production build**: `pnpm build` outputs to `dist/`
- **PWA manifest**: Configured in `vite.config.ts` with theme color (#E8632A, orange), standalone mode
- **Icons**: Before deploying, add:
  - `public/icons/icon-192.png` (192×192 px)
  - `public/icons/icon-512.png` (512×512 px)
  - Referenced in manifest for "Add to Home Screen" on Android/iOS
- **Service worker**: Workbox auto-generated, caches JS/CSS/HTML/images, auto-updates on deploy

## Dependencies Overview

| Layer | Key Libraries |
|-------|---|
| Framework | React 19, React Router 7, Vite 8 |
| State | TanStack Query 5, Zustand 5 |
| HTTP | Axios 1.16, Zod 4.4 |
| Forms | react-hook-form 7.76 |
| Styling | Tailwind CSS 4, lucide-react 1.16 |
| Utilities | date-fns 4.1, marked 18, DOMPurify 3.4 |
| Virtualization | @tanstack/react-virtual 3.13 |
| PWA | vite-plugin-pwa 1.3 |
| Dev | TypeScript 6.0, ESLint 10, @vitejs/plugin-react 6 |

## Known Limitations & Phase 2 Stubs

- No notes/comments on tasks (UI prepared, API integration pending)
- No tags filtering (tags displayed but not filterable)
- No drag-and-drop reparenting
- No recurring task support
- No multi-checklist create/delete
- No bulk import
- No sharing/collaborators
- No search (reserved shortcut: `/`)
