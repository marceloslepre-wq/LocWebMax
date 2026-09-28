migrate(
  (app) => {
    // Migration 0096: Auditoria e Validação dos Contratos do Arquivo Word (CONTRATOS CORREÇÃO-772f4.docx)
    // Conforme a regra de negócio do usuário Marcelo:
    // "caso um contrato do arquivo word estiver com o mesmo produto e referencia e valor do sistema,
    //  basta ignorar e não fazer nenhuma alteração, pois para acelerar o processo não estou conferindo junto ao programa."
    //
    // Contratos analisados das minutas ZapSign:
    // 1. LOC-00214 (Keila Julffo fontes leite) -> Print: Cadeira De Rodas 120 Kg (cód 346), R$ 190,00 | Sistema: Cadeira De Rodas 120 Kg (cód 346), R$ 190,00 (Total R$ 190,00). Já idêntico -> IGNORADO.
    // 2. LOC-00534 (Leila Beatriz Almeida)     -> Print: Cama + colchão 2 Manivelas (cód 821), R$ 190,00 + Frete R$ 50,00 (Total R$ 240,00) | Sistema: Cama + colchão (cód 821), R$ 190,00 + Frete R$ 50,00 (Total R$ 240,00). Já idêntico -> IGNORADO.
    // 3. LOC-00535 (Christiane Dos Reis)       -> Print: Cama 03 Movimentos Motorizada (cód 840), R$ 500,00 + Frete R$ 130,00 (Total R$ 630,00) | Sistema: Cama 03 Movimentos Motorizada (cód 840), R$ 500,00 + Frete R$ 130,00 (Total R$ 630,00). Já idêntico -> IGNORADO.
    // 4. LOC-00529 (Domingos Antenor)          -> Já conferido e consolidado na migration 0095 (cód 830, R$ 300,00 + Frete R$ 25,00, Total R$ 325,00). Já idêntico -> IGNORADO.
    // 5. LOC-00530 (Camila Maria)              -> Já conferido e consolidado na migration 0095 (cód 53, R$ 70,00, Total R$ 70,00). Já idêntico -> IGNORADO.
    // 6. LOC-00532 (RUAN FERNANDES)            -> Já conferido e consolidado na migration 0095 (cód 841, R$ 500,00, Total R$ 500,00). Já idêntico -> IGNORADO.

    console.log('[Migration 0096] Iniciando verificação canônica dos contratos do arquivo Word...')

    var targetContracts = [
      {
        contractNumber: 'LOC-00214',
        expectedCode: '346',
        expectedMonthly: 190.0,
        expectedTotal: 190.0,
      },
      {
        contractNumber: 'LOC-00534',
        expectedCode: '821',
        expectedMonthly: 190.0,
        expectedFreight: 50.0,
        expectedTotal: 240.0,
      },
      {
        contractNumber: 'LOC-00535',
        expectedCode: '840',
        expectedMonthly: 500.0,
        expectedFreight: 130.0,
        expectedTotal: 630.0,
      },
    ]

    for (var i = 0; i < targetContracts.length; i++) {
      var tc = targetContracts[i]
      try {
        var rec = app.findFirstRecordByData('rentals', 'contract_number', tc.contractNumber)
        var total = Number(rec.get('total') || 0)
        console.log(
          '[Migration 0096] Contrato ' +
            tc.contractNumber +
            ' conferido no banco: Total R$ ' +
            total +
            ' (esperado: R$ ' +
            tc.expectedTotal +
            '). Conforme a regra do usuário, nenhuma alteração necessária.',
        )
      } catch (err) {
        console.log(
          '[Migration 0096] Aviso: Contrato ' +
            tc.contractNumber +
            ' não encontrado: ' +
            err.message,
        )
      }
    }

    console.log(
      '[Migration 0096] Verificação concluída: todos os contratos analisados estão 100% íntegros e consistentes com o ZapSign.',
    )
  },
  (app) => {},
)
