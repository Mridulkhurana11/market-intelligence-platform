import React, { useMemo, useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { CircleHelp, Globe2, MapPin, Route, Store } from 'lucide-react'
import AtlasMap from '../components/AtlasMap'
import { DataTable, DownloadButton, KpiStrip, Meter, NoteBanner, Panel, SearchInput } from '../components/Primitives'
import { AtlasTooltip, CHART, axisTick, gridProps, gridPropsHorizontal, numberFormatter, pctFormatter } from '../lib/chart'
import { km, money, number, pct, pctExact } from '../lib/format'

export default function Geospatial({ data }) {
  const [query, setQuery] = useState('')
  const geo = data.geospatial || {}
  const summary = geo.summary || {}

  const stateRows = useMemo(() => (geo.state_balance || [])
    .filter(row => row.state && row.state !== 'Unknown')
    .map(row => ({
      ...row,
      buyerPositive: Number(row.buyer_share || 0) * 100,
      sellerNegative: -Number(row.seller_presence_share || 0) * 100,
    }))
    .sort((a, b) => Number(b.buyers || 0) - Number(a.buyers || 0))
    .slice(0, 14), [geo.state_balance])

  const distanceRows = useMemo(() => (geo.distance_buckets || []).map(row => ({ ...row, label: String(row.distance_band_km).replace('–', '–') })), [geo.distance_buckets])
  const flows = useMemo(() => {
    const needle = query.trim().toUpperCase()
    return (geo.distance_pairs || []).filter(row =>
      !needle || String(row.seller_state).includes(needle) || String(row.customer_state).includes(needle))
  }, [geo.distance_pairs, query])

  return (
    <>
      <KpiStrip items={[
        { label: 'Buyer order coverage', value: pct(summary.mapped_customer_order_share), note: 'Delivered orders matched to postcode centroids', icon: MapPin },
        { label: 'Seller item coverage', value: pct(summary.mapped_seller_item_share), note: 'Delivered item rows with seller coordinates', icon: Store },
        { label: 'Mapped order-seller pairs', value: number(summary.mapped_order_seller_pairs), note: 'Used for straight-line distance proxies', icon: Route },
        { label: 'Postcode centroids', value: number(summary.mapped_zip_prefixes), note: 'Unique five-digit prefixes in the lookup', icon: Globe2 },
      ]} />

      <AtlasMap
        geospatial={geo}
        title="Brazilian marketplace geography"
        subtitle="Interactive buyer and seller layers · city-level aggregates from the Python pipeline"
        showCorridorToggle
      />

      <div className="split-grid split-grid--equal">
        <Panel eyebrow="REGIONAL BALANCE" title="Buyer share versus seller presence" subtitle="Mirrored bars compare state shares within the delivered sample; the label shows the gap in percentage points">
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stateRows} layout="vertical" margin={{ top: 4, right: 18, left: 2, bottom: 0 }} barGap={1}>
                <CartesianGrid {...gridPropsHorizontal} />
                <XAxis type="number" tick={axisTick} tickLine={false} axisLine={false} tickFormatter={value => `${Math.abs(Number(value)).toFixed(0)}%`} />
                <YAxis type="category" dataKey="state" width={38} tick={axisTick} tickLine={false} axisLine={false} />
                <Tooltip content={<AtlasTooltip formatters={{ buyerPositive: value => pct(Number(value) / 100), sellerNegative: value => pct(Math.abs(Number(value)) / 100), seller_presence_gap_pp: value => `${Number(value).toFixed(2)} pp` }} />} />
                <Bar dataKey="buyerPositive" name="Buyer share" fill={CHART.teal} fillOpacity={0.85} maxBarSize={9} radius={[0, 3, 3, 0]} isAnimationActive={false} />
                <Bar dataKey="sellerNegative" name="Seller presence share" fill={CHART.amber} fillOpacity={0.85} maxBarSize={9} radius={[3, 0, 0, 3]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-footnote"><span><i className="legend-dot" style={{ background: CHART.teal }} />Buyer share</span><span><i className="legend-dot" style={{ background: CHART.amber }} />Seller presence share</span></div>
          <p className="micro-note">A positive gap means the state accounts for more identified buyers than active sellers in this sample. This is a descriptive footprint comparison, not proven unmet demand.</p>
        </Panel>

        <Panel eyebrow="DISTANCE PROFILE" title="Seller-to-buyer distance bands" subtitle="Straight-line Haversine distance between mapped postcode centroids">
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={distanceRows} margin={{ top: 14, right: 14, bottom: 10, left: 2 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="distance_band_km" name="Distance band (km)" tick={axisTick} tickLine={false} axisLine={false} dy={8} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={numberFormatter} />
                <Tooltip content={<AtlasTooltip formatters={{ order_seller_pairs: numberFormatter }} />} />
                <Bar dataKey="order_seller_pairs" name="Order-seller pairs" radius={[4, 4, 0, 0]} maxBarSize={42} isAnimationActive={false}>
                  {distanceRows.map(row => <Cell key={row.distance_band_km} fill={CHART.blue} fillOpacity={0.72} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="distance-stats">
            <div><span>Median</span><b className="mono">{km(summary.median_pair_distance_km)}</b></div>
            <div><span>Mean</span><b className="mono">{km(summary.average_pair_distance_km)}</b></div>
            <div><span>90th pct</span><b className="mono">{km(summary.p90_pair_distance_km)}</b></div>
          </div>
        </Panel>
      </div>

      <Panel eyebrow="COVERAGE AUDIT" title="Geospatial matching coverage" subtitle="How source coordinates were resolved into the mapped analytical layer">
        <div className="coverage-grid">
          <Meter label="Delivered orders with buyer centroid" value={summary.mapped_customer_order_share || 0} display={pctExact(summary.mapped_customer_order_share)} tone="teal" />
          <Meter label="Delivered items with seller centroid" value={summary.mapped_seller_item_share || 0} display={pctExact(summary.mapped_seller_item_share)} tone="amber" />
          <div className="coverage-stat"><span>Source geolocation rows</span><b className="mono">{number(summary.geo_source_rows)}</b></div>
          <div className="coverage-stat"><span>Exact duplicate rows removed</span><b className="mono">{number(summary.geo_exact_duplicates_removed)}</b></div>
          <div className="coverage-stat"><span>Buyer city points available</span><b className="mono">{number(summary.buyer_city_points)}</b></div>
          <div className="coverage-stat"><span>Seller city points available</span><b className="mono">{number(summary.seller_city_points)}</b></div>
        </div>
      </Panel>

      <Panel
        eyebrow="STATE CORRIDORS"
        title="Largest mapped seller-to-buyer flows"
        subtitle="Ranked by delivered item GMV between seller state and customer state"
        action={<div className="panel-actions"><SearchInput value={query} onChange={setQuery} placeholder="Filter state…" label="Filter state flows" /><DownloadButton rows={flows} filename="obsidian-state-corridors.csv" /></div>}
      >
        <DataTable
          rowKey={row => `${row.seller_state}-${row.customer_state}`}
          columns={[
            { key: 'seller_state', label: 'SELLER STATE', render: value => <b>{value}</b> },
            { key: 'customer_state', label: 'BUYER STATE', render: value => <b>{value}</b> },
            { key: 'order_seller_pairs', label: 'ORDER-SELLER PAIRS', right: true, render: number },
            { key: 'median_distance_km', label: 'MEDIAN DISTANCE', right: true, render: km },
            { key: 'item_gmv', label: 'ITEM GMV', right: true, render: value => <b>{money(value)}</b> },
          ]}
          rows={flows}
          empty="No state corridor matches this filter."
        />
      </Panel>

      <NoteBanner icon={CircleHelp}>
        Coordinates are approximate postcode-centroid locations, not addresses or tracked shipments. Corridor arcs are schematic links between state-level centroids. Haversine distances are straight-line estimates and must not be read as driving routes, courier paths, delivery times or live shipment tracking.
      </NoteBanner>
    </>
  )
}
