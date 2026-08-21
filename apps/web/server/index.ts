import { startNodeTelemetry } from '@vocabulary/observability/node'

startNodeTelemetry('vocabulary-gateway')
const [{ buildGateway }, { loadGatewayConfig }] = await Promise.all([
  import('./app.js'),
  import('./config.js'),
])
const config = await loadGatewayConfig()
const app = await buildGateway(config)

const close = async () => {
  await app.close()
  process.exit(0)
}

process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())

await app.listen({ host: '0.0.0.0', port: config.port })
