import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { AuthGuard } from '@/auth/AuthGuard'
import { LoginScreen } from '@/auth/LoginScreen'
import { Layout } from './Layout'
import { TaskDetailView } from '@/features/tasks/detail/TaskDetailView'

function DetailOutlet() {
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 768
  return <TaskDetailView isMobile={isMobile} />
}

const router = createBrowserRouter([
  {
    path: '/login',
    element: <LoginScreen />,
  },
  {
    path: '/',
    element: (
      <AuthGuard>
        <Layout />
      </AuthGuard>
    ),
    children: [
      {
        index: true,
        element: null,
      },
      {
        path: ':checklistId/tasks/:taskId',
        element: <DetailOutlet />,
      },
    ],
  },
  {
    path: '*',
    element: <Navigate to="/" replace />,
  },
])

export function AppRouter() {
  return <RouterProvider router={router} />
}
