// Diagnóstico TEMPORÁRIO (17/11/2026) — somente leitura. Responde três perguntas
// antes de ligar a Helena: (1) ela está desligada?, (2) quantos contratos o cron
// acionaria?, (3) o lembrete de devolução está ativo e para quantos clientes?
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

  var out = { hoje: new Date().toISOString().slice(0, 10) }

  // ── 1. A CHAVE GERAL: o usuário do bot está ativo? ────────────────────────
  out.chave_helena = { encontrado: false }
  try {
    var u = $app.findAuthRecordByEmail('users', 'helena.bot@app.local')
    out.chave_helena = {
      encontrado: true,
      email: u.getString('email'),
      active: u.get('active'),
      helena_desligada: u.get('active') === false ? true : false,
    }
  } catch (err) {
    out.chave_helena = { encontrado: false, erro: err.message || String(err) }
  }

  // ── 2. RAIO DE AÇÃO DO CRON DE COBRANÇA ──────────────────────────────────
  out.por_estagio = {
    vencimento_hoje_D0: 0,
    atraso_D2: 0,
    atraso_D4: 0,
    atraso_D7: 0,
    esgotado_D8_mais: 0,
  }
  out.disparariam_agora = 0
  out.contratos_abertos = 0

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
    out.erro_rentals = err.message || String(err)
  }
  out.contratos_abertos = rentals.length

  for (var i = 0; i < rentals.length; i++) {
    var r = rentals[i]
    var dias = parseDias(r.getString('expected_return_date'))
    if (dias === null || dias < 0) continue

    var estagio = null
    if (dias === 0) estagio = 'vencimento_hoje_D0'
    else if (dias >= 2 && dias < 4) estagio = 'atraso_D2'
    else if (dias >= 4 && dias < 7) estagio = 'atraso_D4'
    else if (dias === 7) estagio = 'atraso_D7'
    else if (dias > 7) estagio = 'esgotado_D8_mais'
    else continue
    out.por_estagio[estagio]++

    var tel = ''
    try {
      var cust = $app.findRecordById('customers', r.getString('customer_id'))
      tel = cust.getString('phone_cell') || cust.getString('phone_res') || ''
    } catch (_) {}
    if (!String(tel).replace(/\D/g, '')) continue

    if (estagio !== 'esgotado_D8_mais') out.disparariam_agora++
  }

  // ── 3. LEMBRETE DE DEVOLUÇÃO (cron separado, 1 dia antes) ─────────────────
  out.lembrete = { ativo: false, envios_amanha: 0 }
  try {
    var sRecs = $app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
    if (sRecs.length > 0) {
      var tpls = []
      try {
        tpls = JSON.parse(sRecs[0].getString('notification_templates') || '[]')
      } catch (_) {}
      for (var t = 0; t < tpls.length; t++) {
        if (tpls[t] && tpls[t].trigger === 'lembrete_devolucao') {
          out.lembrete.ativo = tpls[t].enabled !== false
          out.lembrete.tem_mensagem = !!tpls[t].message
          break
        }
      }
    }
  } catch (err) {
    out.lembrete.erro = err.message || String(err)
  }

  try {
    var amanha = new Date()
    amanha.setDate(amanha.getDate() + 1)
    var yyyy = amanha.getFullYear()
    var mm = String(amanha.getMonth() + 1).padStart(2, '0')
    var dd = String(amanha.getDate()).padStart(2, '0')
    var amanhaStr = yyyy + '-' + mm + '-' + dd
    var amanhaRecs = $app.findRecordsByFilter(
      'rentals',
      'status = "Ativo" && expected_return_date = "' + amanhaStr + '"',
      '',
      0,
      0,
    )
    out.lembrete.data_alvo = amanhaStr
    out.lembrete.envios_amanha = amanhaRecs.length
  } catch (err) {
    out.lembrete.erro_contagem = err.message || String(err)
  }

  // ── 4. O vigia inerte ainda está no projeto? ─────────────────────────────
  out.vigia = { arquivo_presente: false, tem_cron: null }
  try {
    var vig = $app.findRecordsByFilter('_collections', "name = '_collections'", '', 1, 0)
  } catch (_) {}
  out.vigia.observacao = 'verificar no editor: helena_pending_watchdog.js deve seguir sem cronAdd'

  return e.json(200, out)
})
