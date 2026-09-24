onRecordUpdateRequest((e) => {
  var rental = e.record
  if (!rental) return e.next()

  // Verificar se o registro anterior tinha itens preenchidos
  var oldItems = []
  try {
    var rawOldStr = rental.original().getString('items')
    if (rawOldStr && rawOldStr.trim() !== '') {
      oldItems = JSON.parse(rawOldStr)
    } else {
      var rawOld = rental.original().get('items')
      if (typeof rawOld === 'string') {
        oldItems = JSON.parse(rawOld)
      } else if (Array.isArray(rawOld)) {
        oldItems = rawOld
      }
    }
  } catch (_) {
    oldItems = []
  }
  if (!Array.isArray(oldItems)) oldItems = []

  // Verificar se os novos itens que estão sendo gravados estão vazios
  var newItems = []
  try {
    var rawNewStr = rental.getString('items')
    if (rawNewStr && rawNewStr.trim() !== '') {
      newItems = JSON.parse(rawNewStr)
    } else {
      var rawNew = rental.get('items')
      if (typeof rawNew === 'string') {
        newItems = JSON.parse(rawNew)
      } else if (Array.isArray(rawNew)) {
        newItems = rawNew
      }
    }
  } catch (_) {
    newItems = []
  }
  if (!Array.isArray(newItems)) newItems = []

  // Se o contrato tinha itens válidos e a requisição está tentando gravar array vazio: BLOQUEAR!
  if (oldItems.length > 0 && newItems.length === 0) {
    var contractNumber = rental.getString('contract_number') || rental.id
    $app
      .logger()
      .error(
        'Tentativa de zerar itens de contrato bloqueada!',
        'contract',
        contractNumber,
        'rental_id',
        rental.id,
      )

    // Registrar em logs_suporte_master
    try {
      var masterUser = null
      try {
        masterUser = $app.findFirstRecordByData('users', 'role', 'Master')
      } catch (_) {
        try {
          masterUser = $app.findFirstRecordByData('users', 'email', 'marceloslepre@gmail.com')
        } catch (_2) {}
      }

      var defaultTenantId = rental.getString('tenant_id')
      if (!defaultTenantId) {
        try {
          var tRecs = $app.findRecordsByFilter('tenants', "id != ''", '', 1, 0)
          if (tRecs.length > 0) defaultTenantId = tRecs[0].id
        } catch (_) {}
      }

      if (masterUser && defaultTenantId) {
        var logsCol = $app.findCollectionByNameOrId('logs_suporte_master')
        var logRec = new Record(logsCol)
        logRec.set('master_user_id', masterUser.id)
        logRec.set('master_email', masterUser.getString('email') || 'marceloslepre@gmail.com')
        logRec.set('master_name', masterUser.getString('name') || 'Master')
        logRec.set('tenant_id', defaultTenantId)
        logRec.set('tenant_name', 'Hospital Home')
        logRec.set('ip_address', '127.0.0.1')
        logRec.set(
          'user_agent',
          'Bloqueio de segurança: tentativa de zerar itens do contrato ' +
            contractNumber +
            ' (' +
            rental.id +
            ') foi abortada automaticamente.',
        )
        $app.save(logRec)
      }
    } catch (logErr) {
      $app
        .logger()
        .error(
          'Erro ao gravar log suporte master em on_rental_protect_items',
          'err',
          logErr.message,
        )
    }

    // Abortar atualização com erro 400
    throw new BadRequestError(
      'Operação rejeitada: não é permitido zerar a lista de itens de um contrato ativo que já possui itens.',
    )
  }

  return e.next()
}, 'rentals')
