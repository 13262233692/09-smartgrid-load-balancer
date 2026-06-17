import express from 'express'
import http from 'http'
import { initInfluxDB, writeTelemetry } from './influxdb.js'
import { initMQTT } from './mqttClient.js'
import { initWebSocket, broadcastLoadRate, broadcastFlowData } from './websocket.js'
import { initAPI } from './api.js'
import { initSimulator } from './simulator.js'

const PORT = process.env.PORT || 3000
const WS_PORT = process.env.WS_PORT || 8080
const SIMULATION_MODE = process.env.SIMULATION_MODE !== 'false'

async function main() {
  console.log('========================================')
  console.log('  区域智能微电网管理看板 - 后端服务')
  console.log('========================================')
  console.log(`  HTTP 端口: ${PORT}`)
  console.log(` WebSocket 端口: ${WS_PORT}`)
  console.log(` 模拟模式: ${SIMULATION_MODE ? '开启' : '关闭'}`)
  console.log('========================================\n')

  initInfluxDB(SIMULATION_MODE)

  const app = express()
  initAPI(app)

  const server = http.createServer(app)
  server.listen(WS_PORT, () => {
    console.log(`[HTTP] WebSocket 服务监听端口 ${WS_PORT}`)
  })

  initWebSocket(server)

  function handleTelemetry(data) {
    writeTelemetry(data)
    broadcastLoadRate(data)
  }

  function handleFlowData(flows) {
    broadcastFlowData(flows)
  }

  if (SIMULATION_MODE) {
    initSimulator(handleTelemetry, handleFlowData)
  } else {
    initMQTT(handleTelemetry)
  }

  app.listen(PORT, () => {
    console.log(`[HTTP] API 服务监听端口 ${PORT}`)
    console.log(`[HTTP] 健康检查: http://localhost:${PORT}/api/health`)
    console.log(`[HTTP] 拓扑数据:   http://localhost:${PORT}/api/topology`)
    console.log(`[WS]   WebSocket:  ws://localhost:${WS_PORT}`)
    console.log('\n系统启动完成 ✓\n')
  })
}

main().catch((err) => {
  console.error('启动失败:', err)
  process.exit(1)
})
