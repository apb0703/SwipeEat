import { useState, useRef } from 'react'
import { Channel } from '../../types'
import { useAutoSearch } from '../../hooks/useAutoSearch'
import { parseM3U, m3uEntriesToChannels } from '../../services/m3uParser'

interface Props {
  onImport: (channels: Channel[]) => void
}

export default function AutoSearchPanel({ onImport }: Props) {
  const { progress, results, runScan, fetchUrl, reset } = useAutoSearch()
  const [urlInput, setUrlInput] = useState('')
  const [subnet, setSubnet] = useState('192.168.1')
  const [selectedResults, setSelectedResults] = useState<Set<number>>(new Set())
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isScanning = progress.phase === 'scanning'

  const toggleResult = (i: number) => {
    setSelectedResults(prev => {
      const next = new Set(prev)
      next.has(i) ? next.delete(i) : next.add(i)
      return next
    })
  }

  const selectAll = () => setSelectedResults(new Set(results.map((_, i) => i)))
  const deselectAll = () => setSelectedResults(new Set())

  const importSelected = () => {
    const channels = results
      .filter((_, i) => selectedResults.has(i))
      .flatMap(r => r.channels)
    onImport(channels)
  }

  const handleUrlSearch = async () => {
    if (!urlInput.trim()) return
    const result = await fetchUrl(urlInput.trim())
    if (result) {
      setSelectedResults(new Set([0]))
    }
  }

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      const content = ev.target?.result as string
      const entries = parseM3U(content)
      const channels = m3uEntriesToChannels(entries, file.name)
      onImport(channels)
      reset()
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleLocalScan = () => {
    reset()
    setSelectedResults(new Set())
    runScan('local')
  }

  const handlePublicScan = () => {
    reset()
    setSelectedResults(new Set())
    runScan('public')
  }

  return (
    <div className="flex flex-col h-full gap-0">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-surface-elevated">
        <h2 className="text-sm font-semibold text-gray-200">Auto Search</h2>
        <p className="text-xs text-gray-500 mt-0.5">Discover and import IPTV channels</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">

        {/* --- Section: URL Import --- */}
        <section>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">M3U URL</label>
          <div className="mt-1.5 flex gap-2">
            <input
              className="flex-1 min-w-0 bg-surface-elevated text-sm text-gray-100 px-3 py-2 rounded-lg placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-accent"
              placeholder="https://example.com/playlist.m3u"
              value={urlInput}
              onChange={e => setUrlInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleUrlSearch()}
              disabled={isScanning}
            />
            <button
              onClick={handleUrlSearch}
              disabled={isScanning || !urlInput.trim()}
              className="px-3 py-2 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors shrink-0"
            >
              Fetch
            </button>
          </div>
        </section>

        {/* --- Section: File Import --- */}
        <section>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Import File</label>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="mt-1.5 w-full flex items-center gap-2 px-3 py-2 bg-surface-elevated hover:bg-surface-elevated/80 text-sm text-gray-300 rounded-lg border border-dashed border-surface-elevated hover:border-accent/50 transition-colors"
          >
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
            </svg>
            Open .m3u / .m3u8 file…
          </button>
          <input ref={fileInputRef} type="file" accept=".m3u,.m3u8,.txt" onChange={handleFile} className="hidden" />
        </section>

        {/* --- Section: Local Network Scan --- */}
        <section>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Local Network Scan</label>
          <p className="text-xs text-gray-600 mt-0.5 mb-2">Probes common IPTV ports on your LAN for M3U playlists.</p>
          <div className="flex gap-2 items-center">
            <div className="flex items-center gap-1.5 bg-surface-elevated rounded-lg px-2 py-1.5 flex-1">
              <span className="text-xs text-gray-500">Subnet</span>
              <input
                className="bg-transparent text-sm text-gray-200 focus:outline-none w-28"
                value={subnet}
                onChange={e => setSubnet(e.target.value)}
                placeholder="192.168.1"
                disabled={isScanning}
              />
              <span className="text-xs text-gray-500">.1–20</span>
            </div>
            <button
              onClick={handleLocalScan}
              disabled={isScanning}
              className="px-3 py-2 bg-surface-elevated hover:bg-surface-elevated/60 disabled:opacity-40 text-sm text-gray-300 rounded-lg border border-surface-elevated hover:border-accent/40 transition-colors shrink-0"
            >
              Scan LAN
            </button>
          </div>
        </section>

        {/* --- Section: Public Sources --- */}
        <section>
          <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Free Public Sources</label>
          <p className="text-xs text-gray-600 mt-0.5 mb-2">Auto-fetch from curated free IPTV lists (US local, news, sports).</p>
          <button
            onClick={handlePublicScan}
            disabled={isScanning}
            className="w-full px-3 py-2 bg-accent/10 hover:bg-accent/20 disabled:opacity-40 text-accent text-sm rounded-lg border border-accent/20 hover:border-accent/40 transition-colors"
          >
            {isScanning ? 'Scanning…' : 'Search Public Sources'}
          </button>
        </section>

        {/* --- Progress --- */}
        {progress.phase !== 'idle' && (
          <section className="bg-surface-elevated rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-400">{progress.message}</span>
              {isScanning && (
                <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin shrink-0" />
              )}
            </div>
            {progress.total > 0 && (
              <div className="w-full bg-surface rounded-full h-1.5">
                <div
                  className="bg-accent h-1.5 rounded-full transition-all"
                  style={{ width: `${Math.round((progress.current / progress.total) * 100)}%` }}
                />
              </div>
            )}
            {progress.phase === 'error' && (
              <p className="text-xs text-red-400">{progress.message}</p>
            )}
          </section>
        )}

        {/* --- Results --- */}
        {results.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                Results ({results.length} source{results.length !== 1 ? 's' : ''})
              </label>
              <div className="flex gap-2">
                <button onClick={selectAll} className="text-xs text-accent hover:underline">All</button>
                <button onClick={deselectAll} className="text-xs text-gray-500 hover:underline">None</button>
              </div>
            </div>
            <div className="space-y-2">
              {results.map((r, i) => (
                <label
                  key={i}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedResults.has(i)
                      ? 'border-accent/40 bg-accent/10'
                      : 'border-surface-elevated bg-surface-elevated hover:border-accent/20'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedResults.has(i)}
                    onChange={() => toggleResult(i)}
                    className="mt-0.5 accent-accent"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-200 truncate">{r.source}</p>
                    <p className="text-xs text-gray-500 truncate">{r.url}</p>
                    <p className="text-xs text-accent mt-0.5">{r.channelCount} channel{r.channelCount !== 1 ? 's' : ''}</p>
                  </div>
                </label>
              ))}
            </div>
            <button
              onClick={importSelected}
              disabled={selectedResults.size === 0}
              className="mt-3 w-full py-2.5 bg-accent hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition-colors"
            >
              Add {selectedResults.size > 0
                ? results.filter((_, i) => selectedResults.has(i)).reduce((s, r) => s + r.channelCount, 0)
                : 0} Channels to My List
            </button>
          </section>
        )}
      </div>
    </div>
  )
}
