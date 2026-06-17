// Frontend API client — replaces direct Supabase calls
// Usage: const api = createApi(getToken)
//        const data = await api.get('/venues')

export function createApi(getToken) {
  async function request(path, options = {}) {
    const headers = { ...options.headers }

    // Attach Clerk JWT for authenticated requests
    if (getToken) {
      try {
        const token = await getToken()
        if (token) headers['Authorization'] = `Bearer ${token}`
      } catch { /* proceed without token */ }
    }

    // Set content-type for non-FormData bodies
    if (options.body && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
      if (typeof options.body === 'object') {
        options = { ...options, body: JSON.stringify(options.body) }
      }
    }

    const res = await fetch(`/api${path}`, { ...options, headers })
    const contentType = res.headers.get('content-type') || ''

    if (!res.ok) {
      const body = contentType.includes('application/json')
        ? await res.json().catch(() => ({}))
        : { error: await res.text().catch(() => '') }
      throw new Error(body.error || `Request failed (${res.status})`)
    }

    if (res.status === 204) return null
    if (!contentType.includes('application/json')) {
      const preview = (await res.text().catch(() => '')).slice(0, 120)
      throw new Error(`Unexpected API response format for ${path}${preview ? `: ${preview}` : ''}`)
    }

    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  return {
    get:    (path) => request(path),
    post:   (path, body) => request(path, { method: 'POST', body }),
    patch:  (path, body) => request(path, { method: 'PATCH', body }),
    del:    (path, body) => request(path, { method: 'DELETE', body }),
    upload: (path, formData) => request(path, { method: 'POST', body: formData }),
  }
}
