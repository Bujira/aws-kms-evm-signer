# EVM, Gas Free (Private) Blockchains and AWS KMS

# Summary

- [1. Introduction](#1-introduction)
- [2. Creating an EVM-compatible key with AWS KMS](#2-creating-an-evm-compatible-key-with-aws-kms)
- [3. KMS DER-encoding](#3-kms-der-encoding)
- [4. Retrieving the EVM public key](#4-retrieving-the-evm-public-key)
  - [4.1. Retrieve the KMS-based public key](#41-retrieve-the-kms-based-public-key)
  - [4.2. Decode the KMS-based public key](#42-decode-the-kms-based-public-key)
- [5. Calculating the EVM address](#5-calculating-the-evm-address)
- [6. Prepare the EVM transaction payload](#6-prepare-the-evm-transaction-payload)
- [7. Signing an EVM transaction](#7-signing-an-evm-transaction)
  - [7.1. Create the unsigned transaction](#71-create-the-unsigned-transaction)
  - [7.2. Sign the hashed unsigned transaction with KMS](#72-sign-the-hashed-unsigned-transaction-with-kms)
  - [7.3. Decode the signed transaction and retrieve the R and S values](#73-decode-the-signed-transaction-and-retrieve-the-r-and-s-values)
  - [7.4. Validate the S value](#74-validate-the-s-value)
  - [7.5. Calculate the V value](#75-calculate-the-v-value)
  - [7.6. Assemble signed EVM transaction](#76-assemble-signed-evm-transaction)
- [8. Sending the transaction to the blockchain](#8-sending-the-transaction-to-the-blockchain)
- [9. Conclusion](#9-conclusion)

---

# 1. Introduction
First things first, this blog post covers three main topics: creating an EVM compatible KMS key pair, signing an EVM transaction with KMS and sending an EVM transaction to a gas free (private) blockchain. All of this using NodeJS, JavaScript and an EVM-compatible gas free blockchain.

For the first topic, the text is pretty straightforward. We will create an EVM compatible key pair using AWS KMS, no tricks involved. When we say EVM compatible, that means we will use KMS to create an asymmetric ECDSA key pair using the secp256k1 curve.

The second topic is where things get really interesting. We will sign an EVM transaction using the KMS key pair we created. If you are familiar with KMS, it stores its keys using DER-encoded format, which is a standard ASN.1 structure, more specifically a X.509 certificate structure (we will talk more about ASN.1 later on). This format is different from the format of public and private keys used in EVM transactions, which are numbers represented in hexadecimal strings. Therefore, there is a need to decode the KMS-based (DER format) public key in order to be able to retrieve the EVM public address of the key. Once the transaction is signed using KMS, the KMS-based signed transaction also needs to be decoded in order to assemble a valid signed EVM transaction. No more spoilers, we will dive into this topic in more detail later on.

Finally, we send the signed transaction to an EVM-compatible gas free blockchain, in accordance with EIP-1559. Note that you could easily adapt this solution to use KMS to sign and send transactions to a public EVM-compatible blockchain; all you would need to do is perform a few tweaks in the EVM transaction payload presented later in this blog post.

Throughout this text, we will often refer to a DER-encoded public key or a DER-encoded signature simply as KMS-based public key or KMS-based signature, respectively.

# 2. Creating an EVM-compatible key with AWS KMS
We start off creating a fresh pair of asymmetric ECDSA keys using AWS KMS. The KMS SDK `CreateKeyCommand` function should be invoked as follows:

```javascript
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
```
	
From this response, you can obtain your KMS `keyId` that identifies your new key (we are not dealing with, or worrying about, IAM users and permissions here).

# 3. KMS DER-encoding
Before we move on to the next steps, we should take a second to better understand what is going on. We have just created an asymmetric ECDSA key pair. KMS will now store our private key and by design we will not have access to this key, so every transaction signature will be done inside the KMS, meaning that each signature will be in DER-encoded format. Our public key is stored in DER-encoded format as well and, same as the signatures, cannot yet be interpreted in EVM transactions.

Therefore, we will make use of ASN.1 schemas to decode and interpret both the DER-encoded public key as well as the DER-encoded transaction signature. The schemas will work as shown below, taking a DER-encoded value and with the appropriate schema decoding it to a format that can be adapted (parsed or assembled) to be used in EVM transactions. After running through the schemas, the public key will be returned in raw format with the first byte indicating if it is a compressed or uncompressed key; the signature will return the R and S values, needed to create a valid EVM transaction, as we'll see soon.

![decoding_kms_material](https://github.com/user-attachments/assets/dc4a2801-2cc5-4796-97d7-1e46f73bef11)

ASN.1 is a standard interface for defining and encoding data structures, commonly used in cryptographic and network protocols. It is used almost everywhere when you need to transmit data digitally. If you are not familiar with ASN.1, we highly encourage you to check it out at https://www.itu.int/en/ITU-T/asn1/Pages/introduction.aspx.

# 4. Retrieving the EVM public key

## 4.1. Retrieve the KMS-based public key
Now you have an asymmetric ECDSA key pair and you are able to retrieve the KMS-based public key value with the AWS SDK `GetPublicKeyCommand` function:

```javascript
async #getKMSPublicKey(keyId)  {
    /* 
     * According to the AWS KMS GetPublicKey API reference: https://docs.aws.amazon.com/kms/latest/APIReference/API_GetPublicKey.html
     * The response will be a DER-encoded X.509 public key, also known as SubjectPublicKeyInfo
     * That means that the public key is wrapped in a specific ASN.1 structure defined by RFC 5480
    */
    const getPublicKeyCommand = new GetPublicKeyCommand({
      KeyId: keyId,
    })
    const response = await this.kms.send(getPublicKeyCommand)

    return Buffer.from(response.PublicKey)
  }
```

From this response, you can obtain your KMS-based public key, currently in DER-encoded format and not yet adapted for EVM operations.

## 4.2. Decode the KMS-based public key
Here we will use a specific ASN.1 schema to decode the KMS-based public key, as discussed before. 

```javascript
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
```

From this response, you can obtain your EVM public key by removing the first byte (0x04). What is left is your EVM public key which is a large number that represents the x and y coordinates of a point in the elliptic curve. 

# 5. Calculating the EVM address
Since we now have an EVM public key, we can use it to derive the EVM public address associated with the key pair generated by KMS by creating a hash of the EVM public key and extracting the last 20 bytes of the hash.

```javascript
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
```

We have successfully used an ASN.1 schema to decode a KMS-based public key and from that decoded key, derive our EVM public address.

# 6. Prepare the EVM transaction payload
Since we are dealing here with EVM-compatible gas free networks (eg.: a private Hyperledger Besu network), we must prepare our transaction payload accordingly, following EIP-1559 guidelines. Note that our EVM-compatible provider has already been instantiated so we can communicate with the blockchain.

```javascript
   const [{ chainId }, nonce, gasLimit] = await Promise.all([
      this.provider.getNetwork(),
      this.provider.getTransactionCount(sender),
      this.provider.estimateGas({
        from: sender,
        to: contractAddress,
        data: txData,
      }),
    ])

    // unsigned EIP-1559 transaction
    const unsignedTx = {
      chainId,
      to: contractAddress, // txData will interact with a function from this contract
      data: txData, // Encoded function call data
      nonce,
      gasLimit,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
    }
```

From this, we have a transaction payload ready to be manipulated and signed by our KMS-based private key.

# 7. Signing an EVM transaction
By now you've probably figured out the main reason why this document was created. We have already seen that KMS stores asymmetric key pairs in a format that is not directly compatible with EVM operations. You cannot just read the KMS-based public key and derive your EVM public address from it, without doing some decoding for compatibility. The same goes for the KMS-based signature. In order to sign an EVM transaction with KMS, we need to create a "digest" of the transaction payload, so that KMS can interpret the message and sign it correctly. Once signed, KMS will return to the user a KMS-based signature that is also not directly compatible with EVMs. Same as we did with the KMS-based public key, we must decode the KMS-based signature and assemble a valid EVM transaction. 

This is a crucial step of the process. If the unsigned transaction has flaws or if the signature format is carried out by incorrectly invoking KMS, we could end up with a valid KMS-based signature that will be successfully sent to an EVM-compatible blockchain, but the transaction will not correctly be associated with its sender.

## 7.1. Create the unsigned transaction
We have everything we need to start our signing process, so it's time to create a serialized unsigned transaction and then hash it. This will be our "digest". We serialize and hash the transaction payload in accordance with the RLP format expected by an EVM. After serializing the transaction payload, we create a buffer of the unsigned serialized transaction since AWS KMS expects the message to be in this format in order to be signed.

```javascript
    const unsignedTx = Transaction.from(tx) // Transaction is imported from ethers

    // Hash the serialized transaction using keccak256
    const rlpUnsignedTx = unsignedTx.unsignedSerialized
    const unsignedTxHash = keccak256(rlpUnsignedTx).slice(2) // remove the 0x prefix

    // Convert the hash to a buffer
    const digest = Buffer.from(unsignedTxHash, 'hex')
```

Your "digest", or message to be signed, is ready.

## 7.2. Sign the hashed unsigned transaction with KMS
At this step, we finally sign our transaction with KMS using the `SignCommand` function which will expect the following parameters:

```javascript
    const signCommand = new SignCommand({
      KeyId: keyId,
      Message: digest,
      MessageType: 'DIGEST',
      SigningAlgorithm: 'ECDSA_SHA_256',
    })
    const response = await this.kms.send(signCommand)
    const ecdsaSignature = Buffer.from(response.Signature)
```

Your transaction is now successfully signed and ready to be decoded.

## 7.3. Decode the signed transaction and retrieve the R and S values
The KMS-based signature is returned in an ASN.1 schema. This schema is specific for ECDSA signatures. We will use the KMS-based signature as input, and decode it using the respective ASN.1 schema.

```javascript
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

    s = this.#validateS(s) // Validate the S value in accordance with EIP-2

    return {
      r: `0x${r.toString('hex')}`,
      s: `0x${s.toString('hex')}`,
    }
  }
```

From this response, we can obtain the R and S values, where R is the x-coordinate of the curve point generated during signing and S is a scalar computed from an arithmetic operation. These values are crucial to identify the transaction signer without revealing the private key.

## 7.4. Validate the S value
We are not done yet, since we must validate the S value which can assume two different values. We use the method below to figure out the S value that constitutes a valid EVM transaction signature. According to EIP-2, the S value cannot be greater than secp256k1n/2, where secp256k1n represents the max value for S defined for the particular elliptic curve. 

```javascript
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
```

## 7.5. Calculate the V value
The last value we need to be able to assemble our valid EVM signed transaction is V. The value V is important because for EVM transactions, R, S and V are used to calculate the EVM public address of the sender associated with the transaction. The V value also prevents replay attacks as specified in EIP-155. 
This is another crucial operation, since messing up the calculation of the V value can create a valid EVM signature leading to a successful transaction that actually misrepresents the actual sender.

```javascript
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
```

We are finally ready to assemble our valid EVM signed transaction.

## 7.6. Assemble signed EVM transaction
We are now able to assemble a valid EVM signed transaction, and for that we will use our serialized unsigned transaction together with the R, S and V values we retrieved from the decoded KMS-based signed transaction. Once this signed transaction is assembled, we will serialize it in order to be able to push it to the blockchain (remember here that EVM transactions expect a RLP encoding format). Finally, the serialized signed transaction is decoded as a hexadecimal string (the ethers lib already takes care of this step).

```javascript
    const { r, s } = this.#decodeRS(ecdsaSignature)
    const v = this.#calculateV(sender, digest, r, s, unsignedTx.chainId)

 const signedTx = Transaction.from({
      ...unsignedTx.toJSON(),
      signature: { r, s, v },
    })

    return signedTx.serialized // Decoded as a hexadecimal string
```

Our job is done and our signed transaction is ready to be sent off.

# 8. Sending the transaction to the blockchain
All we do here is send the signed transaction and verify that it has been successfully inserted in the blockchain.

```javascript
  async broadcastTx(signedTx) {
    // https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_sendrawtransaction
    const txResponse = await this.provider.broadcastTransaction(signedTx)
    const receipt = await txResponse.wait()

    return receipt
  }
```

# 9. Conclusion
AWS KMS is a great tool to securely store your private keys and use them to sign EVM transactions. As we have learned here, KMS will store your keys in DER format, so you must decode them to a format that EVM transactions can interpret. The same happens to your KMS-based signed transaction. The process of understanding the difference of data formats between KMS and EVM-compatible blockchains ends up taking you on a journey that helps you better understand about EVM transactions, elliptic curves, and what goes on under the hood of assembling a valid signed EVM transaction. It also teaches you about ASN.1 which is something that surrounds your daily life and maybe you hadn't taken notice. If you dive a little deeper into ASN.1, for instance, you'll find out that by understanding how the DER format works, you can distinguish the public key value from a KMS-based public key by translating its byte sequence in order to find the public key (we could have used one line of code in the `extractRawPublicKey` function; we did not for code consistency and didactic purposes). This journey also points out to you many changes implemented by different EIPs and how it progressively changes the way EVM-compatible blockchains work and why. We also learned a valuable lesson: the possibility of as miscalculation of the V value that could misinform the sender's identity. Hopefully you've learned a lot and can make use of KMS in your future web3 projects. Happy coding.
