declare module '@go-cms/admin/sdk' {
  import type { Component } from 'vue'
  export interface AdminPlugin {
    code: string
    fieldEditors?: Record<string, Component>
  }
}
