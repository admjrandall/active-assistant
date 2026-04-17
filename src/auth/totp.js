const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

const base32ToBytes = (base32) => {
  const input = base32.toUpperCase().replace(/[^A-Z2-7]/g, '')
  const bits = input.split('').map(c => BASE32_CHARS.indexOf(c).toString(2).padStart(5, '0')).join('')
  const bytes = []
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2))
  }
  return new Uint8Array(bytes)
}

const bytesToBase32 = (bytes) => {
  let bits = ''
  bytes.forEach(b => { bits += b.toString(2).padStart(8, '0') })
  let result = ''
  for (let i = 0; i < bits.length; i += 5) {
    result += BASE32_CHARS[parseInt(bits.slice(i, i + 5).padEnd(5, '0'), 2)]
  }
  while (result.length % 8 !== 0) result += '='
  return result
}

export const generateTOTPSecret = () => {
  const bytes = new Uint8Array(20)
  crypto.getRandomValues(bytes)
  return bytesToBase32(bytes).replace(/=/g, '')
}

export const generateOTPAuthURI = (secret, accountName = 'user', issuer = 'Active Assistant') => {
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  })
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}?${params}`
}

export const computeTOTP = async (secret, timeWindow = null) => {
  const window = timeWindow ?? Math.floor(Date.now() / 1000 / 30)
  const keyBytes = base32ToBytes(secret)

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  )

  const counter = new ArrayBuffer(8)
  const view = new DataView(counter)
  view.setUint32(4, window, false)

  const hmac = await crypto.subtle.sign('HMAC', cryptoKey, counter)
  const hmacBytes = new Uint8Array(hmac)

  const offset = hmacBytes[19] & 0x0f
  const code = (
    ((hmacBytes[offset] & 0x7f) << 24) |
    ((hmacBytes[offset + 1] & 0xff) << 16) |
    ((hmacBytes[offset + 2] & 0xff) << 8) |
     (hmacBytes[offset + 3] & 0xff)
  ) % 1_000_000

  return String(code).padStart(6, '0')
}

export const verifyTOTP = async (secret, token) => {
  const currentWindow = Math.floor(Date.now() / 1000 / 30)
  const windows = [currentWindow - 1, currentWindow, currentWindow + 1]
  for (const w of windows) {
    const expected = await computeTOTP(secret, w)
    if (expected === token.replace(/\s/g, '')) return true
  }
  return false
}

export const renderQRCodeURI = (uri) =>
  `https://chart.googleapis.com/chart?chs=200x200&chld=M|0&cht=qr&chl=${encodeURIComponent(uri)}`
