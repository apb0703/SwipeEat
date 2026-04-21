import { Channel, M3UEntry } from '../types'

function parseAttributes(line: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const regex = /(\S+?)="([^"]*?)"/g
  let match
  while ((match = regex.exec(line)) !== null) {
    attrs[match[1].toLowerCase()] = match[2]
  }
  return attrs
}

function extractDisplayName(extinfoLine: string): string {
  const commaIdx = extinfoLine.lastIndexOf(',')
  return commaIdx >= 0 ? extinfoLine.slice(commaIdx + 1).trim() : ''
}

function parseExtinfLine(line: string): Partial<M3UEntry> {
  const attrs = parseAttributes(line)
  return {
    name: extractDisplayName(line),
    logo: attrs['tvg-logo'],
    group: attrs['group-title'],
    tvgId: attrs['tvg-id'],
    tvgName: attrs['tvg-name'],
    language: attrs['tvg-language'],
    country: attrs['tvg-country'],
  }
}

export function parseM3U(content: string): M3UEntry[] {
  const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const entries: M3UEntry[] = []
  let pending: Partial<M3UEntry> | null = null

  for (const line of lines) {
    if (line.startsWith('#EXTM3U')) continue

    if (line.startsWith('#EXTINF:')) {
      pending = parseExtinfLine(line)
    } else if (!line.startsWith('#') && line.length > 0) {
      if (pending) {
        entries.push({ url: line, name: pending.name || 'Unknown', ...pending })
        pending = null
      } else {
        entries.push({ url: line, name: 'Unknown' })
      }
    }
  }

  return entries
}

export function m3uEntriesToChannels(entries: M3UEntry[], source: string): Channel[] {
  return entries.map((e, i) => ({
    id: `${source}-${i}-${Date.now()}`,
    name: e.name,
    url: e.url,
    logo: e.logo,
    group: e.group,
    tvgId: e.tvgId,
    tvgName: e.tvgName,
    language: e.language,
    country: e.country,
    addedAt: Date.now(),
  }))
}
