
import { kmsProvider, transactionService, contractHelper } from '../src/index.mjs'
import { startNetwork, stopNetwork } from './utils/setup-evm-network.mjs'

describe('Sign and broadcast transaction', () => {
  let kmsAddress
  let kmsERC20ContractAddress
  const contractName = 'ERC20Token'

  beforeAll(async () => {
    const networkUp = await startNetwork()
    expect(networkUp).toBe(true)

    kmsAddress = await kmsProvider.getAddress(process.env.KMS_KEY_ID)
    expect(typeof kmsAddress).toBe('string')
  }, 10000)

  afterAll(stopNetwork)

  test('Should deploy ERC20 smart contract', async () => {
    const tokenName = 'MyCoin'
    const tokenSymbol = 'MYC'
    const tokenOwner = kmsAddress

    const unsignedTx = await transactionService.buildContractDeployTx({
      contractName,
      constructorArgs: [tokenOwner, tokenName, tokenSymbol],
      sender: kmsAddress,
    })

    const signedTx = await kmsProvider.signTx({
      tx: unsignedTx,
      sender: kmsAddress,
      keyId: process.env.KMS_KEY_ID,
    })

    const txReceipt = await transactionService.broadcastTx(signedTx)

    expect(typeof txReceipt).toBe('object')
    expect(typeof txReceipt.from).toBe('string')
    expect(txReceipt.from.toLocaleLowerCase()).toBe(kmsAddress.toLocaleLowerCase())
    expect(typeof txReceipt.contractAddress).toBe('string')

    kmsERC20ContractAddress = txReceipt.contractAddress
  })

  test('Should call mint function on deployed ERC20 smart contract', async () => {
    const functionName = 'mint'
    const functionArgs = [kmsAddress, 1000] // to, amount

    const unsignedTx = await transactionService.buildContractCallTx({
      contractName,
      sender: kmsAddress,
      contractFuncName: functionName,
      contractFuncArgs: functionArgs,
      contractAddress: kmsERC20ContractAddress,
    })

    const signedTx = await kmsProvider.signTx({
      tx: unsignedTx,
      sender: kmsAddress,
      keyId: process.env.KMS_KEY_ID,
    })

    const txReceipt = await transactionService.broadcastTx(signedTx)

    expect(typeof txReceipt).toBe('object')
    expect(typeof txReceipt.from).toBe('string')
    expect(txReceipt.from.toLocaleLowerCase()).toBe(kmsAddress.toLocaleLowerCase())
  })

  test('Should have minted 1000 tokens to the KMS address', async () => {
    const readOnlyContract = await contractHelper.getReadOnlyContract({
      contractName,
      contractAddress: kmsERC20ContractAddress
    })

    const balance = await readOnlyContract.balanceOf(kmsAddress)
    expect(balance).toBe(BigInt(1000))
  })
})
