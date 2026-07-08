routerAdd(
  'POST',
  '/backend/v1/import/customers',
  (e) => {
    const body = e.requestInfo().body || {}
    const rows = body.rows || []

    let imported = 0
    let updated = 0
    let skipped = 0
    let failed = 0
    const errors = []

    const customersCol = $app.findCollectionByNameOrId('customers')
    const docsCol = $app.findCollectionByNameOrId('customer_documents')

    var proto = 'https'
    var forwardedProto = e.request.header.get('X-Forwarded-Proto')
    if (forwardedProto) proto = forwardedProto
    var baseUrl = proto + '://' + e.request.host

    var existingByDoc = {}
    var existingByMatricula = {}
    var maxMatricula = 0

    try {
      var allCustomers = $app.findRecordsByFilter('customers', '', '', 0, 0)
      for (var ai = 0; ai < allCustomers.length; ai++) {
        var c = allCustomers[ai]
        var doc = c.getString('document').replace(/\D/g, '')
        if (doc) existingByDoc[doc] = c
        var mat = c.getString('matricula')
        if (mat) existingByMatricula[mat] = c
        var matNum = parseInt(mat, 10)
        if (!isNaN(matNum) && matNum > maxMatricula) maxMatricula = matNum
      }
    } catch (err) {
      $app.logger().error('import_customers: failed to load existing customers', 'err', err.message)
    }

    for (var i = 0; i < rows.length; i++) {
      var row = rows[i]
      var rowNum = i + 2

      try {
        if (!row.name || !row.name.trim()) {
          errors.push('Linha ' + rowNum + ': Nome não informado')
          failed++
          continue
        }

        var cleanDoc = (row.document || '').replace(/\D/g, '')
        if (!cleanDoc) {
          errors.push('Linha ' + rowNum + ': Documento não informado')
          failed++
          continue
        }

        var existing = existingByDoc[cleanDoc]
        if (!existing && row.matricula) {
          existing = existingByMatricula[row.matricula]
        }

        var phoneCell = (row.phone_cell || '').replace(/\D/g, '')
        var phoneCom = (row.phone_com || '').replace(/\D/g, '')
        var phoneRes = (row.phone_res || '').replace(/\D/g, '')

        var customerRecord = null

        if (existing) {
          existing.set('name', row.name.trim())
          existing.set('document', cleanDoc)
          existing.set('phone_cell', phoneCell)
          existing.set('phone_com', phoneCom)
          existing.set('phone_res', phoneRes)
          existing.set('email', row.email || '')
          existing.set('address', row.address || {})
          if (row.observations !== undefined) existing.set('observations', row.observations || '')
          $app.save(existing)
          customerRecord = existing
          updated++
        } else {
          var matricula = row.matricula || ''
          if (!matricula || matricula === '-') {
            maxMatricula++
            matricula = String(maxMatricula).padStart(4, '0')
          } else {
            var importMatNum = parseInt(matricula, 10)
            if (!isNaN(importMatNum) && importMatNum > maxMatricula) maxMatricula = importMatNum
          }

          var newRecord = new Record(customersCol)
          newRecord.set('matricula', matricula)
          newRecord.set('name', row.name.trim())
          newRecord.set('document', cleanDoc)
          newRecord.set('phone_cell', phoneCell)
          newRecord.set('phone_com', phoneCom)
          newRecord.set('phone_res', phoneRes)
          newRecord.set('email', row.email || '')
          newRecord.set('address', row.address || {})
          if (row.observations !== undefined) newRecord.set('observations', row.observations || '')
          $app.save(newRecord)

          existingByDoc[cleanDoc] = newRecord
          existingByMatricula[matricula] = newRecord
          customerRecord = newRecord
          imported++
        }

        if (row.link_doc_identificacao && row.link_doc_identificacao.indexOf('http') === 0) {
          try {
            var idFile = $filesystem.fileFromURL(row.link_doc_identificacao, 30)
            var idDoc = new Record(docsCol)
            idDoc.set('customer_id', customerRecord.id)
            idDoc.set('file', idFile)
            idDoc.set('doc_type', 'identificacao')
            $app.save(idDoc)

            var idFileUrl =
              baseUrl + '/api/files/customer_documents/' + idDoc.id + '/' + idDoc.getString('file')
            customerRecord.set('doc_identificacao_url', idFileUrl)
            $app.save(customerRecord)
          } catch (err) {
            errors.push(
              'Linha ' + rowNum + ': Falha ao baixar doc de identificação - ' + err.message,
            )
            $app
              .logger()
              .error('import_customers: doc download failed', 'row', rowNum, 'err', err.message)
          }
        }

        if (row.link_comprovante_endereco && row.link_comprovante_endereco.indexOf('http') === 0) {
          try {
            var addrFile = $filesystem.fileFromURL(row.link_comprovante_endereco, 30)
            var addrDoc = new Record(docsCol)
            addrDoc.set('customer_id', customerRecord.id)
            addrDoc.set('file', addrFile)
            addrDoc.set('doc_type', 'comprovante')
            $app.save(addrDoc)

            var addrFileUrl =
              baseUrl +
              '/api/files/customer_documents/' +
              addrDoc.id +
              '/' +
              addrDoc.getString('file')
            customerRecord.set('comprovante_endereco_url', addrFileUrl)
            $app.save(customerRecord)
          } catch (err) {
            errors.push(
              'Linha ' + rowNum + ': Falha ao baixar comprovante de endereço - ' + err.message,
            )
            $app
              .logger()
              .error(
                'import_customers: comprovante download failed',
                'row',
                rowNum,
                'err',
                err.message,
              )
          }
        }
      } catch (err) {
        errors.push('Linha ' + rowNum + ': ' + (err.message || 'Erro ao processar registro'))
        failed++
        $app.logger().error('import_customers: row failed', 'row', rowNum, 'err', err.message)
      }
    }

    return e.json(200, {
      imported: imported,
      updated: updated,
      skipped: skipped,
      failed: failed,
      errors: errors,
    })
  },
  $apis.requireAuth(),
)
