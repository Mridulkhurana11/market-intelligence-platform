import React from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, PolarAngleAxis, RadialBar, RadialBarChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { CheckCircle2, CircleHelp, Gauge, Star, Users } from 'lucide-react'
import {
  AtlasTooltip, CHART, axisTick, gridProps, numberFormatter, pctFormatter,
} from '../lib/chart'
import { money, number, pct } from '../lib/format'
import { DataTable, DownloadButton, KpiStrip, NoteBanner, Panel } from '../components/Primitives'

const PAYMENT_COLORS = { credit_card: CHART.teal, boleto: CHART.amber, voucher: CHART.blue, debit_card: CHART.coral }

export default function Experience({ data }) {
  const ratings = data.review_distribution || []
  const reviewedOrders = ratings.reduce((sum, row) => sum + Number(row.orders || 0), 0)
  const payments = data.payment_methods || []
  const paymentTotal = payments.reduce((sum, row) => sum + Number(row.payment_value || 0), 0) || 1
  const deliveryDistribution = data.delivery_distribution || []
  const deliveryReview = data.delivery_review || []
  const repeatData = [{ name: 'Repeat buyers', value: Number(data.kpis.repeat_buyer_rate || 0) * 100, fill: CHART.teal }]

  return (
    <>
      <KpiStrip items={[
        { label: 'Average review', value: Number(data.kpis.average_review || 0).toFixed(2), note: 'Out of 5 · order-level average', icon: Star },
        { label: 'Average delivery', value: `${Number(data.kpis.average_delivery_days || 0).toFixed(1)} days`, note: 'Purchase to delivered timestamp', icon: Gauge },
        { label: 'On-time delivery', value: pct(data.kpis.on_time_delivery_rate), note: 'By estimated delivery date', icon: CheckCircle2 },
        { label: 'Repeat buyer rate', value: pct(data.kpis.repeat_buyer_rate), note: `Of ${number(data.kpis.identified_buyers)} identified buyers`, icon: Users },
      ]} />

      <div className="split-grid split-grid--equal">
        <Panel eyebrow="SATISFACTION DISTRIBUTION" title="Review score histogram" subtitle="One mean review score per delivered order">
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ratings} margin={{ top: 14, right: 14, bottom: 6, left: 2 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="review_score" name="Review score" tick={axisTick} tickLine={false} axisLine={false} dy={8} tickFormatter={value => `${value}★`} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={numberFormatter} />
                <Tooltip content={<AtlasTooltip formatters={{ orders: numberFormatter }} />} />
                <Bar dataKey="orders" name="Reviewed orders" maxBarSize={54} radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {ratings.map(row => <Cell key={row.review_score} fill={Number(row.review_score) >= 4 ? CHART.teal : Number(row.review_score) === 3 ? CHART.amber : CHART.coral} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-footnote"><span>{number(reviewedOrders)} reviewed delivered orders</span><span>Ratings are not attributed to individual sellers</span></div>
        </Panel>

        <Panel eyebrow="FULFILMENT PROFILE" title="Delivery time distribution" subtitle="Delivered orders grouped by purchase-to-delivery duration">
          <div className="chart chart--medium">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={deliveryDistribution} margin={{ top: 14, right: 14, bottom: 6, left: 2 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="delivery_band_days" name="Delivery days" tick={axisTick} tickLine={false} axisLine={false} dy={8} />
                <YAxis tick={axisTick} tickLine={false} axisLine={false} width={52} tickFormatter={numberFormatter} />
                <Tooltip content={<AtlasTooltip formatters={{ delivered_orders: numberFormatter }} />} />
                <Bar dataKey="delivered_orders" name="Delivered orders" fill={CHART.blue} fillOpacity={0.72} maxBarSize={38} radius={[4, 4, 0, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="chart-footnote"><span>Days shown as ranges (e.g. 0–3)</span><span>Observed delivered orders only</span></div>
        </Panel>
      </div>

      <Panel eyebrow="EXPERIENCE RELATIONSHIP" title="Delivery time against review score" subtitle="Average order review by delivery-duration band; bar height is the number of reviewed orders">
        <div className="chart chart--medium">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={deliveryReview} margin={{ top: 12, right: 18, bottom: 20, left: 6 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="delivery_band_days" tick={axisTick} tickLine={false} axisLine={false} dy={8} label={{ value: 'Delivery days', position: 'insideBottom', offset: -12, fill: CHART.muted, fontSize: 10 }} />
              <YAxis yAxisId="orders" tick={axisTick} tickLine={false} axisLine={false} width={54} tickFormatter={numberFormatter} />
              <YAxis yAxisId="score" orientation="right" domain={[1, 5]} tick={axisTick} tickLine={false} axisLine={false} width={42} />
              <Bar yAxisId="orders" dataKey="reviewed_orders" name="Reviewed orders" fill={CHART.surface2} stroke={CHART.grid} maxBarSize={44} isAnimationActive={false} />
              <Tooltip content={<AtlasTooltip formatters={{ avg_review: value => value == null ? '—' : Number(value).toFixed(2), reviewed_orders: numberFormatter }} />} />
              <Bar yAxisId="score" dataKey="avg_review" name="Average review" fill={CHART.amber} fillOpacity={0.85} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="micro-note">This is an observed association within the sample, not evidence that delivery duration causes a particular review score.</p>
      </Panel>

      <div className="split-grid split-grid--wide-right">
        <Panel eyebrow="PAYMENT MIX" title="Payment composition" subtitle="Payment value associated with delivered orders">
          <div className="payment-list">
            {payments.map(row => (
              <div className="payment-row" key={row.payment_type}>
                <div className="payment-row__head"><span>{row.payment_type.replace('_', ' ')}</span><b className="mono">{pct(row.share)}</b></div>
                <div className="payment-row__track"><span style={{ width: `${Number(row.share || 0) * 100}%`, background: PAYMENT_COLORS[row.payment_type] || CHART.muted }} /></div>
                <div className="payment-row__foot"><span>{number(row.payment_records)} payment records</span><span>{money(row.payment_value)}</span></div>
              </div>
            ))}
          </div>
          <p className="micro-note">Share of tracked payment value for delivered orders · total {money(paymentTotal)}.</p>
        </Panel>

        <Panel eyebrow="REPEAT PURCHASE" title="Buyer retention signal" subtitle="Identified customers with two or more distinct delivered orders">
          <div className="retention-layout">
            <div className="retention-gauge">
              <ResponsiveContainer width="100%" height="100%">
                <RadialBarChart innerRadius="72%" outerRadius="100%" data={repeatData} startAngle={90} endAngle={-270}>
                  <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                  <RadialBar dataKey="value" background={{ fill: CHART.surface2 }} cornerRadius={8} isAnimationActive={false} />
                  <Tooltip content={<AtlasTooltip formatters={{ value: pctFormatter }} />} />
                </RadialBarChart>
              </ResponsiveContainer>
              <div className="retention-gauge__center"><b>{pct(data.kpis.repeat_buyer_rate)}</b><span>Repeat buyers</span></div>
            </div>
            <div className="retention-stats">
              <div><span>Identified buyers</span><b className="mono">{number(data.kpis.identified_buyers)}</b></div>
              <div><span>Delivered orders</span><b className="mono">{number(data.kpis.delivered_orders)}</b></div>
              <div><span>Order-to-buyer ratio</span><b className="mono">{(Number(data.kpis.delivered_orders) / Math.max(1, Number(data.kpis.identified_buyers))).toFixed(2)}</b></div>
              <p>A single buyer can hold more than one customer ID; repeat rates use the anonymised unique-buyer identifier.</p>
            </div>
          </div>
        </Panel>
      </div>

      <Panel
        eyebrow="CUSTOMER FOOTPRINT"
        title="Demand by customer state"
        subtitle="Top states by delivered merchandise GMV inside the Olist sample"
        action={<DownloadButton rows={data.states} filename="obsidian-customer-states.csv" />}
      >
        <DataTable
          compact
          rowKey={row => row.customer_state}
          columns={[
            { key: 'customer_state', label: 'STATE', render: value => <b>{value}</b> },
            { key: 'gmv', label: 'GMV', right: true, render: value => money(value) },
            { key: 'orders', label: 'ORDERS', right: true, render: number },
            { key: 'buyers', label: 'IDENTIFIED BUYERS', right: true, render: number },
          ]}
          rows={data.states}
        />
      </Panel>

      <NoteBanner icon={CircleHelp}>
        Review scores are attached to orders, not sellers. Multi-seller orders make seller-level rating attribution ambiguous, so this page deliberately stays at order grain.
      </NoteBanner>
    </>
  )
}
