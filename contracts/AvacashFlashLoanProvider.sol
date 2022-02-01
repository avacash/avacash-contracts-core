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

pragma solidity 0.5.17;
interface FlashLoanBorrower {
  function avacashFlashLoanCall(bytes calldata _data) external payable returns (bool);
  }

import './libraries/SafeMathUni.sol';
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";



contract AvacashFlashLoanProvider is ReentrancyGuard {
  using SafeMathUni for uint;

  // Now using ReentrancyGuard from  "@openzeppelin/contracts/utils/ReentrancyGuard.sol"
  uint private unlocked = 1;
  address public flashLoanFeeReceiver;
  uint public flashLoanFee = 3;
  event FlashLoan(address _recipient, uint256 _amount, bytes _data);

  // Now using ReentrancyGuard from  "@openzeppelin/contracts/utils/ReentrancyGuard.sol"
  /*
  modifier lock() {
      require(unlocked == 1, 'AvacashFlashLoanProvider: LOCKED');
      unlocked = 0;
      _;
      unlocked = 1;
  }
  */

  constructor(address _flashLoanFeeReceiver)  public {
    flashLoanFeeReceiver = _flashLoanFeeReceiver;
  }

  function changeFeeReceiver(address _newFeeReceiver) external nonReentrant returns (bool){
    require(msg.sender == flashLoanFeeReceiver, "Only current flashLoanFeeReceiver can change this value.");
    require(_newFeeReceiver!= address(0), "New fee receiver should not be address 0");
    flashLoanFeeReceiver = _newFeeReceiver;
    return true;
  }

  function changeFlashLoanFee(uint _newFlashLoanFee) external nonReentrant returns (bool){
    require(msg.sender == flashLoanFeeReceiver, "Only current flashLoanFeeReceiver can change this value.");
    flashLoanFee = _newFlashLoanFee;
    return true;
  }

  function isContract(address _addr) private view returns (bool){
  uint32 size;
  assembly {
    size := extcodesize(_addr)
  }
  return (size > 0);
}



  function flashLoan( address _recipient,
                      uint256 _amount,
                      bytes calldata _data) external nonReentrant returns (bool){

    // 0. Check correct call.
    require(_amount > 0, "flashLoan(): Please select an positive flashloan _amount.");
    require(isContract(_recipient), "flashLoan(): _recipient should be a contract.");

    // 1. We check our own balance.
    uint256  _initialBalance = address(this).balance;
    require(_initialBalance >= _amount, "flashLoan(): Not enough funds for the flashloan.");

    FlashLoanBorrower _borrower = FlashLoanBorrower(_recipient);

    // 2. We lend the money:
    (bool success1 ) = _borrower.avacashFlashLoanCall.value(_amount)(_data);
    // (bool success1, ) = _recipient.call.value(_amount)(abi.encodeWithSignature("avacashFlashLoanCall(bytes32)", _data));
    require(success1, "flashLoan(): flashloan to _recipient did not go thru.");

    // 3. Calculate _feeAdjusted
    // fees are in deci-bps, i.e. 1/10th bps https://www.investopedia.com/terms/b/basispoint.asp
    // if flashLoanFee = 3, means 0.003%
    uint256 _feeAdjusted = _amount.mul(flashLoanFee);

    require(address(this).balance.mul(100000) >= _initialBalance.mul(100000).add(_feeAdjusted) , "flashLoan(): Not enough fee payed");

    // 4. Send fee to feeReceiver.
    if (_feeAdjusted > 0 ) {
      (bool success2, ) = flashLoanFeeReceiver.call.value(address(this).balance.sub(_initialBalance))("");
      require(success2, "flashLoan(): payment to feeReceiver  did not go thru");
    }

    //3. We check the final balance.
    require(address(this).balance == _initialBalance, "flashLoan(): Final balance should be equal to the initial balance.");

    emit FlashLoan(_recipient, _amount,_data);
    return true;
  }

  function payBack() external payable returns (bool){
    return true;
  }

}
