export function downloadCSV(filename: string, headers: string[], data: any[][]) {
  const csv = [
    headers.join(','),
    ...data.map((row) => row.map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')),
  ].join('\n')

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
}

import * as XLSX from 'xlsx'

export function downloadExcel(
  filename: string,
  headers: string[],
  data: any[][],
  sheetName: string = 'Locações',
) {
  // Cria worksheet a partir dos headers e matriz de dados
  const aoa = [headers, ...data]
  const ws = XLSX.utils.aoa_to_sheet(aoa)

  // Ajusta largura estimada das colunas
  const colWidths = headers.map((h, colIdx) => {
    let maxLen = String(h ?? '').length
    for (let r = 0; r < data.length; r++) {
      const valStr = String(data[r]?.[colIdx] ?? '')
      if (valStr.length > maxLen) maxLen = valStr.length
    }
    return { wch: Math.min(Math.max(maxLen + 3, 10), 60) }
  })
  ws['!cols'] = colWidths

  // Cria workbook
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, sheetName.substring(0, 31))

  // Gera array buffer real em formato OOXML/zip (.xlsx)
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' })

  // Blob com MIME type oficial do formato XLSX OpenXML
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })

  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  const cleanFilename = filename.toLowerCase().endsWith('.xlsx') ? filename : `${filename}.xlsx`
  link.setAttribute('href', url)
  link.setAttribute('download', cleanFilename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function printPDF(
  title: string,
  headers: string[],
  data: any[][],
  companyName: string,
  logoUrl?: string | null,
) {
  const printWindow = window.open('', '_blank')
  if (!printWindow) return

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>${title}</title>
        <style>
          body { font-family: system-ui, -apple-system, sans-serif; padding: 40px; color: #333; }
          .header { display: flex; align-items: center; margin-bottom: 30px; border-bottom: 2px solid #eee; padding-bottom: 20px; }
          .logo { max-height: 60px; margin-right: 20px; }
          .title-container { flex: 1; }
          h1 { margin: 0 0 5px 0; font-size: 24px; color: #000; text-transform: uppercase; }
          .company { font-size: 14px; color: #666; }
          table { width: 100%; border-collapse: collapse; margin-top: 20px; }
          th, td { padding: 12px 8px; text-align: left; border-bottom: 1px solid #ddd; font-size: 14px; }
          th { background-color: #f8f9fa; font-weight: 600; color: #000; }
          tr:nth-child(even) { background-color: #fafafa; }
          @media print {
            body { padding: 0; }
            .header { border-bottom-color: #000; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          ${logoUrl ? `<img src="${logoUrl}" class="logo" />` : ''}
          <div class="title-container">
            <h1>${title}</h1>
            <div class="company">${companyName}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr>
          </thead>
          <tbody>
            ${data.map((row) => `<tr>${row.map((cell) => `<td>${cell ?? ''}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
        <script>
          window.onload = () => {
            window.print();
            setTimeout(() => window.close(), 500);
          }
        </script>
      </body>
    </html>
  `

  printWindow.document.write(html)
  printWindow.document.close()
}

export function handleExport(
  format: 'csv' | 'excel' | 'pdf',
  filename: string,
  headers: string[],
  data: any[][],
  companyName?: string,
  logoUrl?: string | null,
) {
  if (format === 'csv') {
    downloadCSV(`${filename}.csv`, headers, data)
  } else if (format === 'excel') {
    downloadExcel(filename, headers, data)
  } else if (format === 'pdf') {
    printPDF(
      filename.toUpperCase().replace(/-/g, ' '),
      headers,
      data,
      companyName || 'Relatório',
      logoUrl,
    )
  }
}
