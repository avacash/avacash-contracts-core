/* global artifacts */
require('dotenv').config({ path: '../.env' })
let i=1;
const AvacashFinance_AVAX = artifacts.require('AvacashFinance_AVAX')
const Verifier = artifacts.require('Verifier')
const hasherContract = artifacts.require('Hasher')
const fs = require('fs')
const zero_address = "0x0000000000000000000000000000000000000000";
const {addJsonInNetwork} = require('../config/lib/utils')

addresses_path= '/workspace/config/addresses/addresses.json'
const { addresses } = require(addresses_path)



module.exports = function(deployer, network, accounts) {
  //const flash_loan_fee_receiver = accounts[2]?accounts[2]:process.env.FLASH_LOAN_FEE_RECEIVER;
  const addresses_network = addresses.find(address => address.name == network)
  const flash_loan_fee_receiver = addresses_network['flashLoanFeeReceiver'].address

  return deployer.then(async () => {

    const { MERKLE_TREE_HEIGHT } = process.env
    const verifier = await Verifier.deployed()
    const hasher = await hasherContract.deployed()
    //await AvacashFinance_AVAX.link(hasherContract, hasherInstance.address)
    amounts = process.env.TOKEN_AMOUNT_ARRAY.split(",")

    const instances_list = [];
    //for(i=0; i<amounts.length; i++) {
      console.log(amounts[i].substring(0,amounts[i].length-18), " ETH")
      console.log("input:",
      " : ", verifier.address,
      " : ", hasher.address,
      " : ", amounts[i],
      " : ", MERKLE_TREE_HEIGHT,
      " : ", flash_loan_fee_receiver)
      const tornado = await deployer.deploy(AvacashFinance_AVAX,
                      verifier.address,
                      hasher.address,
                      amounts[i],
                      MERKLE_TREE_HEIGHT,
                      flash_loan_fee_receiver)//   address _flashLoanFeeReceiver
      console.log('AvacashFinance_AVAX\'s address ', tornado.address)
      console.log('AvacashFinance_AVAX\'s txHash ', tornado.transactionHash)
      const tx = await web3.eth.getTransaction(tornado.transactionHash)
      const blockNumber = tx.blockNumber
      console.log('AvacashFinance_AVAX\'s blockNumber ', blockNumber)
      console.log('AvacashFinance_AVAX\'s fee receiver ', flash_loan_fee_receiver)
      console.log("")

      const instance_json = {instanceAddress: tornado.address,
                            currency: "avax",
                            denomination: (amounts[i]/1000000000000000000).toString(),
                            initialBlock: blockNumber,
                            decimals: 18}
      instances_list.push(instance_json)
    //}
    // const deployments = {
    //     deployments: [
    //       {
    //         netId: "43113",
    //         proxyAddress: "0xd21093B3c6413D5ccBACd339BE9778133a430768",
    //         instances_list: instances_list
    //       }
    //     ]
    // }
    // console.log(deployments)
    addJsonInNetwork("instances", instances_list, network)
  })
}
