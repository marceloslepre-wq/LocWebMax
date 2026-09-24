import pb from '@/lib/pocketbase/client'

/**
 * Utilitário para detecção dinâmica de contratos sem fonte histórica
 * Baseado no critério canônico validado das migrations 0082, 0085 e 0093:
 * Contratos cujos itens NÃO possuem fonte confiável nem em `rental_snapshots`
 * nem em `auditoria_contratos`.
 */

function parseJsonValue(val: any): any {
  if (!val) return null
  if (typeof val === 'string') {
    try {
      return JSON.parse(val)
    } catch {
      return null
    }
  }
  if (Array.isArray(val)) {
    if (val.length > 0 && typeof val[0] === 'number') {
      let str = ''
      for (let i = 0; i < val.length; i++) {
        str += String.fromCharCode(val[i])
      }
      try {
        return JSON.parse(str)
      } catch {
        return null
      }
    }
    return val
  }
  if (typeof val === 'object') return val
  return null
}

function hasRealProductItem(
  items: any[],
  invById: Record<string, boolean>,
  invByCode: Record<string, boolean>,
): boolean {
  if (!Array.isArray(items) || items.length === 0) return false
  for (const it of items) {
    if (!it || typeof it !== 'object') continue
    const itId = String(it.itemId || it.item_id || it.inventory_id || it.id || '').trim()
    const itCode = String(it.code || it.sku || '').trim()
    const itName = String(it.name || it.productName || it.product_name || '').trim()
    if (
      (itId && itId !== 'freight' && invById[itId]) ||
      (itCode && invByCode[itCode.toLowerCase()]) ||
      (itName && !itName.includes('Equipamento Hospitalar') && itName.length > 3)
    ) {
      return true
    }
  }
  return false
}

export interface NoSourceRentalsInfo {
  noSourceActiveIds: Set<string>
  noSourceAllIds: Set<string>
  isLoading: boolean
}

let cachedPromise: Promise<{
  noSourceActiveIds: Set<string>
  noSourceAllIds: Set<string>
}> | null = null
let lastFetchTime = 0
const CACHE_TTL_MS = 60 * 1000 // 1 minuto de cache em memória

export async function fetchNoSourceRentalIds(
  rentalsList: Array<{
    id: string
    contractNumber?: string
    contract_number?: string
    status: string
    total?: number
  }>,
  forceRefresh = false,
): Promise<{ noSourceActiveIds: Set<string>; noSourceAllIds: Set<string> }> {
  const now = Date.now()
  if (!forceRefresh && cachedPromise && now - lastFetchTime < CACHE_TTL_MS) {
    return cachedPromise
  }

  cachedPromise = (async () => {
    try {
      // 1. Carregar inventário para checar códigos/ids reais
      const allInventory = await pb
        .collection('inventory')
        .getFullList({
          fields: 'id,code',
          requestKey: 'no_source_inventory',
        })
        .catch(() => [])

      const invById: Record<string, boolean> = {}
      const invByCode: Record<string, boolean> = {}
      for (const item of allInventory) {
        invById[item.id] = true
        const c = String((item as any).code || '')
          .trim()
          .toLowerCase()
        if (c) invByCode[c] = true
      }

      // 2. Carregar rental_snapshots
      const allSnapshots = await pb
        .collection('rental_snapshots')
        .getFullList({
          fields: 'id,rental_id,action_type,rental_state,extra_data,description,created',
          sort: '-created',
          requestKey: 'no_source_snapshots',
        })
        .catch(() => [])

      const snapshotsByRentalId: Record<string, any[]> = {}
      const snapshotsByContractNum: Record<string, any[]> = {}

      for (const snap of allSnapshots) {
        const sRentalId = (snap as any).rental_id
        const actionType = (snap as any).action_type || ''
        const rState = parseJsonValue((snap as any).rental_state)
        const extraData = parseJsonValue((snap as any).extra_data)

        let sItems: any[] = []
        if (rState && Array.isArray(rState.items) && rState.items.length > 0) {
          sItems = rState.items
        }

        let snapCNum = ''
        if (rState && rState.contract_number) {
          snapCNum = String(rState.contract_number).trim().toUpperCase()
        }
        if (!snapCNum && extraData && extraData.contract_number) {
          snapCNum = String(extraData.contract_number).trim().toUpperCase()
        }
        if (!snapCNum) {
          const snapDesc = String((snap as any).description || '')
          const mC = snapDesc.match(/LOC-\d+/)
          if (mC) snapCNum = mC[0].toUpperCase()
        }

        const snapEntry = {
          id: snap.id,
          actionType,
          items: sItems,
          total: rState && rState.total !== undefined ? Number(rState.total) : null,
          created: (snap as any).created,
        }

        if (sRentalId) {
          if (!snapshotsByRentalId[sRentalId]) snapshotsByRentalId[sRentalId] = []
          snapshotsByRentalId[sRentalId].push(snapEntry)
        }
        if (snapCNum) {
          if (!snapshotsByContractNum[snapCNum]) snapshotsByContractNum[snapCNum] = []
          snapshotsByContractNum[snapCNum].push(snapEntry)
        }
      }

      // 3. Carregar auditoria_contratos
      const allAuditorias = await pb
        .collection('auditoria_contratos')
        .getFullList({
          fields: 'id,rental_id,campos_antigos,campos_novos,created,acao',
          sort: '-created',
          requestKey: 'no_source_auditorias',
        })
        .catch(() => [])

      const auditByRentalId: Record<string, any[]> = {}
      const auditByContractNum: Record<string, any[]> = {}

      for (const audit of allAuditorias) {
        const aRentalId = (audit as any).rental_id
        const cAntigos = parseJsonValue((audit as any).campos_antigos)
        const cNovos = parseJsonValue((audit as any).campos_novos)

        let candidateAuditItems: any[] | null = null
        let cnFromAudit = ''

        if (cAntigos && cAntigos.items) {
          const rawA = parseJsonValue(cAntigos.items)
          if (Array.isArray(rawA) && rawA.length > 0) candidateAuditItems = rawA
          if (cAntigos.contract_number) {
            cnFromAudit = String(cAntigos.contract_number).trim().toUpperCase()
          }
        }
        if (!candidateAuditItems && cNovos && cNovos.items) {
          const rawN = parseJsonValue(cNovos.items)
          if (Array.isArray(rawN) && rawN.length > 0) candidateAuditItems = rawN
          if (!cnFromAudit && cNovos.contract_number) {
            cnFromAudit = String(cNovos.contract_number).trim().toUpperCase()
          }
        }

        if (Array.isArray(candidateAuditItems) && candidateAuditItems.length > 0) {
          const aEntry = {
            items: candidateAuditItems,
            created: (audit as any).created,
            acao: (audit as any).acao,
          }
          if (aRentalId) {
            if (!auditByRentalId[aRentalId]) auditByRentalId[aRentalId] = []
            auditByRentalId[aRentalId].push(aEntry)
          }
          if (cnFromAudit) {
            if (!auditByContractNum[cnFromAudit]) auditByContractNum[cnFromAudit] = []
            auditByContractNum[cnFromAudit].push(aEntry)
          }
        }
      }

      const pickBestSnapshotItems = (snapList: any[], _currentContractTotal: number) => {
        if (!snapList || snapList.length === 0) return null
        const validSnaps = snapList.filter((s) => hasRealProductItem(s.items, invById, invByCode))
        if (validSnaps.length === 0) return null
        return validSnaps[0].items
      }

      const pickBestAuditItems = (auditList: any[]) => {
        if (!auditList || auditList.length === 0) return null
        for (const a of auditList) {
          if (hasRealProductItem(a.items, invById, invByCode)) {
            return a.items
          }
        }
        return null
      }

      // 4. Analisar os rentals fornecidos (ou todos)
      const activeIds = new Set<string>()
      const allNoSourceIds = new Set<string>()

      for (const r of rentalsList) {
        const rId = r.id
        const cNum = String(r.contractNumber || r.contract_number || rId)
          .trim()
          .toUpperCase()
        const curTotal = Number(r.total || 0)
        const curStatus = String(r.status || '').trim()

        let sourceItems: any = null
        if (snapshotsByRentalId[rId]) {
          sourceItems = pickBestSnapshotItems(snapshotsByRentalId[rId], curTotal)
        }
        if (!sourceItems && snapshotsByContractNum[cNum]) {
          sourceItems = pickBestSnapshotItems(snapshotsByContractNum[cNum], curTotal)
        }
        if (!sourceItems && auditByRentalId[rId]) {
          sourceItems = pickBestAuditItems(auditByRentalId[rId])
        }
        if (!sourceItems && auditByContractNum[cNum]) {
          sourceItems = pickBestAuditItems(auditByContractNum[cNum])
        }

        if (!sourceItems || sourceItems.length === 0) {
          allNoSourceIds.add(rId)
          if (curStatus.toLowerCase() === 'ativo') {
            activeIds.add(rId)
          }
        }
      }

      lastFetchTime = Date.now()
      return {
        noSourceActiveIds: activeIds,
        noSourceAllIds: allNoSourceIds,
      }
    } catch (err) {
      console.error('Erro ao computar contratos sem fonte histórica:', err)
      return {
        noSourceActiveIds: new Set<string>(),
        noSourceAllIds: new Set<string>(),
      }
    }
  })()

  return cachedPromise
}
