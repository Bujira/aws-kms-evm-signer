import { JsonRpcProvider } from 'ethers'
import { KMSProvider } from './providers/aws-kms-provider.mjs'
import { TransactionService } from './services/transaction-service.mjs'
import { ContractHelper } from './utils/contract-helper.mjs'

const rpcURL = process.env.RPC_PROVIDER_URL
const kmsConfig = { region: process.env.AWS_REGION }

const provider = new JsonRpcProvider(rpcURL)

export const kmsProvider = new KMSProvider(kmsConfig)
export const contractHelper = new ContractHelper({ provider })
export const transactionService = new TransactionService({ provider, contractHelper })
