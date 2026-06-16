import type { CanonicalTest } from './index'
import { describe, expect, it } from 'vitest'
import { toGherkin, toPlaywrightTs } from './index'

const loginTest: CanonicalTest = {
  title: 'user logs in successfully',
  intent: 'a registered user can sign in',
  polarity: 'positive',
  steps: [
    {
      kind: 'web',
      action: 'navigate',
      params: { url: 'https://app.test/login' },
      description: 'the login page is open',
    },
    {
      kind: 'web',
      action: 'fill',
      target: { strategy: 'label', value: 'Email' },
      params: { text: 'a@b.c' },
      description: 'the user enters their email',
    },
    {
      kind: 'web',
      action: 'click',
      target: { strategy: 'role', value: 'button', name: 'Sign in' },
      description: 'the user submits',
    },
    {
      kind: 'web',
      action: 'expect',
      target: { strategy: 'role', value: 'heading', name: 'Dashboard' },
      assertions: [{ type: 'dom', visible: true }],
      description: 'the dashboard is shown',
    },
  ],
}

describe('toPlaywrightTs', () => {
  it('emits runnable Playwright with stable locators', () => {
    const ts = toPlaywrightTs(loginTest)
    expect(ts).toContain("import { test, expect } from '@playwright/test'")
    expect(ts).toContain("await page.goto('https://app.test/login')")
    expect(ts).toContain("await page.getByLabel('Email').fill('a@b.c')")
    expect(ts).toContain("await page.getByRole('button', { name: 'Sign in' }).click()")
    expect(ts).toContain(
      "await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible()",
    )
  })

  it('includes request fixture only when api steps exist', () => {
    const apiTest: CanonicalTest = {
      title: 'health',
      steps: [
        {
          kind: 'api',
          action: 'request',
          params: { method: 'GET', url: '/health' },
          assertions: [{ type: 'http', status: 200 }],
        },
      ],
    }
    const ts = toPlaywrightTs(apiTest)
    expect(ts).toContain('async ({ page, request }) =>')
    expect(ts).toContain("const res = await request.get('/health')")
    expect(ts).toContain('expect(res.status()).toBe(200)')
  })

  it('emits Playwright snapshot assertions for visual + text snapshots', () => {
    const snapTest: CanonicalTest = {
      title: 'nav snapshot',
      steps: [
        { kind: 'web', action: 'navigate', params: { url: '/' } },
        {
          kind: 'web',
          action: 'expect',
          target: { strategy: 'role', value: 'navigation' },
          assertions: [
            { type: 'visual', name: 'home.nav' },
            { type: 'snapshot', name: 'home.nav.text' },
          ],
        },
      ],
    }
    const ts = toPlaywrightTs(snapTest)
    expect(ts).toContain(
      "await expect(page.getByRole('navigation')).toHaveScreenshot('home-nav.png')",
    )
    expect(ts).toContain(
      "expect(await page.getByRole('navigation').textContent()).toMatchSnapshot('home-nav-text.txt')",
    )
  })
})

describe('toGherkin', () => {
  it('maps steps to Given/When/Then with And-folding', () => {
    const g = toGherkin(loginTest, 'Authentication')
    expect(g).toContain('Feature: Authentication')
    expect(g).toContain('Scenario: user logs in successfully')
    expect(g).toContain('Given the login page is open')
    expect(g).toContain('When the user enters their email')
    expect(g).toContain('And the user submits')
    expect(g).toContain('Then the dashboard is shown')
  })
})
