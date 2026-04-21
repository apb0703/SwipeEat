import { ScanResult, ScanProgress } from '../types'
import { parseM3U, m3uEntriesToChannels } from './m3uParser'

// Common IPTV server paths to probe
const IPTV_PATHS = [
  '/playlist.m3u',
  '/playlist.m3u8',
  '/get.php?username=test&password=test&type=m3u_plus',
  '/channels.m3u',
  '/stream/index.m3u',
  '/iptv/playlist.m3u',
  '/all.m3u',
  '/full.m3u',
  '/live.m3u',
]

// Common IPTV server ports
const IPTV_PORTS = [8080, 80, 8888, 4022, 25461, 2095, 2096]

// Known public free IPTV list sources (GitHub-hosted, no auth needed)
const PUBLIC_SOURCES = [
  {
    url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us.m3u',
    name: 'IPTV-Org: US Channels',
  },
  {
    url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/us_local.m3u',
    name: 'IPTV-Org: US Local',
  },
  {
    url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/news.m3u',
    name: 'IPTV-Org: News',
  },
  {
    url: 'https://raw.githubusercontent.com/iptv-org/iptv/master/streams/sports.m3u',
    name: 'IPTV-Org: Sports',
  },
]

async function fetchWithTimeout(url: string, timeoutMs = 5000): Promise<Response | null> {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    const res = await fetch(url, { signal: controller.signal })
    clearTimeout(timer)
    return res
  } catch {
    return null
  }
}

async function tryFetchM3U(url: string): Promise<string | null> {
  const res = await fetchWithTimeout(url, 5000)
  if (!res || !res.ok) return null
  const text = await res.text()
  if (!text.includes('#EXTM3U') && !text.includes('#EXTINF')) return null
  return text
}

export async function scanLocalNetwork(
  subnet: string,
  onProgress: (p: ScanProgress) => void,
): Promise<ScanResult[]> {
  const results: ScanResult[] = []
  const candidates: { host: string; port: number; path: string }[] = []

  // Build candidate list: subnet IPs × ports × paths (sample 20 IPs to keep scan fast)
  const sampleIps = Array.from({ length: 20 }, (_, i) => `${subnet}.${i + 1}`)
  for (const ip of sampleIps) {
    for (const port of IPTV_PORTS) {
      for (const path of IPTV_PATHS.slice(0, 3)) {
        candidates.push({ host: ip, port, path })
      }
    }
  }

  const total = candidates.length
  let current = 0
  let found = 0

  for (const { host, port, path } of candidates) {
    current++
    const url = `http://${host}:${port}${path}`
    onProgress({ phase: 'scanning', current, total, message: `Probing ${url}`, found })

    const content = await tryFetchM3U(url)
    if (content) {
      const entries = parseM3U(content)
      if (entries.length > 0) {
        const channels = m3uEntriesToChannels(entries, url)
        results.push({ url, channelCount: channels.length, channels, source: `${host}:${port}` })
        found += channels.length
      }
    }
  }

  return results
}

export async function scanPublicSources(
  onProgress: (p: ScanProgress) => void,
): Promise<ScanResult[]> {
  const results: ScanResult[] = []
  const total = PUBLIC_SOURCES.length

  for (let i = 0; i < PUBLIC_SOURCES.length; i++) {
    const { url, name } = PUBLIC_SOURCES[i]
    onProgress({ phase: 'scanning', current: i + 1, total, message: `Fetching ${name}…`, found: results.reduce((s, r) => s + r.channelCount, 0) })

    const content = await tryFetchM3U(url)
    if (content) {
      const entries = parseM3U(content)
      if (entries.length > 0) {
        const channels = m3uEntriesToChannels(entries, url)
        results.push({ url, channelCount: channels.length, channels, source: name })
      }
    }
  }

  return results
}

export async function fetchFromUrl(url: string): Promise<ScanResult | null> {
  const content = await tryFetchM3U(url)
  if (!content) return null
  const entries = parseM3U(content)
  if (entries.length === 0) return null
  const channels = m3uEntriesToChannels(entries, url)
  return { url, channelCount: channels.length, channels, source: url }
}

export function detectSubnet(): string {
  // Best effort: browsers can't read the local IP directly.
  // We return the most common home subnet as a default.
  return '192.168.1'
}
