migrate(
  (app) => {
    // ─── ENCERRA CICLOS DE COBRANÇA ÓRFÃOS (17/11/2026) ─────────────────────
    //
    // O hook renew_rental.js passou a encerrar o registro de helena_cobranca ao
    // renovar o contrato (o cron começa um ciclo novo). Mas os contratos JÁ
    // renovados antes dessa correção continuam com o registro antigo preso num
    // estágio avançado — e a trava anti-regressão do cron impede qualquer
    // cobrança futura neles.
    //
    // Sinal inequívoco de ciclo órfão: o contrato tem expected_return_date no
    // futuro (foi renovado), mas a cobrança está num estágio de ATRASO
    // (atraso_d2 / atraso_d4 / atraso_d7). Um contrato cujo vencimento é hoje ou
    // no futuro não pode estar "em atraso": esse registro é do ciclo anterior.
    //
    // Não apaga nada: marca como `encerrado`, o que preserva o histórico e libera
    // o contrato para o ciclo novo.

    var brt = new Date(Date.now() - 3 * 60 * 60 * 1000)
    var hoje =
      brt.getUTCFullYear() +
      '-' +
      String(brt.getUTCMonth() + 1).padStart(2, '0') +
      '-' +
      String(brt.getUTCDate()).padStart(2, '0')

    var encerrados = 0
    var afetados = []

    var cobs = []
    try {
      cobs = app.findRecordsByFilter(
        'helena_cobranca',
        '(stage = "atraso_d2" || stage = "atraso_d4" || stage = "atraso_d7") && status != "encerrado"',
        '-created',
        2000,
        0,
      )
    } catch (err) {
      console.log('0135: falha ao listar cobrancas =', err.message || String(err))
      return
    }

    for (var i = 0; i < cobs.length; i++) {
      var cob = cobs[i]
      var rentalId = cob.getString('rental_id')
      if (!rentalId) continue

      var rental = null
      try {
        rental = app.findRecordById('rentals', rentalId)
      } catch (_) {
        continue
      }
      if (!rental) continue

      var venc = String(rental.getString('expected_return_date') || '')
      var vencDia = venc.split('T')[0].split(' ')[0]
      if (!vencDia || vencDia < hoje) continue // ainda em atraso de verdade

      // Contrato com vencimento hoje/futuro + cobrança em estágio de atraso
      // = registro do ciclo anterior.
      cob.set('stage', 'encerrado')
      cob.set('status', 'encerrado')
      cob.set(
        'notes',
        'Ciclo encerrado: contrato renovado (vencimento ' +
          vencDia +
          '), registro de atraso era do ciclo anterior.',
      )
      try {
        app.save(cob)
        encerrados++
        if (afetados.length < 20) {
          afetados.push(rental.getString('contract_number') || rentalId)
        }
      } catch (_) {}
    }

    console.log(
      '0135: ciclos orfaos encerrados =',
      encerrados,
      '| contratos:',
      JSON.stringify(afetados),
    )
  },
  (app) => {
    // Sem reversão: o encerramento apenas libera o contrato para o ciclo novo.
  },
)
