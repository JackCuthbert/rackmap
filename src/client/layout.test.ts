import { expect, test } from 'vitest'

import { bandLayoutOptions } from './layout'

test('keeps enough horizontal room between same-band siblings for edge labels', () => {
  expect(bandLayoutOptions['elk.spacing.nodeNode']).toBe('112')
  expect(bandLayoutOptions['elk.spacing.componentComponent']).toBe('112')
})
