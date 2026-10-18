import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

/**
 * 为什么用 Vite 代理而不是后端加 CORS：
 * 开发时浏览器只访问 localhost:5173 这一个源，/api 与 /health 由 Vite 转发到 8080。
 * 好处是后端**一行 CORS 配置都不用加**，也不会因为预检请求多出一次往返；
 * 生产部署时把前端产物交给 Nginx，由它反向代理 /api 即可，前端代码不用改。
 */
export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})
