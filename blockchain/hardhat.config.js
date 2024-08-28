module.exports = {
  solidity: {
    version: '0.8.20',
    settings: {
      evmVersion: 'london',
      optimizer: {
        enabled: true,
      },
    },
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      accounts: [],
    },
  },
}
