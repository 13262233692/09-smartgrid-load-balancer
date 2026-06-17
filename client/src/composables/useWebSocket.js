import { ref } from 'vue'

const loadRates = ref({})
const flows = ref([])
const wsConnected = ref(false)

let ws = null
let reconnectTimer = null
const RECONNECT_DELAY = 3000

function connectWebSocket() {
  let wsUrl
  if (import.meta.env.DEV) {
    wsUrl = 'ws://localhost:8080'
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    wsUrl = `${protocol}//${host}/ws`
  }

  try {
    ws = new WebSocket(wsUrl)
  } catch (e) {
    console.error('[WebSocket] 创建失败:', e)
    scheduleReconnect()
    return
  }

  ws.onopen = () => {
    console.log('[WebSocket] 已连接')
    wsConnected.value = true
    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }
  }

  ws.onmessage = (event) => {
    try {
      const message = JSON.parse(event.data)
      if (message.type === 'snapshot') {
        loadRates.value = { ...message.data }
      } else if (message.type === 'telemetry') {
        loadRates.value = {
          ...loadRates.value,
          [message.data.deviceId]: message.data
        }
      } else if (message.type === 'flow') {
        flows.value = message.data
      }
    } catch (e) {
      console.error('WebSocket 消息解析失败:', e)
    }
  }

  ws.onclose = () => {
    console.log('[WebSocket] 连接已关闭')
    wsConnected.value = false
    scheduleReconnect()
  }

  ws.onerror = (err) => {
    console.error('[WebSocket] 错误:', err)
    wsConnected.value = false
  }
}

function scheduleReconnect() {
  if (reconnectTimer) return
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null
    connectWebSocket()
  }, RECONNECT_DELAY)
}

function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer)
    reconnectTimer = null
  }
  if (ws) {
    ws.close()
    ws = null
  }
  wsConnected.value = false
}

export function useWebSocket() {
  return {
    loadRates,
    flows,
    wsConnected,
    connectWebSocket,
    disconnectWebSocket
  }
}
