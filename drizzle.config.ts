import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './electron/src/infrastructure/database/schema/index.ts',
  out: './electron/migrations',
  dialect: 'sqlite',
  strict: true,
  verbose: true
})
