# 区域智能微电网管理看板系统

基于 Node.js + Vue3 + D3.js 的智能微电网实时监控与可视化管理系统。

## 系统架构

```
┌─────────────────┐     MQTT      ┌─────────────────┐   WebSocket   ┌─────────────────┐
│  变电站/逆变器   │ ────────────▶ │   Node.js 后端   │ ────────────▶ │   Vue3 + D3.js   │
│  遥测数据发送端  │                │                 │               │   前端可视化看板  │
└─────────────────┘                └────────┬────────┘               └─────────────────┘
                                            │
                                            ▼
                                   ┌─────────────────┐
                                   │   InfluxDB 时序  │
                                   │   数据库存储     │
                                   └─────────────────┘
```

## 功能特性

### 后端 (Node.js)
- **MQTT 协议接入**：实时接收变电站、光伏逆变器的高频遥测数据（电压、电流、相位、负载率）
- **InfluxDB 时序存储**：数据缓冲批量写入，平滑写入时序数据库
- **WebSocket 实时推送**：将实时负载率和能量流向数据推送到前端
- **REST API 接口**：提供拓扑数据、节点信息、健康检查等接口
- **模拟数据生成器**：离线模式下自动生成仿真数据，便于开发测试

### 前端 (Vue3 + D3.js)
- **拓扑 DAG 图可视化**：基于 JSON 配置绘制微电网有向无环图
- **节点动态着色**：根据负载率从绿→黄→红渐变显示状态
- **脉冲动画**：负载率越高脉冲动画速度越快
- **能量流向可视化**：连线上的粒子动画直观展示能量传输
- **节点详情面板**：点击节点查看实时电压、电流、负载率等参数
- **负载率排行榜**：实时展示节点负载排序
- **全网统计**：正常/预警/告警节点数量统计

## 项目结构

```
smartgrid-load-balancer/
├── server/                    # 后端服务
│   ├── src/
│   │   ├── index.js           # 入口文件
│   │   ├── mqttClient.js      # MQTT 客户端
│   │   ├── influxdb.js        # InfluxDB 写入模块
│   │   ├── websocket.js       # WebSocket 服务
│   │   ├── api.js             # REST API 路由
│   │   ├── simulator.js       # 模拟数据生成器
│   │   └── topology.js        # 电网拓扑配置
│   ├── .env.example
│   └── package.json
├── client/                    # 前端应用
│   ├── src/
│   │   ├── components/
│   │   │   └── TopologyGraph.vue   # D3.js 拓扑图组件
│   │   ├── composables/
│   │   │   ├── useTopology.js      # 拓扑数据 Hook
│   │   │   └── useWebSocket.js     # WebSocket 连接 Hook
│   │   ├── App.vue
│   │   ├── main.js
│   │   └── style.css
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
└── package.json
```

## 快速开始

### 安装依赖

```bash
# 根目录安装 concurrently
npm install

# 或分别安装前后端依赖
npm install --prefix server
npm install --prefix client
```

### 启动开发环境

#### 方式一：同时启动前后端（推荐）

```bash
npm run dev
```

#### 方式二：分别启动

```bash
# 启动后端 (端口 3000 + 8080)
npm run dev:server

# 启动前端 (端口 5173)
npm run dev:client
```

启动后访问 **http://localhost:5173** 查看看板。

## 配置说明

### 后端环境变量 (server/.env)

| 变量 | 默认值 | 说明 |
|------|--------|------|
| PORT | 3000 | HTTP API 端口 |
| WS_PORT | 8080 | WebSocket 端口 |
| SIMULATION_MODE | true | 是否启用模拟模式（无需真实设备） |
| MQTT_BROKER_URL | mqtt://localhost:1883 | MQTT Broker 地址 |
| MQTT_TOPIC | smartgrid/telemetry/# | MQTT 订阅主题 |
| INFLUXDB_URL | http://localhost:8086 | InfluxDB 地址 |
| INFLUXDB_TOKEN | - | InfluxDB Token |
| INFLUXDB_ORG | smartgrid | InfluxDB 组织 |
| INFLUXDB_BUCKET | telemetry | InfluxDB 存储桶 |

### MQTT 数据格式

MQTT 主题格式：`smartgrid/telemetry/{deviceType}/{deviceId}`

消息载荷（JSON）：
```json
{
  "voltage": 220.5,
  "current": 15.2,
  "phaseAngle": 12.5,
  "loadRate": 0.72,
  "timestamp": "2024-01-01T12:00:00.000Z"
}
```

### 电网拓扑配置

在 [topology.js](file:///d:/SOLO-0616-2/09-smartgrid-load-balancer/server/src/topology.js) 中配置电网节点和连线：

- **节点类型**：grid（主电网）、substation（变电站）、inverter（光伏逆变器）、load（负荷）、battery（储能）
- **连线**：source → target，支持双向和单向

## 负载率颜色映射

| 负载率范围 | 颜色 | 状态 |
|------------|------|------|
| 0% - 60% | 🟢 绿色 | 正常运行 |
| 60% - 85% | 🟡 黄色 | 预警状态 |
| > 85% | 🔴 红色 | 告警状态 |

脉冲动画速度随负载率升高而加快。
