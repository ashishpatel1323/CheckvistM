import { apiClient } from './client'
import type {
  CheckvistChecklist,
  CheckvistTask,
  CreateTaskPayload,
  UpdateTaskPayload,
} from './types'
import { enrichTask, enrichTasks } from '@/lib/taskEnrichment'

// Auth
export async function login(username: string, remoteKey: string): Promise<{ token: string }> {
  const params = new URLSearchParams()
  params.append('username', username)
  params.append('remote_key', remoteKey)
  const response = await apiClient.post<{ token: string }>(
    '/auth/login.json?version=2',
    params,
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  )
  return response.data
}

// Checklists
export async function fetchChecklists(): Promise<CheckvistChecklist[]> {
  const response = await apiClient.get<CheckvistChecklist[]>('/checklists.json')
  return response.data
}

// Tasks
export async function fetchTasks(checklistId: number): Promise<CheckvistTask[]> {
  const response = await apiClient.get<CheckvistTask[]>(
    `/checklists/${checklistId}/tasks.json`
  )
  return enrichTasks(response.data)
}

export async function fetchTask(checklistId: number, taskId: number): Promise<CheckvistTask> {
  const response = await apiClient.get<CheckvistTask>(
    `/checklists/${checklistId}/tasks/${taskId}.json`
  )
  return enrichTask(response.data)
}

export async function createTask(
  checklistId: number,
  payload: CreateTaskPayload
): Promise<CheckvistTask> {
  const response = await apiClient.post<CheckvistTask>(
    `/checklists/${checklistId}/tasks.json`,
    { task: payload }
  )
  return enrichTask(response.data)
}

export async function updateTask(
  checklistId: number,
  taskId: number,
  payload: UpdateTaskPayload
): Promise<CheckvistTask> {
  const response = await apiClient.put<CheckvistTask>(
    `/checklists/${checklistId}/tasks/${taskId}.json`,
    { task: payload }
  )
  return enrichTask(response.data)
}

export async function closeTask(
  checklistId: number,
  taskId: number
): Promise<CheckvistTask> {
  const response = await apiClient.post<CheckvistTask>(
    `/checklists/${checklistId}/tasks/${taskId}/close`
  )
  return enrichTask(response.data)
}

export async function deleteTask(
  checklistId: number,
  taskId: number
): Promise<void> {
  await apiClient.delete(`/checklists/${checklistId}/tasks/${taskId}.json`)
}
