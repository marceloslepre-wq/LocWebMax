/// <reference path="../pb_data/types.d.ts" />
migrate(
  (app) => {
    // Reativar job helena_daily_cobranca em _cron_settings
    try {
      if (app.hasTable('_cron_settings')) {
        let settingRec = null
        try {
          settingRec = app.findFirstRecordByData('_cron_settings', 'job', 'helena_daily_cobranca')
        } catch (_) {}

        if (settingRec) {
          settingRec.set('disabled', false)
          settingRec.set('note', 'Reativado conforme aprovado pelo usuário Marcelo')
          app.save(settingRec)
        }
      }
    } catch (cronErr) {
      console.log('0058: Note on activating helena_daily_cobranca:', cronErr)
    }
  },
  (app) => {
    try {
      if (app.hasTable('_cron_settings')) {
        let settingRec = null
        try {
          settingRec = app.findFirstRecordByData('_cron_settings', 'job', 'helena_daily_cobranca')
        } catch (_) {}

        if (settingRec) {
          settingRec.set('disabled', true)
          settingRec.set('note', 'Pausado')
          app.save(settingRec)
        }
      }
    } catch (_) {}
  },
)
