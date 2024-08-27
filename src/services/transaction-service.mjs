import { Transaction } from 'ethers'
  
export class TransactionService {
  constructor({ provider, contractHelper }) {
    this.provider = provider // new JsonRpcProvider(rpcURL)
    this.contractHelper = contractHelper // new ContractHelper({  provider: this.provider })
  }

  async buildContractCallTx ({
    sender,
    contractName,
    contractAddress,
    contractFuncName,
    contractFuncArgs,
    serialize = true,
}) {
    const readOnlyContract = await this.contractHelper.getReadOnlyContract({
      contractName, contractAddress,
    })

    const { chainId } = await this.provider.getNetwork()
    const nonce = await this.provider.getTransactionCount(sender)
    const data = readOnlyContract.interface.encodeFunctionData(contractFuncName, contractFuncArgs)
    // TODO: add RPC call to get gas estimate

    // TODO: review gas estimation
    const unsignedTxPayload = {
      chainId,
      to: contractAddress,
      data, // Encoded function call data
      nonce,
      gasLimit: 200000,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
    }

    const unsignedTx = serialize // EIP-1559 transaction
      ? Transaction.from(unsignedTxPayload).unsignedSerialized
      : Transaction.from(unsignedTxPayload).toJSON()

    return {
      chainId,
      unsignedTx,
    }
  }

  async buildContractDeployTx ({
    sender,
    contractName,
    constructorArgs = [],
    serialize = true,
}) {
    const contractFactory = await this.contractHelper.getReadOnlyContractFactory({ contractName })

    const { chainId } = await this.provider.getNetwork()
    const nonce = await this.provider.getTransactionCount(sender)
    const { data } = await contractFactory.getDeployTransaction(...constructorArgs)

    // TODO: review gas estimation
    const unsignedTxPayload = {
      chainId,
      to: null, // Deploying contracts don't have a recipient
      nonce,
      data, // Bytecode plus encoded constructor arguments
      gasLimit: 3000000,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
    }

    const unsignedTx = serialize // EIP-1559 transaction
      ? Transaction.from(unsignedTxPayload).unsignedSerialized
      : Transaction.from(unsignedTxPayload).toJSON()

    return {
      chainId,
      unsignedTx,
    }
  }

  async broadcastTx(signedTx) {
    // https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_sendrawtransaction
    const txResponse = await this.provider.broadcastTransaction(signedTx)
    console.log('Transaction sent:', txResponse)
    const receipt = await txResponse.wait()

    return receipt
  }
}
