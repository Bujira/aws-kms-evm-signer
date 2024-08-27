
import { kmsProvider, transactionService } from '../src/index.mjs';

describe('Sign and broadcast transaction', () => {
  let kmsAddress;
  let kmsERC20ContractAddress;
  const contractName = 'ERC20Token';

  beforeAll(async () => {
    kmsAddress = await kmsProvider.getAddress(process.env.KMS_KEY_ID);
  });
  
  test('Should deploy ERC20 smart contract', async () => {
    const tokenName = 'MyCoin'
    const tokenSymbol = 'MYC'
    const tokenOwner = kmsAddress

    const { unsignedTx, chainId } = await transactionService.buildContractDeployTx({
      contractName,
      constructorArgs: [tokenOwner, tokenName, tokenSymbol],
      sender: kmsAddress, // get the nonce from the sender address
      serialize: false,
    });

    const signedTx = await kmsProvider.signTx({
      tx: unsignedTx,
      sender: kmsAddress,
      keyId: process.env.KMS_KEY_ID,
      chainId,
    });
    const result = await transactionService.broadcastTx(signedTx);

    expect(typeof result).toBe('object')
    expect(typeof result.from).toBe('string');
    expect(result.from.toLocaleLowerCase()).toBe(kmsAddress.toLocaleLowerCase());
    expect(typeof result.contractAddress).toBe('string');

    kmsERC20ContractAddress = result.contractAddress;
  });

  test('Should call mint function on deployed ERC20 smart contract', async () => {
    const functionName = 'mint'
    const functionArgs = [kmsAddress, 1000] // to, amount

    const { unsignedTx, chainId } = await transactionService.buildContractCallTx({
      contractName,
      sender: kmsAddress,
      contractFuncName: functionName,
      contractFuncArgs: functionArgs,
      contractAddress: kmsERC20ContractAddress,
      serialize: false,
    });

    const signedTx = await kmsProvider.signTx({
      tx: unsignedTx,
      sender: kmsAddress,
      keyId: process.env.KMS_KEY_ID,
      chainId,
    });
    const result = await transactionService.broadcastTx(signedTx);

    expect(typeof result).toBe('object')
    expect(typeof result.from).toBe('string');
    expect(result.from.toLocaleLowerCase()).toBe(kmsAddress.toLocaleLowerCase());
  })
});
