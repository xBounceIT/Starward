import { execSync } from 'node:child_process'

import { readFileSync } from 'node:fs'

import { defineConfig } from 'vite'

import { tanstackStart } from '@tanstack/react-start/plugin/vite'

import viteReact from '@vitejs/plugin-react'

import tailwindcss from '@tailwindcss/vite'

function resolveAppVersion(): string {
  const envVersion = process.env.APP_VERSION?.trim().replace(/^v/, '')
  if (envVersion) return envVersion

  try {
    const gitVersion = execSync('git describe --tags --match "v*.*.*"', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()
      .replace(/^v/, '')
    if (gitVersion) return gitVersion
  } catch {
    // Not in a git repo or no matching v*.*.* tag reachable
  }

  const pkg = JSON.parse(
    readFileSync(new URL('./package.json', import.meta.url), 'utf8'),
  ) as { version?: string }
  return pkg.version || '0.0.0-dev'
}

const appVersion = resolveAppVersion()

function packageName(id: string): string {
  const segments = id.split(/[\\/]/)
  const nmIndex = segments.lastIndexOf('node_modules')
  if (nmIndex === -1) return ''
  let pkg = segments[nmIndex + 1] ?? ''
  if (pkg.startsWith('@') && segments[nmIndex + 2]) {
    pkg = `${pkg}/${segments[nmIndex + 2]}`
  }
  return pkg
}

export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id: string) {
          const pkg = packageName(id)
          if (!pkg) return undefined
          if (pkg === 'react' || pkg === 'react-dom' || pkg === 'scheduler') {
            return 'react-vendor'
          }
          if (pkg === 'radix-ui' || pkg.startsWith('@radix-ui/')) {
            return 'radix-vendor'
          }
          if (pkg === 'lucide-react') return 'lucide-vendor'
          return undefined
        },
      },
    },
  },
  plugins: [tailwindcss(), tanstackStart(), viteReact()],
})
