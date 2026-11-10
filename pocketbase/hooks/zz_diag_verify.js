// DIAGNÓSTICO TEMPORÁRIO — leitura protegida por secret (remover após uso).
// Valida a correção do campo `items`: roda EXATAMENTE o normalizador publicado
// contra os contratos reais e reporta quantos itens ele extrai de cada um.
routerAdd('GET', '/backend/v1/diag/items-verify', (e) => {
  var expected = $secrets.get('DIAG_READ_TOKEN') || ''
  var given = String(e.request.url.query().get('token') || '')
  if (!expected || given !== expected) return e.json(403, { error: 'forbidden' })

  var limit = Number(e.request.url.query().get('limit') || 20)
  if (!limit || limit < 1 || limit > 100) limit = 20

  // Cópia exata do normalizador que está nos hooks de notificação publicados.
  var normalizeItems = function (value, depth) {
    if (depth > 4 || value === null || value === undefined) return []
    if (typeof value === 'string') {
      var trimmed = value.trim()
      if (!trimmed) return []
      if (trimmed === 'null' || trimmed === 'undefined') return []
      var firstChar = trimmed.charAt(0)
      if (firstChar === '[' || firstChar === '{' || firstChar === '"') {
        try {
          return normalizeItems(JSON.parse(trimmed), depth + 1)
        } catch (_) {}
      }
      return [{ name: trimmed, qty: 1 }]
    }
    if (Array.isArray(value)) {
      var allBytes = value.length > 0
      for (var b = 0; b < value.length; b++) {
        var el = value[b]
        if (typeof el !== 'number' || el < 0 || el > 255 || el !== Math.floor(el)) {
          allBytes = false
          break
        }
      }
      if (allBytes) {
        var byteStr = ''
        for (var by = 0; by < value.length; by++) byteStr += String.fromCharCode(value[by])
        return normalizeItems(byteStr, depth + 1)
      }
      var flat = []
      for (var n = 0; n < value.length; n++) {
        var part = normalizeItems(value[n], depth + 1)
        for (var p = 0; p < part.length; p++) flat.push(part[p])
      }
      return flat
    }
    if (typeof value === 'object') {
      if (Array.isArray(value.items)) return normalizeItems(value.items, depth + 1)
      if (Array.isArray(value.itens)) return normalizeItems(value.itens, depth + 1)
      return [value]
    }
    return []
  }

  var rentals = []
  try {
    rentals = $app.findRecordsByFilter('rentals', "contract_number != ''", '-created', limit, 0)
  } catch (err) {
    return e.json(500, { error: 'query failed: ' + (err.message || String(err)) })
  }

  var results = []
  var withItems = 0
  for (var i = 0; i < rentals.length; i++) {
    var r = rentals[i]
    var items = normalizeItems(r.getString('items'), 0)
    if (items.length === 0) items = normalizeItems(r.get('items'), 0)

    var names = []
    for (var k = 0; k < items.length; k++) {
      var it = items[k]
      var nm = it.name || it.description || it.descricao || it.productName || it.nome || ''
      var q = Number(it.qty || it.quantity || it.quantidade || 1) || 1
      if (nm) names.push(q + ' x ' + nm)
    }
    if (items.length > 0) withItems++
    results.push({
      contract: r.getString('contract_number'),
      status: r.getString('status'),
      parsed_items: items.length,
      rendered: names,
    })
  }

  return e.json(200, {
    checked: rentals.length,
    with_items: withItems,
    results: results,
  })
})
