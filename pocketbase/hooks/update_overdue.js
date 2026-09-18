routerAdd(
  'POST',
  '/backend/v1/rentals/update-overdue',
  (e) => {
    var nowMs = Date.now()

    // Process-level lock / throttle using global/globalThis safe across callback invocations in JSVM
    if (typeof globalThis.__isUpdateOverdueRunning === 'undefined') {
      globalThis.__isUpdateOverdueRunning = false
    }
    if (typeof globalThis.__lastUpdateOverdueRunTime === 'undefined') {
      globalThis.__lastUpdateOverdueRunTime = 0
    }

    // 1. Guard against concurrent executions (in-memory lock)
    if (globalThis.__isUpdateOverdueRunning) {
      return e.json(200, {
        skipped: true,
        reason: 'already_running',
        updated: 0,
        updated_overdue: 0,
        updated_active: 0,
        updated_returned: 0,
      })
    }

    // 2. Throttle backend execution if run very recently (within last 15 seconds)
    if (nowMs - globalThis.__lastUpdateOverdueRunTime < 15000) {
      return e.json(200, {
        skipped: true,
        reason: 'throttled',
        updated: 0,
        updated_overdue: 0,
        updated_active: 0,
        updated_returned: 0,
      })
    }

    globalThis.__isUpdateOverdueRunning = true
    globalThis.__lastUpdateOverdueRunTime = nowMs

    var today = new Date().toISOString().split('T')[0]
    var updatedOverdue = 0
    var updatedActive = 0
    var updatedReturned = 0

    try {
      // 1. Targeted query: Ativo rentals that have actual_return_date set -> Devolvido
      // (Never touch Vendido or Devolvido)
      var activeWithActualReturn = $app.findRecordsByFilter(
        'rentals',
        'status = "Ativo" && actual_return_date != ""',
        '',
        0,
        0,
      )
      for (var r1 = 0; r1 < activeWithActualReturn.length; r1++) {
        var rec1 = activeWithActualReturn[r1]
        rec1.set('status', 'Devolvido')
        $app.save(rec1)
        updatedReturned++
      }

      // 2. Targeted query: Atrasado rentals that have actual_return_date set -> Devolvido
      var overdueWithActualReturn = $app.findRecordsByFilter(
        'rentals',
        'status = "Atrasado" && actual_return_date != ""',
        '',
        0,
        0,
      )
      for (var r2 = 0; r2 < overdueWithActualReturn.length; r2++) {
        var rec2 = overdueWithActualReturn[r2]
        rec2.set('status', 'Devolvido')
        $app.save(rec2)
        updatedReturned++
      }

      // 3. Targeted query: Ativo rentals with expected_return_date < today -> Atrasado
      // Only those where actual_return_date is empty (or null)
      var activeCandidates = $app.findRecordsByFilter(
        'rentals',
        'status = "Ativo" && actual_return_date = "" && expected_return_date < "' +
          today +
          ' 00:00:00.000Z"',
        '',
        0,
        0,
      )
      for (var r3 = 0; r3 < activeCandidates.length; r3++) {
        var rec3 = activeCandidates[r3]
        if (rec3.getString('status') === 'Vendido') continue
        var rawExpected = rec3.getString('expected_return_date')
        var expDate = rawExpected ? rawExpected.split(' ')[0].split('T')[0] : ''
        if (expDate && expDate < today) {
          rec3.set('status', 'Atrasado')
          $app.save(rec3)
          updatedOverdue++
        }
      }

      // 4. Targeted query: Atrasado rentals with expected_return_date >= today (e.g. renewed) -> Ativo
      // Only those where actual_return_date is empty
      var overdueCandidates = $app.findRecordsByFilter(
        'rentals',
        'status = "Atrasado" && actual_return_date = "" && expected_return_date >= "' +
          today +
          ' 00:00:00.000Z"',
        '',
        0,
        0,
      )
      for (var r4 = 0; r4 < overdueCandidates.length; r4++) {
        var rec4 = overdueCandidates[r4]
        if (rec4.getString('status') === 'Vendido') continue
        var rawExpOverdue = rec4.getString('expected_return_date')
        var expDateOverdue = rawExpOverdue ? rawExpOverdue.split(' ')[0].split('T')[0] : ''
        if (expDateOverdue && expDateOverdue >= today) {
          rec4.set('status', 'Ativo')
          $app.save(rec4)
          updatedActive++
        }
      }
    } catch (err) {
      $app.logger().error('overdue bidirectional update failed', 'err', err.message || String(err))
    } finally {
      globalThis.__isUpdateOverdueRunning = false
    }

    return e.json(200, {
      updated: updatedOverdue + updatedActive + updatedReturned,
      updated_overdue: updatedOverdue,
      updated_active: updatedActive,
      updated_returned: updatedReturned,
    })
  },
  $apis.requireAuth(),
)
