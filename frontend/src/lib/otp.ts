import { t } from '@/lib/i18n'
export type OtpAlgorithm = 'SHA1' | 'SHA256' | 'SHA512'

export interface ParsedTotpConfig {
  secretBase32: string
  secretBytes: Uint8Array
  algorithm: OtpAlgorithm
  digits: number
  period: number
  issuer?: string
  label?: string
}

export type ParseTotpResult =
  | { ok: true; config: ParsedTotpConfig }
  | { ok: false; error: string }

export interface TotpResult {
  code: string
  formattedCode: string
  remainingSeconds: number
  progress: number
  period: number
  digits: number
  algorithm: OtpAlgorithm
  expiresAtMs: number
}

const textEncoder = new TextEncoder()

function rotl32(value: number, bits: number): number {
  return ((value << bits) | (value >>> (32 - bits))) >>> 0
}

function rotr32(value: number, bits: number): number {
  return ((value >>> bits) | (value << (32 - bits))) >>> 0
}

function sha1(data: Uint8Array): Uint8Array {
  const bitLen = BigInt(data.length) * 8n
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLen)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setBigUint64(paddedLen - 8, bitLen, false)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const w = new Uint32Array(80)

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 80; i++) {
      w[i] = rotl32(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i++) {
      let f: number
      let k: number
      if (i < 20) {
        f = (b & c) | (~b & d)
        k = 0x5a827999
      } else if (i < 40) {
        f = b ^ c ^ d
        k = 0x6ed9eba1
      } else if (i < 60) {
        f = (b & c) | (b & d) | (c & d)
        k = 0x8f1bbcdc
      } else {
        f = b ^ c ^ d
        k = 0xca62c1d6
      }

      const temp = (rotl32(a, 5) + f + e + k + w[i]) >>> 0
      e = d
      d = c
      c = rotl32(b, 30)
      b = a
      a = temp
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  const out = new Uint8Array(20)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, false)
  outView.setUint32(4, h1, false)
  outView.setUint32(8, h2, false)
  outView.setUint32(12, h3, false)
  outView.setUint32(16, h4, false)
  return out
}

const K256 = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1,
  0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786,
  0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b,
  0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a,
  0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

function sha256(data: Uint8Array): Uint8Array {
  const bitLen = BigInt(data.length) * 8n
  const paddedLen = Math.ceil((data.length + 9) / 64) * 64
  const padded = new Uint8Array(paddedLen)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setBigUint64(paddedLen - 8, bitLen, false)

  let h0 = 0x6a09e667
  let h1 = 0xbb67ae85
  let h2 = 0x3c6ef372
  let h3 = 0xa54ff53a
  let h4 = 0x510e527f
  let h5 = 0x9b05688c
  let h6 = 0x1f83d9ab
  let h7 = 0x5be0cd19

  const w = new Uint32Array(64)

  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false)
    }
    for (let i = 16; i < 64; i++) {
      const s0 = rotr32(w[i - 15], 7) ^ rotr32(w[i - 15], 18) ^ (w[i - 15] >>> 3)
      const s1 = rotr32(w[i - 2], 17) ^ rotr32(w[i - 2], 19) ^ (w[i - 2] >>> 10)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 64; i++) {
      const S1 = rotr32(e, 6) ^ rotr32(e, 11) ^ rotr32(e, 25)
      const ch = (e & f) ^ (~e & g)
      const temp1 = (h + S1 + ch + K256[i] + w[i]) >>> 0
      const S0 = rotr32(a, 2) ^ rotr32(a, 13) ^ rotr32(a, 22)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) >>> 0

      h = g
      g = f
      f = e
      e = (d + temp1) >>> 0
      d = c
      c = b
      b = a
      a = (temp1 + temp2) >>> 0
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
    h5 = (h5 + f) >>> 0
    h6 = (h6 + g) >>> 0
    h7 = (h7 + h) >>> 0
  }

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0, false)
  outView.setUint32(4, h1, false)
  outView.setUint32(8, h2, false)
  outView.setUint32(12, h3, false)
  outView.setUint32(16, h4, false)
  outView.setUint32(20, h5, false)
  outView.setUint32(24, h6, false)
  outView.setUint32(28, h7, false)
  return out
}

const MASK64 = 0xffffffffffffffffn

function rotr64(value: bigint, bits: number): bigint {
  const b = BigInt(bits)
  return ((value >> b) | (value << (64n - b))) & MASK64
}

const K512: readonly bigint[] = [
  0x428a2f98d728ae22n, 0x7137449123ef65cdn, 0xb5c0fbcfec4d3b2fn,
  0xe9b5dba58189dbbcn, 0x3956c25bf348b538n, 0x59f111f1b605d019n,
  0x923f82a4af194f9bn, 0xab1c5ed5da6d8118n, 0xd807aa98a3030242n,
  0x12835b0145706fben, 0x243185be4ee4b28cn, 0x550c7dc3d5ffb4e2n,
  0x72be5d74f27b896fn, 0x80deb1fe3b1696b1n, 0x9bdc06a725c71235n,
  0xc19bf174cf692694n, 0xe49b69c19ef14ad2n, 0xefbe4786384f25e3n,
  0x0fc19dc68b8cd5b5n, 0x240ca1cc77ac9c65n, 0x2de92c6f592b0275n,
  0x4a7484aa6ea6e483n, 0x5cb0a9dcbd41fbd4n, 0x76f988da831153b5n,
  0x983e5152ee66dfabn, 0xa831c66d2db43210n, 0xb00327c898fb213fn,
  0xbf597fc7beef0ee4n, 0xc6e00bf33da88fc2n, 0xd5a79147930aa725n,
  0x06ca6351e003826fn, 0x142929670a0e6e70n, 0x27b70a8546d22ffcn,
  0x2e1b21385c26c926n, 0x4d2c6dfc5ac42aedn, 0x53380d139d95b3dfn,
  0x650a73548baf63den, 0x766a0abb3c77b2a8n, 0x81c2c92e47edaee6n,
  0x92722c851482353bn, 0xa2bfe8a14cf10364n, 0xa81a664bbc423001n,
  0xc24b8b70d0f89791n, 0xc76c51a30654be30n, 0xd192e819d6ef5218n,
  0xd69906245565a910n, 0xf40e35855771202an, 0x106aa07032bbd1b8n,
  0x19a4c116b8d2d0c8n, 0x1e376c085141ab53n, 0x2748774cdf8eeb99n,
  0x34b0bcb5e19b48a8n, 0x391c0cb3c5c95a63n, 0x4ed8aa4ae3418acbn,
  0x5b9cca4f7763e373n, 0x682e6ff3d6b2b8a3n, 0x748f82ee5defb2fcn,
  0x78a5636f43172f60n, 0x84c87814a1f0ab72n, 0x8cc702081a6439ecn,
  0x90befffa23631e28n, 0xa4506cebde82bde9n, 0xbef9a3f7b2c67915n,
  0xc67178f2e372532bn, 0xca273eceea26619cn, 0xd186b8c721c0c207n,
  0xeada7dd6cde0eb1en, 0xf57d4f7fee6ed178n, 0x06f067aa72176fban,
  0x0a637dc5a2c898a6n, 0x113f9804bef90daen, 0x1b710b35131c471bn,
  0x28db77f523047d84n, 0x32caab7b40c72493n, 0x3c9ebe0a15c9bebcn,
  0x431d67c49c100d4cn, 0x4cc5d4becb3e42b6n, 0x597f299cfc657e2an,
  0x5fcb6fab3ad6faecn, 0x6c44198c4a475817n,
]

function sha512(data: Uint8Array): Uint8Array {
  const bitLen = BigInt(data.length) * 8n
  const paddedLen = Math.ceil((data.length + 17) / 128) * 128
  const padded = new Uint8Array(paddedLen)
  padded.set(data)
  padded[data.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setBigUint64(paddedLen - 16, bitLen >> 64n, false)
  view.setBigUint64(paddedLen - 8, bitLen & MASK64, false)

  let h0 = 0x6a09e667f3bcc908n
  let h1 = 0xbb67ae8584caa73bn
  let h2 = 0x3c6ef372fe94f82bn
  let h3 = 0xa54ff53a5f1d36f1n
  let h4 = 0x510e527fade682d1n
  let h5 = 0x9b05688c2b3e6c1fn
  let h6 = 0x1f83d9abfb41bd6bn
  let h7 = 0x5be0cd19137e2179n

  const w = new Array<bigint>(80)

  for (let offset = 0; offset < paddedLen; offset += 128) {
    for (let i = 0; i < 16; i++) {
      w[i] = view.getBigUint64(offset + i * 8, false)
    }
    for (let i = 16; i < 80; i++) {
      const s0 = rotr64(w[i - 15], 1) ^ rotr64(w[i - 15], 8) ^ (w[i - 15] >> 7n)
      const s1 =
        rotr64(w[i - 2], 19) ^ rotr64(w[i - 2], 61) ^ (w[i - 2] >> 6n)
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) & MASK64
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4
    let f = h5
    let g = h6
    let h = h7

    for (let i = 0; i < 80; i++) {
      const S1 = rotr64(e, 14) ^ rotr64(e, 18) ^ rotr64(e, 41)
      const ch = (e & f) ^ (~e & MASK64 & g)
      const temp1 = (h + S1 + ch + K512[i] + w[i]) & MASK64
      const S0 = rotr64(a, 28) ^ rotr64(a, 34) ^ rotr64(a, 39)
      const maj = (a & b) ^ (a & c) ^ (b & c)
      const temp2 = (S0 + maj) & MASK64

      h = g
      g = f
      f = e
      e = (d + temp1) & MASK64
      d = c
      c = b
      b = a
      a = (temp1 + temp2) & MASK64
    }

    h0 = (h0 + a) & MASK64
    h1 = (h1 + b) & MASK64
    h2 = (h2 + c) & MASK64
    h3 = (h3 + d) & MASK64
    h4 = (h4 + e) & MASK64
    h5 = (h5 + f) & MASK64
    h6 = (h6 + g) & MASK64
    h7 = (h7 + h) & MASK64
  }

  const out = new Uint8Array(64)
  const outView = new DataView(out.buffer)
  outView.setBigUint64(0, h0, false)
  outView.setBigUint64(8, h1, false)
  outView.setBigUint64(16, h2, false)
  outView.setBigUint64(24, h3, false)
  outView.setBigUint64(32, h4, false)
  outView.setBigUint64(40, h5, false)
  outView.setBigUint64(48, h6, false)
  outView.setBigUint64(56, h7, false)
  return out
}

function hmac(
  algorithm: OtpAlgorithm,
  key: Uint8Array,
  message: Uint8Array,
): Uint8Array {
  const hashFn =
    algorithm === 'SHA512' ? sha512 : algorithm === 'SHA256' ? sha256 : sha1
  const blockSize = algorithm === 'SHA512' ? 128 : 64

  const normalizedKey = key.length > blockSize ? hashFn(key) : key
  const keyBlock = new Uint8Array(blockSize)
  keyBlock.set(normalizedKey)

  const ipad = new Uint8Array(blockSize)
  const opad = new Uint8Array(blockSize)
  for (let i = 0; i < blockSize; i++) {
    ipad[i] = keyBlock[i] ^ 0x36
    opad[i] = keyBlock[i] ^ 0x5c
  }

  const innerInput = new Uint8Array(blockSize + message.length)
  innerInput.set(ipad, 0)
  innerInput.set(message, blockSize)
  const innerHash = hashFn(innerInput)

  const outerInput = new Uint8Array(blockSize + innerHash.length)
  outerInput.set(opad, 0)
  outerInput.set(innerHash, blockSize)
  return hashFn(outerInput)
}

function decodeBase32WithError(
  input: string,
):
  | { ok: true; normalized: string; bytes: Uint8Array }
  | { ok: false; error: string } {
  const cleaned = input.replace(/[\s-]+/g, '').toUpperCase()
  if (!cleaned) {
    return { ok: false, error: t('otp.il-segreto-otp-non-puo-essere-vuoto') }
  }

  const withoutPad = cleaned.replace(/=+$/, '')
  if (withoutPad.includes('=')) {
    return {
      ok: false,
      error: t('otp.il-segreto-base32-contiene-caratteri-non-validi'),
    }
  }
  if (!withoutPad) {
    return { ok: false, error: t('otp.il-segreto-otp-non-puo-essere-vuoto') }
  }

  const mod = withoutPad.length % 8
  if (mod === 1 || mod === 3 || mod === 6) {
    return { ok: false, error: t('otp.il-segreto-base32-ha-una-lunghezza-non-valida') }
  }

  const out: number[] = []
  let buffer = 0
  let bitsLeft = 0

  for (let i = 0; i < withoutPad.length; i++) {
    const code = withoutPad.charCodeAt(i)
    let val: number
    if (code >= 65 && code <= 90) {
      val = code - 65
    } else if (code >= 50 && code <= 55) {
      val = code - 50 + 26
    } else {
      return {
        ok: false,
        error:
          t('otp.il-segreto-base32-contiene-caratteri-non-validi-'),
      }
    }

    buffer = (buffer << 5) | val
    bitsLeft += 5

    if (bitsLeft >= 8) {
      bitsLeft -= 8
      out.push((buffer >>> bitsLeft) & 0xff)
    }
  }

  if (out.length < 5) {
    return {
      ok: false,
      error: t('otp.il-segreto-otp-e-troppo-corto-minimo-8-caratteri'),
    }
  }

  return { ok: true, normalized: withoutPad, bytes: new Uint8Array(out) }
}

export function decodeBase32(
  raw: string,
): { normalized: string; bytes: Uint8Array } | null {
  const res = decodeBase32WithError(raw)
  return res.ok ? { normalized: res.normalized, bytes: res.bytes } : null
}

function parseAlgorithm(raw: string): OtpAlgorithm | null {
  switch (raw.trim().toUpperCase()) {
    case '':
    case 'SHA1':
    case 'SHA-1':
      return 'SHA1'
    case 'SHA256':
    case 'SHA-256':
      return 'SHA256'
    case 'SHA512':
    case 'SHA-512':
      return 'SHA512'
    default:
      return null
  }
}

export function parseTotpConfig(raw: string): ParseTotpResult {
  const trimmed = raw.trim()
  if (!trimmed) {
    return { ok: false, error: t('otp.il-segreto-otp-non-puo-essere-vuoto') }
  }

  if (trimmed.toLowerCase().startsWith('otpauth://')) {
    const rest = trimmed.slice('otpauth://'.length)
    const beforeHash = rest.split('#', 1)[0] ?? ''
    const qIdx = beforeHash.indexOf('?')
    const authorityAndPath = qIdx >= 0 ? beforeHash.slice(0, qIdx) : beforeHash
    const queryString = qIdx >= 0 ? beforeHash.slice(qIdx + 1) : ''

    const slashIdx = authorityAndPath.indexOf('/')
    const otpType = (
      slashIdx >= 0 ? authorityAndPath.slice(0, slashIdx) : authorityAndPath
    ).toLowerCase()
    const rawLabel = slashIdx >= 0 ? authorityAndPath.slice(slashIdx + 1) : ''

    if (otpType === 'hotp') {
      return {
        ok: false,
        error:
          t('otp.i-codici-hotp-basati-su-contatore-non-sono-suppo'),
      }
    }
    if (otpType !== 'totp') {
      return {
        ok: false,
        error: t('otp.uri-otpauth-non-valido-e-supportato-solo-il-tipo'),
      }
    }

    let decodedLabel = rawLabel
    try {
      decodedLabel = decodeURIComponent(rawLabel)
    } catch {
      // keep rawLabel on malformed percent-encoding
    }
    const label = decodedLabel.trim() || undefined

    const params = new URLSearchParams(queryString)
    let secretParam = ''
    let algorithm: OtpAlgorithm = 'SHA1'
    let digits = 6
    let period = 30
    let issuer: string | undefined

    for (const [rawKey, value] of params.entries()) {
      const key = rawKey.toLowerCase()
      if (key === t('otp.secret')) {
        secretParam = value
      } else if (key === 'algorithm') {
        const alg = parseAlgorithm(value)
        if (!alg) {
          return {
            ok: false,
            error:
              t('otp.algoritmo-otp-non-supportato-ammessi-sha1-sha256'),
          }
        }
        algorithm = alg
      } else if (key === 'digits') {
        const cleanDigits = value.trim()
        if (cleanDigits) {
          if (!/^\d+$/.test(cleanDigits)) {
            return {
              ok: false,
              error: t('otp.il-numero-di-cifre-otp-deve-essere-compreso-tra-'),
            }
          }
          const parsedDigits = Number.parseInt(cleanDigits, 10)
          if (parsedDigits < 6 || parsedDigits > 8) {
            return {
              ok: false,
              error: t('otp.il-numero-di-cifre-otp-deve-essere-compreso-tra-'),
            }
          }
          digits = parsedDigits
        }
      } else if (key === 'period') {
        const cleanPeriod = value.trim()
        if (cleanPeriod) {
          if (!/^\d+$/.test(cleanPeriod)) {
            return {
              ok: false,
              error:
                t('otp.il-periodo-otp-deve-essere-compreso-tra-10-e-300'),
            }
          }
          const parsedPeriod = Number.parseInt(cleanPeriod, 10)
          if (parsedPeriod < 10 || parsedPeriod > 300) {
            return {
              ok: false,
              error:
                t('otp.il-periodo-otp-deve-essere-compreso-tra-10-e-300'),
            }
          }
          period = parsedPeriod
        }
      } else if (key === 'issuer') {
        const cleanIssuer = value.trim()
        if (cleanIssuer) {
          issuer = cleanIssuer
        }
      }
    }

    if (!secretParam.trim()) {
      return {
        ok: false,
        error: t('otp.parametro-secret-mancante-nell-uri-otpauth'),
      }
    }

    const decoded = decodeBase32WithError(secretParam)
    if (!decoded.ok) {
      return decoded
    }

    return {
      ok: true,
      config: {
        secretBase32: decoded.normalized,
        secretBytes: decoded.bytes,
        algorithm,
        digits,
        period,
        issuer,
        label,
      },
    }
  }

  if (trimmed.includes('://')) {
    return {
      ok: false,
      error:
        t('otp.uri-otp-non-valido-usa-otpauth-totp-oppure-una-c'),
    }
  }

  const decoded = decodeBase32WithError(trimmed)
  if (!decoded.ok) {
    return decoded
  }

  return {
    ok: true,
    config: {
      secretBase32: decoded.normalized,
      secretBytes: decoded.bytes,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    },
  }
}

export function buildTotpStorageValue(params: {
  secretBase32: string
  algorithm?: OtpAlgorithm
  digits?: number
  period?: number
  issuer?: string
  label?: string
}): string {
  const cleanSecret = params.secretBase32.replace(/[\s-]+/g, '').toUpperCase()
  if (!cleanSecret) return ''

  const algorithm: OtpAlgorithm = params.algorithm ?? 'SHA1'
  const digits = params.digits ?? 6
  const period = params.period ?? 30
  const issuer = params.issuer?.trim()
  const label = params.label?.trim()

  if (
    algorithm === 'SHA1' &&
    digits === 6 &&
    period === 30 &&
    !issuer &&
    !label
  ) {
    return cleanSecret
  }

  const encodedLabel = encodeURIComponent(label || issuer || t('otp.account'))
  const search = new URLSearchParams()
  search.set(t('otp.secret'), cleanSecret)
  if (issuer) search.set('issuer', issuer)
  search.set('algorithm', algorithm)
  search.set('digits', String(digits))
  search.set('period', String(period))
  return `otpauth://totp/${encodedLabel}?${search.toString()}`
}

export function formatTotpCode(code: string): string {
  if (code.length === 6) {
    return `${code.slice(0, 3)} ${code.slice(3)}`
  }
  if (code.length === 7) {
    return `${code.slice(0, 3)} ${code.slice(3)}`
  }
  if (code.length === 8) {
    return `${code.slice(0, 4)} ${code.slice(4)}`
  }
  return code
}

export function generateTotp(
  config: ParsedTotpConfig,
  nowMs = Date.now(),
): TotpResult {
  const unixSeconds = Math.floor(nowMs / 1000)
  const counter = BigInt(Math.floor(unixSeconds / config.period))
  const counterBytes = new Uint8Array(8)
  for (let i = 0; i < 8; i++) {
    counterBytes[i] = Number((counter >> BigInt((7 - i) * 8)) & 0xffn)
  }

  const hash = hmac(config.algorithm, config.secretBytes, counterBytes)
  const offset = hash[hash.length - 1] & 0x0f
  const binCode =
    ((hash[offset] & 0x7f) << 24) |
    ((hash[offset + 1] & 0xff) << 16) |
    ((hash[offset + 2] & 0xff) << 8) |
    (hash[offset + 3] & 0xff)

  const modulo = 10 ** config.digits
  const code = String((binCode >>> 0) % modulo).padStart(config.digits, '0')

  const periodMs = config.period * 1000
  const elapsedMs = ((nowMs % periodMs) + periodMs) % periodMs
  const remainingMs = periodMs - elapsedMs
  const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000))
  const progress = Math.max(0, Math.min(1, remainingMs / periodMs))
  const expiresAtMs = (Math.floor(unixSeconds / config.period) + 1) * periodMs

  return {
    code,
    formattedCode: formatTotpCode(code),
    remainingSeconds,
    progress,
    period: config.period,
    digits: config.digits,
    algorithm: config.algorithm,
    expiresAtMs,
  }
}

export function generateTotpFromRaw(
  raw: string,
  nowMs = Date.now(),
): TotpResult | null {
  const parsed = parseTotpConfig(raw)
  if (!parsed.ok) return null
  return generateTotp(parsed.config, nowMs)
}
