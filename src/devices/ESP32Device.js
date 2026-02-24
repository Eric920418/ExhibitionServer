// ESP32 WiFi 燈光控制裝置
// 透過 HTTP 與 ESP32 通訊，支援多種燈光模式與 RGB 顏色控制

const axios = require("axios");
const BaseDevice = require("./BaseDevice");

class ESP32Device extends BaseDevice {
  constructor(id, config, eventBus) {
    super(id, config, eventBus);
    this.baseUrl = `http://${config.ip || "192.168.4.1"}`;
    this.timeout = config.timeout || 200;
    // 節流：避免短時間內發送過多請求
    this._lastSentTime = 0;
    this._throttleMs = config.throttleMs || 100;
    // 動畫特效用的 interval
    this._animationInterval = null;
  }

  async init() {
    try {
      await axios.get(this.baseUrl, { timeout: this.timeout });
      this._setStatus("online");
    } catch {
      // ESP32 可能尚未開機，標記為離線但不阻擋啟動
      this._setStatus("offline");
      console.warn(`[${this.id}] ESP32 (${this.baseUrl}) 目前無回應，稍後重試即可`);
    }
  }

  async execute(action, params = {}) {
    switch (action) {
      case "setMode":
        return this._setMode(params.mode, params.color);
      case "setColor":
        return this._setColor(params.r, params.g, params.b);
      case "off":
        return this._setMode("off");
      case "flashEffect":
        return this._startFlashEffect(params.color);
      case "stopEffect":
        return this._stopEffect();
      default:
        throw new Error(`[${this.id}] 不支援的動作: ${action}`);
    }
  }

  getSupportedActions() {
    return [
      { action: "setMode", params: { mode: "string", color: "{ r, g, b }" }, description: "設定燈光模式" },
      { action: "setColor", params: { r: "number", g: "number", b: "number" }, description: "直接設定 RGB" },
      { action: "off", params: {}, description: "關閉燈光" },
      { action: "flashEffect", params: { color: "{ r, g, b }" }, description: "閃爍特效" },
      { action: "stopEffect", params: {}, description: "停止特效動畫" },
    ];
  }

  async destroy() {
    this._stopEffect();
    await super.destroy();
  }

  // ---- 私有方法 ----

  async _setMode(mode, color = null) {
    try {
      const payload = { mode };
      if (color) payload.color = color;
      await axios.post(`${this.baseUrl}/light/mode`, payload, { timeout: this.timeout });
      this._setStatus("online");
      this.eventBus.publish(`${this.id}:modeChanged`, { mode, color });
    } catch (err) {
      this._setStatus("error", err.message);
    }
  }

  async _setColor(r, g, b) {
    // 節流
    const now = Date.now();
    if (now - this._lastSentTime < this._throttleMs) return;
    this._lastSentTime = now;

    try {
      await axios.post(
        `${this.baseUrl}/light/set`,
        { color: { r, g, b } },
        { timeout: this.timeout }
      );
      this._setStatus("online");
    } catch (err) {
      this._setStatus("error", err.message);
    }
  }

  /**
   * 模擬音量閃爍特效（移植自原 server.js 的 runFlashEffect）
   */
  _startFlashEffect(color) {
    this._stopEffect();
    this._setMode("off");
    this._animationInterval = setInterval(() => {
      const loudness = 0.2 + Math.random() * 0.8;
      const r = Math.min(255, Math.floor(color.r * loudness));
      const g = Math.min(255, Math.floor(color.g * loudness));
      const b = Math.min(255, Math.floor(color.b * loudness));
      this._setColor(r, g, b);
    }, 100);
  }

  _stopEffect() {
    if (this._animationInterval) {
      clearInterval(this._animationInterval);
      this._animationInterval = null;
    }
  }
}

module.exports = ESP32Device;
