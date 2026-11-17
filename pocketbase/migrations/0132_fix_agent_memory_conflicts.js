migrate(
  (app) => {
    // ─── CONFLITOS DE PREÇO E DE CADÊNCIA NA MEMÓRIA DO AGENTE ────────────────
    //
    // A Helena recebia instruções contraditórias de duas fontes de memória:
    //
    //   1. "REGRAS DE NEGÓCIO" dizia: 15 dias = diária × 15 e 30 dias = diária × 30.
    //      O prompt do agente (REGRA 2) diz: 30 dias = Valor Mensal, 15 dias = metade.
    //
    //   2. "FLUXO DE ATENDIMENTO" dizia "cobrança diária, escalar após 5 dias".
    //      O cron real cobra em D0, D+2, D+4 e D+7 e depois repassa à loja.
    //
    // Quando a IA recebe duas regras diferentes, ela escolhe — e inventa.
    //
    // Conferido nos dados em 17/11/2026: os 56 produtos têm monthly_price
    // preenchido e daily_price = monthly_price / 30 exatamente. Hoje os dois
    // cálculos dão o mesmo número. O conflito é latente: no dia em que alguém
    // editar daily_price sozinho, os dois passam a divergir e o cliente recebe
    // valor errado. Por isso a regra fica com UMA fonte: monthly_price.
    //
    // As fontes antigas são lidas do banco (não redigidas à mão) para que a
    // remoção case com o hash exato do conteúdo original.

    var fontes = []
    try {
      fontes = app.findRecordsByFilter(
        '_agent_memory_sources',
        'agent_id = "m83j75dfdw9kp9s"',
        '',
        50,
        0,
      )
    } catch (err) {
      console.log('0132: falha ao ler fontes =', err.message)
      return
    }

    var remover = []
    for (const f of fontes) {
      if (f.getString('type') !== 'text') continue
      var payload = null
      try {
        payload = f.get('payload')
      } catch (_) {}
      if (!payload) continue

      var txt = ''
      if (typeof payload === 'string') {
        try {
          txt = String(JSON.parse(payload).text || '')
        } catch (_) {
          txt = payload
        }
      } else if (payload && typeof payload === 'object') {
        txt = String(payload.text || '')
      }
      if (!txt) continue

      if (txt.indexOf('REGRAS DE NEGÓCIO') !== -1 || txt.indexOf('FLUXO DE ATENDIMENTO') !== -1) {
        remover.push({ type: 'text', payload: { text: txt } })
      }
    }

    if (remover.length > 0) {
      try {
        $ai.agents.deleteMemories(app, 'helena', remover)
        console.log('0132: fontes contraditórias removidas =', remover.length)
      } catch (err) {
        console.log('0132: falha ao remover =', err.message)
      }
    }

    // ─── Fontes novas, sem contradição ───────────────────────────────────────
    var novas = [
      {
        type: 'text',
        payload: {
          text: [
            'REGRAS DE NEGÓCIO — HOSPITAL HOME (versão 17/11/2026, substitui a anterior)',
            '',
            'CÁLCULO DE RENOVAÇÃO — FONTE ÚNICA: o campo "Valor Mensal" (monthly_price) do produto no Estoque.',
            '- 30 dias = valor mensal cheio do produto.',
            '- 15 dias = exatamente metade do valor mensal (somente quando o produto permitir 15 dias).',
            '- NUNCA calcule por valor diário. O valor diário é apenas referência interna e não é usado para renovação.',
            '- Se o valor mensal estiver zerado ou ausente, NÃO calcule e NÃO exiba R$ 0,00: diga que a equipe da loja confirmará o valor.',
            '- O valor total do contrato é a soma (valor mensal do produto x quantidade) de cada item.',
            '',
            'LOJAS FÍSICAS (atendimento seg-sex 8h-18h, sábado 8h-12h):',
            '1. Vila Velha — Av. Jerônimo Monteiro, 1715 - Centro, CEP: 29100-401',
            '2. Vitória — Praça San Martin, 180 - Santa Lúcia',
            '3. Serra — Rua Humberto de Campos, 57, cond. Esquina Center - Laranjeiras',
            '4. Cariacica — BR 262, 1466, Loja de Conveniência, Posto Rede Marcela - Vila Capixaba',
            '5. Cachoeiro de Itapemirim — Av. Francisco Lacerda de Aguiar, 1298, Gilberto Machado',
            '',
            'DEVOLUÇÃO — TODAS AS LOJAS SÃO VÁLIDAS:',
            '- A devolução funciona do mesmo jeito em qualquer loja, inclusive nas que não têm atendimento presencial completo (Serra, Cariacica e Cachoeiro).',
            '- Portanto, ao informar onde devolver, ofereça TODAS as lojas cadastradas e deixe o cliente escolher a mais perto dele.',
            '- Não exclua nenhuma loja da lista de devolução.',
            '',
            'PRAZO DE DEVOLUÇÃO: 2 dias úteis (segunda a sexta, exceto feriados).',
            '',
            'CONTATO: aluguel@hospitalhome.com.br / (27) 99904-6961',
            '',
            'POLÍTICAS DO SITE DE LOCAÇÃO:',
            '- Troca por não adaptação: até 2 dias úteis após recebimento',
            '- Cancelamento (direito de arrependimento): 7 dias corridos',
            '- Devolução antecipada: sem ressarcimento',
            '- Manutenção durante a locação: gratuita (sem custo se não for mau uso)',
            '',
            'COMANDO DE INTERVENÇÃO HUMANA:',
            'Quando uma funcionária digitar "Helena deixa que eu continuo com o atendimento", a Helena silencia imediatamente naquela conversa. Permanece ativa nas outras.',
          ].join('\n'),
        },
      },
      {
        type: 'text',
        payload: {
          text: [
            'FLUXO DE ATENDIMENTO DA HELENA (versão 17/11/2026, substitui a anterior)',
            '',
            'CADÊNCIA DE COBRANÇA — DECISÃO DO MARCELO:',
            '- D0 (dia do vencimento): mensagem cordial, oferece renovar ou devolver.',
            '- D+2: mensagem gentil e firme, reforça as duas opções.',
            '- D+4: mensagem firme, reforça a situação e as opções.',
            '- D+7: último aviso da Helena. Informa que o acompanhamento passa para a colaboradora Cristiani, da equipe da loja.',
            '- Depois do D+7: a Helena ENCERRA e não fala mais nesse contrato. O caso é da Cristiani.',
            '- NÃO existe cobrança diária. NÃO escalar "após 5 dias". A cadência é exatamente a acima.',
            '- Se o cliente se posicionar antes (informou data de pagamento, falou com a Cristiani, combinou devolução), a cobrança PARA.',
            '',
            'OUTROS FLUXOS:',
            '1. DEVOLUÇÃO: informar todas as lojas cadastradas; o cliente devolve na loja que preferir. Registrar pendência para a loja dar baixa quando o item chegar.',
            '2. RENOVAÇÃO: 15 ou 30 dias, valor pelo Valor Mensal do produto. O PIX é sempre dinâmico (Mercado Pago).',
            '3. CADASTRO: enviar link novolocacao.goskip.app/public/customer/new',
            '4. ESCALONAMENTO: repassar para a equipe da loja (Cristiani em casos de cobrança).',
            '5. PRÉ-VENDAS: direcionar ao site; interesse em alugar direciona para cadastro.',
            '',
            'SITE DE LOCAÇÃO: https://aluguelhospitalhome.sholver.com.br',
            'LINK DE CADASTRO: https://novolocacao.goskip.app/public/customer/new',
          ].join('\n'),
        },
      },
    ]

    try {
      $ai.agents.putMemories(app, 'helena', novas)
      console.log('0132: fontes novas gravadas =', novas.length)
    } catch (err) {
      console.log('0132: falha ao gravar =', err.message)
    }
  },
  (app) => {
    // Não há reversão automática: as fontes antigas foram substituídas de forma
    // intencional. Para voltar, seria necessário regravar os textos originais.
  },
)
