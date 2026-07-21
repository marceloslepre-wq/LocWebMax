migrate(
  (app) => {
    var col = app.findCollectionByNameOrId('settings')
    if (!col.fields.getByName('notification_templates')) {
      col.fields.add(new JSONField({ name: 'notification_templates' }))
    }
    app.save(col)

    var defaultTemplates = {
      novo_contrato: {
        enabled: false,
        template:
          'Olá {cliente}! Sua locação #{contrato} foi registrada com sucesso. Itens: {itens}. Valor: R$ {valor}. Devolução prevista: {data_devolucao}.',
      },
      lembrete_devolucao: {
        enabled: false,
        template:
          'Olá {cliente}! Lembrete: A devolução da sua locação #{contrato} está prevista para {data_devolucao}. Itens: {itens}.',
      },
      notificacao_atraso: {
        enabled: false,
        template:
          'Olá {cliente}! Sua locação #{contrato} está em atraso. Data prevista de devolução: {data_devolucao}. Por favor, entre em contato para regularizar.',
      },
      confirmacao_devolucao: {
        enabled: false,
        template:
          'Olá {cliente}! A devolução da sua locação #{contrato} foi confirmada com sucesso. Itens devolvidos: {itens}.',
      },
      confirmacao_pagamento: {
        enabled: false,
        template:
          'Olá {cliente}! Recebemos o pagamento de R$ {valor} referente à locação #{contrato}. Obrigado!',
      },
    }

    try {
      var records = app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
      if (records.length > 0) {
        var record = records[0]
        if (
          !record.getString('notification_templates') ||
          record.getString('notification_templates') === '' ||
          record.getString('notification_templates') === 'null'
        ) {
          record.set('notification_templates', defaultTemplates)
          app.save(record)
        }
      }
    } catch (_) {}
  },
  (app) => {
    var col = app.findCollectionByNameOrId('settings')
    var field = col.fields.getByName('notification_templates')
    if (field) {
      col.fields.remove(field)
      app.save(col)
    }
  },
)
