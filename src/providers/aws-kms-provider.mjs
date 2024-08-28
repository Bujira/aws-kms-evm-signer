import {
  KMSClient,
  SignCommand,
  // CreateKeyCommand,
  GetPublicKeyCommand,
} from '@aws-sdk/client-kms'
import BN from 'bn.js'
import * as asn1js from 'asn1js'
import { Transaction, keccak256, getAddress, recoverAddress } from 'ethers'

export class KMSProvider {
  constructor(config) {
    this.kms = new KMSClient(config)
  }

  //   async createKMSKey() {
  //     const createKeyCommand = new CreateKeyCommand({
  //       KeySpec: 'ECC_SECG_P256K1',
  //       KeyUsage: 'SIGN_VERIFY',
  //       Origin: 'AWS_KMS',
  //     })

  //     const response = await this.kms.send(createKeyCommand)
  //     const keyId = response.KeyMetadata?.KeyId

  //     return keyId
  //   }

  async getAddress(keyId) {
    if (!keyId) {
      throw new Error('Key ID is required')
    }

    const publicKey = await this.getPublicKey(keyId)
    const address = this.#deriveAddress(publicKey)

    return address
  }

  async getPublicKey(keyId) {
    if (!keyId) {
      throw new Error('Key ID is required')
    }

    const derPublicKey = await this.#getDerPublickey(keyId)
    const publicKey = this.#extractRawPublicKey(derPublicKey)

    return publicKey
  }

  async #getDerPublickey(keyId)  {
    const getPublicKeyCommand = new GetPublicKeyCommand({
      KeyId: keyId,
    })

    const response = await this.kms.send(getPublicKeyCommand)

    return Buffer.from(response.PublicKey)
  }

  #extractRawPublicKey(derPublicKey) {
    // https://www.rfc-editor.org/rfc/rfc5280#section-4.1
    // https://www.rfc-editor.org/rfc/rfc5480#section-2
    const subjectPublicKeyInfoSchema = new asn1js.Sequence({
      value: [
        new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier()] }),
        new asn1js.BitString({ name: 'subjectPublicKey' }),
      ],
    })

    const parsed = asn1js.verifySchema(derPublicKey, subjectPublicKeyInfoSchema)
    if (!parsed.verified) {
      throw new Error(`Publickey: failed to parse. ${parsed.result.error}`)
    }
    const subjectPublicKey = parsed.result.subjectPublicKey.valueBlock.valueHex

    /*
     * Remove the first byte (0x04) from the public key
     * https://www.rfc-editor.org/rfc/rfc5480#section-2.2
    */
    const publickey = subjectPublicKey.slice(1)

    return Buffer.from(publickey)
  }

  #deriveAddress(publicKey) {
    // Hash the public key using keccak256
    const publicKeyHash = Buffer.from(keccak256(publicKey).slice(2), 'hex')

    // Take the last 20 bytes of the hash
    const last20Bytes = publicKeyHash.subarray(-20)

    // Add the prefix 0x and convert the bytes to a hex string
    const address = `0x${last20Bytes.toString('hex')}`

    // Use ethers.js to checksum the address (EIP-55)
    const checkSummedAddress = getAddress(address)

    return checkSummedAddress
  }

  async signTx({ tx, sender, keyId }) {
    const unsignedTx = Transaction.from(tx)

    // Hash the serialized transaction using keccak256
    const rlpUnsignedTx = unsignedTx.unsignedSerialized
    const unsignedTxHash = keccak256(rlpUnsignedTx).slice(2) // remove the 0x prefix

    // Convert the hash to a buffer
    const digest = Buffer.from(unsignedTxHash, 'hex')

    const signCommand = new SignCommand({
      KeyId: keyId,
      Message: digest,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    })
    const response = await this.kms.send(signCommand)
    const ecdsaSignature = Buffer.from(response.Signature)

    const { r, s } = this.#decodeRS(ecdsaSignature)
    const v = this.#calculateV(sender, digest, r, s, unsignedTx.chainId)

    const signedTx = Transaction.from({
      ...unsignedTx.toJSON(),
      signature: { r, s, v },
    })

    return signedTx.serialized
  }


  #decodeRS(signature) {
    // https://www.rfc-editor.org/rfc/rfc3279#section-2.2.3
    const ecdsaSigValueSchema = new asn1js.Sequence({ value: [
      new asn1js.Integer({ name: 'r' }),
      new asn1js.Integer({ name: 's' }),
    ]})

    const parsed = asn1js.verifySchema(signature, ecdsaSigValueSchema)
    if (!parsed.verified) {
      throw new Error('Failed to parse signature')
    }
    const r = new BN(Buffer.from(parsed.result.r.valueBlock.valueHex))
    let s = new BN(Buffer.from(parsed.result.s.valueBlock.valueHex))

    let secp256k1N = new BN('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 16) // max value on the curve
    let secp256k1halfN = secp256k1N.div(new BN(2)) // half of the curve
    if (s.gt(secp256k1halfN)) {
      s = secp256k1N.sub(s)
    }

    return {
      r: `0x${r.toString('hex')}`,
      s: `0x${s.toString('hex')}`,
    }
  }

  #calculateV(address, digest, r, s, chainId) {
    const addressCandidateA = recoverAddress(digest, { r, s, v: 27 })
    const addressCandidateB = recoverAddress(digest, { r, s, v: 28 })

    if (addressCandidateA.toLocaleLowerCase() === address.toLocaleLowerCase()) {
      return Number(chainId) * 2 + 35
    } else if (addressCandidateB.toLocaleLowerCase() === address.toLocaleLowerCase()) {
      return Number(chainId) * 2 + 36
    }

    throw new Error('There was a problem calculating the V value')
  }
}
