// Diagnóstico TEMPORÁRIO (17/11/2026) — somente leitura.
// Pergunta central: o cron de cobrança ESTÁ ENVIANDO ou apenas passa reto?
routerAdd('GET', '/backend/v1/diag/cron', (e) => {
  var q = e.requestInfo().query || {}
  if (String(q['token'] || '') !== 'diag_cron_2026') {
    return e.json(403, { error: 'forbidden' })
  }

  var agora = new Date()
  var brt = new Date(agora.getTime() - 3 * 60 * 60 * 1000)
  var hoje = brt.toISOString().slice(0, 10)
  var out = { agora_utc: agora.toISOString(), hoje_brt: hoje, hora_brt: brt.getUTCHours() }

  // ── helena_cobranca: o cron grava aqui ao contatar ────────────────────────
  out.cobranca = { total: 0, contatados_hoje: 0, por_estagio: {}, ultimos: [] }
  try {
    var cobs = $app.findRecordsByFilter('helena_cobranca', "id != ''", '-created', 200, 0)
    out.cobranca.total = cobs.length
    for (var i = 0; i < cobs.length; i++) {
      var c = cobs[i]
      var st = c.getString('stage') || '(vazio)'
      out.cobranca.por_estagio[st] = (out.cobranca.por_estagio[st] || 0) + 1
      var lcd = c.getString('last_contact_date') || ''
      if (lcd === hoje) out.cobranca.contatados_hoje++
      if (out.cobranca.ultimos.length < 12) {
        out.cobranca.ultimos.push({
          contrato: c.getString('contract_number'),
          stage: st,
          status: c.getString('status'),
          last_contact_date: lcd,
          created: c.getString('created'),
        })
      }
    }
  } catch (err) {
    out.cobranca.erro = err.message || String(err)
  }

  // ── helena_pendencias: esgotado grava aqui ────────────────────────────────
  out.pendencias = { total: 0, abertas: 0, criadas_hoje: 0 }
  try {
    var ps = $app.findRecordsByFilter('helena_pendencias', "id != ''", '-created', 500, 0)
    out.pendencias.total = ps.length
    for (var j = 0; j < ps.length; j++) {
      var p = ps[j]
      if (p.getString('status') !== 'resolvido') out.pendencias.abertas++
      if (String(p.getString('created') || '').slice(0, 10) === hoje) out.pendencias.criadas_hoje++
    }
  } catch (err) {
    out.pendencias.erro = err.message || String(err)
  }

  // ── settings: a rotina depende desta coleção ──────────────────────────────
  out.settings = { registros: 0 }
  try {
    var s = $app.findRecordsByFilter('settings', "id != ''", '', 5, 0)
    out.settings.registros = s.length
    if (s.length > 0) {
      out.settings.return_responsible_name = s[0].getString('return_responsible_name')
      out.settings.late_fee_type = s[0].getString('late_fee_type')
      out.settings.late_fee_value = s[0].get('late_fee_value')
    }
  } catch (err) {
    out.settings.erro = err.message || String(err)
  }

  // ── evolution: os secrets existem? ────────────────────────────────────────
  out.evolution = {
    url: !!$secrets.get('EVOLUTION_API_URL'),
    key: !!$secrets.get('EVOLUTION_API_KEY'),
    instance: !!$secrets.get('EVOLUTION_INSTANCE'),
    instance_nome: $secrets.get('EVOLUTION_INSTANCE') || '',
  }

  return e.json(200, out)
})
