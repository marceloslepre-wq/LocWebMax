// Diagnóstico TEMPORÁRIO (17/11/2026) — somente leitura.
// Por que o cron não contata ninguém? Para cada candidato, compara o estágio-alvo
// (calculado pela data de vencimento) com o estágio JÁ GRAVADO em helena_cobranca.
// Se forem iguais, o cron não tem o que fazer hoje — e isso é comportamento certo.
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

  function diasVencido(raw) {
    if (!raw) return null
    var clean = String(raw).split('T')[0].split(' ')[0]
    var parts = clean.split('-')
    if (parts.length !== 3) return null
    var target = Date.UTC(
      parseInt(parts[0], 10),
      parseInt(parts[1], 10) - 1,
      parseInt(parts[2], 10),
    )
    var current = Date.UTC(yyyy, parseInt(mm, 10) - 1, parseInt(dd, 10))
    return Math.floor((current - target) / 86400000)
  }

  function alvo(dias) {
    if (dias === 0) return 'vencimento_hoje'
    if (dias >= 2 && dias < 4) return 'atraso_d2'
    if (dias >= 4 && dias < 7) return 'atraso_d4'
    if (dias === 7) return 'atraso_d7'
    if (dias > 7) return 'esgotado'
    return null
  }

  var out = { hoje_brt: hoje, candidatos: 0, ja_no_estagio: 0, acionaveis: 0, detalhe: [] }

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
  out.candidatos = cands.length

  for (var i = 0; i < cands.length; i++) {
    var r = cands[i]
    var dias = diasVencido(r.getString('expected_return_date'))
    var t = dias === null ? null : alvo(dias)
    var contrato = r.getString('contract_number') || r.id

    var stageAtual = '(sem registro)'
    var statusCob = ''
    var contato = ''
    try {
      var c = $app.findRecordsByFilter(
        'helena_cobranca',
        'rental_id = "' + r.id + '"',
        '-created',
        1,
        0,
      )
      if (c.length > 0) {
        stageAtual = c[0].getString('stage') || '(vazio)'
        statusCob = c[0].getString('status')
        contato = c[0].getString('last_contact_date')
      }
    } catch (_) {}

    var pendenciaAberta = false
    try {
      var p = $app.findRecordsByFilter(
        'helena_pendencias',
        'rental_id = "' + r.id + '" && status != "resolvido"',
        '-created',
        1,
        0,
      )
      pendenciaAberta = p.length > 0
    } catch (_) {}

    // Regras de skip do cron
    var motivo = ''
    if (t === null) motivo = 'fora do ciclo (D+1)'
    else if (stageAtual === t) motivo = 'ja esta no estagio de hoje'
    else if (stageAtual === 'esgotado' || statusCob === 'repassado_loja')
      motivo = 'ja repassado a Cristiani'
    else if (t === 'esgotado' && pendenciaAberta) motivo = 'esgotado com pendencia aberta'
    else motivo = 'ACIONAVEL'

    // Pausa de conversa: o cron não cobra quem está com atendimento humano aberto.
    var pausadaAte = ''
    var motivoPausa = ''
    try {
      var custRec = $app.findRecordById('customers', r.getString('customer_id'))
      var telWA = String(
        custRec.getString('phone_cell') || custRec.getString('phone_res') || '',
      ).replace(/\D/g, '')
      if (telWA && telWA.substring(0, 2) !== '55') telWA = '55' + telWA
      if (telWA) {
        var convs = $app.findRecordsByFilter(
          'whatsapp_conversations',
          'phone = "' + telWA + '"',
          '-created',
          1,
          0,
        )
        if (convs.length > 0) {
          pausadaAte = convs[0].getString('helena_paused_until') || ''
          var pn = pausadaAte ? String(pausadaAte).replace(' ', 'T') : ''
          if (pn && new Date(pn).getTime() > Date.now()) {
            motivoPausa = 'conversa pausada (loja assumiu)'
          }
          var dono = convs[0].getString('last_owner_message_at') || ''
          if (dono) motivoPausa = (motivoPausa ? motivoPausa + ' / ' : '') + 'loja respondeu ' + String(dono).slice(0, 16)
        }
      }
    } catch (_) {}

    if (motivoPausa && pausadaAte && new Date(String(pausadaAte).replace(' ', 'T')).getTime() > Date.now()) {
      motivo = 'PAUSADO: ' + motivoPausa
    }

    if (motivo === 'ACIONAVEL') out.acionaveis++
    else out.ja_no_estagio++

    out.detalhe.push({
      contrato: contrato,
      dias: dias,
      alvo: t,
      atual: stageAtual,
      status: statusCob,
      contato: contato,
      motivo: motivo,
    })
  }

  return e.json(200, out)
})
