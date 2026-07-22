migrate(
  (app) => {
    var settingsRecords = app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
    if (settingsRecords.length === 0) return

    var settingsRecord = settingsRecords[0]
    var raw = settingsRecord.getString('notification_templates') || '[]'

    var templates = []
    try {
      templates = JSON.parse(raw)
    } catch (_) {
      return
    }

    var changed = false
    for (var i = 0; i < templates.length; i++) {
      if (templates[i].enabled === undefined) {
        templates[i].enabled = true
        changed = true
      }
    }

    if (changed) {
      settingsRecord.set('notification_templates', JSON.stringify(templates))
      app.save(settingsRecord)
    }
  },
  (app) => {
    var settingsRecords = app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
    if (settingsRecords.length === 0) return

    var settingsRecord = settingsRecords[0]
    var raw = settingsRecord.getString('notification_templates') || '[]'

    var templates = []
    try {
      templates = JSON.parse(raw)
    } catch (_) {
      return
    }

    var changed = false
    for (var i = 0; i < templates.length; i++) {
      if (templates[i].enabled !== undefined) {
        delete templates[i].enabled
        changed = true
      }
    }

    if (changed) {
      settingsRecord.set('notification_templates', JSON.stringify(templates))
      app.save(settingsRecord)
    }
  },
)
