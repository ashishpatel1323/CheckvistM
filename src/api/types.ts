export interface CheckvistTask {
  id: number
  content: string
  due: string | null // "YYYY/MM/DD" format
  priority: number // 1-10 (1=highest)
  status: number // 0=open, 1=done, 2=invalid
  parent_id: number | null
  position: number
  checklist_id: number
  created_at: string
  updated_at: string
  tags_as_text?: string
  notes_count?: number
  sub_tasks?: CheckvistTask[]
  duration?: {
    minutes: number
    formatted: string // e.g., "30m", "1h 30m"
  } | null
}

export interface CheckvistChecklist {
  id: number
  name: string
  task_count: number
  updated_at: string
}

export interface LoginResponse {
  token: string
}

export interface CreateTaskPayload {
  content: string
  parent_id?: number | null
  due_date?: string | null
  priority?: number
}

export interface UpdateTaskPayload {
  content?: string
  due_date?: string | null
  priority?: number
  status?: number
  parent_id?: number | null
  position?: number
}
