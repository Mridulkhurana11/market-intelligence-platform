import React from 'react'
import { BrainCircuit, CircleHelp, Database, GitBranch, Layers3, ShieldCheck } from 'lucide-react'
import { DataTable, KpiStrip, Meter, NoteBanner, Panel } from '../components/Primitives'
import { number } from '../lib/format'

const SOURCE_LABELS = {
  orders: 'Orders', items: 'Order items', customers: 'Customers', products: 'Products',
  sellers: 'Sellers', reviews: 'Reviews', payments: 'Payments',
  translation: 'Category translation', geolocation: 'Geolocation',
}

export default function Quality({ data }) {
  const quality = data.data_quality || {}
  const geo = data.geospatial?.summary || {}
  const inventory = Object.entries(quality.source_rows || {})
    .map(([key, rows]) => ({ source: SOURCE_LABELS[key] || key, rows: Number(rows || 0) }))
    .sort((a, b) => b.rows - a.rows)
  const maxRows = Math.max(1, ...inventory.map(row => row.rows))
  const missingRows = Object.entries(quality.missing_by_source || {}).map(([key, columns]) => ({
    source: SOURCE_LABELS[key] || key,
    affected_columns: Object.keys(columns).length,
    missing_values: Object.values(columns).reduce((sum, value) => sum + Number(value || 0), 0),
  })).sort((a, b) => b.missing_values - a.missing_values)

  const checks = [
    ['Duplicate item rows removed', quality.duplicate_item_rows_removed],
    ['Invalid / non-positive price rows removed', quality.invalid_price_rows_removed],
    ['Delivered orders without an item record', quality.delivered_orders_without_items],
    ['Delivered items without a linked review', quality.missing_review_order_lines],
    ['Unmatched product dimension rows', quality.unmatched_products],
    ['Unmatched seller dimension rows', quality.unmatched_sellers],
    ['Unmatched customer dimension rows', quality.unmatched_customers],
    ['Exact geolocation duplicates removed', geo.geo_exact_duplicates_removed],
    ['Mapped postcode prefixes', geo.mapped_zip_prefixes],
  ]

  const definitions = [
    ['Delivered item GMV', 'Sum of item price for line items in orders with delivered status. Freight is excluded and reported separately.'],
    ['Orders / active sellers', 'Distinct delivered order IDs and distinct seller IDs with at least one delivered item.'],
    ['Seller / category share', 'Share of delivered item GMV inside this Olist dataset only — not national Brazilian market share.'],
    ['Seller HHI', 'Sum of squared seller GMV shares × 10,000, describing concentration in the observed sample.'],
    ['Comparable YTD change', 'Current calendar year from January 1 to the latest observed purchase date versus the same window one year earlier.'],
    ['Opportunity score', 'Weighted percentile index: demand 35%, comparable growth 30%, inverse HHI 20%, review gap 15%. Not TAM or a forecast.'],
    ['Seller cohorts', 'Exploratory K-Means groups from log-transformed, standardised operating signals; not ground-truth labels.'],
    ['Review attribution', 'Order-level reviews only; never attributed to a specific seller in multi-seller orders.'],
  ]

  const limitations = [
    'Single marketplace operator, anonymised sellers and a historical 2016–2018 window. No current-market or national-share inference is supported.',
    'Postcode centroids are medians of multiple source coordinates and do not identify exact customer or seller addresses.',
    'Haversine distances are straight-line proxies; the dataset has no road network, courier path, shipment tracking or actual delivery route.',
    'The dataset lacks full costs, advertising, inventory and external market denominators. Profitability, TAM/SAM/SOM and causal claims are out of scope.',
    'Opportunity weights are fixed and published; alternative weightings should be tested before any real decision.',
    'Seller clusters are exploratory and depend on feature choice, scaling and the fixed random seed documented in the methodology.',
  ]

  return (
    <>
      <KpiStrip items={[
        { label: 'Source tables', value: number(Object.keys(quality.source_rows || {}).length), note: 'Required Olist CSVs loaded', icon: Database },
        { label: 'Delivered item rows', value: number(quality.delivered_item_rows), note: 'Prepared item-level analytical fact', icon: Layers3 },
        { label: 'Delivered orders', value: number(quality.delivered_orders), note: 'Order status = delivered', icon: GitBranch },
        { label: 'Latest source date', value: data.metadata.period_end, note: 'Last delivered purchase date', icon: ShieldCheck },
      ]} />

      <div className="split-grid split-grid--equal">
        <Panel eyebrow="SOURCE AUDIT" title="Dataset inventory" subtitle="Raw row counts read from the nine required Olist tables">
          <DataTable
            compact
            rowKey={row => row.source}
            columns={[
              { key: 'source', label: 'SOURCE TABLE' },
              { key: 'rows', label: 'ROWS', right: true, render: value => <b className="mono">{number(value)}</b> },
              { key: 'bar', label: 'RELATIVE VOLUME', render: (_, row) => <div className="inventory-bar"><span style={{ width: `${Math.max(1, row.rows / maxRows * 100)}%` }} /></div> },
            ]}
            rows={inventory}
          />
        </Panel>

        <Panel eyebrow="PREPARATION" title="Cleaning and join validation" subtitle="Explicit exclusions and diagnostic counts from the pipeline">
          <div className="audit-list">
            {checks.map(([label, value]) => (
              <div className="audit-row" key={label}><span>{label}</span><b className="mono">{number(value)}</b></div>
            ))}
          </div>
        </Panel>
      </div>

      <Panel eyebrow="NULL HANDLING" title="Missing values by source" subtitle="Missing values retained or handled by source table">
        <DataTable
          rowKey={row => row.source}
          columns={[
            { key: 'source', label: 'SOURCE TABLE' },
            { key: 'affected_columns', label: 'AFFECTED COLUMNS', right: true, render: number },
            { key: 'missing_values', label: 'MISSING VALUES', right: true, render: value => <b className="mono">{number(value)}</b> },
          ]}
          rows={missingRows}
        />
      </Panel>

      <Panel eyebrow="GEOSPATIAL AUDIT" title="Geographic matching coverage" subtitle="Postcode lookup resolution and mapped analytical coverage">
        <div className="coverage-grid">
          <Meter label="Orders with buyer centroid" value={geo.mapped_customer_order_share || 0} display={`${((geo.mapped_customer_order_share || 0) * 100).toFixed(2)}%`} tone="teal" />
          <Meter label="Items with seller centroid" value={geo.mapped_seller_item_share || 0} display={`${((geo.mapped_seller_item_share || 0) * 100).toFixed(2)}%`} tone="amber" />
          <div className="coverage-stat"><span>Geolocation source rows</span><b className="mono">{number(geo.geo_source_rows)}</b></div>
          <div className="coverage-stat"><span>Exact duplicates removed</span><b className="mono">{number(geo.geo_exact_duplicates_removed)}</b></div>
          <div className="coverage-stat"><span>Unique postcode centroids</span><b className="mono">{number(geo.mapped_zip_prefixes)}</b></div>
          <div className="coverage-stat"><span>Mapped order-seller pairs</span><b className="mono">{number(geo.mapped_order_seller_pairs)}</b></div>
        </div>
      </Panel>

      <div className="split-grid split-grid--equal">
        <Panel eyebrow="MEASUREMENT CONTRACT" title="KPI definitions" subtitle="What each headline figure does and does not mean">
          <div className="definition-list">
            {definitions.map(([term, definition]) => (
              <div className="definition" key={term}><b>{term}</b><p>{definition}</p></div>
            ))}
          </div>
        </Panel>

        <Panel eyebrow="MACHINE LEARNING" title="Seller cohort methodology" subtitle="Reproducible exploratory clustering, not a predictive model">
          <div className="method-steps">
            <div><span className="mono">01</span><div><b>Aggregate to seller grain</b><p>GMV, orders, products, category breadth, average item price, unique buyers and state coverage.</p></div></div>
            <div><span className="mono">02</span><div><b>Transform and scale</b><p>log1p transformation followed by StandardScaler so large sellers do not dominate distance calculations.</p></div></div>
            <div><span className="mono">03</span><div><b>Fit K-Means</b><p>Up to four clusters, random_state=42, n_init=20, using scikit-learn inside the Python pipeline.</p></div></div>
            <div><span className="mono">04</span><div><b>Order for display</b><p>Clusters are labelled by mean GMV. Labels are ordinal presentation names, not verified seller archetypes.</p></div></div>
          </div>
          <div className="method-callout"><BrainCircuit size={16} /><span>No target variable is trained or predicted. Clusters are a descriptive exploration of the observed seller base.</span></div>
        </Panel>
      </div>

      <Panel eyebrow="SCOPE GUARDRAIL" title="Known limitations" subtitle="Read these alongside every dashboard figure">
        <div className="limitation-grid">
          {limitations.map((item, index) => (
            <div className="limitation" key={item}><span className="mono">{String(index + 1).padStart(2, '0')}</span><p>{item}</p></div>
          ))}
        </div>
      </Panel>

      <NoteBanner icon={CircleHelp}>
        Source: Olist, Brazilian E-Commerce Public Dataset by Olist (Kaggle), CC BY-NC-SA 4.0. All measures are reproducible from src/pipeline.py and the source CSVs.
      </NoteBanner>
    </>
  )
}
