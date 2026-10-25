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
        var decoded = ''
        if (Array.isArray(p)) {
          // Byte array (int array)
          var chars = []
          for (var i = 0; i < p.length; i++) {
            chars.push(String.fromCharCode(p[i]))
          }
          decoded = chars.join('')
        } else if (typeof p === 'object') {
          decoded = JSON.stringify(p)
        } else {
          decoded = String(p)
        }
        var obj = JSON.parse(decoded)
        logRec.set(
          'erro',
          'CONFIRM: cliente.whatsapp=' + (obj.cliente ? obj.cliente.whatsapp : 'UNDEFINED'),
        )
        app.save(logRec)
      }
    } catch (e) {
      logRec.set('erro', 'CONFIRM_ERR: ' + e.message)
      app.save(logRec)
    }
  },
  (app) => {},
)
