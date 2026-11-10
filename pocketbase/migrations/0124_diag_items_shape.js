// DIAGNÓSTICO (temporário): registra a estrutura REAL do campo `items` de
// contratos recentes, para descobrir por que a mensagem sai "Nenhum item listado".
// Só lê e loga — não altera nenhum contrato.
migrate(
  (app) => {
    var report = []
    var recs = []
    try {
      recs = app.findRecordsByFilter('rentals', "contract_number != ''", '-created', 12, 0)
    } catch (err) {
      console.log('[DIAG-ITEMS] query failed: ' + (err && err.message ? err.message : err))
      return
    }

    report.push('contratos analisados: ' + recs.length)

    for (var i = 0; i < recs.length; i++) {
      var rec = recs[i]
      var contract = rec.getString('contract_number') || rec.id
      var raw = rec.get('items')
      var kind = Object.prototype.toString.call(raw)
      var strVal = ''
      try {
        strVal = rec.getString('items') || ''
      } catch (_) {}

      var part = contract + ' | get()=' + kind + ' | isArray=' + Array.isArray(raw)

      if (Array.isArray(raw)) {
        part += ' | len=' + raw.length
        if (raw.length > 0 && raw[0] && typeof raw[0] === 'object') {
          var keys = []
          for (var k in raw[0]) {
            if (Object.prototype.hasOwnProperty.call(raw[0], k)) keys.push(k)
          }
          part += ' | keys=[' + keys.join(',') + ']'
          part += ' | first=' + JSON.stringify(raw[0]).substring(0, 220)
        }
      } else {
        part += ' | rawStr=' + strVal.substring(0, 220)
        try {
          var p1 = JSON.parse(strVal)
          part += ' || parse1=' + typeof p1 + ' isArray=' + Array.isArray(p1)
          if (typeof p1 === 'string') {
            try {
              var p2 = JSON.parse(p1)
              part += ' || parse2=' + typeof p2 + ' isArray=' + Array.isArray(p2)
              if (Array.isArray(p2) && p2.length > 0 && p2[0] && typeof p2[0] === 'object') {
                var k2 = []
                for (var kk in p2[0]) {
                  if (Object.prototype.hasOwnProperty.call(p2[0], kk)) k2.push(kk)
                }
                part += ' || keys2=[' + k2.join(',') + ']'
                part += ' || first2=' + JSON.stringify(p2[0]).substring(0, 220)
              }
            } catch (e2) {
              part += ' || parse2ERR'
            }
          } else if (Array.isArray(p1) && p1.length > 0 && p1[0] && typeof p1[0] === 'object') {
            var k1 = []
            for (var kk1 in p1[0]) {
              if (Object.prototype.hasOwnProperty.call(p1[0], kk1)) k1.push(kk1)
            }
            part += ' || keys1=[' + k1.join(',') + ']'
            part += ' || first1=' + JSON.stringify(p1[0]).substring(0, 220)
          }
        } catch (e1) {
          part += ' || parse1ERR'
        }
      }

      report.push(part)
      console.log('[DIAG-ITEMS] ' + part)
    }
  },
  (app) => {},
)
