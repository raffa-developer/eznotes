import path from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      electron: path.resolve(process.cwd(), 'tests/electron-stub.ts')
    }
  },
  test: {
    environment: 'node',
    env: {
      TZ: 'Europe/Lisbon'
    },
    include: ['src/**/*.test.ts']
  }
})
