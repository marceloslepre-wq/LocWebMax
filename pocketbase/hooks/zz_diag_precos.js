// Diagnóstico temporário de preços: confere se monthly_price está preenchido.
// Token fixo, somente leitura. Será desativado depois da verificação.
routerAdd(
  'GET',
  '/backend/v1/diag/precos',
  (e) => {
    const token = e.requestInfo().query['token'] || ''
    if (token !== 'diag_precos_2026') {
      return e.json(403, { error: 'forbidden' })
    }

    const out = { total: 0, comMensal: 0, semMensalComDiaria: 0, semNenhum: 0, amostra: [] }

    let inv = []
    try {
      inv = $app.findRecordsByFilter('inventory', "id != ''", '-created', 3000, 0)
    } catch (err) {
      return e.json(500, { error: err.message || String(err) })
    }
    out.total = inv.length

    for (const r of inv) {
      const m = Number(r.get('monthly_price') || 0)
      const d = Number(r.get('daily_price') || 0)
      if (m > 0) out.comMensal++
      else if (d > 0) out.semMensalComDiaria++
      else out.semNenhum++

      if (out.amostra.length < 12) {
        out.amostra.push({
          code: r.getString('code'),
          name: String(r.getString('name') || '').substring(0, 40),
          monthly: m,
          daily: d,
          calc15_porMensal: m > 0 ? Math.round((m / 2) * 100) / 100 : null,
          calc15_porDiaria: d > 0 ? Math.round(d * 15 * 100) / 100 : null,
        })
      }
    }

    return e.json(200, out)
  },
  $apis.public(),
)
