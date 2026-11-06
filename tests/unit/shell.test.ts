import { describe, expect, it } from 'vitest'
import { renderToString } from 'react-dom/server'
import React from 'react'
import { App } from '../../src/App'

/**
 * T001 shell evidence: the scaffold entry renders the static shell.
 * No business logic is exercised here; domain tests arrive with
 * T002 and later tasks.
 */
describe('T001 shell', () => {
  it('renders the static shell heading', () => {
    const html = renderToString(React.createElement(App))
    expect(html).toContain('改稿守约 Edit Pact')
  })
})
