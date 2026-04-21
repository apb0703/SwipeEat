import { useState, useCallback, useRef } from 'react'
import { ScanProgress, ScanResult } from '../types'
import { scanLocalNetwork, scanPublicSources, fetchFromUrl, detectSubnet } from '../services/iptvScanner'

const IDLE: ScanProgress = { phase: 'idle', current: 0, total: 0, message: '', found: 0 }

export function useAutoSearch() {
  const [progress, setProgress] = useState<ScanProgress>(IDLE)
  const [results, setResults] = useState<ScanResult[]>([])
  const abortRef = useRef(false)

  const runScan = useCallback(async (mode: 'local' | 'public') => {
    abortRef.current = false
    setResults([])
    setProgress({ phase: 'scanning', current: 0, total: 1, message: 'Starting scan…', found: 0 })

    const onProgress = (p: ScanProgress) => {
      if (!abortRef.current) setProgress(p)
    }

    try {
      let found: ScanResult[] = []
      if (mode === 'local') {
        const subnet = detectSubnet()
        found = await scanLocalNetwork(subnet, onProgress)
      } else {
        found = await scanPublicSources(onProgress)
      }

      if (!abortRef.current) {
        setResults(found)
        const totalChannels = found.reduce((s, r) => s + r.channelCount, 0)
        setProgress({ phase: 'done', current: 1, total: 1, message: `Scan complete. Found ${totalChannels} channels from ${found.length} source(s).`, found: totalChannels })
      }
    } catch (err) {
      if (!abortRef.current) {
        setProgress({ phase: 'error', current: 0, total: 0, message: String(err), found: 0 })
      }
    }
  }, [])

  const fetchUrl = useCallback(async (url: string) => {
    setProgress({ phase: 'scanning', current: 0, total: 1, message: `Fetching ${url}…`, found: 0 })
    try {
      const result = await fetchFromUrl(url)
      if (result) {
        setResults([result])
        setProgress({ phase: 'done', current: 1, total: 1, message: `Found ${result.channelCount} channels.`, found: result.channelCount })
        return result
      } else {
        setProgress({ phase: 'error', current: 0, total: 0, message: 'No valid M3U content found at this URL.', found: 0 })
        return null
      }
    } catch (err) {
      setProgress({ phase: 'error', current: 0, total: 0, message: String(err), found: 0 })
      return null
    }
  }, [])

  const abort = useCallback(() => {
    abortRef.current = true
    setProgress(IDLE)
  }, [])

  const reset = useCallback(() => {
    abortRef.current = true
    setProgress(IDLE)
    setResults([])
  }, [])

  return { progress, results, runScan, fetchUrl, abort, reset }
}
