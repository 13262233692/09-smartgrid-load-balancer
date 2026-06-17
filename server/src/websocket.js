import { WebSocketServer } from 'ws'

let wss = null
const clients = new Set()
const latestLoadRates = new Map()

function initWebSocket(server) {
  wss = new WebSocketServer({ server })

  wss.on('connection', (ws) => {
    console.log(`[WebSocket] 新客户端已连接，当前连接数: ${clients.size + 1}`)
    clients.add(ws)

    const snapshot = {}
    latestLoadRates.forEach((value, key) => {
      snapshot[key] = value
    })
    ws.send(JSON.stringify({ type: 'snapshot', data: snapshot }))

    ws.on('close', () => {
      clients.delete(ws)
      console.log(`[WebSocket] 客户端已断开，当前连接数: ${clients.size}`)
    })

    ws.on('error', (err) => {
      console.error('[WebSocket] 错误:', err.message)
    })
  })

  console.log(`[WebSocket] 服务已启动`)
  return wss
}

function broadcastLoadRate(telemetry) {
  const { deviceId, loadRate, voltage, current, timestamp } = telemetry

  const payload = {
    deviceId,
    loadRate,
    voltage,
    current,
    timestamp: timestamp ? timestamp.getTime() : Date.now()
  }

  latestLoadRates.set(deviceId, payload)

  const message = JSON.stringify({
    type: 'telemetry',
    data: payload
  })

  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message)
    }
  })
}

function broadcastFlowData(flowData) {
  const message = JSON.stringify({
    type: 'flow',
    data: flowData
  })

  clients.forEach((client) => {
    if (client.readyState === 1) {
      client.send(message)
    }
  })
}

function broadcastGuardianEvent(eventData) {
  const message = JSON.stringify({
    type: 'guardian',
    data: eventData
  })

  clients.forEach((client) => {
    if (client.readyState === 1) {
      try {
        client.send(message)
      } catch (err) {
        console.error('[WebSocket] 广播 Guardian 事件失败:', err.message)
      }
    }
  })
}

function getClientCount() {
  return clients.size
}

export { initWebSocket, broadcastLoadRate, broadcastFlowData, broadcastGuardianEvent, getClientCount }
