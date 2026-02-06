import { expect } from "chai";
import hre from "hardhat";

// Extracts standard ethers export from hardhat
const { ethers } = hre;

describe("EcoNFT", function () {
  it("mints projects and tracks metadata", async function () {
    const [owner, recipient, marketplace] = await ethers.getSigners();

    const EcoNFT = await ethers.getContractFactory("EcoNFT");
    const ecoNFT = await EcoNFT.deploy();
    await ecoNFT.waitForDeployment();

    const EcoToken = await ethers.getContractFactory("EcoToken");
    const ecoToken = await EcoToken.deploy();
    await ecoToken.waitForDeployment();
    
    await ecoNFT.setMarketplace(marketplace.address);

    const tx = await ecoNFT.mintProject(recipient.address, 500, 120);
    const receipt = await tx.wait();
    const tokenId = 1n; // Assuming first token token is 1

    const project = await ecoNFT.projects(tokenId);
    expect(project.carbonTons).to.equal(500n);
    expect(project.originalCreator).to.equal(recipient.address);
    expect(project.isRetired).to.equal(false);

    await ecoNFT.connect(recipient).retire(tokenId);
    const updated = await ecoNFT.projects(tokenId);
    expect(updated.isRetired).to.equal(true);

    await expect(ecoNFT.recordSale(tokenId, 150_000_000)).to.be.revertedWithCustomError(
      ecoNFT,
      "NotMarketplace"
    );

    await ecoNFT.connect(marketplace).recordSale(tokenId, 150_000_000);
    const historyLength = await ecoNFT.priceHistoryLength(tokenId);
    expect(historyLength).to.equal(1n);
  });
});
