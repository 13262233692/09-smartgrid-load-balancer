import { topology } from './topology.js'

function initSimulator(onData, onFlow) {
  const nodeBaseLoad = new Map()

  topology.nodes.forEach((node) => {
    if (node.type === 'substation') {
      nodeBaseLoad.set(node.id, 0.35 + Math.random() * 0.3)
    } else if (node.type === 'inverter') {
      nodeBaseLoad.set(node.id, 0.2 + Math.random() * 0.6)
    } else if (node.type === 'load') {
      nodeBaseLoad.set(node.id, 0.4 + Math.random() * 0.5)
    } else if (node.type === 'battery') {
      nodeBaseLoad.set(node.id, 0.15 + Math.random() * 0.2)
    } else if (node.type === 'grid') {
      nodeBaseLoad.set(node.id, 0.25 + Math.random() * 0.2)
    }
  })

  function generateTelemetry() {
    topology.nodes.forEach((node) => {
      if (node.type === 'grid') return

      const base = nodeBaseLoad.get(node.id) || 0.5
      const variation = Math.sin(Date.now() / 5000 + node.id.charCodeAt(0)) * 0.15
      const noise = (Math.random() - 0.5) * 0.1
      let loadRate = base + variation + noise
      loadRate = Math.max(0.05, Math.min(0.98, loadRate))

      const baseVoltage = node.type === 'substation' ? 10.5 : 0.4
      const voltage = baseVoltage * (1 + (Math.random() - 0.5) * 0.05)
      const baseCurrent = node.type === 'substation' ? 200 : 50
      const current = baseCurrent * loadRate

      const telemetry = {
        deviceId: node.id,
        deviceType: node.type,
        voltage: +voltage.toFixed(3),
        current: +current.toFixed(2),
        phaseAngle: +(Math.random() * 20 - 10).toFixed(2),
        loadRate: +loadRate.toFixed(4),
        timestamp: new Date()
      }

      onData(telemetry)
    })
  }

  function generateFlowData() {
    const flows = topology.links.map((link) => {
      const loadFactor = 0.3 + Math.random() * 0.6
      const isReverse = link.direction === 'bidirectional' && Math.random() > 0.7
      return {
        source: isReverse ? link.target : link.source,
        target: isReverse ? link.source : link.target,
        power: +(link.capacity * loadFactor).toFixed(1),
        capacity: link.capacity
      }
    })
    onFlow(flows)
  }

  const telemetryInterval = setInterval(generateTelemetry, 500)
  const flowInterval = setInterval(generateFlowData, 1000)

  generateTelemetry()
  generateFlowData()

  console.log('[Simulator] 模拟数据生成器已启动')

  return () => {
    clearInterval(telemetryInterval)
    clearInterval(flowInterval)
  }
}

export { initSimulator }
