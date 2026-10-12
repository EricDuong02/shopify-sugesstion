import { afterEach, expect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { destroyAll, mount as mountReact } from '@shopify/react-testing'

globalThis.expect = expect
await import('@shopify/react-testing/matchers')

export async function mount(element, { initialPath = '/' } = {}) {
  const mounted = mountReact(
    <MemoryRouter initialEntries={[initialPath]}>{element}</MemoryRouter>,
  )
  return mounted
}

afterEach(() => destroyAll())
