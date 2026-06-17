<template>
  <div class="dashboard">
    <header class="dashboard-header">
      <div class="header-left">
        <h1 class="title">
          <span class="icon">⚡</span>
          区域智能微电网管理看板
        </h1>
        <span class="subtitle">Smart Microgrid Management Dashboard</span>
      </div>
      <div class="header-right">
        <div class="status-badge" :class="{ connected: wsConnected }">
          <span class="dot"></span>
          {{ wsConnected ? '实时连接' : '连接断开' }}
        </div>
        <div class="time-display">{{ currentTime }}</div>
      </div>
    </header>

    <div class="dashboard-main">
      <aside class="sidebar left-sidebar">
        <div class="panel">
          <h3 class="panel-title">节点类型图例</h3>
          <div class="legend-list">
            <div v-for="(info, type) in nodeTypes" :key="type" class="legend-item">
              <span class="legend-dot" :style="{ background: info.color }"></span>
              <span class="legend-label">{{ info.label }}</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">负载率状态</h3>
          <div class="load-status">
            <div class="load-level"><span class="load-dot low"></span><span>正常 0-60%</span></div>
            <div class="load-level"><span class="load-dot medium"></span><span>预警 60-85%</span></div>
            <div class="load-level"><span class="load-dot high"></span><span>告警 >85%</span></div>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">全网统计</h3>
          <div class="stats-grid">
            <div class="stat-item">
              <span class="stat-value">{{ stats.totalNodes }}</span>
              <span class="stat-label">节点总数</span>
            </div>
            <div class="stat-item">
              <span class="stat-value">{{ stats.normalCount }}</span>
              <span class="stat-label">正常运行</span>
            </div>
            <div class="stat-item warning">
              <span class="stat-value">{{ stats.warningCount }}</span>
              <span class="stat-label">预警节点</span>
            </div>
            <div class="stat-item danger">
              <span class="stat-value">{{ stats.alertCount }}</span>
              <span class="stat-label">告警节点</span>
            </div>
          </div>
        </div>
      </aside>

      <main class="main-content">
        <TopologyGraph
          :key="topologyGraphKey"
          :nodes="nodes"
          :links="links"
          :load-rates="loadRates"
          :flows="flows"
          @node-click="handleNodeClick"
        />
      </main>

      <aside class="sidebar right-sidebar">
        <div class="panel node-detail" v-if="selectedNode">
          <h3 class="panel-title">节点详情</h3>
          <div class="detail-row">
            <span class="detail-label">ID</span>
            <span class="detail-value">{{ selectedNode.id }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">名称</span>
            <span class="detail-value">{{ selectedNode.name }}</span>
          </div>
          <div class="detail-row">
            <span class="detail-label">类型</span>
            <span class="detail-value">{{ nodeTypes[selectedNode.type]?.label || selectedNode.type }}</span>
          </div>
          <div class="detail-row" v-if="loadRates[selectedNode.id]">
            <span class="detail-label">负载率</span>
            <span class="detail-value load-value" :class="getLoadClass(loadRates[selectedNode.id].loadRate)">
              {{ (loadRates[selectedNode.id].loadRate * 100).toFixed(1) }}%
            </span>
          </div>
          <div class="detail-row" v-if="loadRates[selectedNode.id]">
            <span class="detail-label">电压</span>
            <span class="detail-value">{{ loadRates[selectedNode.id].voltage?.toFixed(3) }} kV</span>
          </div>
          <div class="detail-row" v-if="loadRates[selectedNode.id]">
            <span class="detail-label">电流</span>
            <span class="detail-value">{{ loadRates[selectedNode.id].current?.toFixed(2) }} A</span>
          </div>
        </div>

        <div class="panel">
          <h3 class="panel-title">节点负载排行</h3>
          <div class="rank-list">
            <div
              v-for="item in sortedLoadRates"
              :key="item.id"
              class="rank-item"
              :class="{ selected: selectedNode?.id === item.id }"
              @click="selectNode(item.id)"
            >
              <span class="rank-name">{{ getNodeName(item.id) }}</span>
              <div class="rank-bar-wrap">
                <div
                  class="rank-bar"
                  :class="getLoadClass(item.loadRate)"
                  :style="{ width: (item.loadRate * 100) + '%' }"
                ></div>
              </div>
              <span class="rank-value" :class="getLoadClass(item.loadRate)">
                {{ (item.loadRate * 100).toFixed(1) }}%
              </span>
            </div>
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onBeforeUnmount, onMounted, markRaw } from 'vue'
import TopologyGraph from './components/TopologyGraph.vue'
import { useTopology } from './composables/useTopology.js'
import { useWebSocket } from './composables/useWebSocket.js'

const { nodes, links, nodeTypes, fetchTopology } = useTopology()
const { loadRates, flows, wsConnected, connectWebSocket, disconnectWebSocket } = useWebSocket()

const selectedNode = ref(null)
const currentTime = ref('')
const topologyGraphKey = ref(0)
let timeTimer = null
let timeUpdateFn = null

const stats = computed(() => {
  const loadArr = Object.values(loadRates.value)
  return {
    totalNodes: nodes.value.length,
    normalCount: loadArr.filter(d => d.loadRate < 0.6).length,
    warningCount: loadArr.filter(d => d.loadRate >= 0.6 && d.loadRate < 0.85).length,
    alertCount: loadArr.filter(d => d.loadRate >= 0.85).length
  }
})

const sortedLoadRates = computed(() => {
  return Object.entries(loadRates.value)
    .map(([id, data]) => ({ id, loadRate: data.loadRate }))
    .sort((a, b) => b.loadRate - a.loadRate)
    .slice(0, 10)
})

function getLoadClass(loadRate) {
  if (loadRate >= 0.85) return 'high'
  if (loadRate >= 0.6) return 'medium'
  return 'low'
}

function getNodeName(id) {
  const node = nodes.value.find(n => n.id === id)
  return node ? node.name : id
}

function handleNodeClick(node) {
  selectedNode.value = node
}

function selectNode(id) {
  const node = nodes.value.find(n => n.id === id)
  if (node) selectedNode.value = node
}

function destroyTimeTimer() {
  if (timeTimer) {
    clearInterval(timeTimer)
    timeTimer = null
  }
  timeUpdateFn = null
}

function createTimeUpdater() {
  destroyTimeTimer()
  timeUpdateFn = markRaw(function() {
    const now = new Date()
    currentTime.value = now.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  })
  if (timeUpdateFn) timeUpdateFn()
  timeTimer = setInterval(() => {
    if (timeUpdateFn) timeUpdateFn()
  }, 1000)
}

onMounted(async () => {
  await fetchTopology()
  topologyGraphKey.value++
  connectWebSocket()
  createTimeUpdater()

  window.addEventListener('beforeunload', handleBeforeUnload)
})

function handleBeforeUnload() {
  try {
    disconnectWebSocket()
    destroyTimeTimer()
  } catch (_) {}
}

onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', handleBeforeUnload)
  disconnectWebSocket()
  destroyTimeTimer()
  selectedNode.value = null
  topologyGraphKey.value++
})
</script>

<style scoped>
.dashboard {
  display: flex;
  flex-direction: column;
  width: 100%;
  height: 100%;
  background: linear-gradient(135deg, #0a0f1a 0%, #0f172a 100%);
}

.dashboard-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 28px;
  background: rgba(15, 23, 42, 0.9);
  border-bottom: 1px solid rgba(59, 130, 246, 0.3);
  box-shadow: 0 2px 20px rgba(0, 0, 0, 0.3);
}

.header-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.title {
  font-size: 22px;
  font-weight: 700;
  color: #f1f5f9;
  display: flex;
  align-items: center;
  gap: 10px;
  letter-spacing: 1px;
}

.title .icon {
  color: #fbbf24;
  font-size: 26px;
}

.subtitle {
  font-size: 12px;
  color: #64748b;
  letter-spacing: 2px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 24px;
}

.status-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 14px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 20px;
  font-size: 13px;
  color: #f87171;
}

.status-badge.connected {
  background: rgba(34, 197, 94, 0.15);
  border-color: rgba(34, 197, 94, 0.4);
  color: #4ade80;
}

.status-badge .dot {
  width: 8px;
  height: 8px;
  background: currentColor;
  border-radius: 50%;
  animation: pulse-dot 2s ease-in-out infinite;
}

@keyframes pulse-dot {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}

.time-display {
  font-size: 14px;
  color: #94a3b8;
  font-family: 'Courier New', monospace;
}

.dashboard-main {
  display: flex;
  flex: 1;
  overflow: hidden;
}

.sidebar {
  width: 280px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  overflow-y: auto;
  background: rgba(15, 23, 42, 0.5);
}

.left-sidebar {
  border-right: 1px solid rgba(59, 130, 246, 0.15);
}

.right-sidebar {
  border-left: 1px solid rgba(59, 130, 246, 0.15);
}

.panel {
  background: rgba(30, 41, 59, 0.6);
  border: 1px solid rgba(71, 85, 105, 0.4);
  border-radius: 10px;
  padding: 16px;
  backdrop-filter: blur(10px);
}

.panel-title {
  font-size: 14px;
  font-weight: 600;
  color: #cbd5e1;
  margin-bottom: 14px;
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(100, 116, 139, 0.3);
  letter-spacing: 0.5px;
}

.legend-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #94a3b8;
}

.legend-dot {
  width: 14px;
  height: 14px;
  border-radius: 3px;
  box-shadow: 0 0 8px currentColor;
}

.load-status {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.load-level {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: #94a3b8;
}

.load-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.load-dot.low { background: #22c55e; box-shadow: 0 0 10px #22c55e; }
.load-dot.medium { background: #eab308; box-shadow: 0 0 10px #eab308; }
.load-dot.high { background: #ef4444; box-shadow: 0 0 10px #ef4444; }

.stats-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.stat-item {
  text-align: center;
  padding: 12px 8px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 8px;
  border: 1px solid rgba(71, 85, 105, 0.3);
}

.stat-item.warning { border-color: rgba(234, 179, 8, 0.4); }
.stat-item.danger { border-color: rgba(239, 68, 68, 0.4); }

.stat-value {
  display: block;
  font-size: 24px;
  font-weight: 700;
  color: #e2e8f0;
}

.stat-item.warning .stat-value { color: #fbbf24; }
.stat-item.danger .stat-value { color: #f87171; }

.stat-label {
  font-size: 11px;
  color: #64748b;
  margin-top: 4px;
}

.main-content {
  flex: 1;
  position: relative;
  overflow: hidden;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(71, 85, 105, 0.2);
  font-size: 13px;
}

.detail-label {
  color: #64748b;
}

.detail-value {
  color: #e2e8f0;
  font-weight: 500;
}

.load-value.low { color: #4ade80; }
.load-value.medium { color: #fbbf24; }
.load-value.high { color: #f87171; }

.rank-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.rank-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 10px;
  background: rgba(15, 23, 42, 0.4);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.2s;
  border: 1px solid transparent;
}

.rank-item:hover {
  background: rgba(30, 41, 59, 0.8);
  border-color: rgba(59, 130, 246, 0.3);
}

.rank-item.selected {
  border-color: rgba(59, 130, 246, 0.6);
  background: rgba(59, 130, 246, 0.1);
}

.rank-name {
  font-size: 12px;
  color: #cbd5e1;
  width: 80px;
  flex-shrink: 0;
}

.rank-bar-wrap {
  flex: 1;
  height: 6px;
  background: rgba(71, 85, 105, 0.4);
  border-radius: 3px;
  overflow: hidden;
}

.rank-bar {
  height: 100%;
  border-radius: 3px;
  transition: width 0.3s ease;
}

.rank-bar.low { background: linear-gradient(90deg, #22c55e, #4ade80); }
.rank-bar.medium { background: linear-gradient(90deg, #ca8a04, #eab308); }
.rank-bar.high { background: linear-gradient(90deg, #dc2626, #ef4444); }

.rank-value {
  font-size: 12px;
  font-weight: 600;
  width: 50px;
  text-align: right;
}

.rank-value.low { color: #4ade80; }
.rank-value.medium { color: #fbbf24; }
.rank-value.high { color: #f87171; }

.sidebar::-webkit-scrollbar {
  width: 6px;
}

.sidebar::-webkit-scrollbar-track {
  background: transparent;
}

.sidebar::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.4);
  border-radius: 3px;
}
</style>
