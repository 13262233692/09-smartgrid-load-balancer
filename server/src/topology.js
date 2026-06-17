const topology = {
  nodes: [
    { id: 'GRID-001', name: '主电网', type: 'grid', x: 600, y: 100 },
    { id: 'SUB-001', name: '1号变电站', type: 'substation', x: 300, y: 250 },
    { id: 'SUB-002', name: '2号变电站', type: 'substation', x: 900, y: 250 },
    { id: 'PV-001', name: '光伏阵列A', type: 'inverter', x: 150, y: 420 },
    { id: 'PV-002', name: '光伏阵列B', type: 'inverter', x: 450, y: 420 },
    { id: 'PV-003', name: '光伏阵列C', type: 'inverter', x: 750, y: 420 },
    { id: 'PV-004', name: '光伏阵列D', type: 'inverter', x: 1050, y: 420 },
    { id: 'LOAD-001', name: '工业负荷区1', type: 'load', x: 200, y: 580 },
    { id: 'LOAD-002', name: '工业负荷区2', type: 'load', x: 500, y: 580 },
    { id: 'LOAD-003', name: '商业负荷区', type: 'load', x: 800, y: 580 },
    { id: 'LOAD-004', name: '居民负荷区', type: 'load', x: 1100, y: 580 },
    { id: 'BATT-001', name: '储能站1', type: 'battery', x: 600, y: 420 }
  ],
  links: [
    { source: 'GRID-001', target: 'SUB-001', capacity: 1000, direction: 'bidirectional' },
    { source: 'GRID-001', target: 'SUB-002', capacity: 1000, direction: 'bidirectional' },
    { source: 'SUB-001', target: 'PV-001', capacity: 500, direction: 'unidirectional' },
    { source: 'SUB-001', target: 'PV-002', capacity: 500, direction: 'unidirectional' },
    { source: 'SUB-002', target: 'PV-003', capacity: 500, direction: 'unidirectional' },
    { source: 'SUB-002', target: 'PV-004', capacity: 500, direction: 'unidirectional' },
    { source: 'SUB-001', target: 'BATT-001', capacity: 300, direction: 'bidirectional' },
    { source: 'SUB-002', target: 'BATT-001', capacity: 300, direction: 'bidirectional' },
    { source: 'PV-001', target: 'LOAD-001', capacity: 400, direction: 'unidirectional' },
    { source: 'PV-002', target: 'LOAD-002', capacity: 400, direction: 'unidirectional' },
    { source: 'BATT-001', target: 'LOAD-002', capacity: 200, direction: 'unidirectional' },
    { source: 'PV-003', target: 'LOAD-003', capacity: 400, direction: 'unidirectional' },
    { source: 'PV-004', target: 'LOAD-004', capacity: 400, direction: 'unidirectional' },
    { source: 'BATT-001', target: 'LOAD-003', capacity: 200, direction: 'unidirectional' }
  ]
}

const nodeTypes = {
  grid: { label: '主电网', color: '#3b82f6' },
  substation: { label: '变电站', color: '#8b5cf6' },
  inverter: { label: '光伏逆变器', color: '#22c55e' },
  load: { label: '负荷', color: '#f97316' },
  battery: { label: '储能', color: '#06b6d4' }
}

export { topology, nodeTypes }
