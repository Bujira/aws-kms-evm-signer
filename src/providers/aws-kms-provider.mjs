import {
  KMSClient,
  SignCommand,
  CreateKeyCommand,
  GetPublicKeyCommand,
} from '@aws-sdk/client-kms'
import BN from 'bn.js'
import * as asn1js from 'asn1js'
import { Transaction, keccak256, getAddress, recoverAddress } from 'ethers'

export class KMSProvider {
  constructor(config) {
    this.kms = new KMSClient(config)
  }

  async createKey() {
    const createKeyCommand = new CreateKeyCommand({
      KeySpec: 'ECC_SECG_P256K1',
      KeyUsage: 'SIGN_VERIFY',
      Origin: 'AWS_KMS',
    })

    const response = await this.kms.send(createKeyCommand)
    const keyId = response.KeyMetadata?.KeyId

    return keyId
  }

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

    const derPublicKey = await this.#getKMSPublickey(keyId)
    const publicKey = this.#extractRawPublicKey(derPublicKey)

    return publicKey
  }

  async #getKMSPublickey(keyId) {
    /* 
     * According to the AWS KMS GetPublicKey API reference: https://docs.aws.amazon.com/kms/latest/APIReference/API_GetPublicKey.html
     * The response will be a DER-encoded X.509 public key, also known as SubjectPublicKeyInfo, as defined in RFC 5480
    */
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

    // Parse the DER-encoded signature
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

    /*
      According to the AWS KMS Sign API reference: https://docs.aws.amazon.com/kms/latest/APIReference/API_Sign.html#KMS-Sign-response-Signature
      When using the ECDSA_SHA_256 algorithm, the response will be a DER-encoded object as specified by ANSI X9.62–2005 and RFC 3279 Section 2.2.3
    */
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
    const ecdsaSigValueSchema = new asn1js.Sequence({
      value: [
        new asn1js.Integer({ name: 'r' }),
        new asn1js.Integer({ name: 's' }),
      ]
    })

    // Parse the DER-encoded signature
    const parsed = asn1js.verifySchema(signature, ecdsaSigValueSchema)
    if (!parsed.verified) {
      throw new Error('Failed to parse signature')
    }
    const r = new BN(Buffer.from(parsed.result.r.valueBlock.valueHex))
    let s = new BN(Buffer.from(parsed.result.s.valueBlock.valueHex))

    s = this.#validateS(s)

    return {
      r: `0x${r.toString('hex')}`,
      s: `0x${s.toString('hex')}`,
    }
  }

  #validateS(s) {
    /*
     * According to secg.org: https://www.secg.org/sec2-v2.pdf section 2.4.1 (page 9)
     * The order n of G for the secp256k1 curve is: FFFFFFFF FFFFFFFF FFFFFFFF FFFFFFFE BAAEDCE6 AF48A03B BFD25E8C D0364141
    */
    let secp256k1N = new BN('fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141', 16) // max value on the curve
    let secp256k1halfN = secp256k1N.div(new BN(2)) // half of the curve

    if (s.gt(secp256k1halfN)) {
      /* 
       * According to the EIP-2: https://eips.ethereum.org/EIPS/eip-2
       * The s value should be less than or equal to the secp256k1N/2 to prevent transaction malleability
       * If s > secp256k1N/2, then s = secp256k1N - s
      */
      s = secp256k1N.sub(s) // Flip the s value
    }

    return s
  }

  #calculateV(address, digest, r, s, chainId) {
    /*
    * According to EIP-155: https://eips.ethereum.org/EIPS/eip-155
    * The original `v` value (also known as the recovery ID) can be either 27 or 28.
    * When applying EIP-155, the `v` value is modified to include the `chainId`.
    * The final `v` value becomes:
    *   v = chainId * 2 + 35, if the original `v` was 27
    *   v = chainId * 2 + 36, if the original `v` was 28
    * This modification ensures that signatures are unique to the specific blockchain network.
    * 
    * Since AWS KMS only returns the `r` and `s` values (not the recovery ID),
    * we must determine the correct `v` value by checking which of the two possible 
    * addresses (derived using `v = 27` or `v = 28`) matches the original address.
    * The final `v` value is then calculated using the matching recovery ID.
    */

    const addressCandidateA = recoverAddress(digest, { r, s, v: 27 })
    const addressCandidateB = recoverAddress(digest, { r, s, v: 28 })

    if (addressCandidateA.toLocaleLowerCase() === address.toLocaleLowerCase()) {
      return Number(chainId) * 2 + 35
    } else if (addressCandidateB.toLocaleLowerCase() === address.toLocaleLowerCase()) {
      return Number(chainId) * 2 + 36
    }

    throw new Error(`Recovered address from signature does not match sender's address`)
  }
}
