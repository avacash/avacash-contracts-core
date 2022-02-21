// https://avacash.finance
/*
█████╗ ██╗   ██╗ █████╗  ██████╗ █████╗ ███████╗██╗  ██╗
██╔══██╗██║   ██║██╔══██╗██╔════╝██╔══██╗██╔════╝██║  ██║
███████║██║   ██║███████║██║     ███████║███████╗███████║
██╔══██║╚██╗ ██╔╝██╔══██║██║     ██╔══██║╚════██║██╔══██║
██║  ██║ ╚████╔╝ ██║  ██║╚██████╗██║  ██║███████║██║  ██║
╚═╝  ╚═╝  ╚═══╝  ╚═╝  ╚═╝ ╚═════╝╚═╝  ╚═╝╚══════╝╚═╝  ╚═╝

███████╗██╗███╗   ██╗ █████╗ ███╗   ██╗ ██████╗███████╗
██╔════╝██║████╗  ██║██╔══██╗████╗  ██║██╔════╝██╔════╝
█████╗  ██║██╔██╗ ██║███████║██╔██╗ ██║██║     █████╗
██╔══╝  ██║██║╚██╗██║██╔══██║██║╚██╗██║██║     ██╔══╝
██║     ██║██║ ╚████║██║  ██║██║ ╚████║╚██████╗███████╗
╚═╝     ╚═╝╚═╝  ╚═══╝╚═╝  ╚═╝╚═╝  ╚═══╝ ╚═════╝╚══════╝

*/

// SPDX-License-Identifier: MIT


pragma solidity ^0.7.0;

interface FlashLoanBorrower {
  function avacashFlashLoanCall(bytes calldata _data) external payable returns (bool);
  }

import './libraries/SafeMathUni.sol';
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";


/**
  @title  A contact that holds AVAX and provides flash loans in a safe way
  @author avacash.finance
*/
contract AvacashFlashLoanProvider is ReentrancyGuard {
  using SafeMathUni for uint;

  address public flashLoanFeeReceiver;
  uint public flashLoanFee = 3;

  event FlashLoan(address _recipient, uint256 _amount, bytes _data);
  event FlashLoanFeeChanged(uint _newFlashLoanFee);
  event FlashLoanFeeReceiverChanged(address _newFlashLoanFeeReceiver);

  /**
    @dev The constructor
    @param _flashLoanFeeReceiver the initial address that will receive the fees for the usage of flash loans
  */
  constructor(address _flashLoanFeeReceiver)  public {
    require(_flashLoanFeeReceiver!=address(0), "feeReceiver should not be the Zero Address");
    flashLoanFeeReceiver = _flashLoanFeeReceiver;
  }

  /**
    @dev Function that changes the flashLoanFeeReceiver
    @notice Can only be called by the current flashLoanFeeReceiver
    @param _newFeeReceiver the new address that will receive the fees for the usage of flash loans
  */
  function changeFeeReceiver(address _newFeeReceiver) external nonReentrant returns (bool){
    require(msg.sender == flashLoanFeeReceiver, "Only current flashLoanFeeReceiver can change this value.");
    require(_newFeeReceiver!= address(0), "New fee receiver should not be address 0");
    flashLoanFeeReceiver = _newFeeReceiver;
    emit FlashLoanFeeReceiverChanged(flashLoanFeeReceiver);
    return true;
  }

  /**
    @dev Function that changes the flashLoanFeeReceiver
    @notice Can only be called by the current flashLoanFeeReceiver
    @param _newFlashLoanFee the new address that will receive the fees for the usage of flash loans
  */
  function changeFlashLoanFee(uint _newFlashLoanFee) external nonReentrant returns (bool){
    require(msg.sender == flashLoanFeeReceiver, "Only current flashLoanFeeReceiver can change this value.");
    flashLoanFee = _newFlashLoanFee;
    emit FlashLoanFeeChanged(flashLoanFee);
    return true;
  }

  /**
    @dev Function that verifies if the functions was called by a contract
    @param _addr address that needs to be verified
    @return bool : true if _addr is a contract, false if not
  */
  function isContract(address _addr) private view returns (bool){
  uint32 size;
  assembly {
    size := extcodesize(_addr)
  }
  return (size > 0);
}

  /**
    @dev Function to ask AVAX as a flashloan
    @param _recipient address of the flashloan recipient, that needs to implement FlashLoanBorrower interface
    @param _amount in AVAX of the flashloan
    @param _data any data that needs to be sent to the FlashLoanBorrower
    @return bool: true if successfull
  */

  function flashLoan( address _recipient,
                      uint256 _amount,
                      bytes calldata _data) external nonReentrant returns (bool){

    // 0. Check correct call.
    require(_amount > 0, "flashLoan(): Please select an positive flashloan _amount.");
    require(isContract(_recipient), "flashLoan(): _recipient should be a contract.");

    // 1. Check this contact's balance
    uint256  _initialBalance = address(this).balance;
    require(_initialBalance >= _amount, "flashLoan(): Not enough funds for the flashloan.");

    FlashLoanBorrower _borrower = FlashLoanBorrower(_recipient);

    // 2. Lend the money:
    (bool success1 ) = _borrower.avacashFlashLoanCall{value: _amount}(_data);
    require(success1, "flashLoan(): flashloan to _recipient did not go through.");

    // 3. Calculate _feeAdjusted
    // fees are in deci-bps, i.e. 1/10th bps https://www.investopedia.com/terms/b/basispoint.asp
    // if flashLoanFee = 3, means 0.003%

    uint256 _feeAdjusted = _amount.mul(flashLoanFee);

    require(address(this).balance.mul(100000) >= _initialBalance.mul(100000).add(_feeAdjusted) , "flashLoan(): Not enough fee paid");

    // 4. Send fee to feeReceiver.
    if (_feeAdjusted > 0 ) {
      (bool success2, ) = flashLoanFeeReceiver.call{value: address(this).balance.sub(_initialBalance)}("");
      require(success2, "flashLoan(): payment to feeReceiver  did not go through");
    }

    // 5. Check the final balance.
    require(address(this).balance == _initialBalance, "flashLoan(): Final balance should be equal to the initial balance.");

    emit FlashLoan(_recipient, _amount,_data);
    return true;
  }

  /**
    @dev Payable function to receive back the flashloan
    @notice Function that needs to be called by the FlashLoanBorrower in order to give back the flashloan + fees
    @return bool: true if successfull
  */
  function payBack() external payable returns (bool){
    return true;
  }

}
