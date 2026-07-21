routerAdd('POST', '/backend/v1/public/check-document', (e) => {
  const body = e.requestInfo().body || {}
  const document = (body.document || '').replace(/\D/g, '')
  if (!document) return e.badRequestError('document is required')

  try {
    const all = $app.findRecordsByFilter('customers', '', '', 0, 0)
    for (let i = 0; i < all.length; i++) {
      const doc = all[i].getString('document').replace(/\D/g, '')
      if (doc === document) {
        return e.json(200, { exists: true })
      }
    }
    return e.json(200, { exists: false })
  } catch (err) {
    $app.logger().error('public_check_document: failed', 'err', err.message)
    return e.json(200, { exists: false })
  }
})
