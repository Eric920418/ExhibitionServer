// 展場 Bridge 客戶端 — 在展場電腦上執行
// 連接雲端 Server，將所有本地裝置（VTS、ESP32、音訊、攝像頭）橋接到雲端
//
// 用法：
//   node src/bridge.js --server wss://你的雲端網址 --secret exhibition2026
//   或設定環境變數：
//   set BRIDGE_SERVER=wss://xxx.onrender.com
//   set BRIDGE_SECRET=exhibition2026
//   node src/bridge.js

const WebSocket = require("ws");
const path = require("path");
const EventBus = require("./core/EventBus");
const DeviceManager = require("./core/DeviceManager");

// 解析命令列參數
function getArg(name) {
  const idx = process.argv.indexOf(`--${name}`);
  return idx !== -1 ? process.argv[idx + 1] : undefined;
}

const CLOUD_SERVER = getArg("server") || process.env.BRIDGE_SERVER || "ws://localhost:3000";
const BRIDGE_SECRET = getArg("secret") || process.env.BRIDGE_SECRET || "exhibition2026";
const DEVICES_CONFIG = path.resolve(__dirname, "../config/devices.json");

let ws = null;
let reconnectTimer = null;
let eventBus = null;
let deviceManager = null;

async function main() {
  console.log("=== 展場 Bridge 啟動中 ===");

  // 初始化本地裝置
  eventBus = new EventBus();
  deviceManager = new DeviceManager(eventBus);

  console.log("[Bridge] 載入本地裝置...");
  await deviceManager.loadFromConfig(DEVICES_CONFIG);

  // 攔截所有本地事件，轉發到雲端
  const originalPublish = eventBus.publish.bind(eventBus);
  eventBus.publish = function (event, data) {
    originalPublish(event, data);
    sendToCloud({ type: "event", event, data });
  };

  // 連接雲端
  connect();

  // 優雅關閉
  process.on("SIGINT", async () => {
    console.log("\n[Bridge] 正在關閉...");
    await deviceManager.destroyAll();
    if (ws) ws.close();
    process.exit(0);
  });
}

function connect() {
  const url = `${CLOUD_SERVER}/bridge?secret=${encodeURIComponent(BRIDGE_SECRET)}`;
  console.log(`[Bridge] 連線至雲端: ${CLOUD_SERVER}`);

  ws = new WebSocket(url);

  ws.on("open", () => {
    console.log("[Bridge] 已連線到雲端 Server");
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

    // 回報所有本地裝置清單
    sendDeviceList();
  });

  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      handleCloudMessage(msg);
    } catch {}
  });

  ws.on("close", () => {
    console.log("[Bridge] 雲端連線已斷開");
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    console.error("[Bridge] 連線錯誤:", err.message);
    scheduleReconnect();
  });
}

function scheduleReconnect() {
  if (reconnectTimer) return;
  console.log("[Bridge] 5 秒後重新連線...");
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 5000);
}

function sendToCloud(msg) {
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

/**
 * 回報所有本地裝置的資訊給雲端
 */
function sendDeviceList() {
  const devices = [];
  for (const device of deviceManager.devices.values()) {
    devices.push({
      id: device.id,
      type: device.constructor.name,
      status: device.status,
      lastError: device.lastError,
      supportedActions: device.getSupportedActions(),
    });
  }
  sendToCloud({ type: "deviceList", devices });
}

/**
 * 處理雲端發來的指令
 */
async function handleCloudMessage(msg) {
  if (msg.type !== "execute") return;

  const { requestId, deviceId, action, params } = msg;

  try {
    const result = await deviceManager.executeOnDevice(deviceId, action, params || {});
    sendToCloud({ type: "result", requestId, data: result });
  } catch (err) {
    sendToCloud({ type: "error", requestId, message: err.message });
  }

  // 指令執行後，回報最新裝置狀態
  const device = deviceManager.get(deviceId);
  if (device) {
    sendToCloud({
      type: "deviceStatus",
      deviceId: device.id,
      status: device.getStatus(),
    });
  }
}

main().catch((err) => {
  console.error("Bridge 啟動失敗:", err);
  process.exit(1);
});
