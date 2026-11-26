import { expect, test } from '@playwright/test'

declare global {
  interface Window {
    __STARWARD_SERVER_LANGUAGE__?: string
  }
}

// Regressione per l'issue "Italian login page has a React hydration mismatch":
// in una sessione fresh it-IT il server deve renderizzare la pagina in
// italiano (Accept-Language) e il primo render client deve usare la stessa
// lingua serializzata nello stream (window.__STARWARD_SERVER_LANGUAGE__),
// cosi' React non emette l'errore #418 (hydration mismatch).
async function collectConsoleErrors(page: import('@playwright/test').Page) {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

function hydrationErrors(errors: string[]): string[] {
  return errors.filter((e) => /hydrat|react error #418|#418/i.test(e))
}

test('fresh it-IT session renders the login page in Italian without hydration errors', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'it-IT' })
  const page = await context.newPage()
  const errors = await collectConsoleErrors(page)

  await page.goto('/login', { waitUntil: 'networkidle' })

  await expect(
    page.getByText('Accedi al tuo Vault'),
  ).toBeVisible()
  expect(await page.locator('html').getAttribute('lang')).toBe('it')
  // La lingua del server serializzata nello stream deve essere it
  expect(await page.evaluate(() => window.__STARWARD_SERVER_LANGUAGE__)).toBe('it')
  // Nessun errore di hydration di React (#418)
  expect(hydrationErrors(errors)).toEqual([])

  await context.close()
})

test('fresh en-US session renders the login page in English without hydration errors', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'en-US' })
  const page = await context.newPage()
  const errors = await collectConsoleErrors(page)

  await page.goto('/login', { waitUntil: 'networkidle' })

  await expect(
    page.getByText('Sign in to your Vault'),
  ).toBeVisible()
  expect(await page.locator('html').getAttribute('lang')).toBe('en')
  expect(await page.evaluate(() => window.__STARWARD_SERVER_LANGUAGE__)).toBe('en')
  expect(hydrationErrors(errors)).toEqual([])

  await context.close()
})
