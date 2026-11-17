// Diagnóstico temporário de preços — somente leitura, token fixo.
routerAdd('GET', '/backend/v1/diag/precos', (e) => {
  var token = String(e.request.pathValue('x') || '')
  var q = e.requestInfo().query || {}
  token = String(q['token'] || '')

  if (token !== 'diag_precos_2026') {
    return e.json(403, { error: 'forbidden' })
  }

  var out = { total: 0, comMensal: 0, semMensalComDiaria: 0, semNenhum: 0, amostra: [] }

  var inv = []
  try {
    inv = $app.findRecordsByFilter('inventory', "id != ''", '-created', 3000, 0)
  } catch (err) {
    return e.json(500, { error: err.message || String(err) })
  }
  out.total = inv.length

  for (var i = 0; i < inv.length; i++) {
    var r = inv[i]
    var m = Number(r.get('monthly_price') || 0)
    var d = Number(r.get('daily_price') || 0)
    if (m > 0) out.comMensal++
    else if (d > 0) out.semMensalComDiaria++
    else out.semNenhum++

    if (out.amostra.length < 14) {
      out.amostra.push({
        code: r.getString('code'),
        name: String(r.getString('name') || '').substring(0, 38),
        monthly: m,
        daily: d,
        calc15_porMensal: m > 0 ? Math.round((m / 2) * 100) / 100 : null,
        calc15_porDiaria: d > 0 ? Math.round(d * 15 * 100) / 100 : null,
      })
    }
  }

  return e.json(200, out)
})
