import "dotenv/config";
import { configVariable } from "hardhat/config";
import hardhatEthers from "@nomicfoundation/hardhat-ethers"
import hardhatToolboxMochaEthers from "@nomicfoundation/hardhat-toolbox-mocha-ethers";


export default {
    plugins: [hardhatEthers, hardhatToolboxMochaEthers],
    solidity: "0.8.23",
    networks: {
        sepolia: {
            type: "http",
            chainType: "l1",
            url: configVariable("SEPOLIA_RPC_URL"),
            accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
            chainId: 11155111,
        },
    },
}
