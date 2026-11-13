/// <reference path="../pb_data/types.d.ts" />
/**
 * ANÁLISE TEMPORÁRIA (SOMENTE LEITURA) — auditoria dos contratos ativos.
 * GET /backend/v1/audit-contratos?token=...
 *
 * Não grava nada. Responde:
 *  - contratos com status Ativo mas data prevista já vencida (deveriam ser Atrasado)
 *  - detalhe completo dos contratos de um item (?item=<inventoryId>)
 *  - possíveis duplicidades (mesmo cliente + mesma data de início)
 *  - contratos sem cliente, sem itens ou com total zero
 *
 * REMOVER ESTE ARQUIVO após a análise.
 */
routerAdd('GET', '/backend/v1/audit-contratos', (e) => {
  if (e.request.url.query().get('token') !== 'diag_9f3k2m1q8v7x') {
    return e.unauthorizedError('token inválido')
  }
  var app = $app
  try {
    function readItems(rec) {
      var raw = ''
      try {
        raw = rec.getString('items')
      } catch (_) {
        return []
      }
      if (!raw) return []
      var p = null
      try {
        p = JSON.parse(raw)
      } catch (_) {
        return []
      }
      if (Array.isArray(p)) return p
      if (p && Array.isArray(p.items)) return p.items
      return []
    }
    function itemId(it) {
      if (!it || typeof it !== 'object') return ''
      var id = String(it.itemId || it.item_id || it.inventory_id || it.id || '')
      if (id === 'freight' || id === 'frete') return ''
      return id
    }
    function itemQty(it) {
      var raw = it.qty
      if (raw === undefined || raw === null) raw = it.quantity
      if (raw === undefined || raw === null) raw = it.quantidade
      var n = Number(raw === undefined || raw === null ? 1 : raw)
      return isNaN(n) || n <= 0 ? 1 : n
    }
    function itemReturned(it) {
      var raw = it.returnedQty
      if (raw === undefined || raw === null) raw = it.returned_qty
      if (raw === undefined || raw === null) raw = it.returned
      var n = Number(raw === undefined || raw === null ? 0 : raw)
      return isNaN(n) || n < 0 ? 0 : n
    }
    function soData(v) {
      if (!v) return ''
      var s = String(v)
      return s.split(' ')[0].split('T')[0]
    }

    var hoje = new Date().toISOString().split('T')[0]

    var all = app.findRecordsByFilter('rentals', '', '', 0, 0)

    // nomes de clientes
    var clientes = app.findRecordsByFilter('customers', '', '', 0, 0)
    var nomeCliente = {}
    for (var c = 0; c < clientes.length; c++)
      nomeCliente[clientes[c].id] = clientes[c].getString('name')

    var pendentesDeStatus = []
    var semCliente = []
    var semItens = []
    var totalZero = []
    var ativos = 0

    for (var i = 0; i < all.length; i++) {
      var r = all[i]
      var st = String(r.getString('status') || '')
      var low = st.toLowerCase()
      var previsto = soData(r.getString('expected_return_date'))
      var inicio = soData(r.getString('start_date'))
      var devolvido = soData(r.getString('actual_return_date'))
      var cid = ''
      try {
        cid = r.getString('customer_id') || ''
      } catch (_) {}
      var its = readItems(r)

      if (low !== 'ativo' && low !== 'atrasado') continue
      ativos++

      if (low === 'ativo' && previsto && previsto < hoje) {
        pendentesDeStatus.push({
          id: r.id,
          numero: r.getString('contract_number'),
          status: st,
          inicio: inicio,
          previsto: previsto,
          devolvido: devolvido,
          diasAtraso: Math.round((new Date(hoje) - new Date(previsto)) / 86400000),
          cliente: nomeCliente[cid] || (cid ? '(cliente não encontrado)' : '(sem cliente)'),
        })
      }
      if (!cid) {
        semCliente.push({ numero: r.getString('contract_number'), status: st, previsto: previsto })
      }
      if (its.length === 0) {
        semItens.push({
          numero: r.getString('contract_number'),
          status: st,
          pago: r.getFloat('total'),
        })
      }
      if (!r.getFloat('total')) {
        totalZero.push({
          numero: r.getString('contract_number'),
          status: st,
          inicio: inicio,
          previsto: previsto,
        })
      }
    }

    // ---------- detalhe do item solicitado ----------
    var alvoItem = e.request.url.query().get('item') || ''
    var detalhe = []
    var duplicados = []
    if (alvoItem) {
      var porClienteData = {}
      for (var a = 0; a < all.length; a++) {
        var rr = all[a]
        var lowr = String(rr.getString('status') || '').toLowerCase()
        if (lowr !== 'ativo' && lowr !== 'atrasado') continue
        var itsr = readItems(rr)
        var qtd = 0
        var dev = 0
        for (var k = 0; k < itsr.length; k++) {
          if (itemId(itsr[k]) !== alvoItem) continue
          qtd += itemQty(itsr[k])
          dev += itemReturned(itsr[k])
        }
        if (qtd === 0) continue
        var cidr = ''
        try {
          cidr = rr.getString('customer_id') || ''
        } catch (_) {}
        var ini = soData(rr.getString('start_date'))
        var registro = {
          id: rr.id,
          numero: rr.getString('contract_number'),
          status: rr.getString('status'),
          cliente: nomeCliente[cidr] || (cidr ? '(cliente não encontrado)' : '(sem cliente)'),
          clienteId: cidr,
          inicio: ini,
          previsto: soData(rr.getString('expected_return_date')),
          devolvidoEm: soData(rr.getString('actual_return_date')),
          qtd: qtd,
          devolvido: dev,
          liquido: qtd - dev,
          total: rr.getFloat('total'),
          local: rr.getString('local_retirada_id'),
          criado: rr.getString('created'),
          atualizado: rr.getString('updated'),
          importado: rr.getBool('is_imported'),
        }
        detalhe.push(registro)

        var chave = cidr + '|' + ini
        if (cidr) {
          if (!porClienteData[chave]) porClienteData[chave] = []
          porClienteData[chave].push(registro.numero)
        }
      }
      for (var ch in porClienteData) {
        if (porClienteData[ch].length > 1) {
          duplicados.push({ chave: ch, contratos: porClienteData[ch] })
        }
      }
    }

    // ---------- pagamentos e sinais de contrato parado ----------
    var pagamentos = []
    var pagosPorContrato = {}
    try {
      var pgs = app.findRecordsByFilter('payments', '', '', 0, 0)
      var pagoPorContrato = {}
      for (var pg = 0; pg < pgs.length; pg++) {
        var rid = ''
        try {
          rid = pgs[pg].getString('rental_id') || ''
        } catch (_) {}
        if (rid) pagoPorContrato[rid] = (pagoPorContrato[rid] || 0) + 1
      }
      var statusPg = {}
      for (var pg2 = 0; pg2 < pgs.length; pg2++) {
        var rid2 = ''
        try {
          rid2 = pgs[pg2].getString('rental_id') || ''
        } catch (_) {}
        if (!rid2) continue
        if (!statusPg[rid2]) statusPg[rid2] = []
        statusPg[rid2].push({
          status: pgs[pg2].getString('status'),
          valor: pgs[pg2].getFloat('amount'),
        })
      }
      for (var ii = 0; ii < detalhe.length; ii++) {
        detalhe[ii].pagamentos = pagoPorContrato[detalhe[ii].id] || 0
        detalhe[ii].listaPagamentos = statusPg[detalhe[ii].id] || []
      }
    } catch (err) {
      pagamentos.push('payments: ' + (err && err.message))
    }

    // contratos do item com prazo vencido mas ainda Ativo
    var vencidosDoItem = []
    for (var vv = 0; vv < detalhe.length; vv++) {
      if (detalhe[vv].previsto && detalhe[vv].previsto < hoje && !detalhe[vv].devolvidoEm) {
        vencidosDoItem.push(detalhe[vv])
      }
    }

    return e.json(200, {
      somenteLeitura: true,
      geradoEm: new Date().toISOString(),
      hoje: hoje,
      avisosPagamento: pagamentos,
      doItemPrazoVencido: vencidosDoItem,
      resumoGeral: {
        totalContratos: all.length,
        ativosOuAtrasados: ativos,
        ativoComPrevistoVencido: pendentesDeStatus.length,
        semCliente: semCliente.length,
        semItens: semItens.length,
        totalZero: totalZero.length,
      },
      ativoComPrevistoVencido: pendentesDeStatus,
      semCliente: semCliente.slice(0, 20),
      semItens: semItens.slice(0, 20),
      totalZero: totalZero.slice(0, 20),
      itemAnalisado: alvoItem,
      contratosDoItem: detalhe,
      possiveisDuplicados: duplicados,
    })
  } catch (err) {
    app.logger().error('audit-contratos: ' + (err && err.message))
    return e.internalServerError('falha: ' + (err && err.message))
  }
})
