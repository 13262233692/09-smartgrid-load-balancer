import { ref } from 'vue'

const nodes = ref([])
const links = ref([])
const nodeTypes = ref({})

async function fetchTopology() {
  try {
    const response = await fetch('/api/topology')
    const data = await response.json()
    nodes.value = data.nodes
    links.value = data.links
    const typeResponse = await fetch('/api/node-types')
    nodeTypes.value = await typeResponse.json()
  } catch (error) {
    console.error('获取拓扑数据失败:', error)
    nodes.value = []
    links.value = []
  }
}

export function useTopology() {
  return {
    nodes,
    links,
    nodeTypes,
    fetchTopology
  }
}
