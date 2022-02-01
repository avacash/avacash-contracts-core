/* global artifacts */
const Hasher = artifacts.require('Hasher')
const {addJsonInNetwork} = require('../config/lib/utils')

module.exports = async function(deployer, network, accounts) {
  return deployer.then(async () => {
    const hasher_deployed = await deployer.deploy(Hasher)

    const tx = await web3.eth.getTransaction(hasher_deployed.transactionHash)
    const json = {
      "address": hasher_deployed.address,
      "blockNumber": tx.blockNumber
    }
    addJsonInNetwork("hasher", json, network)

  })
}
