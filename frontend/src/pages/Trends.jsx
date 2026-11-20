import React, { useMemo, useState } from 'react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Line, LineChart,
  ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Activity, CircleHelp, TrendingUp } from 'lucide-react'
import {
  AtlasTooltip, axisTick, compactMoneyFormatter, gridProps, gridPropsHorizontal,
  moneyFormatter, numberFormatter, pctFormatter, CHART,
} from '../lib/chart'
import { money, monthLabel, number, pct, shortMonth } from '../lib/format'
import { KpiStrip, NoteBanner, Panel, SegmentedControl } from '../components/Primitives'

const COMPOSITION_COLORS = [CHART.teal, CHART.blue, CHART.amber, '#5CC8B4', '#6FA8E8', '#D89A5C', '#C97A7A', '#7FA9A0', '#A9B7BC']

export default function Trends({ data }) {
  const [metric, setMetric] = useState('gmv')
  const [compositionMode, setCompositionMode] = useState('value')

  const monthly = useMemo(() => data.monthly.map(row => ({ ...row, label: monthLabel(row.purchase_month) })), [data.monthly])
  const average = useMemo(() => {
    const values = monthly.map(row => Number(row[metric] || 0))
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
  }, [monthly, metric])

  const composition = useMemo(() => {
    const categories = [...new Set((data.monthly_category || []).map(row => row.category))]
    const byMonth = new Map()
    ;(data.monthly_category || []).forEach(row => {
      if (!byMonth.has(row.purchase_month)) byMonth.set(row.purchase_month, { purchase_month: row.purchase_month, label: monthLabel(row.purchase_month) })
      byMonth.get(row.purchase_month)[row.category] = Number(row.gmv || 0)
    })
    const rows = [...byMonth.values()].sort((a, b) => a.purchase_month.localeCompare(b.purchase_month))
    if (compositionMode === 'share') {
      return rows.map(row => {
        const total = categories.reduce((sum, category) => sum + Number(row[category] || 0), 0) || 1
        const output = { purchase_month: row.purchase_month, label: row.label }
        categories.forEach(category => { output[category] = Number(row[category] || 0) / total })
        return output
      })
    }
    return rows
  }, [data.monthly_category, compositionMode])

  const categories = useMemo(() => [...new Set((data.monthly_category || []).map(row => row.category))], [data.monthly_category])
  const yoyRows = useMemo(() => data.categories
    .filter(row => row.yoy_growth !== null && Number.isFinite(Number(row.yoy_growth)))
    .sort((a, b) => Number(b.yoy_growth) - Number(a.yoy_growth))
    .slice(0, 12), [data.categories])

  const heatmap = useMemo(() => {
    const rows = new Map()
    data.monthly.forEach(row => {
      const [year, month] = String(row.purchase_month).split('-')
      if (!rows.has(year)) rows.set(year, Array.from({ length: 12 }, () => ({ value: 0, orders: 0 })))
      const cell = rows.get(year)[Number(month) - 1]
      cell.value += Number(row[metric] || 0)
      cell.orders += Number(row.orders || 0)
    })
    return [...rows.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [data.monthly, metric])

  const heatMax = Math.max(1, ...heatmap.flatMap(([, cells]) => cells.map(cell => cell.value)))

  return (
    <>
      <KpiStrip items={[
        { label: 'Observed window', value: `${data.metadata.period_start.slice(0, 4)}–${data.metadata.period_end.slice(0, 4)}`, note: 'Delivered purchase dates', icon: Activity },
        { label: 'Average order value', value: money(data.kpis.average_order_value), note: 'GMV ÷ delivered orders', icon: TrendingUp },
        { label: 'Freight tracked', value: money(data.kpis.freight_value, true), note: 'Reported separately from GMV', icon: Activity },
        { label: 'Comparison window', value: data.metadata.comparison_window.current.slice(0, 10), note: 'Against equivalent prior-year YTD', icon: CircleHelp },
      ]} />

      <Panel
        eyebrow="TIME SERIES"
        title="Monthly market trend"
        subtitle="Delivered merchandise activity across the observed purchase months"
        action={<SegmentedControl label="Monthly metric" value={metric} onChange={setMetric} options={[{ value: 'gmv', label: 'GMV' }, { value: 'orders', label: 'Orders' }]} />}
      >
        <div className="chart chart--tall">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthly} margin={{ top: 12, right: 20, left: 8, bottom: 4 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} dy={9} minTickGap={22} />
              <YAxis tick={axisTick} tickLine={false} axisLine={false} width={62} tickFormatter={metric === 'gmv' ? value => `R$${money(value, true).replace('R$ ', '')}` : numberFormatter} />
              <Tooltip content={<AtlasTooltip formatters={{ [metric]: metric === 'gmv' ? moneyFormatter : numberFormatter }} />} />
              <ReferenceLine y={average} stroke={CHART.amber} strokeDasharray="4 6" strokeOpacity={0.75} />
              <Line type="monotone" dataKey={metric} name={metric === 'gmv' ? 'Delivered GMV' : 'Delivered orders'} stroke={CHART.teal} strokeWidth={2.2} dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: CHART.teal }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div className="chart-footnote"><span>Dashed line: monthly average in the observed window</span><span>{monthly.length} purchase months</span></div>
      </Panel>

      <div className="split-grid split-grid--wide-left">
        <Panel
          eyebrow="COMPOSITION"
          title="Category demand composition over time"
          subtitle="Monthly delivered item GMV by leading category; the long tail is grouped"
          action={<SegmentedControl label="Composition mode" value={compositionMode} onChange={setCompositionMode} options={[{ value: 'value', label: 'Value' }, { value: 'share', label: 'Share' }]} />}
        >
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={composition} margin={{ top: 10, right: 16, left: 8, bottom: 2 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" tick={axisTick} tickLine={false} axisLine={false} dy={9} minTickGap={20} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={compositionMode === 'share' ? 48 : 62} tickFormatter={compositionMode === 'share' ? pctFormatter : value => `R$${money(value, true).replace('R$ ', '')}`} />
                <Tooltip content={<AtlasTooltip formatters={Object.fromEntries(categories.map(category => [category, compositionMode === 'share' ? pctFormatter : moneyFormatter]))} />} />
                {categories.map((category, index) => (
                  <Area key={category} type="monotone" dataKey={category} stackId="composition" stroke="none" fill={COMPOSITION_COLORS[index % COMPOSITION_COLORS.length]} fillOpacity={0.78} isAnimationActive={false} />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-legend">
            {categories.map((category, index) => <span key={category}><i style={{ background: COMPOSITION_COLORS[index % COMPOSITION_COLORS.length] }} />{category}</span>)}
          </div>
        </Panel>

        <Panel eyebrow="COMPARABLE CHANGE" title="Year-over-year category movement" subtitle={data.metadata.comparison_window.current + ' vs ' + data.metadata.comparison_window.prior}>
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={yoyRows} layout="vertical" margin={{ top: 4, right: 14, left: 4, bottom: 0 }}>
                <CartesianGrid {...gridPropsHorizontal} />
                <XAxis type="number" tickFormatter={value => `${Math.round(Number(value) * 100)}%`} tick={axisTick} tickLine={false} axisLine={false} />
                <YAxis type="category" dataKey="category" width={126} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip content={<AtlasTooltip formatters={{ yoy_growth: pctFormatter }} />} />
                <ReferenceLine x={0} stroke={CHART.muted} strokeOpacity={0.5} />
                <Bar dataKey="yoy_growth" name="YTD change" radius={[0, 4, 4, 0]} maxBarSize={16} isAnimationActive={false}>
                  {yoyRows.map(row => <Cell key={row.category} fill={Number(row.yoy_growth) >= 0 ? CHART.teal : CHART.coral} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel eyebrow="CALENDAR VIEW" title="Monthly activity heatmap" subtitle={`Intensity of ${metric === 'gmv' ? 'delivered GMV' : 'delivered orders'} by purchase year and month`}>
        <div className="heatmap">
          <div className="heatmap__months"><span />{Array.from({ length: 12 }, (_, index) => <span key={index}>{shortMonth(String(index + 1).padStart(2, '0'))}</span>)}</div>
          {heatmap.map(([year, cells]) => (
            <div className="heatmap__row" key={year}>
              <span className="heatmap__year mono">{year}</span>
              {cells.map((cell, index) => (
                <div
                  key={index}
                  className="heatmap__cell"
                  style={{ background: cell.value ? `rgba(77,224,193,${0.1 + 0.85 * (cell.value / heatMax)})` : 'rgba(35,52,59,.45)' }}
                  title={`${year}-${String(index + 1).padStart(2, '0')}: ${metric === 'gmv' ? money(cell.value) : number(cell.orders)} · ${number(cell.orders)} orders`}
                >
                  {cell.value > 0 && <span className="mono">{metric === 'gmv' ? money(cell.value, true).replace('R$ ', '') : number(cell.value)}</span>}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="chart-footnote"><span>Lighter teal indicates higher observed activity</span><span>2016 and 2018 are partial years</span></div>
      </Panel>

      <NoteBanner icon={CircleHelp}>
        Growth compares matching year-to-date calendar windows inside the Olist dataset. It is not an external Brazilian e-commerce growth rate, and the composition view groups the long tail of categories rather than adding new records.
      </NoteBanner>
    </>
  )
}
