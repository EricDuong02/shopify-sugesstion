import axios from 'axios'
import { useMemo } from 'react'

export function useApiNotTokenShopify() {
  const token = '35a9468c-51e8-4a39-962e-286f52494896'
  const api = useMemo(() => {
    const instance = axios.create({
      baseURL: '/api',
    })

    // To check if the token is set or wait the request until it's set
    instance.interceptors.request.use(async (config) => {
      config.headers['Authorization'] = `Bearer ${token}`
      config.headers['X-Requested-With'] = 'XMLHttpRequest'

      return config
    })

    return instance
  }, [])

  return api
}
