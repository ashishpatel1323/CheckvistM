import { useCallback, useRef } from 'react'
import type { Operation, NodeObj } from 'mind-elixir'
import { useCreateTask, useUpdateTask, useDeleteTask } from '@/features/tasks/list/useTasksQuery'
import { useToast } from '@/components/Toast'
import { parseTaskId, VIRTUAL_ROOT_ID } from '@/lib/mindElixirAdapter'

/**
 * Translates mind-elixir Operation events into Checkvist API mutations.
 * Returns a handler to wire into instance.bus.addListener('operation', ...).
 *
 * Pending op count is exposed so MindElixirView can debounce external refreshes
 * until local mutations settle, avoiding cursor/selection loss.
 */
export function useMindMapSync(checklistId: number) {
  const { mutateAsync: createTask } = useCreateTask(checklistId)
  const { mutateAsync: updateTask } = useUpdateTask(checklistId)
  const { mutateAsync: deleteTask } = useDeleteTask(checklistId)
  const toast = useToast()
  const pendingRef = useRef(0)

  const findParentId = useCallback((root: NodeObj | undefined, childId: string): number | null => {
    if (!root) return null
    function walk(node: NodeObj): NodeObj | null {
      if (!node.children) return null
      for (const c of node.children) {
        if (c.id === childId) return node
        const found = walk(c)
        if (found) return found
      }
      return null
    }
    const parent = walk(root)
    if (!parent) return null
    return parseTaskId(parent.id)
  }, [])

  const handle = useCallback(async (op: Operation, getRoot: () => NodeObj | undefined) => {
    pendingRef.current += 1
    try {
      switch (op.name) {
        case 'finishEdit': {
          const id = parseTaskId(op.obj.id)
          if (id == null) return
          await updateTask({ taskId: id, payload: { content: op.obj.topic } })
          return
        }
        case 'addChild': {
          const parentId = findParentId(getRoot(), op.obj.id)
          await createTask({
            content: op.obj.topic,
            ...(parentId != null ? { parent_id: parentId } : {}),
          })
          return
        }
        case 'insertSibling': {
          const parentId = findParentId(getRoot(), op.obj.id)
          await createTask({
            content: op.obj.topic,
            ...(parentId != null ? { parent_id: parentId } : {}),
          })
          return
        }
        case 'insertParent': {
          // Wraps a node under a new parent — Checkvist API has no atomic op.
          // Skip: warn user.
          toast.error('Insert-parent not supported yet')
          return
        }
        case 'removeNodes': {
          for (const n of op.objs) {
            const id = parseTaskId(n.id)
            if (id != null) await deleteTask(id)
          }
          return
        }
        case 'moveNodeIn': {
          // Reparent: dropped INTO new parent. Op has two shapes.
          const hasObjs = 'objs' in op
          const objs = hasObjs ? op.objs : [op.obj]
          const newParentId = hasObjs ? parseTaskId(op.toObj.id) : findParentId(getRoot(), op.obj.id)
          for (const n of objs) {
            const id = parseTaskId(n.id)
            if (id == null) continue
            await updateTask({
              taskId: id,
              payload: { parent_id: newParentId, position: 1 },
            })
          }
          return
        }
        case 'moveNodeAfter':
        case 'moveNodeBefore': {
          const objs = op.objs
          const newParentId = findParentId(getRoot(), op.toObj.id)
          for (const n of objs) {
            const id = parseTaskId(n.id)
            if (id == null) continue
            await updateTask({
              taskId: id,
              payload: { parent_id: newParentId },
            })
          }
          return
        }
        case 'moveDownNode':
        case 'moveUpNode': {
          // Position-only change within same parent — push position update.
          // mind-elixir reorders local nodeData; reflect new index as position.
          const id = parseTaskId(op.obj.id)
          if (id == null) return
          const parent = findParentByChildIdLocal(getRoot(), op.obj.id)
          if (!parent?.children) return
          const idx = parent.children.findIndex((c) => c.id === op.obj.id)
          if (idx < 0) return
          await updateTask({ taskId: id, payload: { position: idx + 1 } })
          return
        }
        case 'reshapeNode': {
          const id = parseTaskId(op.obj.id)
          if (id == null) return
          if (op.obj.topic !== op.origin?.topic) {
            await updateTask({ taskId: id, payload: { content: op.obj.topic } })
          }
          return
        }
        default:
          return
      }
    } catch (e) {
      toast.error('Mindmap sync failed')
      console.error('[mindmap sync]', op.name, e)
    } finally {
      pendingRef.current -= 1
    }
  }, [createTask, updateTask, deleteTask, toast, findParentId])

  return { handle, pendingRef }
}

function findParentByChildIdLocal(root: NodeObj | undefined, childId: string): NodeObj | null {
  if (!root || root.id === VIRTUAL_ROOT_ID && !root.children) return null
  function walk(node: NodeObj): NodeObj | null {
    if (!node.children) return null
    for (const c of node.children) {
      if (c.id === childId) return node
      const f = walk(c)
      if (f) return f
    }
    return null
  }
  return walk(root)
}
