<template>
  <div ref="containerRef" class="topology-container">
    <svg ref="svgRef" class="topology-svg"></svg>
  </div>
</template>

<script setup>
import { ref, onBeforeUnmount, onMounted, watch, nextTick, markRaw } from 'vue'
import * as d3 from 'd3'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  links: { type: Array, default: () => [] },
  loadRates: { type: Object, default: () => ({}) },
  flows: { type: Array, default: () => [] }
})

const emit = defineEmits(['node-click'])

const containerRef = ref(null)
const svgRef = ref(null)

let svg = null
let gRoot = null
let gLinks = null
let gFlowParticles = null
let gNodes = null
let zoomBehavior = null
let animationTimer = null
let resizeObserver = null
let width = 0
let height = 0
let isDestroyed = false

const cleanupRegistry = {
  nodeClickListeners: new Map(),
  nodePulseTransitions: new Map(),
  activeTransitions: new Set(),
  zoomHandler: null,
  svgNode: null
}

const typeColors = {
  grid: '#3b82f6',
  substation: '#8b5cf6',
  inverter: '#22c55e',
  load: '#f97316',
  battery: '#06b6d4'
}

function trackTransition(transition) {
  if (!transition) return
  cleanupRegistry.activeTransitions.add(transition)
  transition.on('end.cleanup', () => {
    cleanupRegistry.activeTransitions.delete(transition)
  }).on('interrupt.cleanup', () => {
    cleanupRegistry.activeTransitions.delete(transition)
  })
  return transition
}

function cancelAllTransitions() {
  cleanupRegistry.activeTransitions.forEach(t => {
    try { t.stop() } catch (_) {}
  })
  cleanupRegistry.activeTransitions.clear()

  cleanupRegistry.nodePulseTransitions.forEach(({ selection }) => {
    try {
      if (selection && selection.interrupt) {
        selection.interrupt()
      }
    } catch (_) {}
  })
  cleanupRegistry.nodePulseTransitions.clear()
}

function removeDOMElements() {
  if (gFlowParticles) {
    try {
      gFlowParticles.selectAll('*').interrupt().remove()
    } catch (_) {}
  }
  if (gNodes) {
    try {
      gNodes.selectAll('*').interrupt().on('click', null).remove()
    } catch (_) {}
  }
  if (gLinks) {
    try {
      gLinks.selectAll('*').interrupt().remove()
    } catch (_) {}
  }
  if (gRoot) {
    try { gRoot.selectAll('*').interrupt().remove() } catch (_) {}
  }
}

function detachZoom() {
  if (svg && zoomBehavior) {
    try {
      svg.on('.zoom', null)
      svg.call(zoomBehavior)
    } catch (_) {}
    zoomBehavior = null
  }
  cleanupRegistry.zoomHandler = null
}

function detachEventListeners() {
  cleanupRegistry.nodeClickListeners.forEach(({ group, handler }) => {
    try {
      if (group && group.on) {
        group.on('click', null)
      }
    } catch (_) {}
  })
  cleanupRegistry.nodeClickListeners.clear()
}

function destroyAllResources() {
  if (isDestroyed) return
  isDestroyed = true

  if (animationTimer) {
    try { animationTimer.stop() } catch (_) {}
    animationTimer = null
  }

  if (resizeObserver) {
    try { resizeObserver.disconnect() } catch (_) {}
    resizeObserver = null
  }

  cancelAllTransitions()
  detachEventListeners()
  detachZoom()
  removeDOMElements()

  if (svg) {
    try { svg.selectAll('*').remove() } catch (_) {}
    svg = null
  }

  cleanupRegistry.svgNode = null
  gRoot = null
  gLinks = null
  gFlowParticles = null
  gNodes = null
}

function getLoadColor(loadRate) {
  if (loadRate === undefined || loadRate === null) return '#475569'
  if (loadRate >= 0.85) return '#ef4444'
  if (loadRate >= 0.6) {
    const t = (loadRate - 0.6) / 0.25
    return d3.interpolateRgb('#eab308', '#ef4444')(t)
  }
  if (loadRate >= 0.3) {
    const t = (loadRate - 0.3) / 0.3
    return d3.interpolateRgb('#22c55e', '#eab308')(t)
  }
  const t = loadRate / 0.3
  return d3.interpolateRgb('#16a34a', '#22c55e')(t)
}

function getPulseDuration(loadRate) {
  if (loadRate === undefined || loadRate === null) return 3000
  if (loadRate >= 0.85) return 600
  if (loadRate >= 0.6) return 1200
  if (loadRate >= 0.3) return 2000
  return 3500
}

function getNodeRadius(type) {
  switch (type) {
    case 'grid': return 32
    case 'substation': return 26
    case 'battery': return 24
    case 'inverter': return 22
    case 'load': return 20
    default: return 20
  }
}

function getNodeIcon(type) {
  switch (type) {
    case 'grid': return '⚡'
    case 'substation': return '🏭'
    case 'inverter': return '☀️'
    case 'load': return '🏠'
    case 'battery': return '🔋'
    default: return '⬤'
  }
}

function handleNodeClickFactory(nodeData) {
  const handler = (event) => {
    if (isDestroyed) return
    emit('node-click', nodeData)
    if (event && event.stopPropagation) {
      event.stopPropagation()
    }
  }
  return markRaw(handler)
}

function initSVG() {
  if (!svgRef.value || !containerRef.value) return

  destroyAllResources()
  isDestroyed = false

  const container = containerRef.value
  width = container.clientWidth
  height = container.clientHeight

  svg = d3.select(svgRef.value)
    .attr('width', width)
    .attr('height', height)
    .attr('viewBox', [0, 0, width, height])

  cleanupRegistry.svgNode = svgRef.value

  svg.selectAll('*').remove()

  const defs = svg.append('defs')

  const bgGradient = defs.append('radialGradient')
    .attr('id', 'bg-gradient')
    .attr('cx', '50%').attr('cy', '50%').attr('r', '70%')
  bgGradient.append('stop').attr('offset', '0%').attr('stop-color', '#1e293b').attr('stop-opacity', 0.6)
  bgGradient.append('stop').attr('offset', '100%').attr('stop-color', '#0f172a').attr('stop-opacity', 0.2)

  const gridPattern = defs.append('pattern')
    .attr('id', 'grid-pattern')
    .attr('width', 40).attr('height', 40)
    .attr('patternUnits', 'userSpaceOnUse')
  gridPattern.append('path')
    .attr('d', 'M 40 0 L 0 0 0 40')
    .attr('fill', 'none')
    .attr('stroke', 'rgba(59, 130, 246, 0.08)')
    .attr('stroke-width', 1)

  const arrowMarker = defs.append('marker')
    .attr('id', 'arrow-marker')
    .attr('viewBox', '0 -5 10 10')
    .attr('refX', 28)
    .attr('refY', 0)
    .attr('markerWidth', 6)
    .attr('markerHeight', 6)
    .attr('orient', 'auto')
  arrowMarker.append('path')
    .attr('d', 'M0,-5L10,0L0,5')
    .attr('fill', 'rgba(148, 163, 184, 0.6)')

  const glowFilter = defs.append('filter')
    .attr('id', 'glow')
    .attr('x', '-50%').attr('y', '-50%')
    .attr('width', '200%').attr('height', '200%')
  glowFilter.append('feGaussianBlur')
    .attr('stdDeviation', '3')
    .attr('result', 'coloredBlur')
  const feMerge = glowFilter.append('feMerge')
  feMerge.append('feMergeNode').attr('in', 'coloredBlur')
  feMerge.append('feMergeNode').attr('in', 'SourceGraphic')

  svg.append('rect')
    .attr('width', width)
    .attr('height', height)
    .attr('fill', 'url(#grid-pattern)')

  gRoot = svg.append('g').attr('class', 'root')

  zoomBehavior = d3.zoom()
    .scaleExtent([0.3, 3])

  cleanupRegistry.zoomHandler = function(event) {
    if (isDestroyed || !gRoot) return
    gRoot.attr('transform', event.transform)
  }

  zoomBehavior.on('zoom', cleanupRegistry.zoomHandler)
  svg.call(zoomBehavior)

  gLinks = gRoot.append('g').attr('class', 'links')
  gFlowParticles = gRoot.append('g').attr('class', 'flow-particles')
  gNodes = gRoot.append('g').attr('class', 'nodes')
}

function renderLinks() {
  if (!gLinks || props.links.length === 0) return

  detachEventListeners()

  const nodeMap = new Map(props.nodes.map(n => [n.id, n]))

  const linkData = props.links.map(link => {
    const source = nodeMap.get(link.source)
    const target = nodeMap.get(link.target)
    return { ...link, source, target }
  }).filter(l => l.source && l.target)

  const selection = gLinks.selectAll('g.link-group')
    .data(linkData, d => `${d.source.id}-${d.target.id}`)

  selection.exit().each(function() {
    d3.select(this).selectAll('*').interrupt()
  }).remove()

  const linkGroupEnter = selection.enter().append('g').attr('class', 'link-group')

  linkGroupEnter.append('line')
    .attr('class', 'link-bg')
    .attr('stroke', 'rgba(71, 85, 105, 0.3)')
    .attr('stroke-width', 8)
    .attr('stroke-linecap', 'round')

  linkGroupEnter.append('line')
    .attr('class', 'link')
    .attr('stroke', 'rgba(148, 163, 184, 0.5)')
    .attr('stroke-width', 2)
    .attr('stroke-linecap', 'round')
    .attr('marker-end', 'url(#arrow-marker)')

  const merged = linkGroupEnter.merge(selection)

  merged.select('.link-bg, .link')
    .attr('x1', d => d.source.x)
    .attr('y1', d => d.source.y)
    .attr('x2', d => d.target.x)
    .attr('y2', d => d.target.y)
}

function renderNodes() {
  if (!gNodes || props.nodes.length === 0) return

  cancelAllTransitions()

  cleanupRegistry.nodeClickListeners.forEach(({ group }) => {
    try { group.on('click', null) } catch (_) {}
  })
  cleanupRegistry.nodeClickListeners.clear()

  const selection = gNodes.selectAll('g.node-group')
    .data(props.nodes, d => d.id)

  selection.exit().each(function(d) {
    const nodeId = d && d.id
    if (nodeId && cleanupRegistry.nodePulseTransitions.has(nodeId)) {
      const entry = cleanupRegistry.nodePulseTransitions.get(nodeId)
      try {
        entry.selection.interrupt()
        entry._destroyed = true
      } catch (_) {}
      cleanupRegistry.nodePulseTransitions.delete(nodeId)
    }
    d3.select(this).selectAll('*').interrupt().on('click', null)
  }).remove()

  const nodeGroupEnter = selection.enter().append('g')
    .attr('class', 'node-group')
    .style('cursor', 'pointer')

  nodeGroupEnter.each(function(d) {
    const group = d3.select(this)
    const handler = handleNodeClickFactory(d)
    group.on('click', handler)
    cleanupRegistry.nodeClickListeners.set(d.id, { group, handler })
  })

  nodeGroupEnter.append('circle')
    .attr('class', 'node-pulse')
    .attr('r', d => getNodeRadius(d.type) + 6)
    .attr('fill', 'none')
    .attr('stroke-width', 2)

  nodeGroupEnter.append('circle')
    .attr('class', 'node-glow')
    .attr('r', d => getNodeRadius(d.type))
    .attr('filter', 'url(#glow)')

  nodeGroupEnter.append('circle')
    .attr('class', 'node-circle')
    .attr('r', d => getNodeRadius(d.type))
    .attr('stroke', '#fff')
    .attr('stroke-width', 2)

  nodeGroupEnter.append('text')
    .attr('class', 'node-icon')
    .attr('text-anchor', 'middle')
    .attr('dominant-baseline', 'central')
    .attr('font-size', d => getNodeRadius(d.type) * 0.9)
    .attr('fill', '#fff')
    .attr('pointer-events', 'none')
    .text(d => getNodeIcon(d.type))

  nodeGroupEnter.append('text')
    .attr('class', 'node-label')
    .attr('text-anchor', 'middle')
    .attr('dy', d => getNodeRadius(d.type) + 18)
    .attr('fill', '#e2e8f0')
    .attr('font-size', '12px')
    .attr('font-weight', '500')
    .attr('pointer-events', 'none')
    .text(d => d.name)

  nodeGroupEnter.append('text')
    .attr('class', 'node-load-label')
    .attr('text-anchor', 'middle')
    .attr('dy', d => getNodeRadius(d.type) + 34)
    .attr('fill', '#94a3b8')
    .attr('font-size', '11px')
    .attr('font-family', 'Courier New, monospace')
    .attr('pointer-events', 'none')

  const merged = nodeGroupEnter.merge(selection)

  merged.attr('transform', d => `translate(${d.x},${d.y})`)

  updateNodeStyles()
  startNodeAnimations()
}

function updateNodeStyles() {
  if (!gNodes || isDestroyed) return

  gNodes.selectAll('g.node-group').each(function(d) {
    if (isDestroyed) return
    const g = d3.select(this)
    const loadData = props.loadRates[d.id]
    const loadRate = loadData ? loadData.loadRate : 0.3
    const color = getLoadColor(loadRate)

    trackTransition(
      g.select('.node-circle')
        .transition()
        .duration(400)
        .attr('fill', color)
    )

    trackTransition(
      g.select('.node-glow')
        .transition()
        .duration(400)
        .attr('fill', color)
    )

    g.select('.node-pulse')
      .attr('stroke', color)

    g.select('.node-load-label')
      .text(loadData ? `${(loadRate * 100).toFixed(1)}%` : '--')

    trackTransition(
      g.select('.node-load-label')
        .transition()
        .duration(400)
        .attr('fill', color)
    )
  })
}

function startNodeAnimations() {
  if (!gNodes || isDestroyed) return

  cleanupRegistry.nodePulseTransitions.forEach((entry, nodeId) => {
    try {
      entry._destroyed = true
      if (entry.selection && entry.selection.interrupt) {
        entry.selection.interrupt()
      }
    } catch (_) {}
  })
  cleanupRegistry.nodePulseTransitions.clear()

  gNodes.selectAll('g.node-group').each(function(d) {
    if (isDestroyed) return
    const nodeId = d.id
    const g = d3.select(this)
    const pulse = g.select('.node-pulse')
    const loadData = props.loadRates[d.id]
    const loadRate = loadData ? loadData.loadRate : 0.3
    const duration = getPulseDuration(loadRate)
    const radius = getNodeRadius(d.type)

    pulse.interrupt()

    const entry = {
      selection: pulse,
      duration,
      radius,
      nodeId,
      _destroyed: false,
      _iteration: 0
    }
    cleanupRegistry.nodePulseTransitions.set(nodeId, entry)

    function animatePulse() {
      if (isDestroyed || entry._destroyed || !cleanupRegistry.nodePulseTransitions.has(nodeId)) {
        return
      }
      entry._iteration++

      try {
        pulse
          .attr('r', radius + 4)
          .attr('stroke-opacity', 0.8)
          .transition('pulse')
          .duration(duration)
          .ease(d3.easeCubicOut)
          .attr('r', radius + 20)
          .attr('stroke-opacity', 0)
          .on('end', function() {
            if (isDestroyed || entry._destroyed) return
            if (cleanupRegistry.nodePulseTransitions.get(nodeId) === entry) {
              animatePulse()
            }
          })
      } catch (_) {
        if (!isDestroyed && !entry._destroyed && cleanupRegistry.nodePulseTransitions.get(nodeId) === entry) {
          setTimeout(animatePulse, duration)
        }
      }
    }

    animatePulse()
  })
}

function startFlowAnimation() {
  if (!gFlowParticles || animationTimer) return

  animationTimer = d3.interval(() => {
    if (!gLinks || isDestroyed) return

    try {
      const flowMap = new Map()
      props.flows.forEach(f => {
        flowMap.set(`${f.source}-${f.target}`, f)
        flowMap.set(`${f.target}-${f.source}`, { ...f, source: f.target, target: f.source, reversed: true })
      })

      const activeLinks = props.links
        .map(l => flowMap.get(`${l.source}-${l.target}`) || { source: l.source, target: l.target, power: 0, capacity: l.capacity })
        .filter(f => f.power > 0)

      const timestamp = Date.now()
      const particles = activeLinks.flatMap(flow => {
        const count = Math.max(1, Math.floor((flow.power / flow.capacity) * 5))
        return Array.from({ length: count }, (_, i) => ({
          id: `${flow.source}-${flow.target}-${i}-${timestamp}-${Math.random().toString(36).slice(2, 7)}`,
          sourceNode: props.nodes.find(n => n.id === flow.source),
          targetNode: props.nodes.find(n => n.id === flow.target),
          offset: i / count,
          powerRatio: flow.power / flow.capacity
        }))
      }).filter(p => p.sourceNode && p.targetNode)

      if (isDestroyed) return

      const existing = gFlowParticles.selectAll('circle.flow-particle')
      existing.interrupt().each(function() {
        const self = d3.select(this)
        self.on('end', null).on('interrupt', null)
      }).remove()

      const selection = gFlowParticles.selectAll('circle.flow-particle')
        .data(particles, d => d.id)

      selection.exit().interrupt().remove()

      const enter = selection.enter().append('circle')
        .attr('class', 'flow-particle')
        .attr('r', 3)
        .attr('fill', '#60a5fa')
        .attr('filter', 'url(#glow)')

      enter.each(function(d) {
        if (isDestroyed) return
        const particle = d3.select(this)
        const sx = d.sourceNode.x
        const sy = d.sourceNode.y
        const tx = d.targetNode.x
        const ty = d.targetNode.y
        const duration = 2000 / Math.max(0.3, d.powerRatio)
        const delay = d.offset * duration

        let active = true
        const cxTween = () => {
          if (!active || isDestroyed) return sx
          return t => sx + (tx - sx) * t
        }
        const cyTween = () => {
          if (!active || isDestroyed) return sy
          return t => sy + (ty - sy) * t
        }

        try {
          trackTransition(
            particle
              .attr('cx', sx)
              .attr('cy', sy)
              .attr('fill-opacity', 0.9)
              .attr('r', 2 + d.powerRatio * 3)
              .transition()
              .delay(delay)
              .duration(duration)
              .ease(d3.easeLinear)
              .attrTween('cx', cxTween)
              .attrTween('cy', cyTween)
              .on('end', function() {
                active = false
                try { d3.select(this).remove() } catch (_) {}
              })
              .on('interrupt', function() {
                active = false
                try { d3.select(this).remove() } catch (_) {}
              })
          )
        } catch (_) {
          try { particle.remove() } catch (_) {}
        }
      })
    } catch (err) {
      if (!isDestroyed) console.warn('[FlowAnimation] 异常:', err.message)
    }
  }, 1500)
}

function handleResize() {
  if (!containerRef.value || isDestroyed) return
  width = containerRef.value.clientWidth
  height = containerRef.value.clientHeight
  if (svg) {
    try {
      svg.attr('width', width).attr('height', height)
      svg.attr('viewBox', [0, 0, width, height])
    } catch (_) {}
  }
}

let topologyWatchReady = false

watch(() => [JSON.stringify(props.nodes), JSON.stringify(props.links)], () => {
  if (isDestroyed) return
  nextTick(() => {
    if (isDestroyed) return
    if (!topologyWatchReady) {
      topologyWatchReady = true
      return
    }
    cancelAllTransitions()
    renderLinks()
    renderNodes()
  })
}, { flush: 'post' })

let loadRatesWatchCount = 0
watch(() => props.loadRates, () => {
  if (isDestroyed) return
  loadRatesWatchCount++
  if (loadRatesWatchCount === 1) return
  updateNodeStyles()
  startNodeAnimations()
}, { deep: true, flush: 'post' })

onMounted(() => {
  nextTick(() => {
    if (isDestroyed) isDestroyed = false
    initSVG()
    renderLinks()
    renderNodes()
    startFlowAnimation()
  })

  resizeObserver = new ResizeObserver(handleResize)
  if (containerRef.value) {
    resizeObserver.observe(containerRef.value)
  }
})

onBeforeUnmount(() => {
  destroyAllResources()
})
</script>

<style scoped>
.topology-container {
  width: 100%;
  height: 100%;
  position: relative;
  overflow: hidden;
}

.topology-svg {
  display: block;
}

:deep(.link) {
  transition: stroke 0.3s ease;
}

:deep(.node-group:hover .node-circle) {
  stroke: #fbbf24 !important;
  stroke-width: 3 !important;
}

:deep(.node-group:hover .node-label) {
  fill: #fbbf24 !important;
}
</style>
