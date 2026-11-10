// DIAGNÓSTICO TEMPORÁRIO — leitura protegida por secret (remover após uso).
// Objetivo: listar contratos que estão com `items` vazio (vítimas do bug do
// return_rental que apagava os itens) e, para cada um, recuperar os itens a
// partir do snapshot de devolução (rental_snapshots.rental_state.items).
routerAdd('GET', '/backend/v1/diag/items-audit', (e) => {
  var expected = $secrets.get('DIAG_READ_TOKEN') || ''
  var given = String(e.request.url.query().get('token') || '')
  if (!expected || given !== expected) return e.json(403, { error: 'forbidden' })

  var limit = Number(e.request.url.query().get('limit') || 200)
  if (!limit || limit < 1 || limit > 500) limit = 200

  var rentals = []
  try {
    rentals = $app.findRecordsByFilter('rentals', "contract_number != ''", '-created', limit, 0)
  } catch (err) {
    return e.json(500, { error: 'query failed: ' + (err.message || String(err)) })
  }

  var emptyOnes = []
  var okCount = 0

  var countItems = function (value, depth) {
    if (depth > 4 || value === null || value === undefined) return 0
    if (typeof value === 'string') {
      var t = value.trim()
      if (!t || t === 'null' || t === '[]') return 0
      var c = t.charAt(0)
      if (c === '[' || c === '{' || c === '"') {
        try {
          return countItems(JSON.parse(t), depth + 1)
        } catch (_) {}
      }
      return 0
    }
    if (Array.isArray(value)) {
      var total = 0
      for (var i = 0; i < value.length; i++) total += countItems(value[i], depth + 1)
      return total
    }
    if (typeof value === 'object') {
      if (Array.isArray(value.items)) return countItems(value.items, depth + 1)
      if (Array.isArray(value.itens)) return countItems(value.itens, depth + 1)
      return 1
    }
    return 0
  }

  for (var i = 0; i < rentals.length; i++) {
    var r = rentals[i]
    var n = countItems(r.get('items'), 0)
    if (n > 0) {
      okCount++
      continue
    }

    var entry = {
      id: r.id,
      contract: r.getString('contract_number'),
      status: r.getString('status'),
      created: r.getString('created'),
      raw_items: String(r.getString('items') || '').substring(0, 200),
      snapshot_items: null,
      snapshot_action: null,
      snapshot_created: null,
    }

    // buscar snapshot de devolução mais recente deste contrato
    try {
      var snaps = $app.findRecordsByFilter(
        'rental_snapshots',
        'rental_id = "' + r.id + '"',
        '-created',
        1,
        0,
      )
      if (snaps.length > 0) {
        var s = snaps[0]
        entry.snapshot_action = s.getString('action_type')
        entry.snapshot_created = s.getString('created')
        var st = s.get('rental_state')
        if (typeof st === 'string') {
          try {
            st = JSON.parse(st)
          } catch (_) {}
        }
        if (st && typeof st === 'object') {
          var si = st.items
          var siCount = countItems(si, 0)
          entry.snapshot_items_count = siCount
          entry.snapshot_items = si
        }
      }
    } catch (_) {}

    emptyOnes.push(entry)
  }

  return e.json(200, {
    checked: rentals.length,
    with_items: okCount,
    empty_total: emptyOnes.length,
    empty: emptyOnes,
  })
})
