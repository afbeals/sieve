import { MantineProvider } from '@mantine/core'
import { render } from '@testing-library/react'
import type { ComponentProps } from 'react'
import App from '../App'
import { createMockApi } from './mockApi'
import type { MockApi } from './mockApi'

// App reads `window.api` directly (the real contextBridge-exposed surface in production) -
// stubbing it before render is the renderer-side equivalent of the main process being present.
export function renderApp(overrides: Partial<Window['api']> = {}): { api: MockApi } & ReturnType<typeof render> {
  const api = createMockApi(overrides)
  window.api = api

  const providerProps: Partial<ComponentProps<typeof MantineProvider>> = { defaultColorScheme: 'light' }
  const result = render(
    <MantineProvider {...providerProps}>
      <App />
    </MantineProvider>
  )
  return { ...result, api }
}
