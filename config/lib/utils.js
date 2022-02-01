const deployments_path = '/workspace/config/deployments/deployments.json'
//const { deployments } = require(deployments_path)
const fs = require('fs')

const BATCH_SIZE = 200

function getDeploymentFromNetworkName(network) {
  const { deployments } = require(deployments_path)
  const deployment = deployments.filter(element => element.name == network)[0]
  const index = deployments.indexOf(deployment)
  return {
    deployment: deployment,
    index: index
  }
}

function getRecipientsLength() {
  const recipients = require('../airdropInfo/recipients.json')
  return recipients.length
}

function storeData(data) {
  path_store = deployments_path
  try {
    fs.writeFileSync(path_store, JSON.stringify(data, null, 2))
  } catch (err) {
    console.error(err)
  }
}

function storeDataOnPath(data, path_store) {
  try {
    fs.writeFileSync(path_store, JSON.stringify(data, null, 2))
  } catch (err) {
    console.error(err)
  }
}


function addJsonInNetwork(name, json, network){
  const { deployments } = require(deployments_path)
  const { deployment, index } = getDeploymentFromNetworkName(network)
  deployment[name]=json
  deployments[index] = deployment
  storeData({"deployments":deployments})
}
function getForwardContractAddress(sender, nonce){
  return "0x"+ utils.keccak256(rlp.encode([sender, nonce])).slice(26)
}

module.exports = {
  BATCH_SIZE,
  storeData,
  storeDataOnPath,
  getRecipientsLength,
  getForwardContractAddress,
  getDeploymentFromNetworkName,
  addJsonInNetwork
}
