// BridgeManager — 雲端側管理展場本地 Bridge 的 WebSocket 連線
// 接收本地 Bridge 的裝置註冊與事件回報，轉發指令到本地執行

const { v4: uuidv4 } = require("uuid");

class BridgeManager {
  /**
   * @param {EventBus} eventBus
   * @param {DeviceManager} deviceManager
   */
  constructor(eventBus, deviceManager) {
    this.eventBus = eventBus;
    this.deviceManager = deviceManager;
    this._bridgeWS = null;
    this._pendingRequests = new Map();
    this._requestTimeout = 30000;
  }

  get isConnected() {
    return this._bridgeWS?.readyState === 1;
  }

  /**
   * 處理 Bridge WebSocket 連線（掛在 wss /bridge 路徑）
   */
  handleConnection(ws) {
    // 同時只允許一個 Bridge 連線
    if (this._bridgeWS) {
      console.log("[BridgeManager] 舊 Bridge 被新連線取代");
      try { this._bridgeWS.close(); } catch {}
    }

    this._bridgeWS = ws;
    console.log("[BridgeManager] Bridge 已連線");
    this.eventBus.publish("bridge:connected", {});

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        this._handleMessage(msg);
      } catch {}
    });

    ws.on("close", () => {
      console.log("[BridgeManager] Bridge 已斷線");
      this._bridgeWS = null;
      this._rejectAllPending("Bridge 斷線");
      // 將所有遠端裝置標記為離線
      for (const device of this.deviceManager.devices.values()) {
        if (device.constructor.name === "RemoteDevice") {
          device._setStatus("offline", "Bridge 斷線");
        }
      }
      this.eventBus.publish("bridge:disconnected", {});
    });
  }

  /**
   * 透過 Bridge 對遠端裝置執行指令
   * @returns {Promise<any>} 執行結果
   */
  executeRemote(deviceId, action, params) {
    return new Promise((resolve, reject) => {
      if (!this.isConnected) {
        return reject(new Error("展場 Bridge 未連線"));
      }

      const requestId = uuidv4().replace(/-/g, "").substring(0, 16);
      const timer = setTimeout(() => {
        this._pendingRequests.delete(requestId);
        reject(new Error("Bridge 指令逾時"));
      }, this._requestTimeout);

      this._pendingRequests.set(requestId, { resolve, reject, timer });

      this._bridgeWS.send(JSON.stringify({
        type: "execute",
        requestId,
        deviceId,
        action,
        params,
      }));
    });
  }

  // ---- 私有方法 ----

  _handleMessage(msg) {
    switch (msg.type) {
      // Bridge 回傳指令執行結果
      case "result": {
        const pending = this._pendingRequests.get(msg.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this._pendingRequests.delete(msg.requestId);
        pending.resolve(msg.data);
        break;
      }

      // Bridge 回傳指令執行錯誤
      case "error": {
        const pending = this._pendingRequests.get(msg.requestId);
        if (!pending) return;
        clearTimeout(pending.timer);
        this._pendingRequests.delete(msg.requestId);
        pending.reject(new Error(msg.message || "Bridge 執行錯誤"));
        break;
      }

      // Bridge 回報所有裝置清單（首次連線或狀態更新）
      case "deviceList": {
        this._registerRemoteDevices(msg.devices || []);
        break;
      }

      // Bridge 轉發本地事件
      case "event": {
        this.eventBus.publish(msg.event, msg.data || {});
        break;
      }

      // Bridge 回報單一裝置狀態變更
      case "deviceStatus": {
        const device = this.deviceManager.get(msg.deviceId);
        if (device && device.constructor.name === "RemoteDevice") {
          device._updateRemoteStatus(msg.status);
        }
        break;
      }
    }
  }

  /**
   * 根據 Bridge 回報的裝置清單，在雲端註冊對應的 RemoteDevice
   */
  _registerRemoteDevices(devices) {
    const RemoteDevice = require("../devices/RemoteDevice");

    for (const d of devices) {
      if (!this.deviceManager.devices.has(d.id)) {
        const remote = new RemoteDevice(d.id, d, this.eventBus, this);
        this.deviceManager.devices.set(d.id, remote);
        console.log(`[BridgeManager] 註冊遠端裝置: ${d.id} (${d.type})`);
      } else {
        const existing = this.deviceManager.get(d.id);
        if (existing.constructor.name === "RemoteDevice") {
          existing._updateRemoteStatus(d);
        }
      }
    }

    this.eventBus.publish("bridge:devicesRegistered", {
      count: devices.length,
      ids: devices.map((d) => d.id),
    });
  }

  _rejectAllPending(reason) {
    for (const [id, p] of this._pendingRequests) {
      clearTimeout(p.timer);
      p.reject(new Error(reason));
    }
    this._pendingRequests.clear();
  }
}

module.exports = BridgeManager;
