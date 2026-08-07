routerAdd('GET', '/backend/v1/public/payment/{paymentId}', (e) => {
  var paymentId = e.request.pathValue('paymentId')

  var payment = null
  try {
    payment = $app.findRecordById('payments', paymentId)
  } catch (_) {
    return e.notFoundError('Pagamento nao encontrado')
  }

  return e.json(200, {
    id: payment.id,
    amount: payment.get('amount'),
    description: payment.getString('description'),
    status: payment.getString('status'),
    payment_method: payment.getString('payment_method'),
    pix_qr_code: payment.getString('pix_qr_code'),
    pix_copy_paste: payment.getString('pix_copy_paste'),
    pix_expiration: payment.getString('pix_expiration'),
    created: payment.getString('created'),
  })
})
