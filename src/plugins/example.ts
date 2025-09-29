import fp from 'fastify-plugin'

export default fp(async (app) => {
  app.decorate('hello', () => 'Tahel is sexy and beautiful :)')
})

declare module 'fastify' {
  interface FastifyInstance {
    hello(): string
  }
}