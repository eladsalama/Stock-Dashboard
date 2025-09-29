import 'dotenv/config'
import { z } from 'zod'

// define the shape of our environment variables
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  DATABASE_URL: z.string().url(),
})

// parse and validate
export const env = EnvSchema.parse(process.env)
