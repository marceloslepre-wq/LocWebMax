/// <reference path="../pb_data/types.d.ts" />
/**
 * 0128_relatorio_produtos_locados.js — RODADA DO RELATÓRIO "PRODUTOS LOCADOS"
 *
 * Migration one-shot, SOMENTE LEITURA: varre todos os contratos Ativo/Atrasado,
 * decodifica items (tolerante a byte-array — mesmo utilitário do backfill 0126),
 * consolida por SKU e registra o resumo no LOG (visible em list_logs/hooks).
 * Serve para os números do relatório ao Marcelo; a rotina permanente para o
 * botão "Exportar produtos locados (Excel)" é a rota do export_locados.js.
 */
migrate(
  (app) => {
    // Helpers dentro do callback (JSVM não compartilha declarações de topo do
    // próprio arquivo); decodificação de byte-array segue a 0126.
    var utf8Decode = function (bytes) {
      var out = ''
      var i = 0
      while (i < bytes.length) {
        var b = bytes[i]
        if (b < 0x80) {
          out += String.fromCharCode(b)
          i++
        } else if (b >> 5 === 0x6) {
          out += String.fromCharCode(((b & 0x1f) << 6) | (bytes[i + 1] & 0x3f))
          i += 2
        } else if (b >> 4 === 0xe) {
          out += String.fromCharCode(
            ((b & 0xf) << 12) | ((bytes[i + 1] & 0x3f) << 4) | (bytes[i + 2] & 0x3f),
          )
          i += 3
        } else {
          var cp =
            ((b & 0x7) << 18) |
            ((bytes[i + 1] & 0x3f) << 12) |
            ((bytes[i + 2] & 0x3f) << 6) |
            (bytes[i + 3] & 0x3f)
          cp -= 0x10000
          out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff))
          i += 4
        }
      }
      return out
    }

    var parseItems = function (value, depth) {
      if (depth > 4 || value === null || value === undefined) return null
      if (typeof value === 'string') {
        var trimmed = value.trim()
        if (!trimmed || trimmed === 'null' || trimmed === 'undefined') return []
        var firstChar = trimmed.charAt(0)
        if (firstChar === '[' || firstChar === '{' || firstChar === '"') {
          try {
            return parseItems(JSON.parse(trimmed), depth + 1)
          } catch (_) {
            return null
          }
        }
        return null
      }
      if (Array.isArray(value)) {
        var allBytes = value.length > 0
        for (var b = 0; b < value.length; b++) {
          var el = value[b]
          if (typeof el !== 'number' || el < 0 || el > 255 || el !== Math.floor(el)) {
            allBytes = false
            break
          }
        }
        if (allBytes) return parseItems(utf8Decode(value), depth + 1)
        var flat = []
        for (var n = 0; n < value.length; n++) {
          var part = parseItems(value[n], depth + 1)
          if (part === null) return null
          for (var p = 0; p < part.length; p++) flat.push(part[p])
        }
        return flat
      }
      if (typeof value === 'object') {
        if (Array.isArray(value.items)) return parseItems(value.items, depth + 1)
        if (Array.isArray(value.itens)) return parseItems(value.itens, depth + 1)
        return [value]
      }
      return null
    }

    var isFreight = function (item) {
      var id = String(
        (item && (item.itemId || item.item_id || item.inventory_id || item.id)) || '',
      ).toLowerCase()
      return id === 'freight' || id === 'frete'
    }

    // ------------------------------------------------------------------
    // Estoque indexado por SKU (fonte da verdade) e por id
    // ------------------------------------------------------------------
    var inventory = {}
    var invRecords = app.findRecordsByFilter('inventory', '1=1', '', 0, 0)
    for (var iv = 0; iv < invRecords.length; iv++) {
      var inv = invRecords[iv]
      inventory[String(inv.getString('code') || '').trim()] = {
        name: inv.getString('name'),
        monthly: Number(inv.get('monthly_price') || 0),
      }
    }

    var rentals = app.findRecordsByFilter(
      'rentals',
      "status = 'Ativo' || status = 'Atrasado'",
      'contract_number',
      0,
      0,
    )

    var skuAgg = {}
    var totalLines = 0
    var itemsVazio = []
    var itemsIlegivel = []
    var skusNaoEncontrados = {}
    var itensSemSku = {}
    var freteIgnorado = 0
    var valorTotal = 0

    for (var r = 0; r < rentals.length; r++) {
      var rental = rentals[r]
      var num = rental.getString('contract_number') || rental.id

      var items = []
      try {
        // getString() primeiro: get() de campo JSON devolve byte array no JSVM
        items = parseItems(rental.getString('items'), 0) || []
        if (items.length === 0) items = parseItems(rental.get('items'), 0) || []
      } catch (_) {
        items = []
      }

      if (items.length === 0) {
        var rawLen = 0
        try {
          rawLen = String(rental.getString('items') || '').length
        } catch (_) {
          rawLen = 0
        }
        if (rawLen > 0) itemsIlegivel.push(num)
        else itemsVazio.push(num)
        continue
      }

      for (var j = 0; j < items.length; j++) {
        var item = items[j]
        if (isFreight(item)) {
          freteIgnorado++
          continue
        }

        var sku = String(item.code || item.sku || '').trim()
        var rawQty =
          item.qty !== undefined
            ? item.qty
            : item.quantity !== undefined
              ? item.quantity
              : item.quantidade
        var qtd = Number(rawQty !== undefined && rawQty !== null ? rawQty : 1)
        if (isNaN(qtd) || qtd <= 0) qtd = 1

        var inv = sku ? inventory[sku] : null

        if (!sku) {
          itensSemSku[num] = true
        } else if (!inv) {
          skusNaoEncontrados[sku] = (skusNaoEncontrados[sku] || 0) + 1
        }

        var desc = (
          inv ? inv.name : item.name || item.productName || item.description || 'Equipamento'
        ).trim()
        var unit = inv
          ? inv.monthly
          : Number(
              item.monthlyPrice !== undefined
                ? item.monthlyPrice
                : item.monthly_price !== undefined
                  ? item.monthly_price
                  : 0,
            )
        totalLines++
        valorTotal += unit * qtd

        var key = sku || '(sem SKU) ' + desc
        if (!skuAgg[key]) {
          skuAgg[key] = {
            sku: sku,
            descricao: desc,
            qtd: 0,
            valor: 0,
            problematico: !sku || !inv,
          }
        }
        skuAgg[key].qtd += qtd
        skuAgg[key].valor += Math.round(unit * qtd * 100) / 100
      }
    }

    var topSkus = []
    for (var k in skuAgg) topSkus.push(skuAgg[k])
    topSkus.sort(function (a, b) {
      return b.qtd - a.qtd
    })

    var naoEncontrados = []
    for (var s in skusNaoEncontrados)
      naoEncontrados.push({ sku: s, ocorrencias: skusNaoEncontrados[s] })

    var report = {
      contratos_varridos: rentals.length,
      linhas_itens: totalLines,
      valor_mensal_total: Math.round(valorTotal * 100) / 100,
      contratos_items_vazio: itemsVazio,
      contratos_items_ilegivel: itemsIlegivel,
      skus_nao_encontrados: naoEncontrados,
      itens_sem_sku: Object.keys(itensSemSku),
      fretes_ignorados: freteIgnorado,
      top_skus: topSkus,
    }

    app.logger().info('RELATORIO-PRODUTOS-LOCADOS ' + JSON.stringify(report))
  },
  (app) => {
    // no-op: migration somente leitura
  },
)
