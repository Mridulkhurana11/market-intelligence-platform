// Dependency-free Chrome DevTools Protocol smoke test and screenshot capture.
// Usage: node scripts/browser-smoke.mjs
// Optional env: CHROME_PATH, BASE_URL (default http://localhost:4173), OUT_DIR
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'

const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
const BASE = (process.env.BASE_URL || 'http://localhost:4173').replace(/\/$/, '')
const OUT = process.env.OUT_DIR || path.resolve('artifacts')
const SHOTS = path.join(OUT, 'screenshots')
const PORT = Number(process.env.CDP_PORT || 9222)
const PROFILE = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-atlas-chrome-'))

const PAGES = [
  ['overview', 'Market overview'],
  ['trends', 'Market trends'],
  ['categories', 'Category intelligence'],
  ['sellers', 'Seller benchmarking'],
  ['geospatial', 'Geospatial intelligence'],
  ['experience', 'Buyer experience'],
  ['quality', 'Data & methodology'],
]

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

async function waitForEndpoint() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${PORT}/json/list`)
      if (response.ok) return response.json()
    } catch { /* Chrome is still starting */ }
    await sleep(250)
  }
  throw new Error('Chrome DevTools endpoint did not start')
}

async function main() {
  fs.mkdirSync(SHOTS, { recursive: true })
  const chrome = spawn(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
    '--hide-scrollbars', '--force-device-scale-factor=1',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
    '--window-size=1600,1000', 'about:blank',
  ], { stdio: 'ignore' })

  let ws
  const exceptions = []
  const consoleErrors = []
  const logErrors = []
  const report = {
    generated_at: new Date().toISOString(),
    base_url: BASE,
    viewport: { width: 1600, height: 1000, deviceScaleFactor: 1 },
    pages: {},
    interactions: {},
    responsive: {},
    exceptions,
    console_errors: consoleErrors,
    log_errors: logErrors,
    screenshots: [],
  }

  try {
    const targets = await waitForEndpoint()
    const pageTarget = targets.find(target => target.type === 'page')
    if (!pageTarget) throw new Error('No Chrome page target was found')
    ws = new WebSocket(pageTarget.webSocketDebuggerUrl)
    await new Promise((resolve, reject) => {
      ws.addEventListener('open', resolve, { once: true })
      ws.addEventListener('error', reject, { once: true })
    })

    let nextId = 0
    const pending = new Map()
    ws.addEventListener('message', event => {
      const message = JSON.parse(event.data)
      if (message.id && pending.has(message.id)) {
        const { resolve, reject } = pending.get(message.id)
        pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
        return
      }
      if (message.method === 'Runtime.exceptionThrown') {
        exceptions.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Unknown exception')
      }
      if (message.method === 'Runtime.consoleAPICalled' && message.params.type === 'error') {
        consoleErrors.push(message.params.args?.map(arg => arg.value || arg.description || '').join(' ') || 'Console error')
      }
      if (message.method === 'Log.entryAdded' && message.params.entry?.level === 'error') {
        logErrors.push(message.params.entry.text)
      }
    })

    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++nextId
      pending.set(id, { resolve, reject })
      ws.send(JSON.stringify({ id, method, params }))
    })

    const evaluate = async expression => {
      const result = await send('Runtime.evaluate', {
        expression, returnByValue: true, awaitPromise: true,
      })
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text)
      return result.result.value
    }

    const screenshot = async filename => {
      let data
      try {
        data = (await send('Page.captureScreenshot', {
          format: 'png', captureBeyondViewport: true, fromSurface: true,
        })).data
      } catch {
        data = (await send('Page.captureScreenshot', { format: 'png', fromSurface: true })).data
      }
      const file = path.join(SHOTS, filename)
      fs.writeFileSync(file, Buffer.from(data, 'base64'))
      report.screenshots.push(path.relative(OUT, file).replaceAll('\\', '/'))
      return file
    }

    const setViewport = (width, height, mobile = false) => send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile,
    })

    await send('Page.enable')
    await send('Runtime.enable')
    await send('Log.enable')
    await send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    await setViewport(1600, 1000)

    const summaries = {}
    for (const [route] of PAGES) {
      await send('Page.navigate', { url: `${BASE}/#/${route}` })
      for (let attempt = 0; attempt < 80; attempt += 1) {
        const ready = await evaluate(`(() => {
          const h1 = document.querySelector('h1')?.textContent || ''
          const state = document.querySelector('.state-view')
          return Boolean(h1 && !state && document.querySelectorAll('.panel').length > 0)
        })()`)
        if (ready) break
        await sleep(150)
      }
      await sleep(1100)
      const summary = await evaluate(`(() => ({
        title: document.title,
        h1: document.querySelector('h1')?.textContent || null,
        breadcrumb: document.querySelector('.breadcrumb b')?.textContent || null,
        activeNav: document.querySelector('.rail-item.is-active')?.getAttribute('aria-label') || null,
        panels: document.querySelectorAll('.panel').length,
        charts: document.querySelectorAll('.recharts-surface').length,
        maps: document.querySelectorAll('.atlas-leaflet').length,
        tableRows: document.querySelectorAll('.data-table tbody tr').length,
        stateView: document.querySelector('.state-view')?.innerText?.slice(0, 160) || null,
        textLength: document.body.innerText.length,
      }))()`)
      summaries[route] = summary
      report.pages[route] = summary
      await screenshot(`${route}.png`)
    }

    // Page-specific controls and map layer interactions.
    await send('Page.navigate', { url: `${BASE}/#/trends` })
    await sleep(900)
    await evaluate(`(() => {
      const button = [...document.querySelectorAll('.segmented button')].find(el => el.textContent.trim() === 'Orders')
      button?.click()
    })()`)
    await sleep(300)
    report.interactions.trendsMetric = await evaluate(`document.querySelector('.segmented button.is-active')?.textContent?.trim() || null`)

    await send('Page.navigate', { url: `${BASE}/#/categories` })
    await sleep(900)
    const beforeSearch = await evaluate(`document.querySelectorAll('.data-table tbody tr').length`)
    await evaluate(`(() => {
      const input = document.querySelector('.search-input input')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, 'phone')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await sleep(300)
    const afterSearch = await evaluate(`document.querySelectorAll('.data-table tbody tr').length`)
    report.interactions.categorySearch = { beforeSearch, afterSearch, changed: afterSearch !== beforeSearch }

    await send('Page.navigate', { url: `${BASE}/#/sellers` })
    await sleep(900)
    const sellerBefore = await evaluate(`document.querySelectorAll('.data-table tbody tr').length`)
    await evaluate(`(() => {
      const input = document.querySelector('.search-input input')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set
      setter.call(input, '000')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await sleep(300)
    const sellerAfter = await evaluate(`document.querySelectorAll('.data-table tbody tr').length`)
    report.interactions.sellerSearch = { before: sellerBefore, after: sellerAfter, changed: sellerAfter !== sellerBefore }

    await send('Page.navigate', { url: `${BASE}/#/geospatial` })
    await sleep(1400)
    const markerCount = () => evaluate(`document.querySelectorAll('.leaflet-interactive').length`)
    const initialMarkers = await markerCount()
    const toggleLayer = label => evaluate(`(() => {
      const button = [...document.querySelectorAll('.map-layer-toggle')].find(el => el.textContent.includes(${JSON.stringify(label)}))
      if (!button) return false
      button.click()
      return true
    })()`)
    await toggleLayer('Buyer demand')
    await sleep(250)
    const withoutBuyers = await markerCount()
    await toggleLayer('Buyer demand')
    await toggleLayer('Seller supply')
    await sleep(250)
    const withoutSellers = await markerCount()
    await toggleLayer('Seller supply')
    await sleep(250)
    await toggleLayer('Top corridors')
    await sleep(500)
    const withCorridors = await markerCount()
    report.interactions.mapLayers = {
      initialMarkers, withoutBuyers, withoutSellers, withCorridors,
      buyerToggleWorks: withoutBuyers < initialMarkers,
      sellerToggleWorks: withoutSellers < initialMarkers,
      corridorLayerDrawn: withCorridors > initialMarkers,
      corridorPressed: await evaluate(`[...document.querySelectorAll('.map-layer-toggle')].find(el => el.textContent.includes('Top corridors'))?.getAttribute('aria-pressed')`),
    }
    await screenshot('geospatial-map-all-layers.png')

    // Responsive checks: mobile rail, KPI grid and map legend.
    await setViewport(390, 844, true)
    await sleep(500)
    await send('Page.navigate', { url: `${BASE}/#/overview` })
    await sleep(1200)
    report.responsive.overview = await evaluate(`(() => {
      const rail = document.querySelector('.nav-rail')
      const kpi = document.querySelector('.kpi-strip')
      return {
        bodyScrollWidth: document.body.scrollWidth,
        viewportWidth: window.innerWidth,
        horizontalOverflow: document.body.scrollWidth > window.innerWidth + 1,
        railHeight: Math.round(rail.getBoundingClientRect().height),
        railWidth: Math.round(rail.getBoundingClientRect().width),
        kpiColumns: getComputedStyle(kpi).gridTemplateColumns.split(' ').length,
      }
    })()`)
    await screenshot('mobile-overview.png')

    await send('Page.navigate', { url: `${BASE}/#/geospatial` })
    await sleep(1400)
    report.responsive.geospatial = await evaluate(`(() => ({
      bodyScrollWidth: document.body.scrollWidth,
      viewportWidth: window.innerWidth,
      horizontalOverflow: document.body.scrollWidth > window.innerWidth + 1,
      mapHeight: Math.round(document.querySelector('.atlas-map')?.getBoundingClientRect().height || 0),
      legendVisible: Boolean(document.querySelector('.map-legend')),
    }))()`)
    await screenshot('mobile-geospatial.png')

    await setViewport(1600, 1000)
    report.summary = {
      pagesChecked: Object.keys(summaries).length,
      pagesWithExpectedHeading: Object.values(summaries).every((item, index) => item.h1 === PAGES[index][1]),
      pagesWithPanels: Object.values(summaries).every(item => item.panels > 0),
      pagesWithVisualContent: Object.values(summaries).every(item => item.charts > 0 || item.maps > 0 || item.tableRows > 0),
      noLoadingOrErrorStates: Object.values(summaries).every(item => !item.stateView),
      mapInteractionsPass: Object.values(report.interactions.mapLayers || {}).filter(value => typeof value === 'boolean').every(Boolean),
      responsiveNoOverflow: !report.responsive.overview?.horizontalOverflow && !report.responsive.geospatial?.horizontalOverflow,
      noBrowserErrors: report.exceptions.length === 0 && report.console_errors.length === 0 && report.log_errors.length === 0,
    }
  } finally {
    if (ws) ws.close()
    chrome.kill('SIGTERM')
    await sleep(700)
    try {
      fs.rmSync(PROFILE, { recursive: true, force: true })
    } catch (cleanupError) {
      console.warn(`Chrome profile cleanup skipped: ${cleanupError.message}`)
    }
  }

  fs.writeFileSync(path.join(OUT, 'smoke-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify({ summary: report.summary, screenshots: report.screenshots, exceptions: report.exceptions.length, consoleErrors: report.console_errors.length }, null, 2))
  if (!report.summary || Object.values(report.summary).some(value => value === false)) process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
