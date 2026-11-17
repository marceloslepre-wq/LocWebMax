// Diagnóstico TEMPORÁRIO (17/11/2026): quantos contratos o cron de cobrança
// acionaria AGORA, se a Helena fosse habilitada. Somente leitura.
// Serve para o Marcelo saber o tamanho do primeiro disparo antes de ligar —
// ele já teve um disparo em massa em 12/11.
routerAdd('GET', '/backend/v1/diag/raio', (e) => {
  var q = e.requestInfo().query || {}
  if (String(q['token'] || '') !== 'diag_raio_2026') {
    return e.json(403, { error: 'forbidden' })
  }

  function parseDias(raw) {
    if (!raw) return null
    var d = new Date(String(raw).replace(' ', 'T'))
    if (isNaN(d.getTime())) return null
    var hoje = new Date()
    var a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())
    var b = Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate())
    return Math.round((b - a) / 86400000)
  }

  var out = {
    hoje: new Date().toISOString().slice(0, 10),
    total_contratos_abertos: 0,
    fora_do_ciclo: 0,
    sem_telefone: 0,
    com_pendencia_aberta: 0,
    por_estagio: {
      vencimento_hoje_D0: 0,
      atraso_D2: 0,
      atraso_D4: 0,
      atraso_D7: 0,
      esgotado_D8_mais: 0,
    },
    disparariam_agora: 0,
    amostra: [],
  }

  var rentals = []
  try {
    rentals = $app.findRecordsByFilter(
      'rentals',
      '(status = "Ativo" || status = "Atrasado") && actual_return_date = ""',
      'expected_return_date',
      5000,
      0,
    )
  } catch (err) {
    return e.json(500, { error: err.message || String(err) })
  }
  out.total_contratos_abertos = rentals.length

  for (var i = 0; i < rentals.length; i++) {
    var r = rentals[i]
    var dias = parseDias(r.getString('expected_return_date'))
    if (dias === null || dias < 0) {
      out.fora_do_ciclo++
      continue
    }

    var estagio = null
    if (dias === 0) estagio = 'vencimento_hoje_D0'
    else if (dias >= 2 && dias < 4) estagio = 'atraso_D2'
    else if (dias >= 4 && dias < 7) estagio = 'atraso_D4'
    else if (dias === 7) estagio = 'atraso_D7'
    else if (dias > 7) estagio = 'esgotado_D8_mais'
    else {
      out.fora_do_ciclo++
      continue
    }
    out.por_estagio[estagio]++

    // telefone do cliente
    var tel = ''
    try {
      var cust = $app.findRecordById('customers', r.getString('customer_id'))
      tel = cust.getString('phone_cell') || cust.getString('phone_res') || ''
    } catch (_) {}
    var telLimpo = String(tel).replace(/\D/g, '')
    if (!telLimpo) {
      out.sem_telefone++
      continue
    }

    // já existe pendência aberta? (evita duplicata, e em esgotado significa que
    // a Cristiani já recebeu o caso)
    var temPendencia = false
    try {
      var p = $app.findRecordsByFilter(
        'helena_pendencias',
        'rental_id = "' + r.id + '" && status != "resolvido"',
        '-created',
        1,
        0,
      )
      temPendencia = p.length > 0
    } catch (_) {}
    if (temPendencia) out.com_pendencia_aberta++

    var vaiFalar = true
    var motivo = 'mensagem ao cliente'
    if (estagio === 'esgotado_D8_mais') {
      vaiFalar = false
      motivo = temPendencia ? 'ja repassado a Cristiani' : 'repassa a Cristiani (sem mensagem)'
      if (!temPendencia) out.disparariam_agora++
    } else {
      out.disparariam_agora++
    }

    if (out.amostra.length < 25) {
      out.amostra.push({
        contrato: r.getString('contract_number') || r.id,
        dias_atraso: dias,
        estagio: estagio,
        telefone: telLimpo ? telLimpo.substring(0, 4) + '****' + telLimpo.slice(-4) : '',
        vai_enviar: vaiFalar,
        motivo: motivo,
      })
    }
  }

  return e.json(200, out)
})
