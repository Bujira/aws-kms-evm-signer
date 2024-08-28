
import { kmsProvider } from '../src/index.mjs'

test('Should return address from KMS Public Key', async () => {
  const kmsAddress = await kmsProvider.getAddress(process.env.KMS_KEY_ID)
  expect(typeof kmsAddress).toBe('string')
  expect(kmsAddress).toMatch(/^0x[a-fA-F0-9]{40}$/)
})
