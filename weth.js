require("dotenv").config();
const { exec } = require("child_process");
const util = require("util");
const fs = require("fs");
const schedule = require("node-schedule");
const moment = require("moment-timezone");
const axios = require("axios");

const execPromise = util.promisify(exec);

// Baca konfigurasi
const config = JSON.parse(fs.readFileSync("config.json", "utf8"));

// Fungsi untuk mendapatkan semua private keys dari .env
function getPrivateKeys() {
  return Object.keys(process.env)
    .filter((key) => key.startsWith("PRIVATE_KEY_"))
    .map((key) => process.env[key]);
}

async function runCommand(command, env) {
  try {
    const { stdout, stderr } = await execPromise(command, {
      env: { ...process.env, ...env },
    });
    return {
      output: stdout,
      error: stderr,
      retval: 0,
    };
  } catch (error) {
    return {
      output: error.stdout,
      error: error.stderr,
      retval: error.code,
    };
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getCurrentServerTime() {
  return moment()
    .tz(config.timezone || "Asia/Jakarta")
    .format("YYYY-MM-DD HH:mm:ss");
}

async function sendTelegramNotification(message) {
  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  const url = `https://api.telegram.org/bot${telegramToken}/sendMessage`;

  const headers = {
    "User-Agent": "Mozilla/5.0",
    "Content-Type": "application/json",
  };

  try {
    await axios.post(
      url,
      {
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      },
      { headers }
    );
    console.log("Telegram notification sent successfully");
  } catch (error) {
    console.error("Failed to send Telegram notification:", error.message);
  }
}

async function main() {
  const iterations = config.iterations || 45;
  const interval = config.interval || 30;
  const privateKeys = getPrivateKeys();

  for (let i = 0; i < iterations; i++) {
    console.log(`[${getCurrentServerTime()}] Iteration ${i + 1} of ${iterations}`);

    for (let j = 0; j < privateKeys.length; j++) {
      const privateKey = privateKeys[j];
      console.log(`[${getCurrentServerTime()}] Processing wallet ${j + 1} of ${privateKeys.length}`);

      const env = { 
        PRIVATE_KEY: privateKey, 
        PRIORITY_FEE: config.priority_fee,
        MAX_BASE_FEE: config.max_base_fee
      };

      console.log("Running deposit...");
      const depositResult = await runCommand(`node weth_deposit.js`, env);
      console.log(depositResult.output);

      if (depositResult.retval === 0) {
        console.log(`Deposit successful for wallet ${j + 1}, waiting for ${interval} seconds...`);
        await sleep(interval * 1000);

        console.log("Running withdraw...");
        const withdrawResult = await runCommand(`node weth_withdraw.js`, env);
        console.log(withdrawResult.output);

        if (withdrawResult.retval === 0) {
          console.log(`Withdraw successful for wallet ${j + 1}.`);
        } else {
          console.log(`Withdraw failed for wallet ${j + 1}.`);
        }
      } else {
        console.log(`Deposit failed for wallet ${j + 1}.`);
      }

      if (j < privateKeys.length - 1) {
        console.log(`Waiting for ${interval} seconds before processing next wallet...`);
        await sleep(interval * 1000);
      }
    }

    if (i < iterations - 1) {
      console.log(`Waiting for ${interval} seconds before next iteration...`);
      await sleep(interval * 1000);
    }
  }

  console.log(`[${getCurrentServerTime()}] All iterations completed for all wallets.`);
  await sendTelegramNotification("Tugas Otomatis Selesai.");
}

function scheduleTask() {
  const timezone = config.timezone || "Asia/Jakarta";
  const scheduledTime = config.scheduledTime || "07:10";
  const [scheduledHour, scheduledMinute] = scheduledTime.split(":").map(Number);

  console.log(`[${getCurrentServerTime()}] Scheduling task at ${scheduledTime} ${timezone}`);

  const job = schedule.scheduleJob(
    { hour: scheduledHour, minute: scheduledMinute, tz: timezone },
    function () {
      console.log(`[${getCurrentServerTime()}] Starting scheduled task...`);
      main().catch(console.error);
    }
  );

  const now = moment().tz(timezone);
  const nextExecution = moment().tz(timezone).set({ hour: scheduledHour, minute: scheduledMinute });
  if (nextExecution.isBefore(now)) {
    nextExecution.add(1, "day");
  }
  const timeUntilExecution = nextExecution.diff(now);
  console.log(`Next execution in ${moment.duration(timeUntilExecution).humanize()}`);
}

scheduleTask();

process.on("SIGINT", function () {
  console.log(`[${getCurrentServerTime()}] Script terminated.`);
  process.exit();
});
