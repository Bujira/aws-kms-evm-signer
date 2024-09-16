# KMS EVM Signer

This project provides a way to sign EVM transactions using AWS KMS (Key Management Service) with an asymmetric key. It leverages AWS KMS to secure private key management while enabling EVM-compatible signatures.

For a deeper understanding of the underlying mechanics, refer to the [detailed guide](./docs/STEP-BY-STEP.md).

## Pre-Requisites

Before getting started, ensure you have the following:

- [Node.js](https://nodejs.org/en)
- An [AWS Account](https://aws.amazon.com/account/)

**Note:** Ensure you are running these commands in a bash terminal with your AWS credentials configured.

## Setup Environment Variables

Create a `.env` file at the root of the project based on the provided `.env.example` template.

```bash
cp .env.example .env
```

Replace the placeholder values in the .env file with your own configuration:

 - `AWS_REGION` - The AWS region where your KMS key is located.
 - `KMS_KEY_ID` - The ID of the KMS Asymmetric key used for signing (If you already have a KMS key).
 - `RPC_PROVIDER_URL` - The URL of the Ethereum-compatible RPC provider. You can use Hardhat's default URL (http://localhost:8545) for local testing.

## Install Dependencies

Run the following command to install the project dependencies:

```bash
npm install
```

## Create Asymmetric KMS Key

If you don't already have an AWS KMS key, you can create one by running:

```bash
npm run create-key
```

Once the key is created, update your .env file with the `KMS_KEY_ID` value.

## Run End-to-End Test

This test will deploy a simple smart contract, sign a transaction using KMS, and broadcast it to your `RPC_PROVIDER_URL`.

```bash
npm run test -- --silent --verbose
```

## Get KMS Key Info

You can retrieve the public key and address of the KMS key by running the `get-key-info` script.

```bash
npm run get-key-info
```


## Sign Your Own Transaction

You can sign a custom transaction by running the `sign-transaction` script. First, update the transaction object in the `./scripts/sign-transaction.mjs` file with the transaction details.

```bash
npm run sign-tx
```
