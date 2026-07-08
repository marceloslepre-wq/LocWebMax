migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('inventory')
    if (!col.fields.getByName('image_file')) {
      col.fields.add(
        new FileField({
          name: 'image_file',
          maxSelect: 1,
          maxSize: 5242880,
          mimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
        }),
      )
    }
    app.save(col)
  },
  (app) => {
    const col = app.findCollectionByNameOrId('inventory')
    const field = col.fields.getByName('image_file')
    if (field) {
      col.fields.remove(field)
      app.save(col)
    }
  },
)
