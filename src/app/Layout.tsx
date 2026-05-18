import { Outlet, useParams } from 'react-router-dom'
import { CheckSquare, LogOut, CalendarDays, List, GitFork } from 'lucide-react'
import { useAuth } from '@/auth/useAuth'
import { ChecklistSwitcher } from '@/features/checklists/ChecklistSwitcher'
import { TaskListView } from '@/features/tasks/list/TaskListView'
import { ToastContainer } from '@/components/Toast'
import { useTaskView, type TaskView } from '@/features/tasks/list/useTaskView'

function useIsMobile() {
  // We check window width at render — for SSR-safe use, just default to false
  if (typeof window === 'undefined') return false
  return window.innerWidth < 768
}

const VIEW_TABS: { key: TaskView; icon: React.ReactNode; label: string }[] = [
  { key: 'date', icon: <CalendarDays className="w-3.5 h-3.5" />, label: 'By Date' },
  { key: 'list', icon: <List className="w-3.5 h-3.5" />, label: 'List' },
  { key: 'mindmap', icon: <GitFork className="w-3.5 h-3.5 rotate-180" />, label: 'Map' },
]

function AppHeader() {
  const { logout } = useAuth()
  const { view, setView } = useTaskView()

  return (
    <header className="bg-orange-500 text-white px-4 py-2 flex items-center gap-3 shrink-0 shadow-md">
      <div className="flex items-center gap-2 font-bold text-lg">
        <CheckSquare className="w-5 h-5" />
        <span className="hidden sm:inline">Checkvist</span>
      </div>

      {/* View switcher */}
      <div className="flex items-center gap-0.5 bg-white/20 rounded-lg p-0.5">
        {VIEW_TABS.map(({ key, icon, label }) => (
          <button
            key={key}
            onClick={() => setView(key)}
            className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium transition-colors ${
              view === key
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-white/80 hover:text-white hover:bg-white/10'
            }`}
            title={label}
          >
            {icon}
            <span className="hidden sm:inline">{label}</span>
          </button>
        ))}
      </div>

      <div className="flex-1" />
      <ChecklistSwitcher />
      <button
        onClick={logout}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg hover:bg-white/10 transition-colors text-sm"
        aria-label="Sign out"
      >
        <LogOut className="w-4 h-4" />
        <span className="hidden sm:inline">Sign out</span>
      </button>
    </header>
  )
}

function DesktopLayout() {
  const params = useParams()
  const hasDetail = !!(params.taskId)

  return (
    <div className="flex flex-col h-screen bg-gray-50">
      <AppHeader />
      <div className="flex flex-1 overflow-hidden">
        {/* Task list pane */}
        <div
          className={`flex flex-col overflow-hidden bg-white border-r border-gray-100 transition-all duration-200 ${
            hasDetail ? 'w-[60%]' : 'w-full'
          }`}
        >
          <TaskListView isMobile={false} />
        </div>

        {/* Detail pane */}
        {hasDetail && (
          <div className="w-[40%] flex flex-col overflow-hidden">
            <Outlet />
          </div>
        )}
      </div>
      <ToastContainer />
    </div>
  )
}

function MobileLayout() {
  const params = useParams()
  const hasDetail = !!(params.taskId)

  return (
    <div className="flex flex-col h-screen bg-white">
      <AppHeader />
      <div className="flex-1 overflow-hidden relative">
        {/* Task list always rendered underneath */}
        <div className={`absolute inset-0 ${hasDetail ? 'invisible' : 'visible'}`}>
          <TaskListView isMobile />
        </div>
        {/* Detail overlays on mobile */}
        {hasDetail && <Outlet />}
      </div>
      <ToastContainer />
    </div>
  )
}

export function Layout() {
  const isMobile = useIsMobile()

  if (isMobile) return <MobileLayout />
  return <DesktopLayout />
}
