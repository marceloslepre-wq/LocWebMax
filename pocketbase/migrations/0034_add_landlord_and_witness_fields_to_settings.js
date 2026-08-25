migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('settings')

    if (!col.fields.getByName('landlord_rep_name')) {
      col.fields.add(new TextField({ name: 'landlord_rep_name' }))
    }
    if (!col.fields.getByName('landlord_rep_document')) {
      col.fields.add(new TextField({ name: 'landlord_rep_document' }))
    }
    if (!col.fields.getByName('witness_1_name')) {
      col.fields.add(new TextField({ name: 'witness_1_name' }))
    }
    if (!col.fields.getByName('witness_1_document')) {
      col.fields.add(new TextField({ name: 'witness_1_document' }))
    }
    if (!col.fields.getByName('witness_2_name')) {
      col.fields.add(new TextField({ name: 'witness_2_name' }))
    }
    if (!col.fields.getByName('witness_2_document')) {
      col.fields.add(new TextField({ name: 'witness_2_document' }))
    }

    app.save(col)

    // Seed / set default values on existing settings records if empty
    const records = app.findRecordsByFilter('settings', "id != ''", '', 100, 0)
    for (let i = 0; i < records.length; i++) {
      const r = records[i]
      let changed = false

      if (!r.getString('landlord_rep_name')) {
        r.set('landlord_rep_name', 'Marcelo da Silveira Lepre')
        changed = true
      }
      if (!r.getString('landlord_rep_document')) {
        r.set('landlord_rep_document', '022.862.567-05')
        changed = true
      }
      if (!r.getString('witness_1_name')) {
        r.set('witness_1_name', 'Cristiani Aparecida de Fretais Pereira Gomes')
        changed = true
      }
      if (!r.getString('witness_1_document')) {
        r.set('witness_1_document', '106.522.497-44')
        changed = true
      }
      if (!r.getString('witness_2_name')) {
        r.set('witness_2_name', 'Tatiane Cardoso Rodrigues')
        changed = true
      }
      if (!r.getString('witness_2_document')) {
        r.set('witness_2_document', '141.122.117-67')
        changed = true
      }

      if (changed) {
        app.save(r)
      }
    }
  },
  (app) => {
    const col = app.findCollectionByNameOrId('settings')
    const fieldNames = [
      'landlord_rep_name',
      'landlord_rep_document',
      'witness_1_name',
      'witness_1_document',
      'witness_2_name',
      'witness_2_document',
    ]
    for (let i = 0; i < fieldNames.length; i++) {
      const field = col.fields.getByName(fieldNames[i])
      if (field) {
        col.fields.remove(field)
      }
    }
    app.save(col)
  },
)
