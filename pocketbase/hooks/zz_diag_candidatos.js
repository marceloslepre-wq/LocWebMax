// Diagnóstico TEMPORÁRIO (17/11/2026) — somente leitura.
// Replica EXATAMENTE a consulta do cron de cobrança para descobrir por que ele
// não está contatando ninguém: a consulta devolve candidatos ou está zerada?
routerAdd('GET', '/backend/v1/diag/candidatos', (e) => {
  var q = e.requestInfo().query || {}
  if (String(q['token'] || '') !== 'diag_cand_2026') {
    return e.json(403, { error: 'forbidden' })
  }

  var brt = new Date(Date.now() - 3 * 60 * 60 * 1000)
  var yyyy = brt.getUTCFullYear()
  var mm = String(brt.getUTCMonth() + 1).padStart(2, '0')
  var dd = String(brt.getUTCDate()).padStart(2, '0')
  var hoje = yyyy + '-' + mm + '-' + dd

  var out = { hoje_brt: hoje, filtro_usado: '', candidatos: 0, amostra: [] }

  var filtro =
    '(status = "Ativo" || status = "Atrasado") && actual_return_date = "" && expected_return_date <= "' +
    hoje +
    ' 23:59:59.999Z"'
  out.filtro_usado = filtro

  try {
    var c = $app.findRecordsByFilter('rentals', filtro, 'expected_return_date', 0, 0)
    out.candidatos = c.length
    for (var i = 0; i < c.length && out.amostra.length < 15; i++) {
      out.amostra.push({
        contrato: c[i].getString('contract_number'),
        status: c[i].getString('status'),
        vencimento: c[i].getString('expected_return_date'),
        devolvido: c[i].getString('actual_return_date'),
      })
    }
  } catch (err) {
    out.erro = err.message || String(err)
  }

  // Comparação: sem a condição de data
  try {
    var semData = $app.findRecordsByFilter(
      'rentals',
      '(status = "Ativo" || status = "Atrasado") && actual_return_date = ""',
      '-expected_return_date',
      0,
      0,
    )
    out.sem_condicao_data = semData.length
    // Quantos têm expected_return_date vazio ou nulo?
    var semVenc = 0
    var formatos = {}
    for (var j = 0; j < semData.length; j++) {
      var v = semData[j].getString('expected_return_date')
      if (!v) semVenc++
      else {
        var chave =
          v.length > 19 ? 'longo:' + v.slice(0, 10) + v.slice(10, 13) : 'curto:' + v.slice(0, 10)
        var tipo = /^\d{4}-\d{2}-\d{2}$/.test(v) ? 'data_simples' : 'com_hora'
        formatos[tipo] = (formatos[tipo] || 0) + 1
      }
    }
    out.sem_expected_return_date = semVenc
    out.formatos = formatos
  } catch (err) {
    out.erro2 = err.message || String(err)
  }

  // settings: quantos registros? o cron pega o primeiro
  try {
    var s = $app.findRecordsByFilter('settings', "id != ''", '', 0, 0)
    out.settings_registros = s.length
    out.settings_ids = s.map(function (r) {
      return r.id + ' tenant=' + (r.getString('tenant_id') || '(vazio)')
    })
  } catch (err) {
    out.erro3 = err.message || String(err)
  }

  return e.json(200, out)
})
