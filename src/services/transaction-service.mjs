export class TransactionService {
  constructor({ provider, contractHelper }) {
    this.provider = provider;
    this.contractHelper = contractHelper;
  }

  async buildContractCallTx ({
    sender,
    contractName,
    contractAddress,
    contractFuncName,
    contractFuncArgs = [],
  }) {
    const readOnlyContract = await this.contractHelper.getReadOnlyContract({
      contractName, contractAddress,
    })
    const txData = readOnlyContract.interface.encodeFunctionData(
      contractFuncName, contractFuncArgs
    )

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
      to: contractAddress,
      data: txData, // Encoded function call data
      nonce,
      gasLimit,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
    }

    return unsignedTx
  }

  async buildContractDeployTx ({
    sender,
    contractName,
    constructorArgs = [],
  }) {
    const contractFactory = await this.contractHelper.getReadOnlyContractFactory({ contractName })
    const { data: txData } = await contractFactory.getDeployTransaction(...constructorArgs)

    const [{ chainId }, nonce, gasLimit] = await Promise.all([
      this.provider.getNetwork(),
      this.provider.getTransactionCount(sender),
      this.provider.estimateGas({ data: txData })
    ]) 

    // unsigned EIP-1559 transaction
    const unsignedTx = {
      chainId,
      to: null, // Deploying contracts don't have a recipient
      nonce,
      data: txData, // Bytecode plus encoded constructor arguments
      gasLimit,
      maxFeePerGas: 0,
      maxPriorityFeePerGas: 0,
    }

    return unsignedTx
  }

  async broadcastTx(signedTx) {
    // https://ethereum.org/en/developers/docs/apis/json-rpc/#eth_sendrawtransaction
    const txResponse = await this.provider.broadcastTransaction(signedTx)
    const receipt = await txResponse.wait()

    return receipt
  }
}
