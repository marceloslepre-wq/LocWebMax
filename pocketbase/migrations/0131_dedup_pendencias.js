migrate(
  (app) => {
    // LIMPEZA DAS PENDÊNCIAS DUPLICADAS (17/11/2026)
    //
    // O painel "Pendências de Atendimento da Helena" chegou a 72 itens, com o
    // mesmo contrato aparecendo duas e três vezes. Causa: o cron de cobrança
    // criava um registro novo em helena_pendencias a cada dia — tanto na etapa
    // "esgotado" (daysOverdue > 7, verdadeiro todo dia) quanto na de D+7 —
    // sem verificar se já existia uma pendência aberta do mesmo contrato.
    //
    // Aqui: para cada contrato com mais de uma pendência NÃO resolvida, mantém a
    // mais antiga (a que a loja já viu) e marca as demais como resolvidas com a
    // nota de duplicata, para não sumirem do histórico.
    let duplicadasRemovidas = 0
    let contratosAfetados = 0

    let todas = []
    try {
      todas = app.findRecordsByFilter(
        'helena_pendencias',
        'status != "resolvido"',
        '-created',
        2000,
        0,
      )
    } catch (err) {
      console.log('0131: falha ao ler pendencias =', err.message)
      return
    }

    // Agrupa por contrato (contrato vazio usa o rental_id, senão o próprio id)
    const grupos = {}
    for (const rec of todas) {
      const chave = rec.getString('contract_number') || rec.getString('rental_id') || rec.id
      if (!grupos[chave]) grupos[chave] = []
      grupos[chave].push(rec)
    }

    for (const chave of Object.keys(grupos)) {
      const lista = grupos[chave]
      if (lista.length < 2) continue

      // A mais antiga fica; as outras viram resolvidas
      lista.sort((a, b) =>
        String(a.getString('created')).localeCompare(String(b.getString('created'))),
      )
      contratosAfetados++
      for (let i = 1; i < lista.length; i++) {
        const dup = lista[i]
        dup.set('status', 'resolvido')
        dup.set('resolved_at', new Date().toISOString())
        dup.set(
          'description',
          (dup.getString('description') || '') +
            ' [DUPLICADA — consolidada na pendência mais antiga deste contrato em 17/11/2026]',
        )
        app.save(dup)
        duplicadasRemovidas++
      }
    }

    console.log(
      '0131_dedup_pendencias: contratos com duplicata =',
      contratosAfetados,
      '| pendencias consolidadas =',
      duplicadasRemovidas,
    )
  },
  (app) => {
    // Sem volta: a consolidação é intencional.
  },
)
