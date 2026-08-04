import { useState, useEffect, useRef, useCallback } from 'react'

export function useElapsedTimer() {
  const [elapsed, setElapsed] = useState(0)
  const [running, setRunning] = useState(false)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const start = useCallback(() => {
    setElapsed(0)
    setRunning(true)
  }, [])

  const stop = useCallback(() => {
    setRunning(false)
  }, [])

  const reset = useCallback(() => {
    setElapsed(0)
    setRunning(false)
  }, [])

  useEffect(() => {
    if (running) {
      intervalRef.current = setInterval(() => {
        setElapsed((prev) => prev + 1)
      }, 1000)
    } else if (intervalRef.current) {
      clearInterval(intervalRef.current)
      intervalRef.current = null
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
  }, [running])

  const formatted = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`

  return { elapsed, formatted, running, start, stop, reset }
}
