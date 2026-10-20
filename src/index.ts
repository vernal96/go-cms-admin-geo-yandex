import type { AdminPlugin } from '@go-cms/admin/sdk'
import CoordinatesField from './CoordinatesField.vue'

const geoYandexAdminPlugin: AdminPlugin = {
  code: 'geo-yandex',
  fieldEditors: {
    'geo-yandex.coordinates': CoordinatesField,
  },
}

export { CoordinatesField }
export default geoYandexAdminPlugin
