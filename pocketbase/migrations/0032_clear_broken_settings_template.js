migrate(
  (app) => {
    var settingsRecords = app.findRecordsByFilter('settings', "id != ''", '', 1, 0)
    if (settingsRecords.length === 0) return
    var rec = settingsRecords[0]
    rec.set('contract_template_html', '')
    app.save(rec)
  },
  (app) => {},
)
