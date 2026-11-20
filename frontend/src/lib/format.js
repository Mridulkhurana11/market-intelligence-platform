const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL', maximumFractionDigits: 0,
})
const NUM = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 })
const DEC = new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 })
const COMPACT = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 })

export const money = (value, compact = false) =>
  compact ? `R$ ${COMPACT.format(Number(value || 0))}` : BRL.format(Number(value || 0))
export const number = value => NUM.format(Number(value || 0))
export const decimal = value => DEC.format(Number(value || 0))
export const pct = value => `${(Number(value || 0) * 100).toFixed(1)}%`
export const pctExact = value => `${(Number(value || 0) * 100).toFixed(2)}%`
export const pp = value => `${Number(value || 0) >= 0 ? '+' : ''}${Number(value || 0).toFixed(2)} pp`
export const km = value => value == null || !Number.isFinite(Number(value)) ? '—' : `${NUM.format(Math.round(Number(value)))} km`
export const monthLabel = value => {
  const [year, month] = String(value || '').split('-')
  if (!year || !month) return String(value || '')
  return new Date(Number(year), Number(month) - 1, 1).toLocaleDateString('en-US', { month: 'short', year: '2-digit' })
}
export const shortMonth = value => {
  const month = Number(String(value || '').split('-')[1])
  if (!month) return String(value || '')
  return new Date(2000, month - 1, 1).toLocaleDateString('en-US', { month: 'short' })
}
export const stateLabel = value => value === 'Unknown' || !value ? 'Not recorded' : value

export function csvDownload(rows, filename) {
  const list = Array.isArray(rows) ? rows : []
  if (!list.length) return
  const keys = [...new Set(list.flatMap(row => Object.keys(row)))]
  const escape = value => `"${String(value ?? '').replaceAll('"', '""')}"`
  const csv = [keys.map(escape).join(','), ...list.map(row => keys.map(key => escape(row[key])).join(','))].join('\r\n')
  const url = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8;' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export const finite = value => value !== null && value !== undefined && Number.isFinite(Number(value))
