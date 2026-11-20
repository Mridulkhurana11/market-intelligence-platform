import React, { useEffect, useMemo, useState } from 'react'
import {
  CircleMarker, MapContainer, Polyline, Popup, TileLayer,
  Tooltip as LeafletTooltip, ZoomControl, useMap,
} from 'react-leaflet'
import L from 'leaflet'
import { LocateFixed, Layers3, Route } from 'lucide-react'
import { CHART } from '../lib/chart'
import { km, money, number } from '../lib/format'
import { Panel } from './Primitives'

const BRAZIL_CENTER = [-14.2350, -51.9253]
const CARTO_KEY = (import.meta.env.VITE_CARTO_API_KEY || '').trim()
const TILE_URL = CARTO_KEY
  ? `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png?api_key=${encodeURIComponent(CARTO_KEY)}`
  : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
const TILE_ATTRIBUTION = CARTO_KEY
  ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
  : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'

const validPoint = point =>
  point && Number.isFinite(Number(point.lat)) && Number.isFinite(Number(point.lon)) &&
  Number(point.lat) >= -90 && Number(point.lat) <= 90 && Number(point.lon) >= -180 && Number(point.lon) <= 180

function MapController({ points, resetToken }) {
  const map = useMap()
  useEffect(() => {
    if (!points.length) return undefined
    const bounds = L.latLngBounds(points.map(point => [Number(point.lat), Number(point.lon)]))
    const frame = requestAnimationFrame(() => {
      map.invalidateSize()
      map.fitBounds(bounds, { padding: [38, 38], maxZoom: 6, animate: false })
    })
    return () => cancelAnimationFrame(frame)
  }, [map, points, resetToken])
  return null
}

function corridorArc(from, to) {
  const start = [Number(from.demand_lat), Number(from.demand_lon)]
  const end = [Number(to.seller_lat), Number(to.seller_lon)]
  const deltaLat = end[0] - start[0]
  const deltaLng = end[1] - start[1]
  const length = Math.hypot(deltaLat, deltaLng) || 1
  const bend = Math.min(length * 0.16, 5)
  const control = [
    (start[0] + end[0]) / 2 + (-deltaLng / length) * bend,
    (start[1] + end[1]) / 2 + (deltaLat / length) * bend,
  ]
  return Array.from({ length: 21 }, (_, index) => {
    const t = index / 20
    const a = (1 - t) ** 2
    const b = 2 * (1 - t) * t
    const c = t ** 2
    return [a * start[0] + b * control[0] + c * end[0], a * start[1] + b * control[1] + c * end[1]]
  })
}

function buildCorridors(distancePairs = [], stateBalance = [], limit = 8) {
  const byState = new Map(stateBalance.filter(state => state?.state).map(state => [state.state, state]))
  return distancePairs
    .filter(pair => pair.seller_state !== pair.customer_state && Number(pair.item_gmv) > 0)
    .sort((a, b) => Number(b.item_gmv) - Number(a.item_gmv))
    .map(pair => ({ pair, seller: byState.get(pair.seller_state), buyer: byState.get(pair.customer_state) }))
    .filter(({ seller, buyer }) => validPoint(seller && { lat: seller.seller_lat, lon: seller.seller_lon }) &&
      validPoint(buyer && { lat: buyer.demand_lat, lon: buyer.demand_lon }))
    .slice(0, limit)
}

function LayerToggle({ active, onClick, color, label, count, icon: Icon }) {
  return (
    <button type="button" className={`map-layer-toggle ${active ? 'is-active' : ''}`} onClick={onClick} aria-pressed={active}>
      <span className="map-layer-toggle__marker" style={{ background: active ? color : 'transparent', borderColor: color }} />
      {Icon && <Icon size={13} />}
      <span>{label}</span>
      {count != null && <b className="mono">{number(count)}</b>}
    </button>
  )
}

export default function AtlasMap({ geospatial, compact = false, title, subtitle, showCorridorToggle = true }) {
  const [showBuyers, setShowBuyers] = useState(true)
  const [showSellers, setShowSellers] = useState(true)
  const [showCorridors, setShowCorridors] = useState(() =>
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('corridors') === '1')
  const [resetToken, setResetToken] = useState(0)

  const points = useMemo(() => (geospatial?.map_points || []).filter(validPoint), [geospatial])
  const buyers = useMemo(() => points.filter(point => point.role === 'Buyer demand'), [points])
  const sellers = useMemo(() => points.filter(point => point.role === 'Seller supply'), [points])
  const corridors = useMemo(
    () => buildCorridors(geospatial?.distance_pairs || [], geospatial?.state_balance || []),
    [geospatial],
  )
  const maxIntensity = useMemo(() => Math.max(1, ...points.map(point => Number(point.intensity) || 0)), [points])
  const radiusFor = point => 4 + Math.sqrt((Number(point.intensity) || 0) / maxIntensity) * 11

  return (
    <Panel
      className={`map-panel ${compact ? 'map-panel--compact' : 'map-panel--full'}`}
      bodyClass="map-panel__body"
      eyebrow={compact ? 'GEOGRAPHIC LAYER' : 'SPATIAL INTELLIGENCE'}
      title={title || 'Brazilian marketplace footprint'}
      subtitle={subtitle || 'City-level postcode-centroid aggregates from the delivered Olist sample'}
      action={
        <div className="map-toolbar">
          <LayerToggle active={showBuyers} onClick={() => setShowBuyers(value => !value)} color={CHART.teal} label="Buyer demand" count={buyers.length} />
          <LayerToggle active={showSellers} onClick={() => setShowSellers(value => !value)} color={CHART.amber} label="Seller supply" count={sellers.length} />
          {showCorridorToggle && (
            <LayerToggle active={showCorridors} onClick={() => setShowCorridors(value => !value)} color={CHART.blue} label="Top corridors" count={corridors.length} icon={Route} />
          )}
        </div>
      }
    >
      <div className={`atlas-map ${compact ? 'atlas-map--compact' : 'atlas-map--full'} ${CARTO_KEY ? '' : 'atlas-map--osm-fallback'}`}>
        {points.length ? (
          <MapContainer
            center={BRAZIL_CENTER}
            zoom={4}
            minZoom={3}
            maxZoom={12}
            zoomControl={false}
            scrollWheelZoom={false}
            attributionControl
            className="atlas-leaflet"
          >
            <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} subdomains="abcd" />
            <ZoomControl position="bottomright" />
            <MapController points={points} resetToken={resetToken} />
            {showCorridors && corridors.map(({ pair, seller, buyer }) => (
              <Polyline
                key={`${pair.seller_state}-${pair.customer_state}`}
                positions={corridorArc(buyer, seller)}
                pathOptions={{ color: CHART.blue, weight: 1.6, opacity: 0.72, dashArray: '5 5' }}
              >
                <LeafletTooltip className="atlas-map-tooltip" direction="top" sticky>
                  <b>{pair.seller_state} → {pair.customer_state}</b><br />
                  {number(pair.order_seller_pairs)} order-seller pairs<br />
                  {money(pair.item_gmv)} item GMV<br />
                  {km(pair.median_distance_km)} straight-line
                </LeafletTooltip>
              </Polyline>
            ))}
            {showBuyers && buyers.map(point => (
              <CircleMarker
                key={`buyer-${point.city_label}-${point.state}`}
                center={[Number(point.lat), Number(point.lon)]}
                radius={radiusFor(point)}
                pathOptions={{ color: CHART.teal, weight: 1, fillColor: CHART.teal, fillOpacity: 0.55 }}
              >
                <LeafletTooltip className="atlas-map-tooltip" direction="top" offset={[0, -6]}>
                  <b>{point.city_label}, {point.state}</b><br />Buyer demand · {number(point.orders)} orders
                </LeafletTooltip>
                <Popup className="atlas-map-popup">
                  <div className="map-popup">
                    <div className="map-popup__role map-popup__role--buyer">BUYER DEMAND</div>
                    <h4>{point.city_label} <span>{point.state}</span></h4>
                    <dl>
                      <div><dt>Delivered GMV</dt><dd>{money(point.gmv)}</dd></div>
                      <div><dt>Orders</dt><dd>{number(point.orders)}</dd></div>
                      <div><dt>Identified buyers</dt><dd>{number(point.entities)}</dd></div>
                      <div><dt>Coordinates</dt><dd className="mono">{Number(point.lat).toFixed(3)}, {Number(point.lon).toFixed(3)}</dd></div>
                    </dl>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
            {showSellers && sellers.map(point => (
              <CircleMarker
                key={`seller-${point.city_label}-${point.state}`}
                center={[Number(point.lat), Number(point.lon)]}
                radius={radiusFor(point)}
                pathOptions={{ color: CHART.amber, weight: 1, fillColor: CHART.amber, fillOpacity: 0.6 }}
              >
                <LeafletTooltip className="atlas-map-tooltip" direction="top" offset={[0, -6]}>
                  <b>{point.city_label}, {point.state}</b><br />Seller supply · {number(point.entities)} sellers
                </LeafletTooltip>
                <Popup className="atlas-map-popup">
                  <div className="map-popup">
                    <div className="map-popup__role map-popup__role--seller">SELLER SUPPLY</div>
                    <h4>{point.city_label} <span>{point.state}</span></h4>
                    <dl>
                      <div><dt>Delivered GMV</dt><dd>{money(point.gmv)}</dd></div>
                      <div><dt>Orders</dt><dd>{number(point.orders)}</dd></div>
                      <div><dt>Active sellers</dt><dd>{number(point.entities)}</dd></div>
                      <div><dt>Coordinates</dt><dd className="mono">{Number(point.lat).toFixed(3)}, {Number(point.lon).toFixed(3)}</dd></div>
                    </dl>
                  </div>
                </Popup>
              </CircleMarker>
            ))}
          </MapContainer>
        ) : (
          <div className="empty-inline">No valid mapped city points are available. Run the pipeline with the Olist geolocation table.</div>
        )}

        <div className="map-reset">
          <button type="button" onClick={() => setResetToken(token => token + 1)} title="Fit map to all mapped points">
            <LocateFixed size={15} /> Reset view
          </button>
        </div>

        <div className="map-legend">
          <div className="map-legend__title"><Layers3 size={13} /> GEOGRAPHIC ACTIVITY</div>
          <div><i style={{ background: CHART.teal }} /> Buyer demand <small>orders</small></div>
          <div><i style={{ background: CHART.amber }} /> Seller supply <small>sellers</small></div>
          {showCorridors && <div><i style={{ background: CHART.blue }} /> State corridor <small>item GMV</small></div>}
          <p>{CARTO_KEY ? 'CARTO Dark Matter basemap · © OpenStreetMap, © CARTO' : 'OpenStreetMap tiles with dark map treatment · © OpenStreetMap contributors'}</p>
        </div>
      </div>
      <div className="map-disclosure">
        Coordinates are approximate five-digit postcode centroids, not exact addresses. Markers use city-level aggregates from the Python pipeline;
        corridors are schematic links between state centroids, and distances are straight-line Haversine estimates — not driving routes or delivery tracking.
      </div>
    </Panel>
  )
}
