import type { CheckvistTask } from '@/api/types'

export interface TaskNode extends CheckvistTask {
  children: TaskNode[]
  /** Depth in the tree. L1 = direct child of the checklist (parent_id null). */
  level: number
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
    nodeMap.set(task.id, { ...task, children: [], level: 1 })
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

  function sortChildren(nodes: TaskNode[], depth: number) {
    for (const node of nodes) {
      node.level = depth
      node.children.sort((a, b) => a.position - b.position)
      sortChildren(node.children, depth + 1)
    }
  }
  sortChildren(roots, 1)
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

// ─── Hierarchy mode helpers ────────────────────────────────────────────────

export interface HierarchyGroup {
  /** Tasks that should appear at top-level (no ancestor in this group). */
  visibleRoots: TaskNode[]
  /**
   * For each visible root, the descendant tasks from the same date group
   * (flattened — all depths appear at the same indent level).
   */
  childMap: Map<number, TaskNode[]>
}

/**
 * Given a flat list of tasks that all belong to the same date group,
 * determine which ones are "visible roots" (no ancestor also in this group)
 * and which are "hidden children" (have an ancestor in this group).
 *
 * Returns:
 * - `visibleRoots`: tasks to show at top level
 * - `childMap`: for each root, the list of descendant tasks also in this group
 *   (all depths flattened to the same level)
 */
export function computeHierarchyGroup(
  tasks: TaskNode[],
  getById: (id: number) => TaskNode | undefined,
): HierarchyGroup {
  const taskIdsInGroup = new Set(tasks.map((t) => t.id))
  const visibleRoots: TaskNode[] = []
  const childMap = new Map<number, TaskNode[]>()

  for (const task of tasks) {
    let ancestorInGroup = false
    let currentParentId: number | null | undefined = task.parent_id

    // Walk up the parent chain to find the closest ancestor in this group
    while (currentParentId != null) {
      if (taskIdsInGroup.has(currentParentId)) {
        ancestorInGroup = true
        const children = childMap.get(currentParentId) || []
        children.push(task)
        childMap.set(currentParentId, children)
        break
      }
      const parentNode = getById(currentParentId)
      if (!parentNode) break
      currentParentId = parentNode.parent_id
    }

    if (!ancestorInGroup) {
      visibleRoots.push(task)
    }
  }

  return { visibleRoots, childMap }
}