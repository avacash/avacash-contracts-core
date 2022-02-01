/* global artifacts, web3, contract */
require('chai')
  .use(require('bn-chai')(web3.utils.BN))
  .use(require('chai-as-promised'))
  .should()
const fs = require('fs')

var BN = web3.utils.BN;
const { toBN, randomHex } = require('web3-utils')
const BigNumber = require('bignumber.js');
const { takeSnapshot, revertSnapshot } = require('../lib/ganacheHelper')

const Tornado = artifacts.require('./AvacashFinance_AVAX.sol')
const {MERKLE_TREE_HEIGHT } = process.env

const websnarkUtils = require('websnark/src/utils')
const buildGroth16 = require('websnark/src/groth16')
const stringifyBigInts = require('websnark/tools/stringifybigint').stringifyBigInts
const unstringifyBigInts2 = require('snarkjs/src/stringifybigint').unstringifyBigInts
const snarkjs = require('snarkjs')
const bigInt = snarkjs.bigInt
const crypto = require('crypto')
const circomlib = require('circomlib')
const MerkleTree = require('../lib/MerkleTree')

const rbigint = (nbytes) => snarkjs.bigInt.leBuff2int(crypto.randomBytes(nbytes))
const pedersenHash = (data) => circomlib.babyJub.unpackPoint(circomlib.pedersenHash.hash(data))[0]
const toFixedHex = (number, length = 32) =>  '0x' + bigInt(number).toString(16).padStart(length * 2, '0')
const getRandomRecipient = () => rbigint(20)

// const {getNoteString, storeData} = require('../utils/deposit')

  // function generateDeposit() {
  //   let deposit = {
  //     secret: rbigint(31),
  //     nullifier: rbigint(31),
  //   }
  //   const preimage = Buffer.concat([deposit.nullifier.leInt2Buff(31), deposit.secret.leInt2Buff(31)])
  //   deposit.commitment = pedersenHash(preimage)
  //   return deposit
  // }

// eslint-disable-next-line no-unused-vars
function BNArrayToStringArray(array) {
  const arrayToPrint = []
  array.forEach(item => {
    arrayToPrint.push(item.toString())
  })
  return arrayToPrint
}

function snarkVerify(proof) {
  proof = unstringifyBigInts2(proof)
  const verification_key = unstringifyBigInts2(require('../build/circuits/withdraw_verification_key.json'))
  return snarkjs['groth'].isValid(verification_key, proof, proof.publicSignals)
}

contract('AvacashFinance_AVAX', accounts => {
  let tornado
  const sender = accounts[0]
  const relayer = accounts[1]
  const operator = accounts[2]
  const levels = 20 //MERKLE_TREE_HEIGHT || 16
  const value = '100000000000000000000' // The last deployed denomination was 100 ether
  let snapshotId
  let prefix = 'test'
  let tree
//  const fee = bigInt(ETH_AMOUNT).shr(1) || bigInt(1e17)
  const refund = bigInt(0)
  const recipient = getRandomRecipient()
  let groth16
  let circuit
  let proving_key

  // Flash loan test:
  const Borrower = artifacts.require('./Borrower.sol')
  const FlashLoanExploiter = artifacts.require('./FlashloanExploiter.sol')
  let borrower
  let fee
  let initialTornadoBalance
  let flashLoanFeeReceiver
  let initialFeeReceiverBalance
  let _recipient
  let _flashLoanProvider;

  let finalTornadoBalance
  let finalFeeReceiverBalance

  let commitment

  let result

  before(async () => {
    tree = new MerkleTree(
      levels,
      null//,
      //prefix,
    )
    tornado = await Tornado.deployed()
    snapshotId = await takeSnapshot()
    groth16 = await buildGroth16()
    circuit = require('../build/circuits/withdraw.json')
    proving_key = fs.readFileSync('build/circuits/withdraw_proving_key.bin').buffer

    flashLoanFeeReceiver = await tornado.flashLoanFeeReceiver();
    _flashLoanProvider = tornado.address;

    fee = await tornado.flashLoanFee();
    assert.equal(fee, 3, 'Wrong flashLoanFee');

  })

  let testNumber = 1;
  const commitment0 = toFixedHex(41)
  const commitment1 = toFixedHex(40)

  describe('#FlashLoan Tests:', () => {

    beforeEach(async () => {
      console.log("Test Number #", testNumber);
      // commitment = toFixedHex(41)
      await tornado.deposit(commitment0, { value: value, from: sender })
      // await tree.insert(commitment)

      // commitment = toFixedHex(40)
      await tornado.deposit(commitment1, { value: value, from: sender })
      // await tree.insert(commitment)

      borrower = await Borrower.deployed()
      await borrower.payableFunction({value: 10000000000000000000, from: accounts[4]});


      initialTornadoBalance = toBN(await web3.eth.getBalance(tornado.address));
    //  console.log("initialTornadoBalance: " , initialTornadoBalance.toString())
      initialFeeReceiverBalance= toBN(await web3.eth.getBalance(flashLoanFeeReceiver));
    //  console.log("initialFeeReceiverBalance: " , initialFeeReceiverBalance.toString())
      initialBorrowerBalance= toBN(await web3.eth.getBalance(borrower.address));
    //  console.log("initialBorrowerBalance: " , initialBorrowerBalance.toString())
      testNumber ++;
    })


    it('Correct flashloan Borrower', async () => {
      // The receipient will be the borrower contract itself
      let _recipient = borrower.address;
      let _data = "0x";

      // Let's ask just for 9 eth, so the contract will have enough balance
      let _amount =  toBN(9000000000000000000);
      let _amountBN = BigNumber(_amount);
      let _initialTornadoBalanceBN = BigNumber(initialTornadoBalance.toString())
      assert.equal(_amountBN.isGreaterThan(_initialTornadoBalanceBN), false, 'Trying to ask too much funds');

      let { logs } = await borrower.flashLoan(_flashLoanProvider,_recipient, _amount, _data, {from: sender })

      result = false;
      if (logs) result = true
      assert.equal(result, true, 'flashLoan should have been executed correctly');
      // logs[0].event.should.be.equal('FlashLoan')
      // logs[0].args._recipient.should.be.equal(_recipient)
      // logs[0].args._amount.should.be.eq.BN(_amount)
      // logs[0].args._data.should.be.eq.BN(_data)

      finalTornadoBalanceBN = BigNumber(await web3.eth.getBalance(tornado.address));
      finalFeeReceiverBalance = toBN(await web3.eth.getBalance(flashLoanFeeReceiver));

      assert.equal(_initialTornadoBalanceBN.isEqualTo(finalTornadoBalanceBN), true,
      'Initial and final balance of the Tornado Instance should be the same even if flashLoan fail');

      let expectedFeeAdjusted = _amount.mul(fee);
      let minimumExpectedFeeReceiverBalanceAdjusted = (initialFeeReceiverBalance.mul(toBN(10000))).add(expectedFeeAdjusted)
      let finalFeeReceiverBalanceAdjusted = finalFeeReceiverBalance.mul(toBN(10000))
      //console.log("finalFeeReceiverBalanceAdjusted: ", finalFeeReceiverBalanceAdjusted.toString())
      //console.log("minimumExpectedFeeReceiverBalanceAdjusted: ", minimumExpectedFeeReceiverBalanceAdjusted.toString())
      let finalFeeReceiverBalanceAdjustedBN = BigNumber(finalFeeReceiverBalanceAdjusted)
      let minimumExpectedFeeReceiverBalanceAdjustedBN = BigNumber(minimumExpectedFeeReceiverBalanceAdjusted)
      assert.equal(finalFeeReceiverBalanceAdjustedBN.isGreaterThanOrEqualTo(minimumExpectedFeeReceiverBalanceAdjustedBN),true, 'Fee receiver should have received the fee');

    })

    it('flashLoan Thief trying to steal money', async () => {
      // The receipient will be the borrower contract itself
      let _recipient = borrower.address;
      // Let's ask just for 9 eth, so the contract will have enough balance
      let _amount =  toBN(9000000000000000000);
      let _amountBN = BigNumber(_amount);
      let _initialTornadoBalanceBN = BigNumber(initialTornadoBalance.toString())
      assert.equal(_amountBN.isGreaterThan(_initialTornadoBalanceBN), false, 'Trying to ask too much funds');
      let expectedFeeAdjusted = _amount.mul(fee);
      // let _data = web3.fromUtf8("1");
      let _data = web3.utils.fromAscii("thief");
      let error = await borrower.flashLoan(_flashLoanProvider,_recipient, _amount, _data, {from: sender }).should.be.rejected

      // console.log("thief: error:", error.reason.should.be)
      error.reason.should.be.equal("flashLoan(): Not enough fee payed")

      // Checking tornado Balance
      finalTornadoBalanceBN = BigNumber(await web3.eth.getBalance(tornado.address));
      assert.equal(_initialTornadoBalanceBN.isEqualTo(finalTornadoBalanceBN), true,
      'Initial and final balance of the Tornado Instance should be the same even if flashLoan fail');
      // Checking feeReceiverBalance
      finalFeeReceiverBalance = toBN(await web3.eth.getBalance(flashLoanFeeReceiver));
      finalFeeReceiverBalanceBN = BigNumber(finalFeeReceiverBalance);
      initialFeeReceiverBalanceBN = BigNumber(initialFeeReceiverBalance);
      assert.equal(initialFeeReceiverBalanceBN.isEqualTo(finalFeeReceiverBalanceBN), true,
      'When failing, feeReceiver should keep the same balance');

    })

    it('Flash loan asking for more than total funds', async () => {
      // The receipient will be the borrower contract itself
      let _recipient = borrower.address;
      let _data = "0x";

      // Let's ask for 310 eth
      let _amount =  toBN(310000000000000000000);
      let _amountBN = BigNumber(_amount);
      let _initialTornadoBalanceBN = BigNumber(initialTornadoBalance.toString())
      assert.equal(_amountBN.isGreaterThan(_initialTornadoBalanceBN), true, 'Trying to ask less funds... we are testing asking more funds');

      const error = await borrower.flashLoan(_flashLoanProvider,_recipient, _amount, _data, {from: sender }).should.be.rejected
      error.reason.should.be.equal('flashLoan(): Not enough funds for the flashloan.')

      // Checking tornado Balance
      finalTornadoBalanceBN = BigNumber(await web3.eth.getBalance(tornado.address));
      assert.equal(_initialTornadoBalanceBN.isEqualTo(finalTornadoBalanceBN), true,
      'Initial and final balance of the Tornado Instance should be the same even if flashLoan fail');
      // Checking feeReceiverBalance
      finalFeeReceiverBalance = toBN(await web3.eth.getBalance(flashLoanFeeReceiver));
      finalFeeReceiverBalanceBN = BigNumber(finalFeeReceiverBalance);
      initialFeeReceiverBalanceBN = BigNumber(initialFeeReceiverBalance);
      assert.equal(initialFeeReceiverBalanceBN.isEqualTo(finalFeeReceiverBalanceBN), true,
      'When failing, feeReceiver should keep the same balance');

    })

    it('Flash loan giving back exactelly same asked, without enough fee', async () => {

      // The receipient will be the borrower contract itself
      let _recipient = borrower.address;
      // Let's ask just for 9 eth, so the contract will have enough balance
      let _amount =  toBN(9000000000000000000);
      let _amountBN = BigNumber(_amount);
      let _initialTornadoBalanceBN = BigNumber(initialTornadoBalance.toString())
      assert.equal(_amountBN.isGreaterThan(_initialTornadoBalanceBN), false, 'Trying to ask too much funds');
      let expectedFeeAdjusted = _amount.mul(fee);
      // let _data = web3.fromUtf8("1");
      let _data = web3.utils.fromAscii("noFees");
      let error = await borrower.flashLoan(_flashLoanProvider,_recipient, _amount, _data, {from: sender }).should.be.rejected

      // console.log("thief: error:", error.reason.should.be)
      error.reason.should.be.equal("flashLoan(): Not enough fee payed")

      // Checking tornado Balance
      finalTornadoBalanceBN = BigNumber(await web3.eth.getBalance(tornado.address));
      assert.equal(_initialTornadoBalanceBN.isEqualTo(finalTornadoBalanceBN), true,
      'Initial and final balance of the Tornado Instance should be the same even if flashLoan fail');
      // Checking feeReceiverBalance
      finalFeeReceiverBalance = toBN(await web3.eth.getBalance(flashLoanFeeReceiver));
      finalFeeReceiverBalanceBN = BigNumber(finalFeeReceiverBalance);
      initialFeeReceiverBalanceBN = BigNumber(initialFeeReceiverBalance);
      assert.equal(initialFeeReceiverBalanceBN.isEqualTo(finalFeeReceiverBalanceBN), true,
      'When failing, feeReceiver should keep the same balance');
    })

    it('Reentrancy attack', async () => {

      // The receipient will be the borrower contract itself
      let _recipient = borrower.address;
      // Let's ask just for 9 eth, so the contract will have enough balance
      let _amount =  toBN(9000000000000000000);
      let _amountBN = BigNumber(_amount);
      let _initialTornadoBalanceBN = BigNumber(initialTornadoBalance.toString())
      assert.equal(_amountBN.isGreaterThan(_initialTornadoBalanceBN), false, 'Trying to ask too much funds');
      let expectedFeeAdjusted = _amount.mul(fee);
      // let _data = web3.fromUtf8("1");
      let _data = web3.utils.fromAscii("reentrant");
      let error = await borrower.flashLoan(_flashLoanProvider,_recipient, _amount, _data, {from: sender }).should.be.rejected

      // console.log("thief: error:", error.reason.should.be)
      error.reason.should.be.equal("ReentrancyGuard: reentrant call");

      // Checking tornado Balance
      finalTornadoBalanceBN = BigNumber(await web3.eth.getBalance(tornado.address));
      assert.equal(_initialTornadoBalanceBN.isEqualTo(finalTornadoBalanceBN), true,
      'Initial and final balance of the Tornado Instance should be the same even if flashLoan fail');
      // Checking feeReceiverBalance
      finalFeeReceiverBalance = toBN(await web3.eth.getBalance(flashLoanFeeReceiver));
      finalFeeReceiverBalanceBN = BigNumber(finalFeeReceiverBalance);
      initialFeeReceiverBalanceBN = BigNumber(initialFeeReceiverBalance);
      assert.equal(initialFeeReceiverBalanceBN.isEqualTo(finalFeeReceiverBalanceBN), true,
      'When failing, feeReceiver should keep the same balance');
    })

    it('Sending flash loan to normal account (not contract)', async () => {
      // The receipient will be the borrower contract itself
      let _recipient = accounts[3];
      let _data = "0x";

      // Let's ask just for 9 eth, so the contract will have enough balance
      let _amount =  toBN(9000000000000000000);
      let _amountBN = BigNumber(_amount);
      let _initialTornadoBalanceBN = BigNumber(initialTornadoBalance.toString())
      assert.equal(_amountBN.isGreaterThan(_initialTornadoBalanceBN), false, 'Trying to ask too much funds');

      const error = await borrower.flashLoan(_flashLoanProvider,_recipient, _amount, _data, {from: sender }).should.be.rejected
      error.reason.should.be.equal('flashLoan(): _recipient should be a contract.')

      // Checking tornado Balance
      finalTornadoBalanceBN = BigNumber(await web3.eth.getBalance(tornado.address));
      assert.equal(_initialTornadoBalanceBN.isEqualTo(finalTornadoBalanceBN), true,
      'Initial and final balance of the Tornado Instance should be the same even if flashLoan fail');
      // Checking feeReceiverBalance
      finalFeeReceiverBalance = toBN(await web3.eth.getBalance(flashLoanFeeReceiver));
      finalFeeReceiverBalanceBN = BigNumber(finalFeeReceiverBalance);
      initialFeeReceiverBalanceBN = BigNumber(initialFeeReceiverBalance);
      assert.equal(initialFeeReceiverBalanceBN.isEqualTo(finalFeeReceiverBalanceBN), true,
      'When failing, feeReceiver should keep the same balance');
    })

    it('Sending flash loan wrong contract (without the function)', async () => {
      // The receipient will be the provider contract itself
      let _recipient = tornado.address;
      let _data = "0x";

      // Let's ask just for 9 eth, so the contract will have enough balance
      let _amount =  toBN(9000000000000000000);
      let _amountBN = BigNumber(_amount);
      let _initialTornadoBalanceBN = BigNumber(initialTornadoBalance.toString())
      assert.equal(_amountBN.isGreaterThan(_initialTornadoBalanceBN), false, 'Trying to ask too much funds');

      //const error = await borrower.flashLoan(_flashLoanProvider,_recipient, _amount, _data, {from: sender })//.should.be.rejected
      //console.log(error)//error.reason.should.be.equal('flashLoan(): _recipient should be a contract.')

      // Checking tornado Balance
      finalTornadoBalanceBN = BigNumber(await web3.eth.getBalance(tornado.address));
      assert.equal(_initialTornadoBalanceBN.isEqualTo(finalTornadoBalanceBN), true,
      'Initial and final balance of the Tornado Instance should be the same even if flashLoan fail');
      // Checking feeReceiverBalance
      finalFeeReceiverBalance = toBN(await web3.eth.getBalance(flashLoanFeeReceiver));
      finalFeeReceiverBalanceBN = BigNumber(finalFeeReceiverBalance);
      initialFeeReceiverBalanceBN = BigNumber(initialFeeReceiverBalance);
      assert.equal(initialFeeReceiverBalanceBN.isEqualTo(finalFeeReceiverBalanceBN), true,
      'When failing, feeReceiver should keep the same balance');
    })

    it('Sending flash loan with _amount = 0 ', async () => {
      // The receipient will be the borrower contract itself
      let _recipient = borrower.address;
      let _data = "0x";

      // Let's ask for 31 eth
      let _amount =  toBN(0);
      let _amountBN = BigNumber(_amount);
      let _initialTornadoBalanceBN = BigNumber(initialTornadoBalance.toString())
      assert.equal(_amountBN.isGreaterThan(_initialTornadoBalanceBN), false, 'Trying to ask too much funds');

      const error = await borrower.flashLoan(_flashLoanProvider,_recipient, _amount, _data, {from: sender }).should.be.rejected
      error.reason.should.be.equal('flashLoan(): Please select an positive flashloan _amount.')

      // Checking tornado Balance
      finalTornadoBalanceBN = BigNumber(await web3.eth.getBalance(tornado.address));
      assert.equal(_initialTornadoBalanceBN.isEqualTo(finalTornadoBalanceBN), true,
      'Initial and final balance of the Tornado Instance should be the same even if flashLoan fail');
      // Checking feeReceiverBalance
      finalFeeReceiverBalance = toBN(await web3.eth.getBalance(flashLoanFeeReceiver));
      finalFeeReceiverBalanceBN = BigNumber(finalFeeReceiverBalance);
      initialFeeReceiverBalanceBN = BigNumber(initialFeeReceiverBalance);
      assert.equal(initialFeeReceiverBalanceBN.isEqualTo(finalFeeReceiverBalanceBN), true,
      'When failing, feeReceiver should keep the same balance');
    })

    it('changes the feeReceiver by the feeReceiver', async () => {
      await tornado.changeFeeReceiver(accounts[3], {from: operator});

      assert.equal(await tornado.flashLoanFeeReceiver(), accounts[3], "Fee receiver should be accounts[3]" );
    });

    it('changes the feeReceiver by other and fails', async () => {
      const error = await tornado.changeFeeReceiver(accounts[3], {from: sender}).should.be.rejected;
      error.reason.should.be.equal("Only current flashLoanFeeReceiver can change this value.")
      assert.equal(await tornado.flashLoanFeeReceiver(), operator, "Fee receiver should be operator" );

    });

    it('changes the flashLoanFee by the feeReceiver', async () => {
      let oldFlashLoanFee = await tornado.flashLoanFee();
      let desiredFlashLoanFee = 1;
      console.log("Old flashLoanFee: ", oldFlashLoanFee.toString())

      await tornado.changeFlashLoanFee(desiredFlashLoanFee, {from: operator});
      let newFlashLoanFee = await tornado.flashLoanFee();

      console.log("New flashLoanFee: ", newFlashLoanFee.toString())
      assert.equal(newFlashLoanFee.toNumber(), desiredFlashLoanFee, "flashLoanFee was not correctly changed" );
    });

    it('changes the flashLoanFee by other and fails', async () => {
      let oldFlashLoanFee = await tornado.flashLoanFee();
      let desiredFlashLoanFee = 1;
      console.log("Old flashLoanFee: ", oldFlashLoanFee.toString())

      const error = await tornado.changeFlashLoanFee(desiredFlashLoanFee, {from: sender}).should.be.rejected;
      error.reason.should.be.equal("Only current flashLoanFeeReceiver can change this value.")
      let newFlashLoanFee = await tornado.flashLoanFee();
      console.log("newFlashLoanFee.toString(): ", newFlashLoanFee.toString())
      console.log("oldFlashLoanFee.toString(): ", oldFlashLoanFee.toString())
      newFlashLoanFee_BN = BigNumber(newFlashLoanFee);
      oldFlashLoanFee_BN = BigNumber(oldFlashLoanFee);

      assert.equal(newFlashLoanFee_BN.isEqualTo(oldFlashLoanFee_BN), true, "flashLoan.Fee should be same as before" );
      //assert.equal(newFlashLoanFee, oldFlashLoanFee, "flashLoan.Fee should be same as before" );

      console.log("New flashLoanFee: ", newFlashLoanFee.toString())


    });

    it('gasSpender that gives back money', async () => {
      // The receipient will be the borrower contract itself
      let _recipient = borrower.address;
      // Let's ask just for 9 eth, so the contract will have enough balance
      let _amount =  toBN(9000000000000000000);
      let _amountBN = BigNumber(_amount);
      let _initialTornadoBalanceBN = BigNumber(initialTornadoBalance.toString())
      assert.equal(_amountBN.isGreaterThan(_initialTornadoBalanceBN), false, 'Trying to ask too much funds');

      // let _data = web3.fromUtf8("1");
      let _data = web3.utils.fromAscii("gasSpender");

      let { logs } = await borrower.flashLoan(_flashLoanProvider,_recipient, _amount, _data, {from: sender })

      result = false;
      if (logs) result = true
      assert.equal(result, true, 'flashLoan should have been executed correctly');
      // logs[0].event.should.be.equal('FlashLoan')
      // logs[0].args._recipient.should.be.equal(_recipient)
      // logs[0].args._amount.should.be.eq.BN(_amount)
      // logs[0].args._data.should.be.eq.BN(_data)

      finalTornadoBalanceBN = BigNumber(await web3.eth.getBalance(tornado.address));
      finalFeeReceiverBalance = toBN(await web3.eth.getBalance(flashLoanFeeReceiver));

      assert.equal(_initialTornadoBalanceBN.isEqualTo(finalTornadoBalanceBN), true,
      'Initial and final balance of the Tornado Instance should be the same even if flashLoan fail');

      let expectedFeeAdjusted = _amount.mul(fee);
      let minimumExpectedFeeReceiverBalanceAdjusted = (initialFeeReceiverBalance.mul(toBN(10000))).add(expectedFeeAdjusted)
      let finalFeeReceiverBalanceAdjusted = finalFeeReceiverBalance.mul(toBN(10000))
      //console.log("finalFeeReceiverBalanceAdjusted: ", finalFeeReceiverBalanceAdjusted.toString())
      //console.log("minimumExpectedFeeReceiverBalanceAdjusted: ", minimumExpectedFeeReceiverBalanceAdjusted.toString())
      let finalFeeReceiverBalanceAdjustedBN = BigNumber(finalFeeReceiverBalanceAdjusted)
      let minimumExpectedFeeReceiverBalanceAdjustedBN = BigNumber(minimumExpectedFeeReceiverBalanceAdjusted)
      assert.equal(finalFeeReceiverBalanceAdjustedBN.isGreaterThanOrEqualTo(minimumExpectedFeeReceiverBalanceAdjustedBN),true, 'Fee receiver should have received the fee');

    })


  })

  afterEach(async () => {
    await revertSnapshot(snapshotId.result)
    // eslint-disable-next-line require-atomic-updates
    snapshotId = await takeSnapshot()
    tree = new MerkleTree(
      levels,
      null,
      prefix,
    )
  })
})
