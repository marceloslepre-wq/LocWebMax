migrate(
  (app) => {
    try {
      const records = app.findRecordsByFilter(
        'rentals',
        "custom_contract_html != ''",
        '-created',
        0,
        0,
      )

      for (let i = 0; i < records.length; i++) {
        const record = records[i]
        const html = record.getString('custom_contract_html') || ''
        const contractNum = record.getString('contract_number') || record.id

        if (
          html.includes('contrato: <strong>""</strong>') ||
          html.includes('contrato: <strong>"&quot;&quot;"</strong>') ||
          html.includes('contrato: “undefined”') ||
          html.includes('contrato: ""')
        ) {
          const fixedHtml = html
            .replace(
              /contrato:\s*<strong>""<\/strong>/g,
              'contrato: <strong>"' + contractNum + '"</strong>',
            )
            .replace(
              /contrato:\s*<strong>"&quot;&quot;"<\/strong>/g,
              'contrato: <strong>"' + contractNum + '"</strong>',
            )
            .replace(/contrato:\s*“undefined”/g, 'contrato: “' + contractNum + '”')
            .replace(/contrato:\s*""/g, 'contrato: "' + contractNum + '"')
          record.set('custom_contract_html', fixedHtml)
          app.save(record)
        }
      }
    } catch (err) {
      console.log('Error updating rental contract HTMLs:', err)
    }
  },
  (app) => {},
)
