import mqtt from 'mqtt'
import { writeTelemetry } from './influxdb.js'

const config = {
  brokerUrl: process.env.MQTT_BROKER_URL || 'mqtt://localhost:1883',
  username: process.env.MQTT_USERNAME || '',
  password: process.env.MQTT_PASSWORD || '',
  topic: process.env.MQTT_TOPIC || 'smartgrid/telemetry/#'
}

let client = null
let onTelemetryCallback = null

function parseTopic(topic) {
  const parts = topic.split('/')
  return {
    deviceType: parts[2] || 'unknown',
    deviceId: parts[3] || 'unknown'
  }
}

function parsePayload(payload) {
  try {
    const data = JSON.parse(payload.toString())
    return {
      voltage: data.voltage ?? 220 + Math.random() * 20,
      current: data.current ?? 10 + Math.random() * 5,
      phaseAngle: data.phaseAngle ?? Math.random() * 60 - 30,
      loadRate: data.loadRate ?? 0.5,
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date()
    }
  } catch (e) {
    return {
      voltage: 220,
      current: 10,
      phaseAngle: 0,
      loadRate: 0.5,
      timestamp: new Date()
    }
  }
}

function initMQTT(onTelemetry) {
  onTelemetryCallback = onTelemetry

  const options = {}
  if (config.username) options.username = config.username
  if (config.password) options.password = config.password

  client = mqtt.connect(config.brokerUrl, options)

  client.on('connect', () => {
    console.log(`[MQTT] 已连接到 ${config.brokerUrl}`)
    client.subscribe(config.topic, (err) => {
      if (err) {
        console.error('[MQTT] 订阅失败:', err.message)
      } else {
        console.log(`[MQTT] 已订阅主题: ${config.topic}`)
      }
    })
  })

  client.on('message', (topic, payload) => {
    const { deviceId, deviceType } = parseTopic(topic)
    const telemetry = parsePayload(payload)
    const fullData = { deviceId, deviceType, ...telemetry }

    writeTelemetry(fullData)

    if (onTelemetryCallback) {
      onTelemetryCallback(fullData)
    }
  })

  client.on('error', (err) => {
    console.error('[MQTT] 错误:', err.message)
  })

  client.on('close', () => {
    console.log('[MQTT] 连接已关闭')
  })

  return client
}

function publishTestData() {
  if (!client || !client.connected) return null

  const devices = [
    { type: 'substation', id: 'SUB-001' },
    { type: 'substation', id: 'SUB-002' },
    { type: 'inverter', id: 'PV-001' },
    { type: 'inverter', id: 'PV-002' },
    { type: 'inverter', id: 'PV-003' }
  ]

  devices.forEach(({ type, id }) => {
    const topic = `smartgrid/telemetry/${type}/${id}`
    const payload = JSON.stringify({
      voltage: 220 + Math.random() * 20 - 10,
      current: 5 + Math.random() * 20,
      phaseAngle: Math.random() * 40 - 20,
      loadRate: 0.2 + Math.random() * 0.7,
      timestamp: new Date().toISOString()
    })
    client.publish(topic, payload)
  })
}

function publishControlCommand(command) {
  if (!client || !client.connected) {
    console.warn(`[MQTT] 未连接，指令未下发: ${command?.nodeId}`)
    return false
  }

  const { type, nodeId, action } = command || {}
  if (!nodeId || !action) {
    console.error('[MQTT] 无效的控制指令:', command)
    return false
  }

  const topic = `smartgrid/control/${nodeId}`
  const payload = JSON.stringify({
    commandType: type || 'load_shed',
    action,
    nodeId,
    issuedAt: new Date().toISOString(),
    ...command
  })

  client.publish(topic, payload, { qos: 1, retain: false }, (err) => {
    if (err) {
      console.error(`[MQTT] 指令下发失败 [${topic}]:`, err.message)
    } else {
      console.log(`[MQTT] 指令已下发 [${topic}]: action=${action} node=${nodeId}`)
    }
  })
  return true
}

function isMQTTConnected() {
  return !!(client && client.connected)
}

export { initMQTT, publishTestData, publishControlCommand, isMQTTConnected }
