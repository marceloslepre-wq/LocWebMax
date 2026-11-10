// DIAGNÓSTICO TEMPORÁRIO — remover depois de ler o resultado.
// Expõe a estrutura REAL do campo `items` de um contrato, para descobrir por que
// as notificações saem com "Nenhum item listado". Somente leitura.
routerAdd('GET', '/backend/v1/diag/items', (e) => {
  var contract = String(e.request.url.query().get('contract') || 'LOC-00493')

  var rec = null
  try {
    var found = $app.findRecordsByFilter(
      'rentals',
      'contract_number = "' + contract + '"',
      '-created',
      1,
      0,
    )
    if (found.length > 0) rec = found[0]
  } catch (err) {
    return e.json(500, { error: 'query failed: ' + (err.message || String(err)) })
  }

  if (!rec) return e.json(404, { error: 'contract not found', contract: contract })

  var raw = rec.get('items')
  var strVal = ''
  try {
    strVal = rec.getString('items') || ''
  } catch (_) {}

  var out = {
    contract: contract,
    id: rec.id,
    get_typeof: typeof raw,
    get_isArray: Array.isArray(raw),
    get_tostring: Object.prototype.toString.call(raw),
    get_JSON: null,
    getString_length: strVal.length,
    getString_preview: strVal.substring(0, 1200),
  }

  try {
    out.get_JSON = JSON.stringify(raw)
    if (out.get_JSON && out.get_JSON.length > 2000) {
      out.get_JSON = out.get_JSON.substring(0, 2000) + '...[truncated]'
    }
  } catch (_) {
    out.get_JSON = 'unserializable'
  }

  // profundidade real do JSON armazenado
  try {
    var p1 = JSON.parse(strVal)
    out.parse1_type = typeof p1
    out.parse1_isArray = Array.isArray(p1)
    if (Array.isArray(p1)) {
      out.parse1_len = p1.length
      if (p1.length > 0) {
        out.parse1_firstKeys = Object.keys(p1[0])
        out.parse1_first = JSON.stringify(p1[0]).substring(0, 600)
      }
    } else if (typeof p1 === 'string') {
      try {
        var p2 = JSON.parse(p1)
        out.parse2_type = typeof p2
        out.parse2_isArray = Array.isArray(p2)
        if (Array.isArray(p2) && p2.length > 0) {
          out.parse2_len = p2.length
          out.parse2_firstKeys = Object.keys(p2[0])
          out.parse2_first = JSON.stringify(p2[0]).substring(0, 600)
        }
      } catch (e2) {
        out.parse2_error = String(e2)
      }
    }
  } catch (e1) {
    out.parse1_error = String(e1)
  }

  return e.json(200, out)
})
