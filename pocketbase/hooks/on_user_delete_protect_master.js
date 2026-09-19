onRecordDelete((e) => {
  const role = e.record.getString('role')
  const email = e.record.getString('email')
  if (role === 'Master' || email === 'marceloslepre@gmail.com') {
    throw new ForbiddenError('O usuário Master não pode ser excluído por ninguém do sistema.')
  }
}, 'users')
