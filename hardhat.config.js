import hardhatEthers from "@nomicfoundation/hardhat-ethers"
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";


export default {
    plugins: [hardhatEthers, hardhatToolboxMochaEthers],
    solidity: "0.8.23",
}