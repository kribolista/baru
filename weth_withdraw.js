require("dotenv").config();
const { ethers } = require("ethers");
const fs = require("fs");

// Konfigurasi provider
const provider = new ethers.providers.JsonRpcProvider(
  process.env.RPC_URL || "https://rpc.ankr.com/taiko"
);

// Private key dari wallet
const privateKey = process.env.PRIVATE_KEY;
const wallet = new ethers.Wallet(privateKey, provider);

// Baca konfigurasi dari file config.json
const config = JSON.parse(fs.readFileSync("config.json", "utf8"));

// ABI kontrak dan alamat kontrak
const contractABI = JSON.parse(fs.readFileSync("abi.json", "utf8"));
const contractAddress =
  process.env.CONTRACT_ADDRESS || "0xA51894664A773981C6C112C43ce576f315d5b1B6";
const contract = new ethers.Contract(contractAddress, contractABI, wallet);

async function withdraw() {
  try {
    console.log(`\nProcessing withdrawal for wallet: ${wallet.address}`);

    // Cek balance WETH
    const wethBalance = await contract.balanceOf(wallet.address);
    console.log("Current WETH balance:", ethers.utils.formatEther(wethBalance), "WETH");

    // Jika tidak ada balance WETH, keluar dari fungsi
    if (wethBalance.isZero()) {
      console.log("No WETH balance to withdraw");
      return;
    }

    // Gunakan seluruh balance WETH sebagai jumlah penarikan
    const withdrawAmount = wethBalance;
    console.log("Withdrawing full balance:", ethers.utils.formatEther(withdrawAmount), "WETH");

    // Priority fee dan max base fee dari config.json
    const priorityFee = ethers.utils.parseUnits(config.priority_fee, "gwei");
    const maxBaseFee = ethers.utils.parseUnits(config.max_base_fee, "gwei");

    // Transaksi withdraw dengan fee yang disesuaikan
    const tx = await contract.withdraw(withdrawAmount, {
      maxPriorityFeePerGas: priorityFee,
      maxFeePerGas: maxBaseFee.add(priorityFee),
    });

    console.log("Transaction Hash:", tx.hash);

    const receipt = await tx.wait();
    console.log("Withdrawal transaction was mined in block:", receipt.blockNumber);
  } catch (error) {
    console.error("Withdrawal transaction failed:", error);
  }
}

// Memanggil fungsi withdraw
withdraw().catch(console.error);
