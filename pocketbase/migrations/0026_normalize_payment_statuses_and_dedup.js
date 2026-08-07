migrate(
  (app) => {
    var statusMap = {
      approved: 'Aprovado',
      pending: 'Pendente',
      in_process: 'Pendente',
      rejected: 'Rejeitado',
      cancelled: 'Rejeitado',
      canceled: 'Rejeitado',
      authorized: 'Aprovado',
      refunded: 'Rejeitado',
      charged_back: 'Rejeitado',
    }

    var allPayments = []
    try {
      allPayments = app.findRecordsByFilter('payments', 'id != ""', '-created', 0, 0)
    } catch (_) {}

    var normalized = 0
    for (var i = 0; i < allPayments.length; i++) {
      var p = allPayments[i]
      var currentStatus = p.getString('status') || ''
      var lowerStatus = currentStatus.toLowerCase()
      var newStatus = null

      if (statusMap[lowerStatus]) {
        newStatus = statusMap[lowerStatus]
      } else if (
        currentStatus !== 'Pendente' &&
        currentStatus !== 'Aprovado' &&
        currentStatus !== 'Rejeitado'
      ) {
        newStatus = 'Pendente'
      }

      if (newStatus && newStatus !== currentStatus) {
        p.set('status', newStatus)
        app.save(p)
        normalized++
      }
    }

    if (normalized > 0) {
      console.log('Migration 0026: normalized ' + normalized + ' payment status values')
    }

    allPayments = []
    try {
      allPayments = app.findRecordsByFilter('payments', 'id != ""', '-created', 0, 0)
    } catch (_) {}

    var rentalGroups = {}
    for (var j = 0; j < allPayments.length; j++) {
      var rid = allPayments[j].getString('rental_id') || ''
      if (!rid) continue
      if (!rentalGroups[rid]) rentalGroups[rid] = []
      rentalGroups[rid].push(allPayments[j])
    }

    var deleted = 0
    for (var key in rentalGroups) {
      var group = rentalGroups[key]
      if (group.length <= 1) continue

      var approved = []
      var pending = []
      for (var k = 0; k < group.length; k++) {
        var st = group[k].getString('status') || ''
        if (st === 'Aprovado') approved.push(group[k])
        else if (st === 'Pendente') pending.push(group[k])
      }

      if (approved.length > 0) {
        for (var m = 0; m < pending.length; m++) {
          app.delete(pending[m])
          deleted++
        }
        for (var n = 1; n < approved.length; n++) {
          app.delete(approved[n])
          deleted++
        }
      } else if (pending.length > 1) {
        var withPref = []
        for (var q = 0; q < pending.length; q++) {
          if (pending[q].getString('mp_preference_id') !== '') {
            withPref.push(pending[q])
          }
        }
        var toKeep = withPref.length > 0 ? withPref[0] : pending[0]

        for (var r = 0; r < pending.length; r++) {
          if (pending[r].id !== toKeep.id) {
            app.delete(pending[r])
            deleted++
          }
        }
      }
    }

    if (deleted > 0) {
      console.log('Migration 0026: removed ' + deleted + ' duplicate payment records')
    }
  },
  (app) => {},
)
