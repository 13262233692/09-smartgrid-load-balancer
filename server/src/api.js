import express from 'express'
import cors from 'cors'
import { topology, nodeTypes } from './topology.js'
import { getClientCount } from './websocket.js'

function initAPI(app) {
  app.use(cors())
  app.use(express.json())

  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      wsClients: getClientCount()
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

  console.log('[API] REST API 已初始化')
}

export { initAPI }
