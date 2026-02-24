// 裝置管理器 — 負責裝置的註冊、初始化、生命週期控管
// 從 config/devices.json 讀取設定，自動實例化對應的裝置類型

const fs = require("fs");
const path = require("path");
const deviceTypes = require("../devices");

class DeviceManager {
  /**
   * @param {EventBus} eventBus 中央事件匯流排
   */
  constructor(eventBus) {
    this.eventBus = eventBus;
    /** @type {Map<string, BaseDevice>} */
    this.devices = new Map();
  }

  /**
   * 從設定檔載入所有裝置並初始化
   * @param {string} configPath devices.json 的路徑
   */
  async loadFromConfig(configPath) {
    const raw = fs.readFileSync(configPath, "utf-8");
    const { devices } = JSON.parse(raw);

    for (const entry of devices) {
      await this.register(entry.id, entry.type, entry.config);
    }
  }

  /**
   * 註冊並初始化單一裝置
   */
  async register(id, typeName, config) {
    const DeviceClass = deviceTypes[typeName];
    if (!DeviceClass) {
      console.error(`[DeviceManager] 未知裝置類型: ${typeName} (id: ${id})`);
      return;
    }

    const device = new DeviceClass(id, config, this.eventBus);
    this.devices.set(id, device);

    try {
      await device.init();
      console.log(`[DeviceManager] ✓ ${id} (${typeName}) 已初始化`);
    } catch (err) {
      console.error(`[DeviceManager] ✗ ${id} 初始化失敗:`, err.message);
    }
  }

  /**
   * 取得指定裝置
   * @param {string} id
   * @returns {BaseDevice|undefined}
   */
  get(id) {
    return this.devices.get(id);
  }

  /**
   * 對指定裝置執行動作
   */
  async executeOnDevice(deviceId, action, params = {}) {
    const device = this.devices.get(deviceId);
    if (!device) {
      throw new Error(`裝置 "${deviceId}" 不存在`);
    }
    return device.execute(action, params);
  }

  /**
   * 取得所有裝置的狀態摘要
   */
  getAllStatus() {
    const result = [];
    for (const device of this.devices.values()) {
      result.push(device.getStatus());
    }
    return result;
  }

  /**
   * 銷毀所有裝置（伺服器關閉時呼叫）
   */
  async destroyAll() {
    for (const [id, device] of this.devices) {
      try {
        await device.destroy();
        console.log(`[DeviceManager] ${id} 已銷毀`);
      } catch (err) {
        console.error(`[DeviceManager] ${id} 銷毀失敗:`, err.message);
      }
    }
    this.devices.clear();
  }
}

module.exports = DeviceManager;
