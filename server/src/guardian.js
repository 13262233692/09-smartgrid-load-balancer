import { topology } from './topology.js'
import {
  evaluateLoadShedDecision,
  markLoadShed,
  markLoadRestore,
  isLoadShed,
  getShedSummary,
  getShedHistory,
  FREQUENCY_THRESHOLD,
  FREQUENCY_RECOVERY
} from './loadShedding.js'

const POLL_INTERVAL_MS = 100
const STATE_WINDOW_MS = 2000
const COOLDOWN_MS = 8000

const nodeStates = new Map()
const frequencySamples = []
let guardianTimer = null
let lastShedTime = 0
let cooldownTimer = null
let lastDecision = null
let systemFrequency = 50.0

function ingestTelemetry(data) {
  const { deviceId, loadRate, frequency } = data
  const existing = nodeStates.get(deviceId) || {}
  nodeStates.set(deviceId, {
    ...existing,
    loadRate,
    frequency: frequency || existing.frequency,
    isConnected: data.isConnected !== undefined ? data.isConnected : existing.isConnected,
    lastSeen: Date.now()
  })

  if (frequency !== undefined && typeof frequency === 'number') {
    systemFrequency = frequency
    frequencySamples.push({ ts: Date.now(), freq: frequency })
  } else if (deviceId && (deviceId.startsWith('SUB-') || deviceId.startsWith('GRID-'))) {
    const baseFreq = existing.frequency || 50.0
    const drift = (Math.random() - 0.5) * 0.05
    systemFrequency = baseFreq + drift
    frequencySamples.push({ ts: Date.now(), freq: systemFrequency })
  }

  const cutoff = Date.now() - STATE_WINDOW_MS
  while (frequencySamples.length > 0 && frequencySamples[0].ts < cutoff) {
    frequencySamples.shift()
  }
  if (frequencySamples.length > 200) {
    frequencySamples.splice(0, frequencySamples.length - 200)
  }
}

function setSystemFrequency(freq, gridDisconnected = false) {
  systemFrequency = freq
  frequencySamples.push({ ts: Date.now(), freq })

  const gridNode = topology.nodes.find(n => n.isMainGrid)
  if (gridNode) {
    const existing = nodeStates.get(gridNode.id) || {}
    nodeStates.set(gridNode.id, {
      ...existing,
      isConnected: !gridDisconnected,
      loadRate: gridDisconnected ? 0 : (existing.loadRate || 0.5),
      frequency: freq,
      lastSeen: Date.now()
    })
  }
}

function getSmoothedFrequency() {
  if (frequencySamples.length === 0) return systemFrequency
  const recent = frequencySamples.slice(-20)
  const sum = recent.reduce((s, r) => s + r.freq, 0)
  return sum / recent.length
}

function executeShedPlan(plan, decision) {
  if (!plan || !plan.selected || plan.selected.length === 0) return []

  const executed = []
  plan.selected.forEach(load => {
    if (!isLoadShed(load.id)) {
      markLoadShed(load.id)
      executed.push({
        id: load.id,
        name: load.name,
        shedLoad: load.shedLoad,
        priority: load.priority
      })
    }
  })
  lastShedTime = Date.now()
  return executed
}

function getGuardianState() {
  const smoothedFreq = getSmoothedFrequency()
  const decision = evaluateLoadShedDecision(nodeStates, smoothedFreq)
  return {
    timestamp: Date.now(),
    systemFrequency: +smoothedFreq.toFixed(3),
    frequencyThreshold: FREQUENCY_THRESHOLD,
    inCooldown: Date.now() - lastShedTime < COOLDOWN_MS,
    lastDecision: decision,
    shedSummary: getShedSummary(),
    shedHistory: getShedHistory().slice(0, 20)
  }
}

function evaluateAndAct(broadcastFn, executeMqttFn) {
  if (Date.now() - lastShedTime < COOLDOWN_MS) return
  if (nodeStates.size === 0) return

  const smoothedFreq = getSmoothedFrequency()
  const decision = evaluateLoadShedDecision(nodeStates, smoothedFreq)
  lastDecision = decision

  if (decision.action === 'shed' && decision.plan) {
    console.log(`\n[Guardian] ⚠️  紧急甩负荷触发！`)
    console.log(`[Guardian] 频率: ${smoothedFreq.toFixed(2)}Hz | 主电网: ${decision.gridConnected ? '在线' : '离线（孤岛）'}`)
    console.log(`[Guardian] 发电: ${decision.totalGeneration}kW | 负荷: ${decision.totalLoad}kW | 缺额: ${decision.powerDeficit}kW`)
    console.log(`[Guardian] 计划切除 ${decision.plan.selected.length} 个负荷，共 ${decision.plan.totalShed}kW：`)
    decision.plan.selected.forEach(l => {
      console.log(`[Guardian]   - [优先级${l.priority}] ${l.name}: ${l.shedLoad}kW (${l.description})`)
    })
    console.log(`[Guardian] 预计恢复频率: ${decision.expectedFrequency}Hz\n`)

    const executed = executeShedPlan(decision.plan, decision)

    if (executeMqttFn) {
      executed.forEach(load => {
        try {
          executeMqttFn({
            type: 'load_shed',
            nodeId: load.id,
            action: 'open',
            shedLoad: load.shedLoad,
            timestamp: Date.now()
          })
        } catch (e) {
          console.error('[Guardian] MQTT 指令下发失败:', e.message)
        }
      })
    }

    if (broadcastFn) {
      try {
        broadcastFn({
          type: 'load_shed_event',
          event: 'SHED_EXECUTED',
          frequency: +smoothedFreq.toFixed(3),
          gridConnected: decision.gridConnected,
          totalGeneration: decision.totalGeneration,
          totalLoad: decision.totalLoad,
          powerDeficit: decision.powerDeficit,
          executed,
          totalShed: decision.plan.totalShed,
          expectedFrequency: decision.expectedFrequency,
          timestamp: Date.now()
        })
      } catch (e) {
        console.error('[Guardian] WebSocket 广播失败:', e.message)
      }
    }

    if (cooldownTimer) clearTimeout(cooldownTimer)
    cooldownTimer = setTimeout(() => {
      console.log(`[Guardian] 冷却期结束，重新启用甩负荷检测`)
      cooldownTimer = null
    }, COOLDOWN_MS)
  } else if (decision.action === 'warning') {
    if (broadcastFn) {
      try {
        broadcastFn({
          type: 'load_shed_event',
          event: 'WARNING',
          frequency: +smoothedFreq.toFixed(3),
          gridConnected: decision.gridConnected,
          reason: decision.reason,
          timestamp: Date.now()
        })
      } catch (_) {}
    }
  }
}

function initGuardian(broadcastFn, executeMqttFn) {
  if (guardianTimer) return

  console.log(`[Guardian] 安全防御中枢启动`)
  console.log(`[Guardian] 轮询间隔: ${POLL_INTERVAL_MS}ms | 频率阈值: ${FREQUENCY_THRESHOLD}Hz | 恢复阈值: ${FREQUENCY_RECOVERY}Hz`)
  console.log(`[Guardian] 动作冷却: ${COOLDOWN_MS}ms`)
  console.log(`[Guardian] 可切除负荷清单:`)
  const shedSummary = getShedSummary()
  shedSummary.loads.filter(l => l.shedable).forEach(l => {
    console.log(`[Guardian]   [优先级${l.priority}] ${l.name} (${l.capacity}kW)`)
  })
  console.log('')

  guardianTimer = setInterval(() => {
    try {
      evaluateAndAct(broadcastFn, executeMqttFn)
    } catch (err) {
      console.error('[Guardian] 轮询异常:', err.message)
    }
  }, POLL_INTERVAL_MS)

  if (broadcastFn) {
    broadcastFn({
      type: 'load_shed_event',
      event: 'GUARDIAN_STARTED',
      frequencyThreshold: FREQUENCY_THRESHOLD,
      frequencyRecovery: FREQUENCY_RECOVERY,
      pollInterval: POLL_INTERVAL_MS,
      shedSummary: getShedSummary(),
      timestamp: Date.now()
    })
  }
}

function stopGuardian() {
  if (guardianTimer) {
    clearInterval(guardianTimer)
    guardianTimer = null
  }
  if (cooldownTimer) {
    clearTimeout(cooldownTimer)
    cooldownTimer = null
  }
  console.log('[Guardian] 安全防御中枢已停止')
}

function triggerTestIsland() {
  console.log('[Guardian] 测试：触发主电网断开 + 频率暴跌')
  setSystemFrequency(49.2, true)
  topology.nodes.filter(n => n.type === 'load').forEach(n => {
    const existing = nodeStates.get(n.id) || {}
    nodeStates.set(n.id, {
      ...existing,
      loadRate: 0.95,
      lastSeen: Date.now()
    })
  })
  topology.nodes.filter(n => n.isGenerator).forEach(n => {
    const existing = nodeStates.get(n.id) || {}
    nodeStates.set(n.id, {
      ...existing,
      loadRate: 0.35,
      lastSeen: Date.now()
    })
  })
}

function restoreTest() {
  console.log('[Guardian] 测试：恢复主电网连接')
  setSystemFrequency(50.1, false)
  topology.nodes.filter(n => n.type === 'load').forEach(n => {
    markLoadRestore(n.id)
  })
}

export {
  initGuardian,
  stopGuardian,
  ingestTelemetry,
  setSystemFrequency,
  getGuardianState,
  getSmoothedFrequency,
  triggerTestIsland,
  restoreTest
}
