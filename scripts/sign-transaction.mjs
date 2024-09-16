import { kmsProvider, transactionService } from "../src/index.mjs";

// unsigned EIP-1559 transaction
const unsignedTx = {
    chainId: 31337, // Hardhat network chain ID
    to: '0x',
    data: '0x', // Encoded function call data (if your transaction is a contract call)
    nonce: 0,
    gasLimit: 21000,
    maxFeePerGas: 0,
    maxPriorityFeePerGas: 0,
  }

kmsProvider.getAddress()
  .then(async (address) => {
    const signedTx = await kmsProvider.signTx({
        tx: unsignedTx,
        sender: address,
        keyId: process.env.KMS_KEY_ID
    })
    console.log(`Signed Transaction: ${signedTx}`)

    const receipt = await transactionService.broadcastTx(signedTx)
    console.log(`Transaction Receipt: ${JSON.stringify(receipt, null, 2)}`)
  }).catch(console.error)
