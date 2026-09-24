migrate(
  (app) => {
    // 1. CORREÇÃO ESPECÍFICA DO CONTRATO LOC-00148 (id: 9ou8qildztv33we)
    var rental = null
    try {
      rental = app.findRecordById('rentals', '9ou8qildztv33we')
    } catch (_) {
      try {
        rental = app.findFirstRecordByData('rentals', 'contract_number', 'LOC-00148')
      } catch (_2) {}
    }

    if (rental) {
      // Preservar LOC-00148
      console.log('Migration 0064: LOC-00148 mantido.')
    } else {
      console.log('Migration 0064: Contrato LOC-00148 não encontrado.')
    }

    // 2. VARREDURA GLOBAL NEUTRALIZADA:
    // A varredura agressiva anterior esvaziou itens em massa devido a inconsistência de serialização.
    // NUNCA executar varreduras destrutivas em lote.
    console.log('Migration 0064: Varredura global desativada preventivamente.')
  },
  (app) => {
    // Reversão opcional (não destrutiva)
  },
)
