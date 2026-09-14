import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Background, BackgroundVariant, ReactFlow, SelectionMode, useReactFlow,
  type Connection, type NodeMouseHandler, type OnNodeDrag,
} from '@xyflow/react'
import { ResourceNode, ContainerNode } from './nodes/ResourceNode'
import { FlowEdge } from './edges/FlowEdge'
import { canDropInto, useGame } from '@/store/gameStore'
import { getResource } from '@/catalog/registry'
import type { CwEdge, CwNode } from '@/store/types'
import { RejectionToast } from './RejectionToast'
import { CanvasControls } from './controls/CanvasControls'
import { CanvasEmptyState } from './CanvasEmptyState'
import { useMission } from '@/store/missionStore'

/** Width of the mission objective panel, used to offset the initial framing. */
const MISSION_PANEL_WIDTH = 300

const nodeTypes = { resource: ResourceNode, container: ContainerNode }
const edgeTypes = { flow: FlowEdge }

const PRO_OPTIONS = { hideAttribution: true }

export function Canvas() {
  const wrapper = useRef<HTMLDivElement>(null)
  const { screenToFlowPosition, getIntersectingNodes, fitView, getViewport, setViewport } = useReactFlow<CwNode, CwEdge>()
  const [dropTarget, setDropTarget] = useState<string | null>(null)

  const nodes = useGame((s) => s.nodes)
  const edges = useGame((s) => s.edges)
  const onNodesChange = useGame((s) => s.onNodesChange)
  const onEdgesChange = useGame((s) => s.onEdgesChange)
  const connect = useGame((s) => s.connect)
  const isValidConnection = useGame((s) => s.isValidConnection)
  const select = useGame((s) => s.select)
  const addNode = useGame((s) => s.addNode)

  const fitSignal = useGame((s) => s.fitSignal)
  const missionActive = useMission((s) => s.activeId !== null)

  // Re-frame when a whole diagram is swapped in. When a mission panel is open,
  // nudge the viewport right so the architecture is not hidden behind it.
  useEffect(() => {
    if (fitSignal === 0) return
    const timer = setTimeout(async () => {
      await fitView({ duration: 0, padding: 0.08, maxZoom: 1 })
      if (!missionActive || !wrapper.current) return

      // Zoom out about the centre by exactly the fraction the panel covers,
      // then slide the result clear of it. The architecture stays fully visible.
      const rect = wrapper.current.getBoundingClientRect()
      const shrink = Math.max(0.6, 1 - MISSION_PANEL_WIDTH / rect.width)
      const cx = rect.width / 2
      const cy = rect.height / 2
      const vp = getViewport()
      setViewport(
        {
          x: cx - (cx - vp.x) * shrink + MISSION_PANEL_WIDTH / 2,
          y: cy - (cy - vp.y) * shrink,
          zoom: vp.zoom * shrink,
        },
        { duration: 320 },
      )
    }, 60)
    return () => clearTimeout(timer)
  }, [fitSignal, fitView, getViewport, setViewport, missionActive])

  const onConnect = useCallback((c: Connection) => connect(c), [connect])

  // React Flow also calls this with an existing edge during reconnection.
  const validate = useCallback(
    (c: Connection | CwEdge) =>
      isValidConnection({
        source: c.source,
        target: c.target,
        sourceHandle: c.sourceHandle ?? null,
        targetHandle: c.targetHandle ?? null,
      }),
    [isValidConnection],
  )

  const onDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }, [])

  const onDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault()
      const defId = event.dataTransfer.getData('application/cloudwright')
      if (!defId || !getResource(defId)) return

      const position = screenToFlowPosition({ x: event.clientX, y: event.clientY })

      // Drop into a container when one is under the cursor and accepts this type.
      const containers = nodes
        .filter((n) => n.type === 'container')
        .filter((n) => {
          const w = Number(n.style?.width ?? n.width ?? 0)
          const h = Number(n.style?.height ?? n.height ?? 0)
          const origin = absolutePosition(n, nodes)
          return (
            position.x >= origin.x && position.x <= origin.x + w &&
            position.y >= origin.y && position.y <= origin.y + h
          )
        })
        // Innermost container wins, so a subnet inside a VPC takes the drop.
        .sort((a, b) => depthOf(b, nodes) - depthOf(a, nodes))

      const parent = containers.find((c) => canDropInto(c.data.defId, defId))
      if (parent) {
        const origin = absolutePosition(parent, nodes)
        addNode(defId, { x: position.x - origin.x - 94, y: position.y - origin.y - 30 }, parent.id)
      } else {
        addNode(defId, { x: position.x - 94, y: position.y - 30 })
      }
      setDropTarget(null)
    },
    [addNode, nodes, screenToFlowPosition],
  )

  const onNodeDrag: OnNodeDrag<CwNode> = useCallback(
    (_, node) => {
      if (node.type === 'container') return
      const hits = getIntersectingNodes(node).filter(
        (n) => n.type === 'container' && n.id !== node.parentId && canDropInto(n.data.defId, node.data.defId),
      )
      setDropTarget(hits.length ? hits[hits.length - 1].id : null)
    },
    [getIntersectingNodes],
  )

  const onNodeDragStop: OnNodeDrag<CwNode> = useCallback(
    (_, node) => {
      setDropTarget(null)
      if (node.type === 'container') return
      const hits = getIntersectingNodes(node).filter(
        (n) => n.type === 'container' && n.id !== node.id && canDropInto(n.data.defId, node.data.defId),
      )
      const parent = hits[hits.length - 1]
      if (!parent || parent.id === node.parentId) return

      const origin = absolutePosition(parent, nodes)
      const nodeAbs = absolutePosition(node, nodes)
      useGame.setState((s) => ({
        nodes: s.nodes.map((n) =>
          n.id === node.id
            ? { ...n, parentId: parent.id, extent: 'parent' as const, position: { x: nodeAbs.x - origin.x, y: nodeAbs.y - origin.y } }
            : n,
        ),
      }))
      useGame.getState().runReview()
    },
    [getIntersectingNodes, nodes],
  )

  const onNodeClick: NodeMouseHandler<CwNode> = useCallback((_, node) => select(node.id), [select])

  const styledNodes = dropTarget
    ? nodes.map((n) => (n.id === dropTarget ? { ...n, className: 'cw-drop-target' } : n))
    : nodes

  return (
    <div ref={wrapper} className="relative size-full" onDrop={onDrop} onDragOver={onDragOver}>
      <ReactFlow<CwNode, CwEdge>
        nodes={styledNodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        isValidConnection={validate}
        onNodeClick={onNodeClick}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={onNodeDragStop}
        onEdgeClick={(_, edge) => select(null, edge.id)}
        onPaneClick={() => select(null, null)}
        proOptions={PRO_OPTIONS}
        minZoom={0.15}
        maxZoom={2.5}
        fitView
        fitViewOptions={{ padding: 0.3, maxZoom: 1.1 }}
        selectionMode={SelectionMode.Partial}
        panOnScroll
        selectionOnDrag
        panOnDrag={[1, 2]}
        deleteKeyCode={['Backspace', 'Delete']}
        connectionRadius={28}
        defaultEdgeOptions={{ type: 'flow' }}
        elevateNodesOnSelect
        elevateEdgesOnSelect
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={26}
          size={1}
          color="var(--color-line)"
          className="opacity-60"
        />
      </ReactFlow>

      {nodes.length === 0 && <CanvasEmptyState />}
      <CanvasControls />
      <RejectionToast />
    </div>
  )
}

function absolutePosition(node: CwNode, all: CwNode[]): { x: number; y: number } {
  let x = node.position.x
  let y = node.position.y
  let parentId = node.parentId
  let guard = 0
  while (parentId && guard++ < 10) {
    const parent = all.find((n) => n.id === parentId)
    if (!parent) break
    x += parent.position.x
    y += parent.position.y
    parentId = parent.parentId
  }
  return { x, y }
}

function depthOf(node: CwNode, all: CwNode[]): number {
  let depth = 0
  let parentId = node.parentId
  while (parentId && depth < 10) {
    depth++
    parentId = all.find((n) => n.id === parentId)?.parentId
  }
  return depth
}
