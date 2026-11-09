onRecordDelete((e) => {
  const role = e.record.getString('role')
  const email = e.record.getString('email')
  if (role === 'Master' || email === 'marceloslepre@gmail.com') {
    throw new ForbiddenError('O usuário Master não pode ser excluído por ninguém do sistema.')
  }

  // Todo caminho que deve prosseguir PRECISA chamar e.next(): sem isso o PocketBase
  // pula a escrita (a exclusão) e ainda assim responde sucesso à API.
  e.next()
}, 'users')
