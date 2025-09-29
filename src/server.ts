import Fastify from 'fastify'
import { env } from './env'
import examplePlugin from './plugins/example'

const app = Fastify({
  logger: {
    level: 'info',
    transport: { target: 'pino-pretty' }
  }
})

async function start() {
  await app.register(examplePlugin)

  app.get('/test', async () => ({ msg: app.hello() }))

  await app.listen({ port: env.PORT, host: '0.0.0.0' })
  console.log(`Server running at http://localhost:${env.PORT}`)
}

start().catch((err) => {
  console.error(err)
  process.exit(1)
})
