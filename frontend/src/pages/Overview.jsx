import React, { useMemo } from 'react'
import { ResponsiveContainer, Tooltip, Treemap } from 'recharts'
import { BarChart3, Boxes, ShoppingBag, Store, Wallet } from 'lucide-react'
import AtlasMap from '../components/AtlasMap'
import { Badge, InsightList, KpiStrip, LollipopList, Meter, Panel, TextLink } from '../components/Primitives'
import { CHART, AtlasTooltip, compactMoneyFormatter, moneyFormatter } from '../lib/chart'
import { money, number, pct } from '../lib/format'

const CATEGORY_COLORS = [CHART.teal, CHART.blue, CHART.amber, '#5CC8B4', '#6FA8E8', '#D89A5C', '#C97A7A', '#7FA9A0', '#A9B7BC', '#5E8B8F']

function TreemapCell({ x = 0, y = 0, width = 0, height = 0, index = 0, depth = 0, payload, name, value }) {
  if (depth === 0) return null
  const color = CATEGORY_COLORS[index % CATEGORY_COLORS.length]
  const label = name || payload?.category || payload?.name || ''
  const amount = value ?? payload?.gmv ?? 0
  const showLabel = width > 78 && height > 34
  return (
    <g>
      <rect x={x} y={y} width={Math.max(0, width - 2)} height={Math.max(0, height - 2)} rx={5} fill={color} fillOpacity={0.82} stroke="#080D11" strokeWidth={2} />
      {showLabel && (
        <>
          <text x={x + 10} y={y + 19} fill="#EAF3F4" fontSize={11} fontWeight={700} fontFamily="Manrope, sans-serif">
            {String(label).length > 20 ? `${String(label).slice(0, 19)}…` : label}
          </text>
          <text x={x + 10} y={y + 35} fill="#EAF3F4" fillOpacity={0.78} fontSize={10} fontFamily="IBM Plex Mono, monospace">
            {money(amount, true)}
          </text>
        </>
      )}
    </g>
  )
}

export default function Overview({ data, navigate }) {
  const kpis = data.kpis
  const treeData = useMemo(() => {
    const top = data.categories.slice(0, 10)
    const rest = data.categories.slice(10).reduce((sum, row) => sum + Number(row.gmv || 0), 0)
    const rows = top.map(row => ({ category: row.category, gmv: Number(row.gmv || 0) }))
    if (rest > 0) rows.push({ category: 'Other categories', gmv: rest })
    return rows
  }, [data.categories])

  return (
    <>
      <KpiStrip items={[
        { label: 'Delivered GMV', value: money(kpis.delivered_gmv, true), note: 'Merchandise value · freight excluded', icon: Wallet },
        { label: 'Delivered orders', value: number(kpis.delivered_orders), note: 'Distinct fulfilled orders', icon: ShoppingBag },
        { label: 'Active sellers', value: number(kpis.active_sellers), note: 'Sellers with delivered items', icon: Store },
        { label: 'Active categories', value: number(kpis.active_categories), note: 'Represented in delivered sales', icon: Boxes },
      ]} />

      <div className="overview-layout">
        <AtlasMap geospatial={data.geospatial} compact title="Marketplace geography" subtitle="Buyer demand and seller supply · city-level aggregated points" />
        <div className="overview-rail">
          <Panel
            eyebrow="PRIORITISATION QUEUE"
            title="Market opportunity ranking"
            subtitle="Weighted relative score from observed signals"
            action={<Badge tone="teal">0–100</Badge>}
          >
            <LollipopList
              rows={data.opportunities.slice(0, 7)}
              valueKey="opportunity_score"
              labelKey="category"
              max={100}
              formatter={value => Number(value || 0).toFixed(1)}
            />
            <p className="micro-note">Score combines demand 35%, comparable growth 30%, seller fragmentation 20% and review gap 15%. It is a screening aid, not a forecast.</p>
          </Panel>

          <Panel eyebrow="COMPETITIVE SIGNAL" title="Concentration snapshot" subtitle="Seller shares within the delivered Olist sample">
            <div className="concentration-stack">
              <Meter label="Top 5 seller share" value={data.concentration.top5_share} display={pct(data.concentration.top5_share)} note="Of observed delivered item GMV" tone="teal" />
              <Meter label="Top 10 seller share" value={data.concentration.top10_share} display={pct(data.concentration.top10_share)} note="Of observed delivered item GMV" tone="blue" />
              <div className="concentration-hhi">
                <div><span>Seller HHI</span><b className="mono">{number(data.concentration.hhi)}</b></div>
                <p>Sum of squared seller GMV shares × 10,000. Describes concentration in this sample only.</p>
              </div>
            </div>
          </Panel>
        </div>
      </div>

      <div className="overview-lower">
        <Panel
          eyebrow="DEMAND STRUCTURE"
          title="Top categories by delivered GMV"
          subtitle="Area is proportional to merchandise value in the observed sample"
          action={<TextLink onClick={() => navigate('categories')}>Category intelligence</TextLink>}
        >
          <div className="treemap-wrap">
            <ResponsiveContainer width="100%" height="100%">
              <Treemap data={treeData} dataKey="gmv" nameKey="category" content={<TreemapCell />} stroke="#080D11" isAnimationActive={false}>
                <Tooltip content={<AtlasTooltip formatters={{ gmv: moneyFormatter }} title="Delivered GMV" />} />
              </Treemap>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel eyebrow="AUTOMATED READOUT" title="Key market intelligence observations" subtitle="Rule-based findings calculated from the prepared dataset">
          <InsightList insights={data.insights} />
        </Panel>
      </div>
      <div className="panel-note"><BarChart3 size={14} /> All figures describe delivered orders observed in the historical Olist sample (2016–2018), not the total Brazilian market.</div>
    </>
  )
}
