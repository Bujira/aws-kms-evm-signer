import { kmsProvider } from "../src/index.mjs";

kmsProvider.getPublicKey()
  .then(async (pubKey) => {
    console.log(`Public Key: ${pubKey}`)
    const address = await kmsProvider.getAddress()
    console.log(`Address: ${address}`)
  }).catch(console.error)