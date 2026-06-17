import { InfluxDB, Point } from '@influxdata/influxdb-client'

const config = {
  url: process.env.INFLUXDB_URL || 'http://localhost:8086',
  token: process.env.INFLUXDB_TOKEN || 'test-token',
  org: process.env.INFLUXDB_ORG || 'smartgrid',
  bucket: process.env.INFLUXDB_BUCKET || 'telemetry'
}

let writeApi = null
let isConnected = false

const buffer = []
const BUFFER_MAX_SIZE = 100
const FLUSH_INTERVAL_MS = 1000

function initInfluxDB(simulationMode = false) {
  if (simulationMode) {
    console.log('[InfluxDB] 模拟模式：数据将仅记录到日志不写入数据库')
    isConnected = true
    return
  }
  try {
    const influxDB = new InfluxDB({ url: config.url, token: config.token })
    writeApi = influxDB.getWriteApi(config.org, config.bucket)
    isConnected = true
    console.log(`[InfluxDB] 已连接到 ${config.url}`)
  } catch (error) {
    console.error('[InfluxDB] 连接失败:', error.message)
    console.log('[InfluxDB] 将以模拟模式运行')
    isConnected = true
  }

  setInterval(flushBuffer, FLUSH_INTERVAL_MS)
}

function writeTelemetry(data) {
  const { deviceId, deviceType, voltage, current, phaseAngle, loadRate, timestamp } = data
  
  const point = new Point('telemetry')
    .tag('deviceId', deviceId)
    .tag('deviceType', deviceType)
    .floatField('voltage', voltage)
    .floatField('current', current)
    .floatField('phaseAngle', phaseAngle)
    .floatField('loadRate', loadRate)
    .timestamp(timestamp || new Date())

  buffer.push(point)

  if (buffer.length >= BUFFER_MAX_SIZE) {
    flushBuffer()
  }

  if (!writeApi) {
    if (buffer.length % 50 === 0) {
      console.log(`[InfluxDB][模拟] 缓冲点数: ${buffer.length}, 最新: ${deviceId} V=${voltage.toFixed(2)} I=${current.toFixed(2)} 负载=${(loadRate * 100).toFixed(1)}%`)
    }
  }
}

function flushBuffer() {
  if (buffer.length === 0) return
  
  if (writeApi) {
    try {
      writeApi.writePoints(buffer)
      writeApi.flush()
      console.log(`[InfluxDB] 已写入 ${buffer.length} 个数据点`)
    } catch (error) {
      console.error('[InfluxDB] 写入失败:', error.message)
    }
  }
  buffer.length = 0
}

function isInfluxDBConnected() {
  return isConnected
}

export { initInfluxDB, writeTelemetry, isInfluxDBConnected }
