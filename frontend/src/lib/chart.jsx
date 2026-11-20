import React from 'react'
import { money, number, pct } from './format'

export const CHART = {
  teal: '#4DE0C1',
  blue: '#83BBFF',
  amber: '#F2B66D',
  coral: '#F08080',
  text: '#EAF3F4',
  muted: '#91A4AA',
  grid: '#23343B',
  surface: '#101B20',
  surface2: '#142127',
}

export const axisTick = { fill: CHART.muted, fontSize: 11, fontFamily: 'Manrope, sans-serif' }
export const axisLine = { stroke: CHART.grid }
export const gridProps = { vertical: false, stroke: CHART.grid, strokeDasharray: '2 6' }
export const gridPropsHorizontal = { horizontal: false, stroke: CHART.grid, strokeDasharray: '2 6' }

export function AtlasTooltip({ active, payload, label, labelFormatter, formatters = {}, title }) {
  if (!active || !payload?.length) return null
  const heading = typeof title === 'function'
    ? title(payload, label)
    : title || (labelFormatter ? labelFormatter(label) : label)
  return (
    <div className="atlas-tooltip">
      {heading != null && heading !== '' && <div className="atlas-tooltip__title">{heading}</div>}
      {payload.map((entry, index) => {
        const formatter = formatters[entry.dataKey || entry.name]
        const value = formatter ? formatter(entry.value, entry.payload) : number(entry.value)
        const color = entry.color || entry.fill || CHART.teal
        return (
          <div className="atlas-tooltip__row" key={`${entry.dataKey || entry.name}-${index}`}>
            <i style={{ background: color }} />
            <span>{entry.name}</span>
            <b>{value}</b>
          </div>
        )
      })}
    </div>
  )
}

export const moneyFormatter = value => money(value)
export const compactMoneyFormatter = value => money(value, true)
export const numberFormatter = value => number(value)
export const pctFormatter = value => pct(value)
export const oneDecimalFormatter = value => Number(value || 0).toFixed(1)

export const TOOLTIP_STYLE = {
  backgroundColor: CHART.surface2,
  border: `1px solid ${CHART.grid}`,
  borderRadius: 10,
  boxShadow: '0 16px 40px rgba(0,0,0,.45)',
  fontSize: 11,
  color: CHART.text,
}
