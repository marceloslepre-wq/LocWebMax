/// <reference path="../pb_data/types.d.ts" />
/**
 * CONFERÊNCIA AUTOMÁTICA DOS PIX PENDENTES (22/11/2026)
 *
 * Rede de segurança caso o aviso do Mercado Pago (mp_webhook) não chegue.
 * A cada 10 minutos consulta no Mercado Pago os PIX ainda "Pendente" criados
 * nas últimas 48h. Se algum foi pago, muda para "Aprovado" — o que dispara a
 * renovação do contrato e o recibo (hooks/payment_approved_renewal.js).
 * Expirado/cancelado vira "Rejeitado". Não envia nada por conta própria.
 *
 * Tudo dentro do callback (o JSVM roda cada callback em VM separada).
 */
cronAdd('mp_pix_poll', '*/10 * * * *', () => {
  var accessToken = $secrets.get('MERCADO_PAGO_ACCESS_TOKEN') || ''
  if (!accessToken) return

  var desde = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString().replace('T', ' ')
  var pendentes = []
  try {
    pendentes = $app.findRecordsByFilter(
      'payments',
      "status = 'Pendente' && mp_payment_id != '' && created >= {:desde}",
      '-created',
      100,
      0,
      { desde: desde },
    )
  } catch (_) {
    return
  }

  for (var i = 0; i < pendentes.length; i++) {
    var pay = pendentes[i]
    var mpId = pay.getString('mp_payment_id')
    try {
      var res = $http.send({
        url: 'https://api.mercadopago.com/v1/payments/' + mpId,
        method: 'GET',
        headers: { Authorization: 'Bearer ' + accessToken },
        timeout: 20,
      })
      if (res.statusCode < 200 || res.statusCode >= 300 || !res.json) continue
      var st = String(res.json.status || '')
      var novo = ''
      if (st === 'approved') novo = 'Aprovado'
      else if (st === 'rejected' || st === 'cancelled' || st === 'expired') novo = 'Rejeitado'
      if (!novo) continue

      // Relê para não sobrescrever uma mudança feita no meio do caminho.
      var atual = $app.findRecordById('payments', pay.id)
      if (atual.getString('status') !== 'Pendente') continue
      atual.set('status', novo)
      $app.save(atual)
      $app.logger().info('mp_pix_poll: status atualizado', 'payment', pay.id, 'status', novo)
    } catch (err) {
      $app
        .logger()
        .warn('mp_pix_poll: falha ao consultar', 'payment', pay.id, 'err', err.message || String(err))
    }
  }
})
