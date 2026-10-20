<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { geocode, getMapConfig, getSuggests, type Coordinate, type Suggestion } from './api'

defineOptions({ inheritAttrs: false })
const props = defineProps<{ field?: unknown; siteId?: number; accessToken?: string }>()
const model = defineModel<Coordinate | null>()
const mapElement = ref<HTMLElement | null>(null)
const address = ref('')
const suggestions = ref<Suggestion[]>([])
const busy = ref(false)
const error = ref('')
const mapError = ref('')
const loadingMap = ref(false)
const latitudeDraft = ref(model.value?.lat === undefined ? '' : String(model.value.lat))
const longitudeDraft = ref(model.value?.lon === undefined ? '' : String(model.value.lon))
let map: any
let marker: any
let suggestTimer: ReturnType<typeof setTimeout> | undefined
let suggestController: AbortController | undefined
let disposed = false
let mapInitializationStarted = false

declare global {
  interface Window { ymaps3?: any }
}

function validCoordinate(value: Coordinate | null | undefined): value is Coordinate {
  return !!value && Number.isFinite(value.lat) && Number.isFinite(value.lon) && Math.abs(value.lat) <= 90 && Math.abs(value.lon) <= 180
}

function updateCoordinate(next: Coordinate): void {
  if (!validCoordinate(next)) return
  model.value = { lat: Number(next.lat.toFixed(6)), lon: Number(next.lon.toFixed(6)) }
}

async function loadYandex(key: string): Promise<any> {
  if (typeof window === 'undefined') throw new Error('Карта доступна только в браузере')
  if (window.ymaps3) return window.ymaps3
  await new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-geo-yandex-api]')
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true })
      existing.addEventListener('error', () => reject(new Error('Не удалось загрузить карту Яндекса')), { once: true })
      if (window.ymaps3) resolve()
      return
    }
    const script = document.createElement('script')
    script.dataset.geoYandexApi = 'true'
    script.src = `https://api-maps.yandex.ru/v3/?apikey=${encodeURIComponent(key)}&lang=ru_RU`
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Не удалось загрузить карту Яндекса'))
    document.head.append(script)
  })
  if (!window.ymaps3) throw new Error('Яндекс API не инициализировался')
  await window.ymaps3.ready
  return window.ymaps3
}

async function initializeMap(): Promise<void> {
  if (mapInitializationStarted || !mapElement.value || typeof window === 'undefined') return
  mapInitializationStarted = true
  loadingMap.value = true
  mapError.value = ''
  try {
    const config = await getMapConfig(props.accessToken)
    if (disposed) return
    if (!config.js_api_key) throw new Error('Не настроен ключ JavaScript API Яндекс Карт')
    const ymaps3 = await loadYandex(config.js_api_key)
    if (disposed || !mapElement.value) return
    const initial = validCoordinate(model.value) ? [model.value.lon, model.value.lat] : [37.6176, 55.7558]
    map = new ymaps3.YMap(mapElement.value, { location: { center: initial, zoom: 12 } })
    map.addChild(new ymaps3.YMapDefaultSchemeLayer({}))
    map.addChild(new ymaps3.YMapDefaultFeaturesLayer({}))
    map.addChild(new ymaps3.YMapListener({
      layer: 'any',
      onClick: (_object: unknown, event: any) => {
        const coords = event?.coordinates
        if (Array.isArray(coords)) updateCoordinate({ lon: coords[0], lat: coords[1] })
      },
    }))
    if (validCoordinate(model.value)) setMarker(model.value)
  } catch (cause) {
    if (!disposed) mapError.value = cause instanceof Error ? cause.message : 'Не удалось открыть карту'
  } finally {
    if (!disposed) loadingMap.value = false
  }
}

function setMarker(value: Coordinate): void {
  if (!map || !window.ymaps3) return
  if (marker) { map.removeChild(marker); marker = undefined }
  const ymaps3 = window.ymaps3
  const markerElement = document.createElement('div')
  markerElement.className = 'geo-marker'
  markerElement.setAttribute('aria-label', 'Перетащите точку на карте')
  markerElement.textContent = '●'
  marker = new ymaps3.YMapMarker({
    coordinates: [value.lon, value.lat],
    draggable: true,
    onDragEnd: (event: any) => {
      const coords = event?.coordinates ?? event
      if (Array.isArray(coords)) updateCoordinate({ lon: coords[0], lat: coords[1] })
    },
  }, markerElement)
  map.addChild(marker)
}

watch(model, value => { if (validCoordinate(value)) setMarker(value) }, { deep: true })
watch(model, value => {
  latitudeDraft.value = value?.lat === undefined ? '' : String(value.lat)
  longitudeDraft.value = value?.lon === undefined ? '' : String(value.lon)
}, { deep: true })

function onAddressInput(): void {
  clearTimeout(suggestTimer)
  suggestController?.abort()
  suggestions.value = []
  error.value = ''
  if (address.value.trim().length < 3) return
  suggestTimer = setTimeout(async () => {
    const controller = new AbortController()
    suggestController = controller
    try { suggestions.value = (await getSuggests(address.value.trim(), props.accessToken, controller.signal)).results ?? [] }
    catch (cause) { if (!controller.signal.aborted) error.value = cause instanceof Error ? cause.message : 'Не удалось найти адрес' }
  }, 250)
}

async function chooseSuggestion(item: Suggestion): Promise<void> {
  address.value = item.address
  suggestions.value = []
  await resolveAddress(item.address)
}

async function resolveAddress(value = address.value): Promise<void> {
  if (!value.trim()) return
  busy.value = true
  error.value = ''
  try {
    const result = await geocode(value.trim(), props.accessToken)
    updateCoordinate({ lat: result.lat, lon: result.lon })
    address.value = result.address || value
    if (map) map.update({ location: { center: [result.lon, result.lat], zoom: 15, duration: 300 } })
  } catch (cause) { error.value = cause instanceof Error ? cause.message : 'Не удалось определить координаты' }
  finally { busy.value = false }
}

function manualChanged(axis: 'lat' | 'lon', raw: string | number): void {
  const draft = typeof raw === 'number' ? String(raw) : raw
  if (axis === 'lat') latitudeDraft.value = draft
  else longitudeDraft.value = draft
  if (!latitudeDraft.value.trim() || !longitudeDraft.value.trim()) return
  const lat = Number(latitudeDraft.value.replace(',', '.'))
  const lon = Number(longitudeDraft.value.replace(',', '.'))
  if (validCoordinate({ lat, lon })) updateCoordinate({ lat, lon })
}

onMounted(() => { void initializeMap() })
onBeforeUnmount(() => {
  disposed = true
  clearTimeout(suggestTimer)
  suggestController?.abort()
  map?.destroy?.()
  map = undefined
})
</script>

<template>
  <div class="geo-yandex-editor">
    <div class="geo-search">
      <input v-model="address" type="search" placeholder="Введите адрес" autocomplete="off" @input="onAddressInput" @keydown.enter.prevent="resolveAddress()" />
      <button type="button" :disabled="busy || !address.trim()" @click="resolveAddress()">{{ busy ? 'Ищем…' : 'Найти' }}</button>
      <ul v-if="suggestions.length" class="geo-suggestions">
        <li v-for="(item, index) in suggestions" :key="`${item.address}-${index}`">
          <button type="button" @click="chooseSuggestion(item)"><strong>{{ item.title }}</strong><small v-if="item.subtitle">{{ item.subtitle }}</small></button>
        </li>
      </ul>
    </div>
    <p v-if="error" class="geo-error" role="alert">{{ error }}</p>
    <div ref="mapElement" class="geo-map" :aria-busy="loadingMap" />
    <p v-if="mapError" class="geo-error" role="alert">Карта недоступна: {{ mapError }} Ручной ввод координат остаётся доступен.</p>
    <p class="geo-help">Нажмите на карту, чтобы поставить точку. Координаты можно уточнить вручную.</p>
    <div class="geo-coordinates">
      <label>Широта <input v-model="latitudeDraft" type="number" step="any" min="-90" max="90" @input="manualChanged('lat', ($event.target as HTMLInputElement).value)" /></label>
      <label>Долгота <input v-model="longitudeDraft" type="number" step="any" min="-180" max="180" @input="manualChanged('lon', ($event.target as HTMLInputElement).value)" /></label>
      <button v-if="model" type="button" class="geo-clear" @click="model = null">Очистить</button>
    </div>
  </div>
</template>

<style scoped>
.geo-yandex-editor { display: grid; gap: 10px; width: 100%; }
.geo-search { position: relative; display: flex; gap: 8px; }
.geo-search > input, .geo-coordinates input { box-sizing: border-box; min-width: 0; width: 100%; border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 4px; padding: 8px 10px; color: var(--el-text-color-regular, #606266); background: var(--el-fill-color-blank, white); }
.geo-search > button, .geo-clear { border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 4px; padding: 7px 12px; background: var(--el-fill-color-blank, white); cursor: pointer; white-space: nowrap; }
.geo-search > button:disabled { cursor: not-allowed; opacity: .6; }
.geo-suggestions { z-index: 3; position: absolute; top: 100%; left: 0; right: 54px; margin: 2px 0 0; padding: 4px; list-style: none; border: 1px solid var(--el-border-color, #dcdfe6); border-radius: 4px; background: var(--el-bg-color, white); box-shadow: 0 4px 12px #0002; }
.geo-suggestions button { display: grid; width: 100%; gap: 2px; padding: 7px; border: 0; text-align: left; background: transparent; cursor: pointer; color: inherit; }
.geo-suggestions button:hover { background: var(--el-fill-color-light, #f5f7fa); }
.geo-suggestions small, .geo-help { color: var(--el-text-color-secondary, #909399); }
.geo-map { width: 100%; min-height: 300px; overflow: hidden; border-radius: 4px; background: var(--el-fill-color-light, #f5f7fa); }
.geo-coordinates { display: flex; align-items: end; gap: 10px; }
.geo-coordinates label { flex: 1; display: grid; gap: 4px; font-size: 12px; color: var(--el-text-color-secondary, #606266); }
.geo-error { margin: 0; color: var(--el-color-danger, #f56c6c); }
.geo-help { margin: -3px 0 0; font-size: 12px; }
.geo-marker { color: #e53935; font-size: 30px; line-height: 24px; cursor: grab; text-shadow: 0 1px 2px white; }
@media (max-width: 640px) { .geo-coordinates { flex-wrap: wrap; } .geo-coordinates label { flex-basis: 40%; } }
</style>
