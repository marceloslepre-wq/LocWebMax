migrate(
  (app) => {
    try {
      var logRec = app.findFirstRecordByData(
        'sholver_sync_log',
        'numero_pedido',
        'LOC-2026-TESTE-WPP',
      )
      if (logRec) {
        var p = logRec.get('payload')
        console.log('[SHOLVER 0119 PAYLOAD INSPECT] ' + JSON.stringify(p))
      }
    } catch (e) {
      console.log('[SHOLVER 0119 ERR] ' + e.message)
    }
  },
  (app) => {},
)
