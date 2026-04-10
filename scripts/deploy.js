const hre = require("hardhat");

async function main() {
  console.log("🚀 正在部署 MilestoneFundFactory 工厂合约...");
  
  // 获取工厂合约的编译文件
  const Factory = await hre.ethers.getContractFactory("MilestoneFundFactory");
  
  // 部署工厂合约
  const factory = await Factory.deploy();

  // 等待部署完成
  await factory.waitForDeployment();

  // 获取部署后的地址
  const address = await factory.getAddress();
  
  console.log("✅ 工厂合约部署成功！");
  console.log("👉 你的 Factory 地址是:", address);
}

// 运行主函数并处理报错
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});