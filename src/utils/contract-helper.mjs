import fs from 'fs'
import path from 'path'
import * as ethers from 'ethers'
import { fileURLToPath } from 'url'

export class ContractHelper {
  constructor({ provider }) {
    this.provider = provider
  }

  async getReadOnlyContract ({ contractName, contractAddress }) {
    const { abi } = this.#loadContractData(contractName)
    const contract = new ethers.Contract(contractAddress, abi, this.provider)

    return contract
  }

  async getReadOnlyContractFactory ({ contractName }) {
    const { abi, bytecode } = this.#loadContractData(contractName)
    const contract = new ethers.ContractFactory(abi, bytecode, this.provider)

    return contract
  }

  #loadContractData (contractName) {
    if (!contractName) {
      throw new Error('Contract name is required')
    }

    const contractDataRelativePath = '../../blockchain/contracts-data'
    const __dirname = path.dirname(fileURLToPath(import.meta.url))

    // TODO: ensure file exists and is readable
    const contractDataAbsolutePath = path.resolve(__dirname, contractDataRelativePath, `${contractName}.json`) 
    const contractData = JSON.parse(fs.readFileSync(contractDataAbsolutePath))
      
    return contractData
  }
}