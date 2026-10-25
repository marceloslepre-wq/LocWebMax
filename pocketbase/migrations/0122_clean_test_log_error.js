migrate(
  (app) => {
    try {
      var logRec = app.findFirstRecordByData(
        'sholver_sync_log',
        'numero_pedido',
        'LOC-2026-TESTE-WPP',
      )
      if (logRec) {
        logRec.set('erro', '')
        app.save(logRec)
      }
    } catch (_) {}
  },
  (app) => {},
)
