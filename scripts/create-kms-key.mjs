import { kmsProvider } from "../src/index.mjs";

kmsProvider.createKey()
  .then(async (keyId) => {
    console.log(`Key ID: ${keyId}`)
    const [pubKey, address] = await Promise.all([
        kmsProvider.getPublicKey(keyId),
        kmsProvider.getAddress(keyId),
    ])
    console.log(`Public Key: ${pubKey}`)
    console.log(`Address: ${address}`)
  }).catch(console.error)