migrate(
  (app) => {
    var settingsRecords = app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
    if (settingsRecords.length === 0) return

    var settingsRecord = settingsRecords[0]
    var existing = settingsRecord.getString('notification_templates') || ''

    if (existing && existing !== '[]' && existing !== 'null' && existing !== '') return

    var defaultTemplates = [
      {
        trigger: 'novo_contrato',
        message:
          'Olá {cliente}! Sua locação #{contrato} foi registrada com sucesso. Itens: {itens}. Data de devolução: {data_devolucao}. Valor: R$ {valor}.',
      },
      {
        trigger: 'lembrete_devolucao',
        message:
          'Olá {cliente}! Lembrete: A devolução da sua locação #{contrato} está prevista para {data_devolucao}. Itens: {itens}.',
      },
      {
        trigger: 'contrato_atrasado',
        message:
          'Olá {cliente}! Sua locação #{contrato} está em atraso. Por favor, entre em contato para regularizar.',
      },
      {
        trigger: 'devolucao_concluida',
        message:
          'Olá {cliente}! A devolução da sua locação #{contrato} foi concluída com sucesso. Obrigado pela preferência!',
      },
      {
        trigger: 'confirmacao_pagamento',
        message:
          'Olá {cliente}! Confirmamos o recebimento do pagamento de R$ {valor} referente à locação #{contrato}.',
      },
    ]

    settingsRecord.set('notification_templates', JSON.stringify(defaultTemplates))
    app.save(settingsRecord)
  },
  (app) => {
    var settingsRecords = app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
    if (settingsRecords.length > 0) {
      settingsRecords[0].set('notification_templates', '[]')
      app.save(settingsRecords[0])
    }
  },
)
