import React, { useMemo, useState } from 'react'
import {
  Bar, CartesianGrid, ComposedChart, Legend, Line, PolarAngleAxis, PolarGrid,
  PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from 'recharts'
import { Building2, CircleHelp, Gauge, Search, Store, Target } from 'lucide-react'
import {
  AtlasTooltip, CHART, axisTick, compactMoneyFormatter, gridProps,
  moneyFormatter, numberFormatter, pctFormatter,
} from '../lib/chart'
import { money, number, pct } from '../lib/format'
import {
  Badge, DataTable, DownloadButton, KpiStrip, NoteBanner, Panel,
  SearchInput, SegmentedControl,
} from '../components/Primitives'

const COHORT_COLORS = [CHART.teal, CHART.amber, CHART.blue, CHART.coral]

export default function Sellers({ data }) {
  const [query, setQuery] = useState('')
  const [cohort, setCohort] = useState('all')

  const sellers = data.sellers
  const pareto = useMemo(() => {
    let cumulative = 0
    return sellers.map(seller => {
      cumulative += Number(seller.gmv_share || 0)
      return {
        rank: Number(seller.rank),
        seller_id: seller.seller_id,
        gmv: Number(seller.gmv || 0),
        barGmv: Number(seller.rank) <= 25 ? Number(seller.gmv || 0) : null,
        cumulative: Math.min(1, cumulative),
      }
    })
  }, [sellers])

  const scatterByCohort = useMemo(() => {
    const map = new Map()
    sellers.filter(row => Number(row.gmv) > 0 && Number(row.buyers) > 0).forEach(row => {
      if (!map.has(row.seller_cohort)) map.set(row.seller_cohort, [])
      map.get(row.seller_cohort).push({ buyers: Number(row.buyers), gmv: Number(row.gmv), orders: Number(row.orders), seller_id: row.seller_id })
    })
    return [...map.entries()]
  }, [sellers])

  const radarData = useMemo(() => {
    const rows = data.seller_cohorts
    const keys = [
      ['average_gmv', 'GMV'], ['average_orders', 'Orders'],
      ['average_buyers', 'Buyer reach'], ['average_categories', 'Breadth'],
    ]
    const maximums = Object.fromEntries(keys.map(([key]) => [key, Math.max(1, ...rows.map(row => Number(row[key] || 0)))]))
    return keys.map(([key, label]) => ({
      metric: label,
      ...Object.fromEntries(rows.map(row => [row.seller_cohort, Number(row[key] || 0) / maximums[key] * 100])),
    }))
  }, [data.seller_cohorts])

  const cohortOptions = useMemo(() => [
    { value: 'all', label: 'All cohorts' },
    ...[...new Set(sellers.map(row => row.seller_cohort))].sort().map(value => ({ value, label: value.replace('Seller cohort ', 'Cohort ') })),
  ], [sellers])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return sellers.filter(row =>
      (cohort === 'all' || row.seller_cohort === cohort) &&
      (!needle || String(row.seller_id).toLowerCase().includes(needle)),
    ).slice(0, 60)
  }, [sellers, query, cohort])

  return (
    <>
      <KpiStrip items={[
        { label: 'Active sellers', value: number(data.kpis.active_sellers), note: 'At least one delivered item', icon: Store },
        { label: 'Top 5 sample share', value: pct(data.concentration.top5_share), note: 'Within delivered Olist GMV', icon: Target },
        { label: 'Top 10 sample share', value: pct(data.concentration.top10_share), note: 'Within delivered Olist GMV', icon: Building2 },
        { label: 'Seller HHI', value: number(data.concentration.hhi), note: 'Squared GMV shares × 10,000', icon: Gauge },
      ]} />

      <Panel
        eyebrow="CONCENTRATION CURVE"
        title="Seller Pareto profile"
        subtitle="Bars: GMV of the top 25 sellers · line: cumulative share of observed GMV across all active sellers"
      >
        <div className="chart chart--tall">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={pareto} margin={{ top: 12, right: 18, left: 6, bottom: 6 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="rank" type="number" domain={[1, sellers.length]} name="Seller rank" tick={axisTick} tickLine={false} axisLine={false} label={{ value: 'Seller rank (descending GMV)', position: 'insideBottom', offset: -6, fill: CHART.muted, fontSize: 10 }} />
              <YAxis yAxisId="left" tick={axisTick} tickLine={false} axisLine={false} width={62} tickFormatter={compactMoneyFormatter} />
              <YAxis yAxisId="right" orientation="right" domain={[0, 1]} tick={axisTick} tickLine={false} axisLine={false} width={48} tickFormatter={pctFormatter} />
              <Tooltip content={<AtlasTooltip formatters={{ barGmv: moneyFormatter, cumulative: pctFormatter, rank: numberFormatter }} title={payload => payload?.[0]?.payload ? `Rank ${payload[0].payload.rank}` : ''} />} />
              <Bar yAxisId="left" dataKey="barGmv" name="Seller GMV" fill={CHART.teal} fillOpacity={0.68} maxBarSize={9} isAnimationActive={false} />
              <Line yAxisId="right" type="monotone" dataKey="cumulative" name="Cumulative sample share" stroke={CHART.amber} strokeWidth={2.2} dot={false} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Panel>

      <div className="split-grid split-grid--equal">
        <Panel eyebrow="EXPLORATORY SEGMENTS" title="Seller cohort profiles" subtitle="K-Means groups indexed to the strongest cohort on each signal">
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke={CHART.grid} />
                <PolarAngleAxis dataKey="metric" tick={{ fill: CHART.muted, fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {data.seller_cohorts.map((row, index) => (
                  <Radar key={row.seller_cohort} name={row.seller_cohort.replace('Seller cohort ', 'Cohort ')} dataKey={row.seller_cohort} stroke={COHORT_COLORS[index % COHORT_COLORS.length]} fill={COHORT_COLORS[index % COHORT_COLORS.length]} fillOpacity={0.08} strokeWidth={1.8} />
                ))}
                <Legend wrapperStyle={{ fontSize: 10, color: CHART.muted }} />
                <Tooltip content={<AtlasTooltip formatters={Object.fromEntries(data.seller_cohorts.map(row => [row.seller_cohort, value => `${Number(value || 0).toFixed(0)} / 100`]))} />} />
              </RadarChart>
            </ResponsiveContainer>
          </div>
          <p className="micro-note">Cohorts are exploratory clusters from log-transformed, standardised operating signals — not verified business types.</p>
        </Panel>

        <Panel eyebrow="SCALE VS REACH" title="Seller GMV against buyer reach" subtitle="Bubble size reflects delivered order volume">
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 14, right: 18, bottom: 12, left: 6 }}>
                <CartesianGrid {...gridProps} />
                <XAxis type="number" dataKey="buyers" name="Distinct buyers" scale="log" domain={[1, 'dataMax']} tick={axisTick} tickLine={false} axisLine={false} label={{ value: 'Distinct buyers (log scale)', position: 'insideBottom', offset: -8, fill: CHART.muted, fontSize: 10 }} />
                <YAxis type="number" dataKey="gmv" name="Delivered GMV" scale="log" domain={[1, 'dataMax']} tick={axisTick} tickLine={false} axisLine={false} width={62} tickFormatter={compactMoneyFormatter} />
                <ZAxis type="number" dataKey="orders" range={[24, 300]} />
                <Tooltip content={<AtlasTooltip formatters={{ gmv: moneyFormatter, buyers: numberFormatter, orders: numberFormatter }} />} cursor={{ strokeDasharray: '3 5' }} />
                {scatterByCohort.map(([name, rows], index) => (
                  <Scatter key={name} name={name.replace('Seller cohort ', 'Cohort ')} data={rows} fill={COHORT_COLORS[index % COHORT_COLORS.length]} fillOpacity={0.35} stroke={COHORT_COLORS[index % COHORT_COLORS.length]} strokeOpacity={0.7} isAnimationActive={false} />
                ))}
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="LEADERBOARD"
        title="Seller benchmark"
        subtitle="Relative performance within the delivered Olist sample"
        action={<div className="panel-actions"><SearchInput value={query} onChange={setQuery} placeholder="Find seller ID…" label="Search seller ID" /><SegmentedControl label="Filter cohort" value={cohort} onChange={setCohort} options={cohortOptions} /><DownloadButton rows={filtered} filename="obsidian-seller-benchmark.csv" /></div>}
      >
        <DataTable
          compact
          rowKey={row => row.seller_id}
          columns={[
            { key: 'rank', label: 'RANK', render: value => <span className="mono rank">{String(value).padStart(2, '0')}</span> },
            { key: 'seller_id', label: 'SELLER ID', render: value => <span className="mono">{String(value).slice(0, 12)}…</span> },
            { key: 'gmv', label: 'GMV', right: true, render: value => <b>{money(value)}</b> },
            { key: 'gmv_share', label: 'SAMPLE SHARE', right: true, render: pct },
            { key: 'orders', label: 'ORDERS', right: true, render: number },
            { key: 'products', label: 'PRODUCTS', right: true, render: number },
            { key: 'buyers', label: 'BUYERS', right: true, render: number },
            { key: 'customer_states', label: 'STATES', right: true, render: number },
            { key: 'average_item_price', label: 'AVG ITEM PRICE', right: true, render: money },
            { key: 'seller_cohort', label: 'COHORT', render: value => <Badge tone="blue">{String(value).replace('Seller cohort ', 'C')}</Badge> },
          ]}
          rows={filtered}
          empty="No seller matches this search or cohort filter."
        />
      </Panel>

      <NoteBanner icon={CircleHelp}>
        Seller IDs are anonymised. Every share on this page is calculated within the observed delivered Olist sample; it is not a share of all Brazilian e-commerce.
      </NoteBanner>
    </>
  )
}
