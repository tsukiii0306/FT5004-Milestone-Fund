// 引入刚刚复制过来的两个 JSON 文件 (因为它们现在和 constants.js 在同一个文件夹里，所以用 "./" 即可)
import factoryJson from "./MilestoneFundFactory.json";
import milestoneFundJson from "./MilestoneFund.json";

// 1. 工厂合约的地址 (就是你刚才部署终端里吐出来的那个)
export const FACTORY_ADDRESS = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

// 2. 导出工厂的 ABI (用于首页展示列表、创建页发起项目)
export const factoryABI = factoryJson.abi;

// 3. 导出具体项目的 ABI (用于详情页出资、投票。注意：它不需要具体的地址，因为地址是动态的)
export const milestoneFundABI = milestoneFundJson.abi;

/** Platform governance args to the factory (factory: 60s funding/grace, 40s voting in MilestoneFundFactory.sol). */
export const DEFAULT_GOVERNANCE = {
  votingThreshold: 60,
  quorum: 40,
  minContributionEth: "0.1",
};

/** UI + demo flows assume exactly two on-chain milestones (two payout ratios summing to 100). */
export const MILESTONE_COUNT = 2;
export const DEFAULT_PAYOUT_RATIOS = "40,60";

/**
 * If true, every address from `getDeployedCampaigns()` is hidden (UI only; chain unchanged).
 * Set to `false` when you want the list and `/campaign/:addr` to work again for factory deployments.
 */
export const HIDE_ALL_FACTORY_CAMPAIGNS = false;

/** Used only when `HIDE_ALL_FACTORY_CAMPAIGNS` is false: factory indices to omit. */
export const HIDDEN_FACTORY_CAMPAIGN_INDICES = [];