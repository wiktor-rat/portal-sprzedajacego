import { resolve } from 'node:path'
import { defineConfig } from 'vite'

// Na komputerze (npm run dev / preview) adres /o/<token> ma działać tak samo jak na Vercel,
// gdzie przepisuje go vercel.json.
const ownerPortalRewrite = () => {
  const rewrite = (req, _res, next) => {
    if (req.url?.startsWith('/o/')) req.url = '/portal.html'
    next()
  }
  return {
    name: 'owner-portal-rewrite',
    configureServer(server) {
      server.middlewares.use(rewrite)
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite)
    },
  }
}

export default defineConfig({
  plugins: [ownerPortalRewrite()],
  build: {
    rollupOptions: {
      input: {
        panel: resolve(import.meta.dirname, 'index.html'),
        portal: resolve(import.meta.dirname, 'portal.html'),
      },
    },
  },
})
