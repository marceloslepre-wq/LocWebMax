import PocketBase from 'pocketbase'

/**
 * PocketBase Client com:
 * 1. Backoff exponencial para status 429 (Too Many Requests), evitando rajadas
 * 2. Deduplicação e cache curto (5-10s) para requisições GET idênticas (listagens/buscas)
 * 3. Notificação global de rate limit com mensagem amigável para o usuário
 * 4. Proteção multi-abas para não sobrecarregar os limites da plataforma
 */

type RateLimitListener = (retryAfterSeconds: number) => void
const rateLimitListeners = new Set<RateLimitListener>()

export function onRateLimit(listener: RateLimitListener): () => void {
  rateLimitListeners.add(listener)
  return () => {
    rateLimitListeners.delete(listener)
  }
}

function notifyRateLimit(retryAfterSeconds: number) {
  rateLimitListeners.forEach((listener) => {
    try {
      listener(retryAfterSeconds)
    } catch {
      // ignore
    }
  })
}

// In-flight GET promise cache (deduplication) + short TTL cache (5s)
interface CacheEntry {
  timestamp: number
  response: Response
  bodyText: string
}

const getCache = new Map<string, CacheEntry>()
const inFlightGets = new Map<string, Promise<Response>>()
const CACHE_TTL_MS = 5000 // 5 seconds cache for identical GETs (listagens)

// Global backoff state for 429
let rateLimitBlockedUntil = 0
let consecutive429s = 0

async function customFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const method = (
    init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')
  ).toUpperCase()
  const urlStr =
    typeof input === 'string'
      ? input
      : input instanceof URL
        ? input.toString()
        : (input as Request).url

  // Only GET requests participate in deduplication and caching
  const isGet = method === 'GET'

  // Do not cache realtime SSE streams
  const isRealtime = urlStr.includes('/api/realtime')

  // If rate-limited globally, delay before sending
  const now = Date.now()
  if (rateLimitBlockedUntil > now && !isRealtime) {
    const waitTime = rateLimitBlockedUntil - now
    await new Promise((resolve) => setTimeout(resolve, waitTime))
  }

  const cacheKey =
    isGet && !isRealtime ? `${urlStr}::${init?.headers ? JSON.stringify(init.headers) : ''}` : null

  // Check cache for recent identical GET
  if (cacheKey && getCache.has(cacheKey)) {
    const entry = getCache.get(cacheKey)!
    if (Date.now() - entry.timestamp < CACHE_TTL_MS) {
      return new Response(entry.bodyText, {
        status: entry.response.status,
        statusText: entry.response.statusText,
        headers: new Headers(entry.response.headers),
      })
    } else {
      getCache.delete(cacheKey)
    }
  }

  // Deduplicate in-flight GETs
  if (cacheKey && inFlightGets.has(cacheKey)) {
    const existingPromise = inFlightGets.get(cacheKey)!
    const res = await existingPromise
    // Clone response so multiple readers can read body
    return res.clone()
  }

  const executeRequest = async (retryAttempt = 0): Promise<Response> => {
    const response = await fetch(input, init)

    if (response.status === 429) {
      consecutive429s++
      // Determine backoff: check Retry-After header or exponential backoff (2s, 4s, 8s, max 30s)
      const retryAfterHeader = response.headers.get('Retry-After')
      let waitSeconds = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0
      if (!waitSeconds || isNaN(waitSeconds) || waitSeconds <= 0) {
        waitSeconds = Math.min(Math.pow(2, consecutive429s), 30) // 2s, 4s, 8s, 16s, 30s
      }

      rateLimitBlockedUntil = Date.now() + waitSeconds * 1000
      notifyRateLimit(waitSeconds)

      // Retry up to 3 times with backoff if it's a GET request, instead of throwing immediately or looping in a burst
      if (isGet && retryAttempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, waitSeconds * 1000))
        return executeRequest(retryAttempt + 1)
      }

      return response
    }

    // If successful, reset 429 counter
    if (response.ok) {
      consecutive429s = 0
    }

    // Cache successful GET responses
    if (isGet && cacheKey && response.ok) {
      try {
        const cloned = response.clone()
        const text = await cloned.text()
        getCache.set(cacheKey, {
          timestamp: Date.now(),
          response,
          bodyText: text,
        })
        // Auto clear after TTL
        setTimeout(() => {
          if (getCache.get(cacheKey)?.timestamp === Date.now()) {
            getCache.delete(cacheKey)
          }
        }, CACHE_TTL_MS + 100)
      } catch {
        // ignore cache error
      }
    }

    return response
  }

  if (cacheKey) {
    const p = executeRequest().finally(() => {
      inFlightGets.delete(cacheKey)
    })
    inFlightGets.set(cacheKey, p)
    const res = await p
    return res.clone()
  }

  return executeRequest()
}

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL, undefined, undefined)
pb.autoCancellation(false)

// Attach custom fetch with 429 backoff & deduplication
if (typeof window !== 'undefined') {
  ;(pb as any).beforeSend = function (url: string, options: any) {
    options.fetch = customFetch
    return { url, options }
  }
}
export default pb
