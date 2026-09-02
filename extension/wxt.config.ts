import { defineConfig } from 'wxt'

export default defineConfig({
  modules: ['@wxt-dev/module-solid'],
  manifest: {
    name: 'WebMCP Assistant POC',
    description: 'Cross-browser side panel proof of concept.',
    permissions: ['activeTab', 'scripting', 'tabs'],
    host_permissions: ['<all_urls>'],
    action: { default_title: 'Open WebMCP Assistant' },
    browser_specific_settings: {
      gecko: {
        id: 'webmcp-assistant-poc@example.invalid',
        data_collection_permissions: { required: ['none'] },
      },
    },
  },
})
