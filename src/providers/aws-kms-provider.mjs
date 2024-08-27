import {
  KMSClient,
  SignCommand,
  // CreateKeyCommand,
  GetPublicKeyCommand,
} from "@aws-sdk/client-kms"
import * as asn1js from "asn1js"
import { keccak256, Transaction, recoverAddress } from "ethers"
import secp256k1 from 'secp256k1';
import BN from 'bn.js'

export class KMSProvider {
  constructor(config) {
    this.kms = new KMSClient(config)
  }

//   async createKMSKey() {
//     const createKeyCommand = new CreateKeyCommand({
//       KeySpec: 'ECC_SECG_P256K1',
//       KeyUsage: 'SIGN_VERIFY',
//       Origin: 'AWS_KMS',
//     });

//     const response = await this.kms.send(createKeyCommand);
//     const keyId = response.KeyMetadata?.KeyId;

//     return keyId
//   }

  async getAddress(keyId) {
    if (!keyId) {
        throw new Error('Key ID is required');
    }

    const publicKey = await this.getPublicKey(keyId);
    const address = this.#deriveAddress(publicKey);

    return address;
  }

  async getPublicKey(keyId) {
    if (!keyId) {
        throw new Error('Key ID is required');
    }

    const derPublicKey = await this.#getDerPublickey(keyId);
    const publicKey = this.#extractRawPublicKey(derPublicKey);

    return publicKey;
  }

  // async signTx({ tx, sender, keyId, chainId }) {}

  async #getDerPublickey(keyId)  {
    const getPublicKeyCommand = new GetPublicKeyCommand({
      KeyId: keyId
    })

    const response = await this.kms.send(getPublicKeyCommand);

    return Buffer.from(response.PublicKey);
  }

  #extractRawPublicKey(derPublicKey) {
    // https://www.rfc-editor.org/rfc/rfc5280#section-4.1
    // https://www.rfc-editor.org/rfc/rfc5480#section-2
    const subjectPublicKeyInfoSchema = new asn1js.Sequence({
      value: [
        new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier()] }),
        new asn1js.BitString({ name: "subjectPublicKey" }),
      ]
    });

    const parsed = asn1js.verifySchema(derPublicKey, subjectPublicKeyInfoSchema);
    if (!parsed.verified) {
      throw new Error(`Publickey: failed to parse. ${parsed.result.error}`);
    }
    const subjectPublicKey = parsed.result.subjectPublicKey.valueBlock.valueHex;
    
    /*
     * Remove the first byte (0x04) from the public key
     * https://www.rfc-editor.org/rfc/rfc5480#section-2.2
    */
    const publickey = subjectPublicKey.slice(1); 

    return Buffer.from(publickey);
  }

  #deriveAddress(publicKey) {
    // Hash the public key using keccak256
    const publicKeyHash = Buffer.from(keccak256(publicKey).slice(2), 'hex');

    // Take the last 20 bytes of the hash
    const last20Bytes = publicKeyHash.subarray(-20);

    // Add the prefix 0x and convert the bytes to a hex string
    const address = `0x${last20Bytes.toString('hex')}`;

    return address;
  }

  async signTx1({ tx, sender, keyId, chainId }) {
    const txClone = Transaction.from(tx)

    // Hash the serialized transaction using keccak256
    const rlpTx = txClone.unsignedSerialized
    console.log('RLP Transaction:', rlpTx)

    // const txHash = keccak256(rlpTx)
    const txHash = keccak256(Buffer.from('picanha é muito bommmm!'))
    console.log('Transaction Hash:', txHash)

    // Convert the hash to a buffer
    const digest = Buffer.from(txHash.slice(2), 'hex')
    console.log('Digest:', digest.toString('hex'))

    const signCommand = new SignCommand({
      KeyId: keyId,
      Message: digest,
      MessageType: "DIGEST", // NOTE: if you use RAW, KMS will hash the message for you (we don't want that here)
      SigningAlgorithm: "ECDSA_SHA_256",
    })
    const response = await this.kms.send(signCommand)
    
    const signedMessage = Buffer.from(response.Signature)
    // const signedMessage = Buffer.from('MEUCIFJXc8pE6i9ZurkoZ9hHTO8sV5Jr2E+Bw4iDW+KP0YIlAiEA4ra4EUNhq7GutNDiFxOgjr/TCoYOPC2keiM0MKQpz+w=', 'base64')
    console.log('KMS Sign Response')
    console.log(signedMessage.toString('base64'))

    const { r, s } = this.#decodeRS(signedMessage)
    // const { v } = calculateV(signedMessage, chainId)
    const v = this.#calculateV(sender, digest, r, s, chainId);

    const signedTx = Transaction.from({
      ...txClone.toJSON(),
      signature: {
        r: '0x' + r.toString('hex'),
        s: '0x' + s.toString('hex'),
        v
      }
    })
    console.log(signedTx.toJSON())
    console.log(signedTx.serialized)
    return signedTx.serialized
  }
  async signTx({ tx, sender, keyId, chainId }) {
    console.log({ tx, sender, keyId, chainId })

    const txClone = Transaction.from(tx)

    // Hash the serialized transaction using keccak256
    const rlpTx = txClone.unsignedSerialized
    console.log('RLP Transaction:', rlpTx)

    const txHash = keccak256(rlpTx)
    console.log('Transaction Hash:', txHash)

    // Convert the hash to a buffer
    const digest = Buffer.from(txHash.slice(2), 'hex')
    console.log('Digest:', digest.toString('hex'))

    const signCommand = new SignCommand({
      KeyId: keyId,
      Message: digest,
      MessageType: "DIGEST", // NOTE: if you use RAW, KMS will hash the message for you (we don't want that here)
      SigningAlgorithm: "ECDSA_SHA_256",
    })
    const response = await this.kms.send(signCommand)
    
    const signedMessage = Buffer.from(response.Signature)
    // const signedMessage = Buffer.from('MEUCIFJXc8pE6i9ZurkoZ9hHTO8sV5Jr2E+Bw4iDW+KP0YIlAiEA4ra4EUNhq7GutNDiFxOgjr/TCoYOPC2keiM0MKQpz+w=', 'base64')

    const { r, s } = this.#decodeRS(signedMessage)
    // const { v } = calculateV(signedMessage, chainId)
    const v = this.#calculateV(sender, digest, r, s, chainId);

    const signedTx = Transaction.from({
      ...txClone.toJSON(),
      signature: {
        r: '0x' + r.toString('hex'),
        s: '0x' + s.toString('hex'),
        v
      }
    })
    console.log(signedTx.toJSON())
    console.log(signedTx.serialized)
    return signedTx.serialized
  }


  #decodeRS(signature) {
    // https://www.rfc-editor.org/rfc/rfc3279#section-2.2.3
    const ecdsaSigValueSchema = new asn1js.Sequence({ value: [
      new asn1js.Integer({ name: "r" }),
      new asn1js.Integer({ name: "s" }),
    ]});

    const parsed = asn1js.verifySchema(signature, ecdsaSigValueSchema);
    if (!parsed.verified) {
      throw new Error("Failed to parse signature");
    }
  
    const r = new BN(Buffer.from(parsed.result.r.valueBlock.valueHex));
    let s = new BN(Buffer.from(parsed.result.s.valueBlock.valueHex));
  
    console.log({ r: r.toString('hex'), s: s.toString('hex') })
    console.log({ r: r.toString(), s: s.toString() })
  
    let secp256k1N = new BN("fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141", 16); // max value on the curve
    let secp256k1halfN = secp256k1N.div(new BN(2)); // half of the curve
    if (s.gt(secp256k1halfN)) {
      s = secp256k1N.sub(s);
      console.log({ s: s.toString('hex') })
      console.log({ s: s.toString() })
    }
    return { r: r.toBuffer(), s: s.toBuffer() }
  }
  
   #calculateV(address, digest, r, s, chainId) {
    const publicKey = secp256k1.ecdsaRecover(new Uint8Array(Buffer.concat([r, s])), 0, digest, false);
    const recoveredAddress = `0x${keccak256(publicKey.slice(1)).slice(-40)}`;
  
    if (recoveredAddress.toLowerCase() === address.toLowerCase()) {
      return Number(chainId) * 2 + 35; // v = 27 + chainId * 2 + 8 (EIP-1559)
    } else { // TODO: check if the address is the same for the other v value
      return Number(chainId) * 2 + 36; // v = 28 + chainId * 2 + 8 (EIP-1559)
    }
  }
}
