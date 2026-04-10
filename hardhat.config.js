require("@nomicfoundation/hardhat-toolbox");
/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.28", // 保持你原来的版本号
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // 🌟 魔法开关：开启 Yul (IR) 底层编译优化，专门解决 Stack Too Deep
    },
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    }
  }
};
require("@nomicfoundation/hardhat-toolbox");