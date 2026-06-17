import { topology } from './topology.js'
import { isLoadShed } from './loadShedding.js'

let telemetryInterval = null
let flowInterval = null
let systemState = {
  isIsland: false,
  frequency: 50.0,
  nextIslandAt: null,
  triggerIslandAt: null,
  recoverAt: null
}

function getInitialBaseLoad(node) {
  if (node.type === 'substation') return 0.4 + Math.random() * 0.2
  if (node.type === 'inverter') return 0.25 + Math.random() * 0.5
  if (node.type === 'load') return 0.5 + Math.random() * 0.4
  if (node.type === 'battery') return 0.2 + Math.random() * 0.2
  if (node.type === 'grid') return 0.3 + Math.random() * 0.2
  return 0.5
}

function scheduleNextEvent() {
  const now = Date.now()
  if (!systemState.triggerIslandAt) {
    systemState.triggerIslandAt = now + 30000 + Math.floor(Math.random() * 60000)
    console.log(`[Simulator] 下一次孤岛事件将在约 ${Math.ceil((systemState.triggerIslandAt - now) / 1000)}s 后触发`)
  }
}

function simulateSystemFrequency(nodeBaseLoad) {
  const now = Date.now()

  if (!systemState.isIsland && systemState.triggerIslandAt && now >= systemState.triggerIslandAt) {
    systemState.isIsland = true
    systemState.frequency = 49.4 + Math.random() * 0.15
    systemState.recoverAt = now + 30000 + Math.floor(Math.random() * 40000)
    console.log(`[Simulator] ⚠️  主电网断开！进入孤岛模式，频率=${systemState.frequency.toFixed(2)}Hz`)
  }

  if (systemState.isIsland && systemState.recoverAt && now >= systemState.recoverAt) {
    systemState.isIsland = false
    systemState.frequency = 50.0
    systemState.triggerIslandAt = null
    console.log(`[Simulator] ✓ 主电网恢复，频率回到 50.00Hz`)
    scheduleNextEvent()
  }

  if (!systemState.isIsland) {
    const drift = (Math.random() - 0.5) * 0.04
    systemState.frequency = 50.0 + drift
  } else {
    let totalGen = 0
    let totalLoad = 0
    topology.nodes.forEach(n => {
      const base = nodeBaseLoad.get(n.id) || 0.5
      if (n.isGenerator) {
        totalGen += n.capacity * base * 0.8
      } else if (n.type === 'load') {
        if (!isLoadShed(n.id)) {
          totalLoad += n.capacity * base
        }
      }
    })
    const deficit = totalLoad - totalGen
    const freqDrop = deficit > 0 ? (deficit / 200) * 0.6 : 0
    const recovery = Math.random() * 0.02
    const noise = (Math.random() - 0.5) * 0.05
    systemState.frequency = 49.5 - freqDrop + recovery + noise
    systemState.frequency = Math.max(48.8, Math.min(50.2, systemState.frequency))
  }

  return systemState.frequency
}

function initSimulator(onData, onFlow) {
  const nodeBaseLoad = new Map()

  topology.nodes.forEach((node) => {
    nodeBaseLoad.set(node.id, getInitialBaseLoad(node))
  })

  scheduleNextEvent()

  function generateTelemetry() {
    const freq = simulateSystemFrequency(nodeBaseLoad)

    topology.nodes.forEach((node) => {
      let isConnected = true
      if (node.isMainGrid && systemState.isIsland) {
        isConnected = false
      }

      let loadRate
      if (node.type === 'load' && isLoadShed(node.id)) {
        loadRate = 0.02 + Math.random() * 0.03
      } else {
        const base = nodeBaseLoad.get(node.id) || 0.5
        const variation = Math.sin(Date.now() / 5000 + node.id.charCodeAt(0)) * 0.12
        const noise = (Math.random() - 0.5) * 0.08
        loadRate = base + variation + noise
        loadRate = Math.max(0.05, Math.min(0.98, loadRate))
      }

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
        frequency: +freq.toFixed(3),
        isConnected,
        timestamp: new Date()
      }

      onData(telemetry)
    })
  }

  function generateFlowData() {
    const flows = topology.links.map((link) => {
      let loadFactor = 0.3 + Math.random() * 0.55
      if (systemState.isIsland) {
        loadFactor *= 0.75
      }
      const isReverse = link.direction === 'bidirectional' && Math.random() > 0.6
      return {
        source: isReverse ? link.target : link.source,
        target: isReverse ? link.source : link.target,
        power: +(link.capacity * loadFactor).toFixed(1),
        capacity: link.capacity
      }
    })
    onFlow(flows)
  }

  if (telemetryInterval) clearInterval(telemetryInterval)
  if (flowInterval) clearInterval(flowInterval)

  telemetryInterval = setInterval(generateTelemetry, 500)
  flowInterval = setInterval(generateFlowData, 1000)

  generateTelemetry()
  generateFlowData()

  console.log('[Simulator] 模拟数据生成器已启动（含孤岛/频率动态模拟）')

  return () => {
    if (telemetryInterval) {
      clearInterval(telemetryInterval)
      telemetryInterval = null
    }
    if (flowInterval) {
      clearInterval(flowInterval)
      flowInterval = null
    }
  }
}

function triggerIslandEvent() {
  systemState.isIsland = true
  systemState.frequency = 49.2
  systemState.recoverAt = Date.now() + 45000
  console.log('[Simulator] 手动触发：孤岛模式 + 频率 49.20Hz')
}

function restoreGridEvent() {
  systemState.isIsland = false
  systemState.frequency = 50.0
  systemState.triggerIslandAt = null
  console.log('[Simulator] 手动触发：主电网恢复')
}

function getSimulatorState() {
  return {
    isIsland: systemState.isIsland,
    frequency: +systemState.frequency.toFixed(3),
    nextIslandAt: systemState.triggerIslandAt,
    recoverAt: systemState.recoverAt
  }
}

export { initSimulator, triggerIslandEvent, restoreGridEvent, getSimulatorState }
