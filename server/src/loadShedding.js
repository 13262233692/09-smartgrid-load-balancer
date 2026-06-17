import { topology } from './topology.js'

const FREQUENCY_NOMINAL = 50.0
const FREQUENCY_THRESHOLD = 49.5
const FREQUENCY_RECOVERY = 49.8
const POWER_IMBALANCE_COEFFICIENT = 8.0
const MIN_SHED_MARGIN = 1.15

const shedHistory = []
const shedStatus = new Map()

function getNodeById(id) {
  return topology.nodes.find(n => n.id === id)
}

function getShedableLoads(nodeStates) {
  return topology.nodes
    .filter(n => n.type === 'load' && n.shedable)
    .map(n => {
      const state = nodeStates.get(n.id) || {}
      const currentLoad = state.loadRate !== undefined
        ? n.capacity * state.loadRate
        : n.capacity * 0.6
      const isShed = shedStatus.get(n.id) || false
      return {
        id: n.id,
        name: n.name,
        priority: n.priority,
        capacity: n.capacity,
        currentLoad: Math.max(0, currentLoad),
        isShed,
        description: n.description
      }
    })
    .filter(l => !l.isShed)
    .sort((a, b) => a.priority - b.priority)
}

function getTotalGeneration(nodeStates) {
  let total = 0
  topology.nodes.forEach(n => {
    if (n.isGenerator) {
      const state = nodeStates.get(n.id) || {}
      const loadRate = state.loadRate !== undefined ? state.loadRate : 0.5
      const output = n.capacity * loadRate
      if (n.type === 'battery') {
        total += output * (n.soc || 0.7)
      } else {
        total += output
      }
    }
  })
  return total
}

function getTotalConnectedLoad(nodeStates) {
  let total = 0
  topology.nodes.forEach(n => {
    if (n.type === 'load') {
      const isShed = shedStatus.get(n.id) || false
      if (!isShed) {
        const state = nodeStates.get(n.id) || {}
        const loadRate = state.loadRate !== undefined ? state.loadRate : 0.6
        total += n.capacity * loadRate
      }
    }
  })
  return total
}

function isGridConnected(nodeStates) {
  const gridNode = topology.nodes.find(n => n.isMainGrid)
  if (!gridNode) return true
  const state = nodeStates.get(gridNode.id)
  if (!state) return true
  if (state.isConnected === false) return false
  if (state.loadRate !== undefined && state.loadRate <= 0.01) return false
  return state.isConnected !== false
}

function calculateRequiredShed(currentFrequency, totalGeneration, totalLoad) {
  if (currentFrequency >= FREQUENCY_THRESHOLD) return 0
  const frequencyDrop = FREQUENCY_NOMINAL - currentFrequency
  const estimatedImbalance = frequencyDrop * POWER_IMBALANCE_COEFFICIENT
  const actualDeficit = Math.max(0, totalLoad - totalGeneration)
  const required = Math.max(estimatedImbalance, actualDeficit)
  return required * MIN_SHED_MARGIN
}

function selectOptimalShedPlan(shedableLoads, requiredCapacity) {
  if (requiredCapacity <= 0 || shedableLoads.length === 0) {
    return { selected: [], totalShed: 0 }
  }

  const n = shedableLoads.length
  const capacity = Math.ceil(requiredCapacity)

  const dp = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(Infinity))
  const take = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(false))
  dp[0][0] = 0

  for (let i = 1; i <= n; i++) {
    const load = shedableLoads[i - 1]
    const loadCap = Math.ceil(load.currentLoad)
    const priorityCost = 100 - load.priority

    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w]
      take[i][w] = false
    }

    for (let w = 0; w <= capacity; w++) {
      if (dp[i - 1][w] !== Infinity) {
        const newW = Math.min(capacity, w + loadCap)
        const newCost = dp[i - 1][w] + priorityCost
        if (newCost < dp[i][newW]) {
          dp[i][newW] = newCost
          take[i][newW] = true
        }
      }
    }
  }

  const selected = []
  let w = capacity
  for (let i = n; i >= 1; i--) {
    if (take[i][w]) {
      selected.push(shedableLoads[i - 1])
      const loadCap = Math.ceil(shedableLoads[i - 1].currentLoad)
      w = Math.max(0, w - loadCap)
    }
  }

  const totalShed = selected.reduce((sum, l) => sum + l.currentLoad, 0)
  return {
    selected: selected.sort((a, b) => a.priority - b.priority),
    totalShed
  }
}

function evaluateLoadShedDecision(nodeStates, currentFrequency) {
  const gridConnected = isGridConnected(nodeStates)
  const totalGeneration = getTotalGeneration(nodeStates)
  const totalLoad = getTotalConnectedLoad(nodeStates)
  const shedable = getShedableLoads(nodeStates)

  const decision = {
    timestamp: Date.now(),
    gridConnected,
    currentFrequency,
    totalGeneration: +totalGeneration.toFixed(1),
    totalLoad: +totalLoad.toFixed(1),
    powerDeficit: +(totalLoad - totalGeneration).toFixed(1),
    shedableCount: shedable.length,
    shedableCapacity: +shedable.reduce((s, l) => s + l.currentLoad, 0).toFixed(1),
    action: 'none',
    plan: null
  }

  if (gridConnected) {
    decision.reason = '主电网连接正常，无需甩负荷'
    return decision
  }

  if (currentFrequency >= FREQUENCY_THRESHOLD) {
    decision.reason = `频率 ${currentFrequency.toFixed(2)}Hz 高于阈值 ${FREQUENCY_THRESHOLD}Hz，无需甩负荷`
    return decision
  }

  const required = calculateRequiredShed(currentFrequency, totalGeneration, totalLoad)

  if (required <= 0) {
    decision.reason = '计算结果无需切除负荷'
    return decision
  }

  decision.requiredShed = +required.toFixed(1)

  const plan = selectOptimalShedPlan(shedable, required)

  if (plan.selected.length === 0) {
    decision.action = 'warning'
    decision.reason = '无可切除负荷！系统即将失稳'
    return decision
  }

  if (plan.totalShed < required * 0.8) {
    decision.action = 'warning'
    decision.reason = `可切除容量不足：需要 ${required.toFixed(1)}kW，仅能切除 ${plan.totalShed.toFixed(1)}kW`
    decision.plan = plan
    return decision
  }

  decision.action = 'shed'
  decision.reason = `孤岛模式，频率 ${currentFrequency.toFixed(2)}Hz 跌破阈值，启动紧急甩负荷`
  decision.plan = {
    selected: plan.selected.map(l => ({
      id: l.id,
      name: l.name,
      priority: l.priority,
      shedLoad: +l.currentLoad.toFixed(1),
      description: l.description
    })),
    totalShed: +plan.totalShed.toFixed(1)
  }
  decision.expectedFrequency = +(currentFrequency + (plan.totalShed / POWER_IMBALANCE_COEFFICIENT)).toFixed(2)

  return decision
}

function markLoadShed(nodeId) {
  shedStatus.set(nodeId, true)
  const node = getNodeById(nodeId)
  shedHistory.unshift({
    timestamp: Date.now(),
    nodeId,
    nodeName: node ? node.name : nodeId,
    action: 'shed'
  })
  if (shedHistory.length > 200) shedHistory.pop()
}

function markLoadRestore(nodeId) {
  shedStatus.set(nodeId, false)
  const node = getNodeById(nodeId)
  shedHistory.unshift({
    timestamp: Date.now(),
    nodeId,
    nodeName: node ? node.name : nodeId,
    action: 'restore'
  })
  if (shedHistory.length > 200) shedHistory.pop()
}

function isLoadShed(nodeId) {
  return shedStatus.get(nodeId) || false
}

function getShedHistory() {
  return shedHistory.slice()
}

function getShedSummary() {
  const shedLoads = topology.nodes
    .filter(n => n.type === 'load')
    .map(n => ({
      id: n.id,
      name: n.name,
      shedable: n.shedable,
      priority: n.priority,
      capacity: n.capacity,
      isShed: isLoadShed(n.id)
    }))

  return {
    totalLoads: shedLoads.length,
    shedCount: shedLoads.filter(l => l.isShed).length,
    activeCount: shedLoads.filter(l => !l.isShed).length,
    loads: shedLoads,
    frequencyThreshold: FREQUENCY_THRESHOLD,
    frequencyRecovery: FREQUENCY_RECOVERY,
    frequencyNominal: FREQUENCY_NOMINAL
  }
}

export {
  FREQUENCY_NOMINAL,
  FREQUENCY_THRESHOLD,
  FREQUENCY_RECOVERY,
  evaluateLoadShedDecision,
  markLoadShed,
  markLoadRestore,
  isLoadShed,
  getShedHistory,
  getShedSummary,
  isGridConnected
}
