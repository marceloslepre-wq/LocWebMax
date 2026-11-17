// Verificação FINAL da 0135 (17/11/2026) — somente leitura, temporária.
// Depois de encerrar os ciclos órfãos, os contratos renovados voltam a ser
// cobrados? E quantas mensagens o cron dispararia amanhã?
routerAdd('GET', '/backend/v1/diag/final', (e) => {
  var q = e.requestInfo().query || {}
  if (String(q['token'] || '') !== 'diag_final_2026') {
    return e.json(403, { error: 'forbidden' })
  }

  var brt = new Date(Date.now() - 3 * 60 * 60 * 1000)
  var yyyy = brt.getUTCFullYear()
  var mm = String(brt.getUTCMonth() + 1).padStart(2, '0')
  var dd = String(brt.getUTCDate()).padStart(2, '0')
  var hoje = yyyy + '-' + mm + '-' + dd

  function diasVencido(raw) {
    if (!raw) return null
    var clean = String(raw).split('T')[0].split(' ')[0]
    var p = clean.split('-')
    if (p.length !== 3) return null
    var t = Date.UTC(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10))
    var c = Date.UTC(yyyy, parseInt(mm, 10) - 1, parseInt(dd, 10))
    return Math.floor((c - t) / 86400000)
  }
  function alvo(d) {
    if (d === 0) return 'vencimento_hoje'
    if (d >= 2 && d < 4) return 'atraso_d2'
    if (d >= 4 && d < 7) return 'atraso_d4'
    if (d === 7) return 'atraso_d7'
    if (d > 7) return 'esgotado'
    return null
  }

  var out = { hoje: hoje, encerrados: 0, por_estagio: {}, acionaveis: 0, lista: [] }

  // Ciclos encerrados pela 0135
  try {
    var enc = $app.findRecordsByFilter(
      'helena_cobranca',
      'status = "encerrado" && notes ~ "Ciclo encerrado"',
      '-created',
      100,
      0,
    )
    out.encerrados = enc.length
    out.encerrados_contratos = enc.map(function (r) {
      return r.getString('contract_number')
    })
  } catch (_) {}

  var cands = []
  try {
    cands = $app.findRecordsByFilter(
      'rentals',
      '(status = "Ativo" || status = "Atrasado") && actual_return_date = "" && expected_return_date <= "' +
        hoje +
        ' 23:59:59.999Z"',
      'expected_return_date',
      0,
      0,
    )
  } catch (err) {
    return e.json(500, { error: err.message || String(err) })
  }

  var ORDEM = ['vencimento_hoje', 'atraso_d2', 'atraso_d4', 'atraso_d7', 'esgotado']

  for (var i = 0; i < cands.length; i++) {
    var r = cands[i]
    var d = diasVencido(r.getString('expected_return_date'))
    var t = d === null ? null : alvo(d)
    if (t === null) continue
    out.por_estagio[t] = (out.por_estagio[t] || 0) + 1

    var atual = '(sem registro)'
    var status = ''
    var notas = ''
    try {
      var c = $app.findRecordsByFilter(
        'helena_cobranca',
        'rental_id = "' + r.id + '"',
        '-created',
        5,
        0,
      )
      // considera só o registro VIVO (não encerrado)
      for (var k = 0; k < c.length; k++) {
        if (c[k].getString('status') === 'encerrado') continue
        atual = c[k].getString('stage') || '(vazio)'
        status = c[k].getString('status')
        notas = String(c[k].getString('notes') || '')
        break
      }
    } catch (_) {}

    var pendente = false
    try {
      pendente =
        $app.findRecordsByFilter(
          'helena_pendencias',
          'rental_id = "' + r.id + '" && status != "resolvido"',
          '-created',
          1,
          0,
        ).length > 0
    } catch (_) {}

    var pix = false
    try {
      pix =
        $app.findRecordsByFilter(
          'payments',
          'rental_id = "' + r.id + '" && status = "Pendente"',
          '-created',
          1,
          0,
        ).length > 0
    } catch (_) {}

    var motivo = 'ACIONAVEL'
    if (atual === t) motivo = 'ja no estagio de hoje'
    else if (atual === 'esgotado' || status === 'repassado_loja') motivo = 'ja com a Cristiani'
    else if (t === 'esgotado' && pendente) motivo = 'esgotado com pendencia aberta'
    else if (status === 'intencao_renovacao' || status === 'aguardando_pagamento')
      motivo = 'cliente se posicionou'
    else if (
      notas.indexOf('intencao_renovacao') !== -1 ||
      notas.indexOf('aguardando_pagamento') !== -1
    )
      motivo = 'cliente se posicionou'
    else if (pix) motivo = 'pix pendente ja gerado'
    else {
      var ia = ORDEM.indexOf(atual)
      var al = ORDEM.indexOf(t)
      if (ia !== -1 && al !== -1 && al < ia)
        motivo = 'TRAVA ANTI-REGRESSAO (bug se nao for ciclo antigo)'
    }

    if (motivo === 'ACIONAVEL') out.acionaveis++

    if (out.lista.length < 20) {
      out.lista.push({
        contrato: r.getString('contract_number'),
        dias: d,
        alvo: t,
        atual: atual,
        motivo: motivo,
      })
    }
  }

  return e.json(200, out)
})
