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
We start off creating a fresh pair of asymmetric ECDSA keys using AWS KMS. The KMS SDK `CreateKeyCommand` function will expect the following parameters:

KeySpec: 'ECC_SECG_P256K1'
       	KeyUsage: 'SIGN_VERIFY'
      	Origin: 'AWS_KMS'

```javascript
// JavaScript code snippet
```
	
From this response, you can obtain your KMS `keyId` that identifies your new key (we are not dealing with, or worrying about, IAM users and permissions here).

# 3. KMS DER-encoding
Before we move on to the next steps, we should take a second to better understand what is going on. We have just created an asymmetric ECDSA key pair. KMS will now store our private key and by design we will not have access to this key, so every transaction signature will be done inside the KMS, meaning that each signature will be in DER-encoded format. Our public key is stored in DER-encoded format as well and, same as the signatures, cannot yet be interpreted in EVM transactions.

Therefore, we will make use of ASN.1 schemas to decode and interpret both the DER-encoded public key as well as the DER-encoded transaction signature. The schemas will work as shown below, taking a DER-encoded value and with the appropriate schema decoding it to a format that can be adapted (parsed or assembled) to be used in EVM transactions. After running through the schemas, the public key will be returned in raw format with the first byte indicating if it is a compressed or uncompressed key; the signature will return the R and S values, needed to create a valid EVM transaction, as we'll see soon.

![decoding_kms_material](https://github.com/user-attachments/assets/dc4a2801-2cc5-4796-97d7-1e46f73bef11)

ASN.1, which is a notation, is used almost everywhere when you need to transmit data digitally. If you are not familiar with ASN.1, we highly encourage you to check it out at https://www.itu.int/en/ITU-T/asn1/Pages/introduction.aspx.

# 4. Retrieving the EVM public key

## 4.1. Retrieve the KMS-based public key
Now you have an asymmetric ECDSA key pair and you are able to retrieve the KMS-based public key value with the AWS SDK `GetPublicKeyCommand` function:

```javascript
// JavaScript code snippet
```

From this response, you can obtain your KMS-based public key, currently in DER-encoded format and not yet adapted for EVM operations.

## 4.2. Decode the KMS-based public key
Here we will use a specific ASN.1 schema to decode the KMS-based public key, as discussed before. 

```javascript
// JavaScript code snippet
```

From this response, you can obtain your EVM public key by removing the first byte (0x04). What is left is your EVM public key which is a large number that represents the x and y coordinates of a point in the elliptic curve. 

# 5. Calculating the EVM address
Since we now have an EVM public key, we can use it to derive the EVM public address associated with the key pair generated by KMS by creating a hash of the EVM public key and extracting the last 20 bytes of the hash.

```javascript
// JavaScript code snippet
```

We have successfully used an ASN.1 schema to decode a KMS-based public key and from that decoded key, derive our EVM public address.

# 6. Prepare the EVM transaction payload
Since we are dealing here with EVM-compatible gas free networks (eg.: a private Hyperledger Besu network), we must prepare our transaction payload accordingly, following EIP-1559 guidelines.

```javascript
// JavaScript code snippet
```

From this, we have a transaction payload ready to be manipulated and signed by our KMS-based private key.

# 7. Signing an EVM transaction
By now you've probably figured out the main reason why this document was created. We have already seen that KMS stores asymmetric key pairs in a format that is not directly compatible with EVM operations. You cannot just read the KMS-based public key and derive your EVM public address from it, without doing some decoding for compatibility. The same goes for the KMS-based signature. In order to sign an EVM transaction with KMS, we need to create a "digest" of the transaction payload, so that KMS can interpret the message and sign it correctly. Once signed, KMS will return to the user a KMS-based signature that is also not directly compatible with EVMs. Same as we did with the KMS-based public key, we must decode the KMS-based signature and assemble a valid EVM transaction. 

This is a crucial step of the process. If the unsigned transaction has flaws or if the signature format is carried out incorrectly by misinvoking KMS, we could end up with a valid KMS-based signature that will be successfully sent to an EVM-compatible blockchain, but the transaction will not correctly be associated with its sender.

## 7.1. Create the unsigned transaction
We have everything we need to start our signing process, so it's time to create a serialized unsigned transaction and then hash it. This will be our "digest". We serialize and hash the transaction payload in accordance with the RLP format expected by an EVM. After serializing the transaction payload, we create a buffer of the unsigned serialized transaction since AWS KMS expects the message to be in this format in order to be signed.

```javascript
// JavaScript code snippet
```

Your "digest", or message to be signed, is ready.

## 7.2. Sign the hashed unsigned transaction with KMS
At this step, we finally sign our transaction with KMS using the `SignCommand` function which will expect the following parameters:

KeyId: keyId
Message: digest
MessageType: 'DIGEST'
SigningAlgorithm: 'ECDSA_SHA_256'

```javascript
// JavaScript code snippet
```

Your transaction is now successfully signed and ready to be decoded.

## 7.3. Decode the signed transaction and retrieve the R and S values
The KMS-based signature is returned in an ASN.1 schema. This schema is specific for ECDSA signatures. We will use the KMS-based signature as input, and decode it using the respective ASN.1 schema.

```javascript
// JavaScript code snippet
```

From this response, we can obtain the R and S values of the elliptic curve (x and y coordinates of the signature, respectively). These values are crucial to identify the transaction signer without revealing the private key.

## 7.4. Validate the S value
We are not done yet, since we must validate the S value. The S value (y-coordinate) can assume two values in the elliptic curve (there are two possible values for y that satisfy the equation). We use the method below to figure out the S value that constitutes a valid EVM transaction signature. According to EIP-2, the S value cannot be greater than secp256k1n/2, where secp256k1n represents the max value for S defined for the particular elliptic curve. 

```javascript
// JavaScript code snippet
```

## 7.5. Calculate the V value
The last value we need to be able to assemble our valid EVM signed transaction is V. The value V is important because for EVM transactions, R, S and V are used to calculate the EVM public address of the sender associated with the transaction. The V value also prevents replay attacks as specified in EIP-155. 
This is another crucial operation, since messing up the calculation of the V value can create a valid EVM signature leading to a successful transaction that actually misrepresents the actual sender.

```javascript
// JavaScript code snippet
```

We are finally ready to assemble our valid EVM signed transaction.

## 7.6. Assemble signed EVM transaction
We are now able to assemble a valid EVM signed transaction, and for that we will use our serialized unsigned transaction together with the R, S and V values we retrieved from the decoded KMS-based signed transaction. Once this signed transaction is assembled, we will serialize it in order to be able to push it to the blockchain (remember here that EVM transactions expect a RLP encoding format).

```javascript
// JavaScript code snippet
```

Our job is done and our signed transaction is ready to be sent off.

# 8. Sending the transaction to the blockchain
All we do here is send the signed transaction and verify that it has been successfully inserted in the blockchain.

```javascript
// JavaScript code snippet
```

# 9. Conclusion
Content...
