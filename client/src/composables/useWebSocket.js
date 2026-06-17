import { ref, shallowRef } from 'vue'

const RECONNECT_DELAY = 3000

const state = {
  loadRates: ref({}),
  flows: ref([]),
  wsConnected: ref(false),
  ws: shallowRef(null),
  reconnectTimer: null,
  manuallyClosed: false,
  connectionGeneration: 0,
  handlers: {
    onopen: null,
    onmessage: null,
    onclose: null,
    onerror: null
  }
}

function clearReconnectTimer() {
  if (state.reconnectTimer) {
    clearTimeout(state.reconnectTimer)
    state.reconnectTimer = null
  }
}

function detachCurrentWSListeners() {
  const ws = state.ws.value
  if (!ws) return

  if (state.handlers.onopen) {
    try { ws.removeEventListener('open', state.handlers.onopen) } catch (_) {}
    state.handlers.onopen = null
  }
  if (state.handlers.onmessage) {
    try { ws.removeEventListener('message', state.handlers.onmessage) } catch (_) {}
    state.handlers.onmessage = null
  }
  if (state.handlers.onclose) {
    try { ws.removeEventListener('close', state.handlers.onclose) } catch (_) {}
    state.handlers.onclose = null
  }
  if (state.handlers.onerror) {
    try { ws.removeEventListener('error', state.handlers.onerror) } catch (_) {}
    state.handlers.onerror = null
  }
}

function destroyCurrentWS() {
  const ws = state.ws.value
  if (!ws) return

  detachCurrentWSListeners()

  try {
    if (ws.readyState === 0 || ws.readyState === 1) {
      ws.close(1000, 'Normal closure')
    }
  } catch (_) {}

  state.ws.value = null
}

function scheduleReconnect() {
  if (state.manuallyClosed) return
  if (state.reconnectTimer) return

  state.reconnectTimer = setTimeout(() => {
    state.reconnectTimer = null
    if (!state.manuallyClosed) {
      connectWebSocket()
    }
  }, RECONNECT_DELAY)
}

function handleMessage(event) {
  let message
  try {
    message = JSON.parse(event.data)
  } catch (e) {
    console.error('[WebSocket] 消息解析失败:', e)
    return
  }

  if (message.type === 'snapshot') {
    state.loadRates.value = { ...message.data }
  } else if (message.type === 'telemetry') {
    state.loadRates.value = {
      ...state.loadRates.value,
      [message.data.deviceId]: message.data
    }
  } else if (message.type === 'flow') {
    state.flows.value = message.data
  }
}

function connectWebSocket() {
  if (state.manuallyClosed) {
    state.manuallyClosed = false
  }

  if (state.ws.value) {
    destroyCurrentWS()
  }

  clearReconnectTimer()

  state.connectionGeneration++
  const myGeneration = state.connectionGeneration

  let wsUrl
  if (import.meta.env.DEV) {
    wsUrl = 'ws://localhost:8080'
  } else {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const host = window.location.host
    wsUrl = `${protocol}//${host}/ws`
  }

  let ws
  try {
    ws = new WebSocket(wsUrl)
  } catch (e) {
    console.error('[WebSocket] 创建失败:', e)
    scheduleReconnect()
    return
  }

  state.ws.value = ws

  state.handlers.onopen = function onOpenHandler() {
    if (state.connectionGeneration !== myGeneration) return
    if (state.manuallyClosed) return
    console.log('[WebSocket] 已连接')
    state.wsConnected.value = true
    clearReconnectTimer()
  }

  state.handlers.onmessage = function onMessageHandler(event) {
    if (state.connectionGeneration !== myGeneration) return
    if (state.manuallyClosed) return
    handleMessage(event)
  }

  state.handlers.onclose = function onCloseHandler() {
    if (state.connectionGeneration !== myGeneration) return
    console.log('[WebSocket] 连接已关闭')
    state.wsConnected.value = false

    if (state.ws.value === ws) {
      detachCurrentWSListeners()
      state.ws.value = null
    }

    if (!state.manuallyClosed) {
      scheduleReconnect()
    }
  }

  state.handlers.onerror = function onErrorHandler(err) {
    if (state.connectionGeneration !== myGeneration) return
    console.error('[WebSocket] 错误:', err)
    state.wsConnected.value = false
  }

  ws.addEventListener('open', state.handlers.onopen)
  ws.addEventListener('message', state.handlers.onmessage)
  ws.addEventListener('close', state.handlers.onclose)
  ws.addEventListener('error', state.handlers.onerror)
}

function disconnectWebSocket() {
  state.manuallyClosed = true
  clearReconnectTimer()
  state.connectionGeneration++
  destroyCurrentWS()
  state.wsConnected.value = false
}

export function useWebSocket() {
  return {
    loadRates: state.loadRates,
    flows: state.flows,
    wsConnected: state.wsConnected,
    connectWebSocket,
    disconnectWebSocket
  }
}
