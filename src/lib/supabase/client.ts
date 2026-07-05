const ERROR_MSG = 'Supabase has been removed. Use @/lib/pocketbase/client instead.'

export const supabase = {
  from: () => ({
    select: () => Promise.reject(new Error(ERROR_MSG)),
    insert: () => Promise.reject(new Error(ERROR_MSG)),
    update: () => ({ eq: () => Promise.reject(new Error(ERROR_MSG)) }),
    delete: () => ({ eq: () => Promise.reject(new Error(ERROR_MSG)) }),
    upsert: () => Promise.reject(new Error(ERROR_MSG)),
  }),
  rpc: () => Promise.reject(new Error(ERROR_MSG)),
  auth: {
    getSession: () => Promise.resolve({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.reject(new Error(ERROR_MSG)),
    signUp: () => Promise.reject(new Error(ERROR_MSG)),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: () => Promise.reject(new Error(ERROR_MSG)),
    updateUser: () => Promise.reject(new Error(ERROR_MSG)),
  },
  storage: {
    from: () => ({
      upload: () => Promise.reject(new Error(ERROR_MSG)),
      remove: () => Promise.reject(new Error(ERROR_MSG)),
      getPublicUrl: (path: string) => ({ data: { publicUrl: path } }),
    }),
  },
  functions: { invoke: () => Promise.reject(new Error(ERROR_MSG)) },
  channel: () => ({ on: () => ({ subscribe: () => ({ unsubscribe: () => {} }) }) }),
}
