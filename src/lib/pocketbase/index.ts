// Barrel do módulo — resolve `@/lib/pocketbase` (o caminho que os imports
// antigos usam) sem criar um `pocketbase.ts` ao lado da pasta `pocketbase/`,
// que é justamente o que o Rollup confundia:
//   Error: "isNetworkError" is not exported by "src/lib/pocketbase.ts"
//
// Com este index, os DOIS caminhos funcionam e há uma única fonte de verdade:
//   import pb from '@/lib/pocketbase'                          -> cliente
//   import { isNetworkError } from '@/lib/pocketbase'          -> helpers de erro
//   import { getErrorMessage } from '@/lib/pocketbase/errors'  -> idem (direto)
export { default } from './client'
export { default as pb } from './client'
export * from './errors'
