export interface Coordinate { lat: number; lon: number }
export interface Suggestion { title: string; subtitle?: string; address: string; uri?: string }
export interface SuggestResponse { results: Suggestion[] }
export interface GeocodeResponse extends Coordinate { address: string }
interface APIError { error?: { message?: string; code?: string; details?: unknown }; message?: string }

export async function geoRequest<T>(path: string, token?: string, signal?: AbortSignal): Promise<T> {
  const headers = new Headers()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(path, { headers, signal })
  let body: unknown
  try { body = await response.json() } catch { body = undefined }
  if (!response.ok) {
    const envelope = body as APIError | undefined
    const message = envelope?.error?.message ?? envelope?.message ?? `Ошибка API (${response.status})`
    throw new Error(message)
  }
  return body as T
}

export function getSuggests(text: string, token?: string, signal?: AbortSignal): Promise<SuggestResponse> {
  return geoRequest(`/api/geo-yandex/suggests?text=${encodeURIComponent(text)}`, token, signal)
}

export function geocode(address: string, token?: string): Promise<GeocodeResponse> {
  return geoRequest(`/api/geo-yandex/geocode?address=${encodeURIComponent(address)}`, token)
}

export function getMapConfig(token?: string): Promise<{ js_api_key: string }> {
  return geoRequest('/api/geo-yandex/config', token)
}
