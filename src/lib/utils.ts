import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function compressImage(file: File, maxSizeMB: number = 5): Promise<File> {
  if (!file.type.startsWith('image/')) return Promise.resolve(file)
  const maxSizeBytes = maxSizeMB * 1024 * 1024
  if (file.size <= maxSizeBytes) return Promise.resolve(file)

  return new Promise((resolve) => {
    const img = new Image()
    const reader = new FileReader()

    reader.onload = (e) => {
      img.onload = () => {
        const canvas = document.createElement('canvas')
        let width = img.width
        let height = img.height

        const MAX_WIDTH = 1920
        const MAX_HEIGHT = 1920
        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width
            width = MAX_WIDTH
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height
            height = MAX_HEIGHT
          }
        }

        canvas.width = width
        canvas.height = height
        const ctx = canvas.getContext('2d')
        ctx?.drawImage(img, 0, 0, width, height)

        canvas.toBlob(
          (blob) => {
            if (blob) {
              const compressedFile = new File([blob], file.name, {
                type: file.type,
                lastModified: Date.now(),
              })
              resolve(compressedFile)
            } else {
              resolve(file)
            }
          },
          file.type,
          0.8,
        )
      }
      if (e.target?.result) {
        img.src = e.target.result as string
      }
    }
    reader.onerror = () => resolve(file)
    reader.readAsDataURL(file)
  })
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function hexToHSL(H: string) {
  let r = 0,
    g = 0,
    b = 0
  if (H.length === 4) {
    r = parseInt('0x' + H[1] + H[1])
    g = parseInt('0x' + H[2] + H[2])
    b = parseInt('0x' + H[3] + H[3])
  } else if (H.length === 7) {
    r = parseInt('0x' + H[1] + H[2])
    g = parseInt('0x' + H[3] + H[4])
    b = parseInt('0x' + H[5] + H[6])
  }

  r /= 255
  g /= 255
  b /= 255

  let cmin = Math.min(r, g, b),
    cmax = Math.max(r, g, b),
    delta = cmax - cmin,
    h = 0,
    s = 0,
    l = 0

  if (delta === 0) h = 0
  else if (cmax === r) h = ((g - b) / delta) % 6
  else if (cmax === g) h = (b - r) / delta + 2
  else h = (r - g) / delta + 4

  h = Math.round(h * 60)
  if (h < 0) h += 360

  l = (cmax + cmin) / 2
  s = delta === 0 ? 0 : delta / (1 - Math.abs(2 * l - 1))
  s = +(s * 100).toFixed(1)
  l = +(l * 100).toFixed(1)

  return `${h} ${s}% ${l}%`
}
