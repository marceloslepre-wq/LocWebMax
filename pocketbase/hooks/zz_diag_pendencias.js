// Diagnóstico temporário: conta pendências antes/depois da dedup.
// Token fixo, leitura apenas.
routerAdd(
  'GET',
  '/backend/v1/diag/pendencias',
  (e) => {
    const token = e.requestInfo().query['token'] || ''
    if (token !== 'diag_pend_2026') {
      return e.json(403, { error: 'forbidden' })
    }

    const out = { total: 0, pendentes: 0, resolvidas: 0, porContrato: [], duplicados: 0 }

    try {
      let todas = []
      try {
        todas = $app.findRecordsByFilter('helena_pendencias', "id != ''", '-created', 2000, 0)
      } catch (_) {
        todas = []
      }
      out.total = todas.length

      const abertas = {}
      for (const r of todas) {
        const st = r.getString('status')
        if (st === 'resolvido') out.resolvidas++
        else out.pendentes++

        if (st !== 'resolvido') {
          const k = r.getString('contract_number') || r.getString('rental_id') || r.id
          abertas[k] = (abertas[k] || 0) + 1
        }
      }

      for (const k of Object.keys(abertas)) {
        if (abertas[k] > 1) {
          out.duplicados++
          out.porContrato.push({ contrato: k, abertas: abertas[k] })
        }
      }
    } catch (err) {
      out.erro = err.message || String(err)
    }

    return e.json(200, out)
  },
  $apis.public(),
)
