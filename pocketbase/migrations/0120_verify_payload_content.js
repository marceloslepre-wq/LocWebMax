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
        // Transformar em string se for objeto
        var pStr = typeof p === 'string' ? p : JSON.stringify(p)
        logRec.set('erro', 'CONFIRM_PAYLOAD: ' + pStr.slice(0, 1500))
        app.save(logRec)
      }
    } catch (e) {}
  },
  (app) => {},
)
