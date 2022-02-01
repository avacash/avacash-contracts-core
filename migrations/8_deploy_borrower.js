/* global artifacts */
const Borrower = artifacts.require('Borrower')
//console.log(Borrower) // this works

module.exports = function(deployer, network, accounts) {
  if(network == "development"){
    return deployer.then(async () => {
      const borrower =  await deployer.deploy(Borrower)
      //console.log ("borrower: ", borrower) //this works

      console.log('Borrower\'s address ', borrower.address)
      console.log('Borrower\'s txHash ', borrower.transactionHash)
    })

  }
}
