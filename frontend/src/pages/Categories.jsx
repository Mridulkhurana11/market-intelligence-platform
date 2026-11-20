import React, { useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer,
  Scatter, ScatterChart, Tooltip, Treemap, XAxis, YAxis, ZAxis,
} from 'recharts'
import { Boxes, CircleHelp, Search, TrendingUp } from 'lucide-react'
import {
  AtlasTooltip, CHART, axisTick, compactMoneyFormatter, gridProps,
  gridPropsHorizontal, moneyFormatter, numberFormatter, pctFormatter,
} from '../lib/chart'
import { money, number, pct } from '../lib/format'
import {
  Badge, DataTable, DownloadButton, KpiStrip, NoteBanner, Panel,
  SearchInput, SegmentedControl,
} from '../components/Primitives'

const CAT_COLORS = [CHART.teal, CHART.blue, CHART.amber, '#5CC8B4', '#6FA8E8', '#D89A5C', '#C97A7A', '#7FA9A0', '#A9B7BC']

export default function Categories({ data }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('opportunity_score')

  const categories = data.categories
  const treemapData = useMemo(() => {
    const top = categories.slice(0, 11)
    const rest = categories.slice(11).reduce((sum, row) => sum + Number(row.gmv || 0), 0)
    const rows = top.map(row => ({ category: row.category, gmv: Number(row.gmv || 0) }))
    if (rest > 0) rows.push({ category: 'Other categories', gmv: rest })
    return rows
  }, [categories])

  const demandScatter = useMemo(() => categories
    .filter(row => Number(row.sellers) > 0 && Number(row.gmv) > 0)
    .map(row => ({ ...row, bubble: Number(row.orders || 0) })), [categories])

  const matrix = useMemo(() => categories
    .filter(row => row.yoy_growth !== null && Number.isFinite(Number(row.yoy_growth)) && Number(row.hhi) > 0)
    .map(row => ({ ...row, bubble: Number(row.gmv || 0) })), [categories])

  const medianHhi = useMemo(() => {
    const values = matrix.map(row => Number(row.hhi)).sort((a, b) => a - b)
    if (!values.length) return 0
    const mid = Math.floor(values.length / 2)
    return values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2
  }, [matrix])

  const ranked = useMemo(() => [...categories]
    .sort((a, b) => Number(b[sort] || 0) - Number(a[sort] || 0))
    .slice(0, 10), [categories, sort])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const rows = needle ? categories.filter(row => row.category.toLowerCase().includes(needle)) : categories
    return [...rows].sort((a, b) => Number(b[sort] || 0) - Number(a[sort] || 0))
  }, [categories, query, sort])

  const positiveGrowth = matrix.filter(row => Number(row.yoy_growth) > 0).length
  const lead = categories[0]

  return (
    <>
      <KpiStrip items={[
        { label: 'Active categories', value: number(data.kpis.active_categories), note: 'Represented in delivered sales', icon: Boxes },
        { label: 'Largest category', value: lead?.category || '—', note: lead ? `${pct(lead.gmv_share)} of sample GMV` : 'No category data', icon: TrendingUp },
        { label: 'Positive comparable growth', value: number(positiveGrowth), note: `Of ${matrix.length} categories with a comparable window`, icon: TrendingUp },
        { label: 'Highest opportunity score', value: Number(data.opportunities[0]?.opportunity_score || 0).toFixed(1), note: data.opportunities[0]?.category || '—', icon: Boxes },
      ]} />

      <div className="split-grid split-grid--equal">
        <Panel eyebrow="GMV COMPOSITION" title="Category value map" subtitle="Tile area reflects delivered item GMV within the observed sample">
          <div className="treemap-wrap treemap-wrap--tall">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap data={treemapData} dataKey="gmv" nameKey="category" isAnimationActive={false} stroke="#080D11" content={props => {
                if (props.depth === 0) return null
                const label = props.name || props.payload?.category || props.payload?.name || ''
                const amount = props.value ?? props.payload?.gmv ?? 0
                return (
                  <g>
                    <rect x={props.x} y={props.y} width={Math.max(0, props.width - 2)} height={Math.max(0, props.height - 2)} rx={5} fill={CAT_COLORS[props.index % CAT_COLORS.length]} fillOpacity={0.82} stroke="#080D11" strokeWidth={2} />
                    {props.width > 70 && props.height > 32 && <>
                      <text x={props.x + 9} y={props.y + 18} fill="#EAF3F4" fontSize={10} fontWeight={700} fontFamily="Manrope, sans-serif">{String(label).slice(0, 20)}</text>
                      <text x={props.x + 9} y={props.y + 33} fill="#EAF3F4" fillOpacity={0.78} fontSize={10} fontFamily="IBM Plex Mono, monospace">{money(amount, true)}</text>
                    </>}
                  </g>
                )
              }}>
                <Tooltip content={<AtlasTooltip formatters={{ gmv: moneyFormatter }} title="Delivered GMV" />} />
              </Treemap>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel eyebrow="DEMAND VS COMPETITION" title="Demand and seller density" subtitle="Each bubble is a category; size reflects delivered order count">
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 14, right: 18, bottom: 12, left: 6 }}>
                <CartesianGrid {...gridProps} />
                <XAxis type="number" dataKey="sellers" name="Active sellers" tick={axisTick} tickLine={false} axisLine={false} label={{ value: 'Active sellers', position: 'insideBottom', offset: -8, fill: CHART.muted, fontSize: 10 }} />
                <YAxis type="number" dataKey="gmv" name="Delivered GMV" tick={axisTick} tickLine={false} axisLine={false} width={62} tickFormatter={compactMoneyFormatter} />
                <ZAxis type="number" dataKey="bubble" range={[40, 520]} />
                <Tooltip content={<AtlasTooltip formatters={{ gmv: moneyFormatter, sellers: numberFormatter, orders: numberFormatter }} />} cursor={{ strokeDasharray: '3 5' }} />
                <Scatter data={demandScatter} fill={CHART.teal} fillOpacity={0.42} stroke={CHART.teal} strokeOpacity={0.75} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <p className="micro-note">High GMV with few sellers indicates a concentrated observed seller base, not necessarily unmet market demand.</p>
        </Panel>
      </div>

      <div className="split-grid split-grid--equal">
        <Panel eyebrow="OPPORTUNITY MATRIX" title="Growth versus seller concentration" subtitle="Bubble size is delivered GMV; vertical line is the median category HHI">
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 14, right: 18, bottom: 12, left: 6 }}>
                <CartesianGrid {...gridProps} />
                <XAxis type="number" dataKey="hhi" name="Seller HHI" tick={axisTick} tickLine={false} axisLine={false} label={{ value: 'Seller HHI (higher = more concentrated)', position: 'insideBottom', offset: -8, fill: CHART.muted, fontSize: 10 }} />
                <YAxis type="number" dataKey="yoy_growth" name="Comparable YTD change" tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={value => `${Math.round(Number(value) * 100)}%`} />
                <ZAxis type="number" dataKey="bubble" range={[40, 520]} />
                <ReferenceLine x={medianHhi} stroke={CHART.amber} strokeDasharray="4 5" strokeOpacity={0.8} />
                <ReferenceLine y={0} stroke={CHART.muted} strokeOpacity={0.45} />
                <Tooltip content={<AtlasTooltip formatters={{ hhi: numberFormatter, yoy_growth: pctFormatter, gmv: moneyFormatter }} />} cursor={{ strokeDasharray: '3 5' }} />
                <Scatter data={matrix} fill={CHART.blue} fillOpacity={0.4} stroke={CHART.blue} strokeOpacity={0.75} isAnimationActive={false} />
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>

        <Panel
          eyebrow="RELATIVE RANKING"
          title="Opportunity score leaders"
          subtitle="Weighted screening score from observed category signals"
          action={<SegmentedControl label="Rank by" value={sort} onChange={setSort} options={[{ value: 'opportunity_score', label: 'Score' }, { value: 'yoy_growth', label: 'Growth' }]} />}
        >
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranked} layout="vertical" margin={{ top: 2, right: 16, left: 4, bottom: 0 }}>
                <CartesianGrid {...gridPropsHorizontal} />
                <XAxis type="number" domain={sort === 'opportunity_score' ? [0, 100] : undefined} tick={axisTick} tickLine={false} axisLine={false} tickFormatter={sort === 'yoy_growth' ? value => `${Math.round(Number(value) * 100)}%` : numberFormatter} />
                <YAxis type="category" dataKey="category" width={128} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip content={<AtlasTooltip formatters={{ [sort]: sort === 'yoy_growth' ? pctFormatter : value => Number(value || 0).toFixed(1) }} />} />
                <Bar dataKey={sort} name={sort === 'yoy_growth' ? 'Comparable change' : 'Opportunity score'} radius={[0, 4, 4, 0]} maxBarSize={15} isAnimationActive={false}>
                  {ranked.map(row => <Cell key={row.category} fill={sort === 'yoy_growth' ? (Number(row.yoy_growth) >= 0 ? CHART.teal : CHART.coral) : CHART.amber} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="CATEGORY BENCHMARK"
        title="Full category comparison"
        subtitle="Search and sort the observed category-level measurements"
        action={<div className="panel-actions"><SearchInput value={query} onChange={setQuery} placeholder="Find category…" label="Search categories" /><DownloadButton rows={filtered} filename="obsidian-category-benchmark.csv" /></div>}
      >
        <DataTable
          compact
          rowKey={row => row.category}
          columns={[
            { key: 'category', label: 'CATEGORY', render: value => <b>{value}</b> },
            { key: 'gmv', label: 'GMV', right: true, render: value => money(value) },
            { key: 'gmv_share', label: 'SAMPLE SHARE', right: true, render: pct },
            { key: 'orders', label: 'ORDERS', right: true, render: number },
            { key: 'sellers', label: 'SELLERS', right: true, render: number },
            { key: 'yoy_growth', label: 'YOY CHANGE', right: true, render: value => value == null || !Number.isFinite(Number(value)) ? '—' : <span className={Number(value) >= 0 ? 'positive' : 'negative'}>{Number(value) >= 0 ? '+' : ''}{(Number(value) * 100).toFixed(1)}%</span> },
            { key: 'hhi', label: 'SELLER HHI', right: true, render: value => number(value) },
            { key: 'average_review', label: 'AVG REVIEW', right: true, render: value => value == null ? '—' : Number(value).toFixed(2) },
            { key: 'opportunity_score', label: 'SCORE', right: true, render: value => <Badge tone="amber">{Number(value).toFixed(1)}</Badge> },
          ]}
          rows={filtered}
          empty="No category matches this search."
        />
      </Panel>

      <NoteBanner icon={CircleHelp}>
        Category shares and HHI are calculated inside the delivered Olist sample. Opportunity scores use fixed published weights (35/30/20/15) and are a relative investigation queue, not TAM or a prediction.
      </NoteBanner>
    </>
  )
}
