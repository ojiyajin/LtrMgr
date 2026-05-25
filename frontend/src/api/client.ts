import axios from 'axios'

// Resolve API base relative to the current page path.
// Works behind any reverse proxy / subpath (e.g. code-server /proxy/8000/).
const apiBase = (() => {
  const path = window.location.pathname.replace(/\/+$/, '')
  return `${window.location.origin}${path}/api`
})()

export { apiBase }

export const client = axios.create({
  baseURL: apiBase,
  paramsSerializer: {
    serialize: (params) => {
      const sp = new URLSearchParams()
      for (const [key, val] of Object.entries(params)) {
        if (Array.isArray(val)) {
          val.forEach((v) => sp.append(key, String(v)))
        } else if (val !== undefined && val !== null) {
          sp.append(key, String(val))
        }
      }
      return sp.toString()
    },
  },
})

client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

client.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.hash = '#/login'
    }
    return Promise.reject(err)
  }
)
