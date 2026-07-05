migrate(
  (app) => {
    try {
      app.findAuthRecordByEmail('_pb_users_auth_', 'marceloslepre@gmail.com')
    } catch (_) {
      const users = app.findCollectionByNameOrId('_pb_users_auth_')
      const record = new Record(users)
      record.setEmail('marceloslepre@gmail.com')
      record.setPassword('Skip@Pass')
      record.setVerified(true)
      record.set('name', 'Administrador')
      record.set('role', 'Administrador')
      record.set('active', true)
      record.set('permissions', [
        'items:write',
        'items:delete',
        'customers:write',
        'customers:delete',
        'rentals:manage',
        'users:manage',
        'reports:view',
        'editar_contratos',
      ])
      app.save(record)
    }

    const locaisCol = app.findCollectionByNameOrId('locais')
    const locaisData = [
      { nome: 'Loja Central', endereco: 'Av. Central, 1000 - Centro', ativo: true },
      { nome: 'Galpão Depósito', endereco: 'Rua dos Armazéns, 500 - Industrial', ativo: true },
    ]
    locaisData.forEach((l) => {
      try {
        app.findFirstRecordByData('locais', 'nome', l.nome)
      } catch (_) {
        const r = new Record(locaisCol)
        r.set('nome', l.nome)
        r.set('endereco', l.endereco)
        r.set('ativo', l.ativo)
        app.save(r)
      }
    })

    const settingsCol = app.findCollectionByNameOrId('settings')
    const existingSettings = app.findRecordsByFilter('settings', '1=1', '', 1, 0)
    if (existingSettings.length === 0) {
      const s = new Record(settingsCol)
      s.set('company_name', 'LocaWeb Gestão de Ativos LTDA')
      s.set('company_document', '00.000.000/0001-00')
      s.set('company_address', 'Av. Central, 1000 - Centro, São Paulo/SP')
      s.set('primary_color', '#1e40af')
      s.set('late_fee_type', 'daily')
      s.set('late_fee_value', 2)
      s.set('categories', ['Ferramentas', 'Equipamentos Pesados', 'Acessórios', 'Geral'])
      s.set('locations', [])
      app.save(s)
    }

    const invCol = app.findCollectionByNameOrId('inventory')
    const invData = [
      {
        code: 'CAM-001',
        name: 'Cama Hospitalar Elétrica',
        category: 'Equipamentos Pesados',
        total_qty: 10,
        available_qty: 8,
        rented_qty: 2,
        daily_price: 15,
        monthly_price: 350,
        condition_status: 'Disponível',
      },
      {
        code: 'CAD-002',
        name: 'Cadeira de Rodas Standard',
        category: 'Acessórios',
        total_qty: 15,
        available_qty: 12,
        rented_qty: 3,
        daily_price: 8,
        monthly_price: 180,
        condition_status: 'Disponível',
      },
      {
        code: 'AND-003',
        name: 'Andador Articulado',
        category: 'Acessórios',
        total_qty: 8,
        available_qty: 8,
        rented_qty: 0,
        daily_price: 5,
        monthly_price: 120,
        condition_status: 'Disponível',
      },
    ]
    invData.forEach((i) => {
      try {
        app.findFirstRecordByData('inventory', 'code', i.code)
      } catch (_) {
        const r = new Record(invCol)
        r.set('code', i.code)
        r.set('name', i.name)
        r.set('category', i.category)
        r.set('total_qty', i.total_qty)
        r.set('available_qty', i.available_qty)
        r.set('rented_qty', i.rented_qty)
        r.set('daily_price', i.daily_price)
        r.set('monthly_price', i.monthly_price)
        r.set('condition_status', i.condition_status)
        r.set('assets', [])
        app.save(r)
      }
    })

    const custCol = app.findCollectionByNameOrId('customers')
    const custData = [
      {
        matricula: '0001',
        name: 'João Silva Santos',
        document: '12345678901',
        phone_cell: '(11) 98765-4321',
        email: 'joao.silva@email.com',
      },
      {
        matricula: '0002',
        name: 'Maria Oliveira Costa',
        document: '98765432100',
        phone_cell: '(11) 91234-5678',
        email: 'maria.costa@email.com',
      },
    ]
    custData.forEach((c) => {
      try {
        app.findFirstRecordByData('customers', 'document', c.document)
      } catch (_) {
        const r = new Record(custCol)
        r.set('matricula', c.matricula)
        r.set('name', c.name)
        r.set('document', c.document)
        r.set('phone_cell', c.phone_cell)
        r.set('email', c.email)
        app.save(r)
      }
    })
  },
  (app) => {},
)
