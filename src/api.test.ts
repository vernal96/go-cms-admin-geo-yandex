import { afterEach, describe, expect, it, vi } from 'vitest'
import { geocode, getSuggests } from './api'

afterEach(() => vi.restoreAllMocks())

describe('geolocation API', () => {
  it('encodes suggest text and carries the optional admin token', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ results: [] })))
    await getSuggests('Москва, Тверская', 'secret')
    expect(fetchMock).toHaveBeenCalledWith('/api/geo-yandex/suggests?text=%D0%9C%D0%BE%D1%81%D0%BA%D0%B2%D0%B0%2C%20%D0%A2%D0%B2%D0%B5%D1%80%D1%81%D0%BA%D0%B0%D1%8F', expect.objectContaining({ headers: expect.any(Headers) }))
    const init = fetchMock.mock.calls[0]?.[1]
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret')
  })

  it('surfaces structured API failures', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: { code: 'quota', message: 'Превышена квота' } }), { status: 429 }))
    await expect(geocode('Москва')).rejects.toThrow('Превышена квота')
  })
})
