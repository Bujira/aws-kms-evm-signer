import { spawn } from 'child_process'
import { JsonRpcProvider } from 'ethers'

let hardhatProcess

export async function startNetwork() {
  // Start the Hardhat node
  hardhatProcess = spawn('npm', ['run', 'hardhat', '--', 'node'], {
    stdio: 'ignore', // Ignore the stdio streams
    detached: true, // Detach the process so it runs independently
  })

  // Give the Hardhat node some time to start up
  await new Promise(resolve => setTimeout(resolve, 4000))

  // Check if the Hardhat node is running
  const networkUp = await checkNetworkUp()
  if (!networkUp) {
    throw new Error('Hardhat node is not running')
  }

  return true
}

export function stopNetwork() {
  if (hardhatProcess) {
    process.kill(-hardhatProcess.pid) // Terminate the Hardhat node after tests
  }
}

async function checkNetworkUp(provider = new JsonRpcProvider(process.env.RPC_PROVIDER_URL)) {
  try {
    await provider.getNetwork()
    return true
  } catch (error) {
    return false
  }
}
