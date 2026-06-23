import type { MindElixirData, NodeObj } from 'mind-elixir'
import type { CheckvistTask } from '@/api/types'
import { buildTaskTree, type TaskNode } from './taskTree'
import { stripMarkdown } from '@/components/InlineMarkdown'

export const VIRTUAL_ROOT_ID = '__root__'

export interface AdapterOptions {
  /** If set, mindmap is rooted at this task's subtree. Otherwise virtual root holds all top-level tasks. */
  rootTaskId?: number | null
  /** Label for the virtual root when rootTaskId is not set. */
  virtualRootLabel?: string
  /** If true, all descendants of the root start collapsed (root itself stays expanded). */
  collapseChildren?: boolean
}

function nodeToMindElixir(node: TaskNode, depth: number, collapseChildren: boolean): NodeObj {
  return {
    id: String(node.id),
    topic: stripMarkdown(node.content) || '(empty)',
    children: node.children.map((c) => nodeToMindElixir(c, depth + 1, collapseChildren)),
    expanded: collapseChildren ? depth === 0 : true,
  }
}

export function tasksToMindElixir(
  tasks: CheckvistTask[],
  opts: AdapterOptions = {}
): MindElixirData {
  const { roots, getById } = buildTaskTree(tasks)
  const { rootTaskId, virtualRootLabel = 'Tasks', collapseChildren = false } = opts

  let rootNode: NodeObj
  if (rootTaskId != null) {
    const t = getById(rootTaskId)
    if (t) {
      rootNode = nodeToMindElixir(t, 0, collapseChildren)
    } else {
      rootNode = { id: VIRTUAL_ROOT_ID, topic: virtualRootLabel, children: [] }
    }
  } else {
    rootNode = {
      id: VIRTUAL_ROOT_ID,
      topic: virtualRootLabel,
      children: roots.map((r) => nodeToMindElixir(r, 1, collapseChildren)),
      expanded: true,
    }
  }

  return { nodeData: rootNode }
}

/** Parse mind-elixir node id back to numeric Checkvist task id, or null for virtual/temp. */
export function parseTaskId(meId: string): number | null {
  if (!meId || meId === VIRTUAL_ROOT_ID) return null
  if (meId.startsWith('tmp-')) return null
  const n = Number(meId)
  return Number.isFinite(n) ? n : null
}

export function isTempId(meId: string): boolean {
  return meId.startsWith('tmp-')
}

export function makeTempId(): string {
  return `tmp-${Math.random().toString(36).slice(2, 10)}`
}
