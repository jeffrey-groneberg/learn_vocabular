import { startNodeTelemetry } from '@vocabulary/observability/node'

startNodeTelemetry('vocabulary-api')
const [{ buildApi }, { loadApiConfig }, { AzureSpeechService }] = await Promise.all([
  import('./app.js'),
  import('./config.js'),
  import('./speech.js'),
])
const config = await loadApiConfig()
const app = await buildApi(config, new AzureSpeechService(config.speechEndpoint))

const close = async () => {
  await app.close()
  process.exit(0)
}

process.on('SIGINT', () => void close())
process.on('SIGTERM', () => void close())

await app.listen({ host: '0.0.0.0', port: config.port })
