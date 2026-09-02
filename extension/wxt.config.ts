import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-solid'],
  manifest: {
    name: 'WebMCP Assistant',
    description: 'Use the WebMCP tools exposed by the active webpage.',
    permissions: ['activeTab', 'scripting', 'storage', 'tabs'],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Open WebMCP Assistant' },
    browser_specific_settings: {
      gecko: {
        id: 'webmcp-assistant@example.invalid',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
})
