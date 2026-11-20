import React from 'react'
import { AlertTriangle, ArrowUpRight, ChevronRight, Database, Download, RefreshCw, Sparkles } from 'lucide-react'
import { csvDownload } from '../lib/format'

export function Panel({ eyebrow, title, subtitle, action, children, className = '', bodyClass = '' }) {
  return (
    <section className={`panel ${className}`}>
      {(title || action || eyebrow) && (
        <header className="panel__head">
          <div className="panel__title-wrap">
            {eyebrow && <span className="panel__eyebrow">{eyebrow}</span>}
            {title && <h2>{title}</h2>}
            {subtitle && <p>{subtitle}</p>}
          </div>
          {action && <div className="panel__action">{action}</div>}
        </header>
      )}
      <div className={`panel__body ${bodyClass}`}>{children}</div>
    </section>
  )
}

export function Badge({ children, tone = 'neutral' }) {
  return <span className={`badge badge--${tone}`}>{children}</span>
}

export function KpiStrip({ items }) {
  return (
    <div className="kpi-strip">
      {items.filter(Boolean).map(item => {
        const Icon = item.icon
        return (
          <div className="kpi-cell" key={item.label}>
            <div className="kpi-cell__top">
              <span>{item.label}</span>
              {Icon && <Icon size={15} strokeWidth={1.7} aria-hidden="true" />}
            </div>
            <div className="kpi-cell__value">{item.value}</div>
            <div className="kpi-cell__note">{item.note}</div>
          </div>
        )
      })}
    </div>
  )
}

export function SectionHeading({ eyebrow, title, description, meta }) {
  return (
    <div className="section-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {meta && <div className="section-heading__meta">{meta}</div>}
    </div>
  )
}

export function NoteBanner({ icon: Icon = Sparkles, children, tone = 'info' }) {
  return <div className={`note-banner note-banner--${tone}`}><Icon size={16} strokeWidth={1.8} /><span>{children}</span></div>
}

export function DataTable({ columns, rows, rowKey, empty = 'No records available.', compact = false }) {
  return (
    <div className="table-wrap">
      <table className={`data-table ${compact ? 'data-table--compact' : ''}`}>
        <thead><tr>{columns.map(column => <th key={column.key} className={column.right ? 'right' : ''}>{column.label}</th>)}</tr></thead>
        <tbody>
          {rows?.length
            ? rows.map((row, index) => (
              <tr key={rowKey ? rowKey(row) : index}>
                {columns.map(column => (
                  <td key={column.key} className={column.right ? 'right' : ''}>
                    {column.render ? column.render(row[column.key], row, index) : row[column.key]}
                  </td>
                ))}
              </tr>
            ))
            : <tr><td colSpan={columns.length} className="empty-cell">{empty}</td></tr>}
        </tbody>
      </table>
    </div>
  )
}

export function DownloadButton({ rows, filename, label = 'Export CSV' }) {
  return (
    <button type="button" className="action-button action-button--ghost" onClick={() => csvDownload(rows, filename)}>
      <Download size={14} />{label}
    </button>
  )
}

export function TextLink({ onClick, children }) {
  return <button type="button" className="text-link" onClick={onClick}>{children}<ChevronRight size={14} /></button>
}

export function Meter({ label, value, display, tone = 'teal', note }) {
  return (
    <div className="meter">
      <div className="meter__head"><span>{label}</span><b>{display ?? `${Math.round(Number(value || 0) * 100)}%`}</b></div>
      <div className="meter__track"><span className={`meter__fill meter__fill--${tone}`} style={{ width: `${Math.max(0, Math.min(100, Number(value || 0) * 100))}%` }} /></div>
      {note && <div className="meter__note">{note}</div>}
    </div>
  )
}

export function LollipopList({ rows, valueKey, labelKey, formatter = value => Number(value || 0).toFixed(0), max, tone = 'teal', limit }) {
  const list = limit ? rows.slice(0, limit) : rows
  const ceiling = max || Math.max(...list.map(row => Number(row[valueKey] || 0)), 1)
  return (
    <div className="lollipop-list">
      {list.map((row, index) => (
        <div className="lollipop" key={`${row[labelKey]}-${index}`}>
          <div className="lollipop__label"><span className="lollipop__rank">{String(index + 1).padStart(2, '0')}</span><span title={String(row[labelKey])}>{row[labelKey]}</span></div>
          <div className="lollipop__track">
            <span className={`lollipop__stem lollipop__stem--${tone}`} style={{ width: `${Math.max(1, Math.min(100, Number(row[valueKey] || 0) / ceiling * 100))}%` }} />
            <span className={`lollipop__dot lollipop__dot--${tone}`} style={{ left: `${Math.max(1, Math.min(100, Number(row[valueKey] || 0) / ceiling * 100))}%` }} />
          </div>
          <b className="lollipop__value mono">{formatter(row[valueKey], row)}</b>
        </div>
      ))}
    </div>
  )
}

export function InsightList({ insights = [] }) {
  if (!insights.length) return <div className="empty-inline">No generated observations are available for this dataset.</div>
  return (
    <div className="insight-grid">
      {insights.map((item, index) => (
        <article className="insight" key={`${item.title}-${index}`}>
          <div className="insight__index mono">{String(index + 1).padStart(2, '0')}</div>
          <div><h3>{item.title}</h3><p>{item.body}</p></div>
          <ArrowUpRight size={15} className="insight__arrow" />
        </article>
      ))}
    </div>
  )
}

export function LoadingState() {
  return (
    <div className="state-view" role="status" aria-live="polite">
      <div className="state-view__mark state-view__mark--spin"><RefreshCw size={22} /></div>
      <div className="eyebrow">LOADING INTELLIGENCE LAYER</div>
      <h2>Preparing the atlas</h2>
      <p>Reading the generated market intelligence dataset…</p>
      <div className="skeleton-grid"><span /><span /><span /><span /></div>
    </div>
  )
}

export function EmptyState({ message }) {
  return (
    <div className="state-view">
      <div className="state-view__mark"><Database size={22} /></div>
      <div className="eyebrow">NO ANALYSIS DATA</div>
      <h2>Generate the market intelligence dataset</h2>
      <p>{message || 'The dashboard only displays metrics produced by the reproducible Python pipeline. No sample or invented values are used.'}</p>
      <div className="state-steps">
        <div><span className="mono">01</span><b>Place the nine Olist CSVs</b><code>data/olist/</code></div>
        <div><span className="mono">02</span><b>Run the analysis pipeline</b><code>python run_analysis.py</code></div>
        <div><span className="mono">03</span><b>Start the Vite dashboard</b><code>cd frontend && npm run dev</code></div>
      </div>
    </div>
  )
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="state-view">
      <div className="state-view__mark state-view__mark--error"><AlertTriangle size={22} /></div>
      <div className="eyebrow">DATA LOAD FAILED</div>
      <h2>The intelligence layer could not be loaded</h2>
      <p>{message}</p>
      <button type="button" className="action-button" onClick={onRetry}><RefreshCw size={14} />Retry load</button>
    </div>
  )
}

export function SearchInput({ value, onChange, placeholder = 'Search', label = 'Search records' }) {
  return (
    <label className="search-input">
      <span className="sr-only">{label}</span>
      <input type="search" value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  )
}

export function SegmentedControl({ options, value, onChange, label }) {
  return (
    <div className="segmented" role="group" aria-label={label}>
      {options.map(option => (
        <button type="button" key={option.value} className={value === option.value ? 'is-active' : ''} onClick={() => onChange(option.value)}>{option.label}</button>
      ))}
    </div>
  )
}
