import type { Bundle, Concept } from '@shared/okf/types'

export interface TreeNode {
  name: string
  path: string // full id-ish path for dirs; concept id for files
  isDir: boolean
  concept?: Concept
  children: TreeNode[]
}

/** Build a directory tree from a bundle's concepts (by their ids). */
export function buildTree(bundle: Bundle): TreeNode {
  const root: TreeNode = { name: bundle.label, path: '', isDir: true, children: [] }

  const dirNode = (parts: string[]): TreeNode => {
    let node = root
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      let child = node.children.find((c) => c.isDir && c.name === part)
      if (!child) {
        child = { name: part, path: acc, isDir: true, children: [] }
        node.children.push(child)
      }
      node = child
    }
    return node
  }

  for (const concept of [...bundle.concepts].sort((a, b) => a.id.localeCompare(b.id))) {
    const segs = concept.id.split('/')
    const fileName = segs.pop() as string
    const parent = dirNode(segs)
    parent.children.push({
      name: fileName,
      path: concept.id,
      isDir: false,
      concept,
      children: []
    })
  }

  sortTree(root)
  return root
}

function sortTree(node: TreeNode): void {
  node.children.sort((a, b) => {
    if (a.isDir !== b.isDir) return a.isDir ? -1 : 1
    return a.name.localeCompare(b.name)
  })
  node.children.forEach(sortTree)
}
