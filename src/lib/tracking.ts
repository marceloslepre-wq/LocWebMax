/**
 * Utilitários para rastreamento (Google Ads e Meta Pixel) no cadastro público
 * LocWebPro.
 */

declare global {
  interface Window {
    dataLayer?: any[]
    gtag?: (...args: any[]) => void
    fbq?: (...args: any[]) => void
    _fbq?: any
  }
}

const GOOGLE_ADS_ID = 'AW-18513891486'
const GOOGLE_ADS_CONVERSION_SEND_TO = 'AW-18513891486/iBAaCLO-0qwdEJ6hjvxE'
const META_PIXEL_ID = '2307497159656039'

let googleAdsInitialized = false
let metaPixelInitialized = false

/**
 * Inicializa a tag do Google Ads AW-18513891486 e o Pixel da Meta 2307497159656039
 * Dispara PageView no Pixel da Meta.
 */
export function initRegistrationTracking() {
  if (typeof window === 'undefined') return

  // 1. Google Ads Tag
  if (!googleAdsInitialized) {
    if (!document.getElementById('google-ads-gtag-script')) {
      const script = document.createElement('script')
      script.id = 'google-ads-gtag-script'
      script.async = true
      script.src = `https://www.googletagmanager.com/gtag/js?id=${GOOGLE_ADS_ID}`
      document.head.appendChild(script)

      window.dataLayer = window.dataLayer || []
      window.gtag = function gtag(...args: any[]) {
        window.dataLayer?.push(args)
      }
      window.gtag('js', new Date())
      window.gtag('config', GOOGLE_ADS_ID)
    }
    googleAdsInitialized = true
  }

  // 2. Meta Pixel
  if (!metaPixelInitialized) {
    if (!window.fbq) {
      const fbq: any = function (...args: any[]) {
        if (fbq.callMethod) {
          fbq.callMethod(...args)
        } else {
          fbq.queue.push(args)
        }
      }
      fbq.push = fbq
      fbq.loaded = true
      fbq.version = '2.0'
      fbq.queue = []
      window.fbq = fbq
      window._fbq = fbq

      const script = document.createElement('script')
      script.id = 'meta-pixel-script'
      script.async = true
      script.src = 'https://connect.facebook.net/en_US/fbevents.js'
      document.head.appendChild(script)
    }

    if (window.fbq) {
      window.fbq('init', META_PIXEL_ID)
      window.fbq('track', 'PageView')
    }
    metaPixelInitialized = true
  }
}

/**
 * Dispara eventos de conversão quando a conta for criada com sucesso:
 * - Google Ads: send_to AW-18513891486/iBAaCLO-0qwdEJ6hjvxE
 * - Meta Pixel: CompleteRegistration
 */
export function trackSuccessfulRegistration(data?: { companyName?: string; planName?: string }) {
  if (typeof window === 'undefined') return

  // Google Ads Conversion
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', 'conversion', {
        send_to: GOOGLE_ADS_CONVERSION_SEND_TO,
      })
    }
  } catch (err) {
    console.warn('Erro ao disparar conversão Google Ads:', err)
  }

  // Meta Pixel CompleteRegistration
  try {
    if (typeof window.fbq === 'function') {
      window.fbq('track', 'CompleteRegistration', {
        content_name: data?.planName || 'LocWebPro Trial',
        status: 'completed',
      })
    }
  } catch (err) {
    console.warn('Erro ao disparar evento CompleteRegistration no Meta Pixel:', err)
  }
}
