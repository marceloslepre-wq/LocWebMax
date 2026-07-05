routerAdd(
  'POST',
  '/backend/v1/whatsapp/send',
  (e) => {
    const body = e.requestInfo().body || {}
    $app
      .logger()
      .info(
        'WhatsApp message requested',
        'to',
        body.to || '',
        'message',
        (body.message || '').substring(0, 100),
      )
    return e.json(200, { success: true, message: 'Message queued' })
  },
  $apis.requireAuth(),
)
