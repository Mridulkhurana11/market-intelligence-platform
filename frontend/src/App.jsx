import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Activity, Boxes, ChevronRight, Compass, Database, Download, Layers3,
  MapPinned, PackageSearch, ShieldCheck, Store, TrendingUp, Users,
} from 'lucide-react'
import { DownloadButton, EmptyState, ErrorState, LoadingState } from './components/Primitives'
import { csvDownload } from './lib/format'
import Overview from './pages/Overview'
import Trends from './pages/Trends'
import Categories from './pages/Categories'
import Sellers from './pages/Sellers'
import Geospatial from './pages/Geospatial'
import Experience from './pages/Experience'
import Quality from './pages/Quality'

const NAV = [
  { id: 'overview', label: 'Market overview', icon: Compass },
  { id: 'trends', label: 'Market trends', icon: TrendingUp },
  { id: 'categories', label: 'Category intelligence', icon: PackageSearch },
  { id: 'sellers', label: 'Seller benchmarking', icon: Store },
  { id: 'geospatial', label: 'Geospatial intelligence', icon: MapPinned },
  { id: 'experience', label: 'Buyer experience', icon: Users },
  { id: 'quality', label: 'Data & methodology', icon: ShieldCheck },
]

const PAGE_COPY = {
  overview: {
    eyebrow: 'EXECUTIVE MARKET READOUT',
    description: 'Map-first view of demand, seller presence, category structure and competitive concentration across the observed Olist sample.',
  },
  trends: {
    eyebrow: 'TEMPORAL ANALYSIS',
    description: 'Compare monthly demand, category composition, comparable year-to-date movement and calendar intensity.',
  },
  categories: {
    eyebrow: 'CATEGORY STRUCTURE',
    description: 'Read category demand against seller competition, concentration and relative opportunity signals.',
  },
  sellers: {
    eyebrow: 'COMPETITIVE BENCHMARKING',
    description: 'Benchmark sellers by delivered GMV, buyer reach, assortment and exploratory cohort membership.',
  },
  geospatial: {
    eyebrow: 'GEOGRAPHIC INTELLIGENCE',
    description: 'Explore mapped buyer and seller footprints, state-level balance and straight-line distance proxies.',
  },
  experience: {
    eyebrow: 'BUYER OUTCOMES',
    description: 'Inspect review patterns, delivery outcomes, payment composition and repeat purchasing indicators.',
  },
  quality: {
    eyebrow: 'ANALYTICAL AUDIT',
    description: 'Inspect source inventory, cleaning decisions, KPI definitions, machine-learning method and limitations.',
  },
}

const routeFromHash = () => {
  const candidate = window.location.hash.replace(/^#\/?/, '').split('/')[0]
  return NAV.some(item => item.id === candidate) ? candidate : 'overview'
}

function exportRowsFor(page, data) {
  if (!data) return []
  switch (page) {
    case 'sellers': return data.sellers
    case 'categories': return data.categories
    case 'geospatial': return data.geospatial?.distance_pairs
    case 'trends': return data.monthly_category
    case 'experience': return data.payment_methods
    case 'quality': return data.states
    default: return data.monthly
  }
}

export default function App() {
  const [page, setPage] = useState(routeFromHash)
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const sync = () => setPage(routeFromHash())
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    fetch('/data/market_intelligence.json', { signal: controller.signal })
      .then(response => {
        if (!response.ok) throw new Error(`Dashboard data returned HTTP ${response.status}`)
        return response.json()
      })
      .then(json => {
        if (json.status !== 'ready') throw new Error(json.message || 'Analysis data has not been generated yet.')
        setData(json)
      })
      .catch(err => { if (err.name !== 'AbortError') setError(err.message) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [attempt])

  const navigate = useCallback(id => {
    setPage(id)
    if (window.location.hash !== `#/${id}`) window.location.hash = `/${id}`
  }, [])

  const current = NAV.find(item => item.id === page) || NAV[0]
  const copy = PAGE_COPY[page] || PAGE_COPY.overview
  const exportRows = useMemo(() => exportRowsFor(page, data), [page, data])

  const renderPage = () => {
    if (loading && !data) return <LoadingState />
    if (error && !data) return <ErrorState message={error} onRetry={() => setAttempt(value => value + 1)} />
    if (!data) return <EmptyState />
    switch (page) {
      case 'trends': return <Trends data={data} />
      case 'categories': return <Categories data={data} />
      case 'sellers': return <Sellers data={data} />
      case 'geospatial': return <Geospatial data={data} />
      case 'experience': return <Experience data={data} />
      case 'quality': return <Quality data={data} />
      default: return <Overview data={data} navigate={navigate} />
    }
  }

  return (
    <div className="app-shell">
      <aside className="nav-rail" aria-label="Primary navigation">
        <div className="brand-mark" title="Obsidian Atlas" aria-label="Obsidian Atlas">
          <span className="brand-mark__glyph"><span /></span>
        </div>
        <div className="rail-divider" />
        <nav className="rail-nav">
          {NAV.map((item, index) => {
            const Icon = item.icon
            return (
              <button
                key={item.id}
                type="button"
                className={`rail-item ${page === item.id ? 'is-active' : ''}`}
                onClick={() => navigate(item.id)}
                aria-label={item.label}
                aria-current={page === item.id ? 'page' : undefined}
                data-tooltip={item.label}
              >
                <Icon size={19} strokeWidth={1.75} />
                <span className="rail-item__index mono">{String(index + 1).padStart(2, '0')}</span>
              </button>
            )
          })}
        </nav>
        <div className="rail-bottom">
          <div className="rail-source" data-tooltip="Olist Brazilian Marketplace · public research dataset" title="Olist Brazilian Marketplace">
            <Database size={17} strokeWidth={1.7} />
          </div>
          <div className="rail-version mono">OA / 01</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="top-header">
          <div className="top-header__identity">
            <div className="breadcrumb"><span>OBSIDIAN ATLAS</span><ChevronRight size={12} /><b>{current.label}</b></div>
            <div className="page-title"><h1>{current.label}</h1><span className="page-title__mark" /></div>
          </div>
          <div className="top-header__meta">
            <span className="dataset-badge"><Database size={13} /> Olist Brazilian Marketplace</span>
            <span className="period-badge mono">2016 — 2018</span>
            <span className="header-divider" />
            <button
              type="button"
              className="action-button"
              onClick={() => csvDownload(exportRows, `obsidian-atlas-${page}.csv`)}
              disabled={!exportRows?.length}
              title={exportRows?.length ? `Export ${current.label} data` : 'Load data to enable export'}
            >
              <Download size={14} /> Export
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-intro">
            <div>
              <div className="eyebrow">{copy.eyebrow}</div>
              <p>{copy.description}</p>
            </div>
            <div className="page-intro__icons" aria-hidden="true">
              <Activity size={14} /><Layers3 size={14} /><Boxes size={14} />
            </div>
          </div>
          {renderPage()}
          <footer className="app-footer">
            <span>OBSIDIAN ATLAS · MARKET INTELLIGENCE CONSOLE</span>
            <span>Olist Brazilian E-Commerce · CC BY-NC-SA 4.0 · Historical sample</span>
          </footer>
        </div>
      </main>
    </div>
  )
}
