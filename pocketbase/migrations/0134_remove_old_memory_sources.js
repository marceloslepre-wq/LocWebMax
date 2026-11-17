migrate(
  (app) => {
    // ─── REMOÇÃO DAS FONTES ANTIGAS DE MEMÓRIA (17/11/2026) ───────────────────
    //
    // A migration 0132 gravou as fontes novas mas NÃO conseguiu remover as
    // antigas: deleteMemories exige o conteúdo EXATO (a chave é um SHA-256 do
    // texto), e o texto que eu reconstruí a partir do payload lido do banco não
    // bateu caractere por caractere.
    //
    // Resultado indesejado: a Helena passou a ter QUATRO fontes de texto — as
    // duas antigas e as duas novas — ou seja, a contradição ficou maior.
    //
    // Aqui o texto é literal, copiado do que está gravado, e a remoção é feita
    // uma fonte por vez para que uma falha não impeça a outra.

    var antigas = [
      {
        id: 'tkiz24qv40zqs1p',
        rotulo: 'REGRAS DE NEGÓCIO (antiga: preço por valor diário)',
        text: [
          'REGRAS DE NEGÓCIO — HOSPITAL HOME',
          '',
          'LOJAS FÍSICAS (5 lojas, todas seg-sex 8h-18h, sáb 8h-12h):',
          '1. Vila Velha — Av. Jerônimo Monteiro, 1715 - Centro, CEP: 29100-401',
          '2. Vitória — Praça San Martin, 180 - Santa Lúcia',
          '3. Serra — Rua Humberto de Campos, 57, cond. Esquina Center - Laranjeiras',
          '4. Cariacica — BR 262, 1466, Loja de Conveniência, Posto Rede Marcela - Vila Capixaba',
          '5. Cachoeiro de Itapemirim — Av. Francisco Lacerda de Aguiar, 1298, Gilberto Machado',
          '',
          'CONTATO: aluguel@hospitalhome.com.br / (27) 99904-6961',
          '',
          'CÁLCULO DE RENOVAÇÃO:',
          '- 15 dias = Valor Diário × 15',
          '- 30 dias = Valor Diário × 30',
          '- Arredondamento: 0,00 a 0,50 → baixo | 0,51 a 0,99 → cima',
          '',
          'PRAZO DE DEVOLUÇÃO: 2 dias úteis (seg a sex, exceto feriados)',
          '',
          'POLÍTICAS DO SITE DE LOCAÇÃO:',
          '- Troca por não adaptação: até 2 dias úteis após recebimento',
          '- Cancelamento (direito de arrependimento): 7 dias corridos',
          '- Devolução antecipada: sem ressarcimento',
          '- Manutenção durante a locação: gratuita (sem custo se não for mau uso)',
          '',
          'CATEGORIAS DE PRODUTOS NO SITE:',
          '- Cadeira de Rodas',
          '- Cadeira de Banho',
          '- Cama Hospitalar',
          '- Móveis Hospitalares',
          '- Equipamentos Hospitalares',
          '- Muletas e Andadores',
          '',
          'COMANDO DE INTERVENÇÃO HUMANA:',
          'Quando uma funcionária digitar "Helena deixa que continuo com o atendimento", a Helena deve silenciar imediatamente naquela conversa e deixar a funcionária assumir. Permanece ativa em outras conversas.',
        ].join('\n'),
      },
      {
        id: 'aw1ub9lv14wjmbl',
        rotulo: 'FLUXO DE ATENDIMENTO (antiga: cobrança diária, escalar em 5 dias)',
        text: [
          'FLUXO DE ATENDIMENTO DA HELENA:',
          '',
          '1. VENCIMENTO (contrato vencendo hoje) → oferecer renovação 15/30 dias ou devolução',
          '2. DEVOLUÇÃO → oferecer compra do equipamento pelo Valor de Venda, ou direcionar para loja (2 dias úteis)',
          '3. COBRANÇA (vencido sem renovação) → cobrança diária, escalar após 5 dias sem resposta',
          '4. CADASTRO → enviar link: novolocacao.goskip.app/public/customer/new',
          '5. ESCALONAMENTO → transferir para atendente humano',
          '6. PRÉ-VENDAS → direcionar fotos para o site, valores consultar banco de dados, interesse em alugar direcionar para cadastro',
          '',
          'SITE DE LOCAÇÃO: https://aluguelhospitalhome.sholver.com.br',
          'LINK DE CADASTRO: https://novolocacao.goskip.app/public/customer/new',
        ].join('\n'),
      },
    ]

    for (var i = 0; i < antigas.length; i++) {
      var item = antigas[i]
      try {
        $ai.agents.deleteMemories(app, 'helena', [{ type: 'text', payload: { text: item.text } }])
        console.log('0134: removida ->', item.rotulo)
      } catch (err) {
        console.log('0134: falhou ->', item.rotulo, '|', err.message || String(err))
      }
    }

    // Conferência: a Helena deve ficar com 2 fontes de texto (as novas).
    try {
      var restantes = app.findRecordsByFilter(
        '_agent_memory_sources',
        'agent_id = "m83j75dfdw9kp9s" && type = "text"',
        '',
        50,
        0,
      )
      var titulos = []
      for (const r of restantes) {
        var p = r.get('payload')
        var t = ''
        if (p && typeof p === 'object') t = String(p.text || '')
        else if (typeof p === 'string') {
          try {
            t = String(JSON.parse(p).text || '')
          } catch (_) {
            t = ''
          }
        }
        titulos.push(t.substring(0, 42).replace(/\n/g, ' '))
      }
      console.log(
        '0134: fontes de texto restantes =',
        restantes.length,
        '|',
        JSON.stringify(titulos),
      )
    } catch (err) {
      console.log('0134: falha na conferencia =', err.message)
    }
  },
  (app) => {
    // Sem reversão: as fontes antigas continham regras contraditórias.
  },
)
