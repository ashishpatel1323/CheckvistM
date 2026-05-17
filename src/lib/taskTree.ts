import type { CheckvistTask } from '@/api/types'

export interface TaskNode extends CheckvistTask {
  children: TaskNode[]
}

export interface TaskTreeResult {
  /** Every open task, in source (API response) order. */
  allNodes: TaskNode[]
  /** Tasks without a visible parent in the open-task set. */
  roots: TaskNode[]
  /** O(1) lookup by id. */
  getById: (id: number) => TaskNode | undefined
}

/**
 * Builds a parent → children tree from the flat tasks array.
 *
 * The returned shape supports a flat-by-due-date list view with hierarchy
 * layered on top: callers iterate `allNodes` to render every task as a
 * top-level row in its own date bucket, and use `node.children` for inline
 * expansion. A task can therefore appear both at the top level and nested
 * under an expanded ancestor — that duplication is intentional.
 *
 * Only open tasks (`status === 0`) are included. Children within each parent
 * are sorted by Checkvist's `position` field to preserve manual ordering.
 */
export function buildTaskTree(flat: CheckvistTask[]): TaskTreeResult {
  const openTasks = flat.filter((t) => t.status === 0)
  const nodeMap = new Map<number, TaskNode>()

  for (const task of openTasks) {
    nodeMap.set(task.id, { ...task, children: [] })
  }

  const roots: TaskNode[] = []
  for (const task of openTasks) {
    const node = nodeMap.get(task.id)!
    if (task.parent_id === null || task.parent_id === undefined || !nodeMap.has(task.parent_id)) {
      roots.push(node)
    } else {
      nodeMap.get(task.parent_id)!.children.push(node)
    }
  }

  function sortChildren(nodes: TaskNode[]) {
    for (const node of nodes) {
      node.children.sort((a, b) => a.position - b.position)
      sortChildren(node.children)
    }
  }
  sortChildren(roots)
  roots.sort((a, b) => a.position - b.position)

  return {
    allNodes: Array.from(nodeMap.values()),
    roots,
    getById: (id: number) => nodeMap.get(id),
  }
}

/** Count of descendants in the full subtree (all depths). */
export function countDescendants(node: TaskNode): number {
  let n = 0
  for (const child of node.children) {
    n += 1 + countDescendants(child)
  }
  return n
}

/** DFS flatten — preserves parent/child order. Kept for tests and ad-hoc consumers. */
export function flattenTree(nodes: TaskNode[]): TaskNode[] {
  const result: TaskNode[] = []
  function traverse(list: TaskNode[]) {
    for (const node of list) {
      result.push(node)
      traverse(node.children)
    }
  }
  traverse(nodes)
  return result
}
