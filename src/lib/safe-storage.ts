function isStorageAvailable(storage: Storage): boolean {
  try {
    const testKey = '__skip_storage_test__'
    storage.setItem(testKey, '1')
    storage.removeItem(testKey)
    return true
  } catch {
    return false
  }
}

class MemoryStorage implements Storage {
  private store = new Map<string, string>()

  get length(): number {
    return this.store.size
  }

  clear(): void {
    this.store.clear()
  }

  getItem(key: string): string | null {
    return this.store.has(key) ? this.store.get(key)! : null
  }

  key(index: number): string | null {
    const keys = Array.from(this.store.keys())
    return keys[index] ?? null
  }

  removeItem(key: string): void {
    this.store.delete(key)
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value)
  }
}

function resolveSafeStorage(): Storage {
  try {
    if (
      typeof window !== 'undefined' &&
      window.localStorage &&
      isStorageAvailable(window.localStorage)
    ) {
      return window.localStorage
    }
  } catch {
    // fallthrough to memory
  }
  return new MemoryStorage()
}

export const safeStorage = resolveSafeStorage()
export default safeStorage
