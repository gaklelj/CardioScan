import { useMemo } from 'react'

export function usePlatform() {
  return useMemo(() => {
    const ua = navigator.userAgent || navigator.platform || ''
    const isIOS = /iPhone|iPad|iPod/i.test(ua)
    const isAndroid = /Android/i.test(ua)
    const isTauri = !!(window.__TAURI__ || window.__TAURI_INTERNALS__)
    const isMobile = isIOS || isAndroid
    return { isIOS, isAndroid, isMobile, isTauri }
  }, [])
}
