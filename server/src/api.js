import express from 'express'
import cors from 'cors'
import { topology, nodeTypes } from './topology.js'
import { getClientCount } from './websocket.js'
import { getGuardianState } from './guardian.js'
import { getSimulatorState, triggerIslandEvent, restoreGridEvent } from './simulator.js'
import { isMQTTConnected } from './mqttClient.js'

function initAPI(app) {
  app.use(cors())
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      wsClients: getClientCount(),
      mqttConnected: isMQTTConnected()
    })
  })

  app.get('/api/topology', (req, res) => {
    res.json({
      nodes: topology.nodes.map(n => ({
      ...n,
      typeInfo: nodeTypes[n.type]
    })),
    links: topology.links
    })
  })

  app.get('/api/nodes', (req, res) => {
    res.json(topology.nodes)
  })

  app.get('/api/nodes/:id', (req, res) => {
    const node = topology.nodes.find(n => n.id === req.params.id)
    if (!node) {
      res.status(404).json({ error: '节点不存在' })
    } else {
      res.json(node)
    }
  })

  app.get('/api/links', (req, res) => {
    res.json(topology.links)
  })

  app.get('/api/node-types', (req, res) => {
    res.json(nodeTypes)
  })

  app.get('/api/guardian/state', (req, res) => {
    res.json(getGuardianState())
  })

  app.get('/api/simulator/state', (req, res) => {
    res.json(getSimulatorState())
  })

  app.post('/api/simulator/trigger-island', (req, res) => {
    triggerIslandEvent()
    res.json({ ok: true, message: '已手动触发孤岛模式' })
  })

  app.post('/api/simulator/restore-grid', (req, res) => {
    restoreGridEvent()
    res.json({ ok: true, message: '已手动恢复主电网' })
  })

  console.log('[API] REST API 已初始化')
}

export { initAPI }
