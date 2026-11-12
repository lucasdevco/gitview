import { expect, test } from "vitest"
import { followSystemTheme } from "./theme"

/** A stand-in for matchMedia("(prefers-color-scheme: dark)") the test can flip. */
function systemScheme(dark: boolean) {
  const listeners = new Set<(event: { matches: boolean }) => void>()
  const media = {
    matches: dark,
    addEventListener: (_: "change", listener: (event: { matches: boolean }) => void) => listeners.add(listener),
    removeEventListener: (_: "change", listener: (event: { matches: boolean }) => void) => listeners.delete(listener),
  }
  const flip = (next: boolean) => {
    media.matches = next
    for (const listener of listeners) listener({ matches: next })
  }
  return { media, flip, listeners }
}

function rootElement() {
  const classes = new Set<string>()
  return {
    classes,
    classList: {
      toggle: (name: string, on: boolean) => {
        if (on) classes.add(name)
        else classes.delete(name)
        return on
      },
    },
  }
}

test("the page follows the system colour scheme as it changes", () => {
  const system = systemScheme(true)
  const root = rootElement()

  const stop = followSystemTheme(root, system.media)
  expect(root.classes.has("dark")).toBe(true)

  system.flip(false)
  expect(root.classes.has("dark")).toBe(false)
  system.flip(true)
  expect(root.classes.has("dark")).toBe(true)

  stop()
  expect(system.listeners.size).toBe(0)
})
