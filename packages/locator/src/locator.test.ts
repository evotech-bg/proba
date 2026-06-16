import { describe, expect, it } from 'vitest'
import {
  BrittleLocatorError,
  fromSignals,
  isPositional,
  stabilityScore,
  toPlaywright,
} from './index'

describe('isPositional', () => {
  it('flags nth-child, indexes, deep chains, xpath', () => {
    expect(isPositional('div:nth-child(2)')).toBe(true)
    expect(isPositional('ul > li > a > span')).toBe(true)
    expect(isPositional('div[2]')).toBe(true)
    expect(isPositional('//div/span[1]')).toBe(true)
    expect(isPositional('xpath=//button')).toBe(true)
  })
  it('allows clean semantic css', () => {
    expect(isPositional('[data-testid="x"]')).toBe(false)
    expect(isPositional('.card')).toBe(false)
  })
})

describe('fromSignals — priority order', () => {
  it('prefers role+name over everything', () => {
    const loc = fromSignals({ role: 'button', accessibleName: 'Save', testId: 'save-btn' })
    expect(loc).toEqual({ strategy: 'role', value: 'button', name: 'Save' })
  })
  it('falls back through label → placeholder → text → testId', () => {
    expect(fromSignals({ label: 'Email' })?.strategy).toBe('label')
    expect(fromSignals({ placeholder: 'you@x.com' })?.strategy).toBe('placeholder')
    expect(fromSignals({ text: 'Click me' })?.strategy).toBe('text')
    expect(fromSignals({ testId: 'x' })?.strategy).toBe('testId')
  })
  it('refuses to fall back to positional css', () => {
    expect(fromSignals({ css: 'div:nth-child(3)' })).toBeNull()
  })
})

describe('toPlaywright', () => {
  it('renders each strategy', () => {
    expect(toPlaywright({ strategy: 'role', value: 'button', name: 'Save' })).toBe(
      "page.getByRole('button', { name: 'Save' })",
    )
    expect(toPlaywright({ strategy: 'testId', value: 'save-btn' })).toBe(
      "page.getByTestId('save-btn')",
    )
    expect(toPlaywright({ strategy: 'label', value: 'Email', exact: true })).toBe(
      "page.getByLabel('Email', { exact: true })",
    )
  })
  it('escapes quotes', () => {
    expect(toPlaywright({ strategy: 'text', value: "it's" })).toBe("page.getByText('it\\'s')")
  })
  it('throws on brittle css', () => {
    expect(() => toPlaywright({ strategy: 'css', value: 'div:nth-child(2)' })).toThrow(
      BrittleLocatorError,
    )
  })
})

describe('stabilityScore', () => {
  it('ranks role above testId above clean css, positional = 0', () => {
    expect(stabilityScore({ strategy: 'role', value: 'button' })).toBeGreaterThan(
      stabilityScore({ strategy: 'testId', value: 'x' }),
    )
    expect(stabilityScore({ strategy: 'css', value: 'div:nth-child(1)' })).toBe(0)
  })
})
