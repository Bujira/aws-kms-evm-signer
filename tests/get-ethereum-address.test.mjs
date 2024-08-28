
import { isAddress, getAddress } from 'ethers'
import { kmsProvider } from '../src/index.mjs'

describe('Get Ethereum address', () => {
  let kmsAddress

  beforeAll(async () => {
    kmsAddress = await kmsProvider.getAddress(process.env.KMS_KEY_ID)
  })

  test('Should return a valid Ethereum address', () => {
    expect(isAddress(kmsAddress)).toBe(true)
  })

  test('Should return a checksummed Ethereum address', () => {
    expect(isValidChecksumAddress(kmsAddress)).toBe(true)
  })
})

function isValidChecksumAddress(address) {
  // Check if the address is all lowercase or all uppercase
  const isAllLowercase = address === address.toLowerCase()
  const isAllUppercase = address === address.toUpperCase()
  if (isAllLowercase || isAllUppercase) {
    return false
  }

  try {
    getAddress(address)
    return true
  } catch {
    return false
  }
}
