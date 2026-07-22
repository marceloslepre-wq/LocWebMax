import PocketBase from 'pocketbase'
import { safeStorage } from '@/lib/safe-storage'

const pb = new PocketBase(import.meta.env.VITE_POCKETBASE_URL, safeStorage as any)
pb.autoCancellation(false)

export default pb
