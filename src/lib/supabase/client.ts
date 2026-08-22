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
    onAuthStateChange: (_callback?: any) => ({ data: { subscription: { unsubscribe: () => {} } } }),
    signInWithPassword: () => Promise.reject(new Error(ERROR_MSG)),
    signUp: () => Promise.reject(new Error(ERROR_MSG)),
    signOut: () => Promise.resolve({ error: null }),
    resetPasswordForEmail: (_email?: string, _opts?: any) =>
      Promise.resolve({ data: {}, error: null }),
    updateUser: (_attrs?: any) => Promise.resolve({ data: { user: null }, error: null }),
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
