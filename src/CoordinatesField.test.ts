import { mount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import CoordinatesField from './CoordinatesField.vue'
import { getMapConfig } from './api'

vi.mock('./api', () => ({
  getMapConfig: vi.fn().mockRejectedValue(new Error('map unavailable')),
  getSuggests: vi.fn().mockResolvedValue({ results: [] }),
  geocode: vi.fn().mockResolvedValue({ lat: 55.75, lon: 37.61, address: 'Москва' }),
}))

describe('CoordinatesField', () => {
  it('supports manual coordinate entry and emits the scalar object', async () => {
    const wrapper = mount(CoordinatesField)
    const inputs = wrapper.findAll('input[type="number"]')
    await inputs[0]!.setValue('55.75')
    await inputs[1]!.setValue('37.61')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ lat: 55.75, lon: 37.61 }])
    await wrapper.get('button.geo-clear').trigger('click')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([null])
    wrapper.unmount()
  })

  it('keeps the first manually entered axis as a draft until the other axis is entered', async () => {
    const wrapper = mount(CoordinatesField)
    const inputs = wrapper.findAll('input[type="number"]')
    await inputs[0]!.setValue('55.75')
    expect(wrapper.emitted('update:modelValue')).toBeUndefined()
    expect((inputs[0]!.element as HTMLInputElement).value).toBe('55.75')
    expect((inputs[1]!.element as HTMLInputElement).value).toBe('')
    await inputs[1]!.setValue('37.61')
    expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ lat: 55.75, lon: 37.61 }])
    wrapper.unmount()
  })

  it('reports map setup failure while keeping manual controls usable', async () => {
    const wrapper = mount(CoordinatesField)
    await vi.waitFor(() => expect(wrapper.text()).toContain('Карта недоступна: map unavailable'))
    expect(wrapper.text()).toContain('Ручной ввод координат остаётся доступен.')
    expect(wrapper.findAll('input[type="number"]')).toHaveLength(2)
    wrapper.unmount()
  })

  it('sets coordinates from a map click and a dragged marker', async () => {
    const children: any[] = []
    class MockMap {
      addChild(child: any) { children.push(child) }
      removeChild(child: any) { const index = children.indexOf(child); if (index >= 0) children.splice(index, 1) }
      update() {}
      destroy() {}
    }
    class MockMarker { constructor(public props: any, public element: HTMLElement) {} }
    class MockListener { constructor(public props: any) {} }
    vi.mocked(getMapConfig).mockResolvedValue({ js_api_key: 'test-key' })
    window.ymaps3 = {
      ready: Promise.resolve(),
      YMap: MockMap,
      YMapDefaultSchemeLayer: class {},
      YMapDefaultFeaturesLayer: class {},
      YMapListener: MockListener,
      YMapMarker: MockMarker,
    }
    const wrapper = mount(CoordinatesField)
    await vi.waitFor(() => expect(children.some(child => child instanceof MockListener)).toBe(true))
    const listener = children.find(child => child instanceof MockListener) as MockListener
    listener.props.onClick(undefined, { coordinates: [37.61, 55.75] })
    await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ lat: 55.75, lon: 37.61 }]))
    const marker = children.find(child => child instanceof MockMarker) as MockMarker
    marker.props.onDragEnd({ coordinates: [37.62, 55.76] })
    await vi.waitFor(() => expect(wrapper.emitted('update:modelValue')?.at(-1)).toEqual([{ lat: 55.76, lon: 37.62 }]))
    wrapper.unmount()
    delete window.ymaps3
  })

  it('starts map configuration only once when the access token changes during loading', async () => {
    let resolveConfig!: (value: { js_api_key: string }) => void
    vi.mocked(getMapConfig).mockClear()
    vi.mocked(getMapConfig).mockReturnValue(new Promise(resolve => { resolveConfig = resolve }))
    const wrapper = mount(CoordinatesField, { props: { accessToken: 'first-token' } })
    await wrapper.setProps({ accessToken: 'second-token' })
    expect(getMapConfig).toHaveBeenCalledTimes(1)
    expect(getMapConfig).toHaveBeenCalledWith('first-token')
    resolveConfig({ js_api_key: '' })
    await vi.waitFor(() => expect(wrapper.text()).toContain('Карта недоступна'))
    expect(getMapConfig).toHaveBeenCalledTimes(1)
    wrapper.unmount()
  })
})
