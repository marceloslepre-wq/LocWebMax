migrate(
  (app) => {
    // 1. Adicionar campos de WhatsApp na collection 'tenants'
    const tenantsCol = app.findCollectionByNameOrId('tenants')

    if (!tenantsCol.fields.getByName('whatsapp_instance_name')) {
      tenantsCol.fields.add(
        new TextField({
          name: 'whatsapp_instance_name',
          required: false,
        }),
      )
    }

    if (!tenantsCol.fields.getByName('whatsapp_status')) {
      tenantsCol.fields.add(
        new TextField({
          name: 'whatsapp_status',
          required: false,
        }),
      )
    }

    if (!tenantsCol.fields.getByName('whatsapp_number')) {
      tenantsCol.fields.add(
        new TextField({
          name: 'whatsapp_number',
          required: false,
        }),
      )
    }

    if (!tenantsCol.fields.getByName('whatsapp_connected_at')) {
      tenantsCol.fields.add(
        new DateField({
          name: 'whatsapp_connected_at',
          required: false,
        }),
      )
    }

    if (!tenantsCol.fields.getByName('whatsapp_connected_by')) {
      tenantsCol.fields.add(
        new TextField({
          name: 'whatsapp_connected_by',
          required: false,
        }),
      )
    }

    app.save(tenantsCol)

    // 2. Corrigir textos legados de condomínio nos Planos cadastrados (ajustar para locação de equipamentos hospitalares)
    try {
      const plans = app.findRecordsByFilter('plans', "id != ''", '', 0, 0)
      for (let i = 0; i < plans.length; i++) {
        const p = plans[i]
        const rawFeatures = p.get('features')
        let feats = Array.isArray(rawFeatures) ? rawFeatures : []
        if (typeof rawFeatures === 'string') {
          try {
            feats = JSON.parse(rawFeatures)
          } catch (_) {}
        }

        let updated = false
        const cleanFeats = feats.map((f) => {
          if (typeof f === 'string') {
            if (f.includes('portaria') || f.includes('moradores') || f.includes('condomínio')) {
              updated = true
              return f
                .replace(
                  /Triagem e recebimentos na portaria/gi,
                  'Gestão de locação e estoque hospitalar',
                )
                .replace(
                  /Gestão completa de unidades e moradores/gi,
                  'Controle de contratos, clientes e devoluções',
                )
                .replace(/portaria/gi, 'recepção')
                .replace(/moradores/gi, 'clientes')
            }
          }
          return f
        })

        if (updated) {
          p.set('features', cleanFeats)
          app.save(p)
        }
      }
    } catch (_) {}

    // 3. Configurar instância padrão na operação principal (Hospital Home), se existir
    try {
      const hh = app.findFirstRecordByData('tenants', 'name', 'Hospital Home')
      if (hh && !hh.getString('whatsapp_instance_name')) {
        const defaultInst = $secrets.get('EVOLUTION_INSTANCE') || 'tenant-hospitalhome'
        hh.set('whatsapp_instance_name', defaultInst)
        hh.set('whatsapp_status', 'connected')
        const defaultNum = $secrets.get('EVOLUTION_NUMBER_SEND') || ''
        if (defaultNum) {
          hh.set('whatsapp_number', defaultNum)
        }
        app.save(hh)
      }
    } catch (_) {}
  },
  (app) => {
    try {
      const tenantsCol = app.findCollectionByNameOrId('tenants')
      const fieldNames = [
        'whatsapp_instance_name',
        'whatsapp_status',
        'whatsapp_number',
        'whatsapp_connected_at',
        'whatsapp_connected_by',
      ]
      fieldNames.forEach((fn) => {
        const f = tenantsCol.fields.getByName(fn)
        if (f) tenantsCol.fields.remove(f)
      })
      app.save(tenantsCol)
    } catch (_) {}
  },
)
