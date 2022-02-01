/* global artifacts */
const Verifier = artifacts.require('Verifier')
const {addJsonInNetwork} = require('../config/lib/utils')


module.exports = async function(deployer, network, accounts) {
  return deployer.then(async () => {
    const verifier_deployed = await deployer.deploy(Verifier) 

    const tx = await web3.eth.getTransaction(verifier_deployed.transactionHash)
    const json = {
      "address": verifier_deployed.address,
      "blockNumber": tx.blockNumber
    }
    addJsonInNetwork("verifier", json, network)

  })
}
