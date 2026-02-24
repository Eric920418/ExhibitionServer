// 攝像頭感測裝置 — 包裝 camera.py Python 子程序
// 接收 Python 輸出的 DATA:xxx 資料，轉為事件發射到 EventBus

const { spawn } = require("child_process");
const path = require("path");
const BaseDevice = require("./BaseDevice");

class CameraSensorDevice extends BaseDevice {
  constructor(id, config, eventBus) {
    super(id, config, eventBus);
    this.scriptPath = path.resolve(config.script || "./camera.py");
    this.triggerThreshold = config.triggerThreshold || 0.8;
    this._process = null;
    this._currentBrightness = 0;
    this._wasTriggered = false;
  }

  async init() {
    // 預設不自動啟動攝像頭，透過 execute("start") 控制
    this._setStatus("online");
  }

  async execute(action, params = {}) {
    switch (action) {
      case "start":
        return this._startCamera();
      case "stop":
        return this._stopCamera();
      case "getBrightness":
        return { brightness: this._currentBrightness };
      default:
        throw new Error(`[${this.id}] 不支援的動作: ${action}`);
    }
  }

  getSupportedActions() {
    return [
      { action: "start", params: {}, description: "啟動攝像頭偵測" },
      { action: "stop", params: {}, description: "停止攝像頭偵測" },
      { action: "getBrightness", params: {}, description: "取得目前亮度值" },
    ];
  }

  getStatus() {
    return {
      ...super.getStatus(),
      running: this._process !== null,
      brightness: this._currentBrightness,
    };
  }

  async destroy() {
    this._stopCamera();
    await super.destroy();
  }

  // ---- 私有方法 ----

  _startCamera() {
    if (this._process) return { status: "already_running" };

    console.log(`[${this.id}] 啟動攝像頭偵測: ${this.scriptPath}`);
    this._process = spawn("python", [this.scriptPath]);

    this._process.stdout.on("data", (data) => {
      const output = data.toString();
      if (!output.includes("DATA:")) return;

      const brightness = parseFloat(output.split("DATA:")[1]);
      if (isNaN(brightness)) return;

      this._currentBrightness = brightness;

      // 持續發送亮度資料
      this.eventBus.publish(`${this.id}:brightness`, { brightness });

      // 觸發閾值判定 — 只在狀態切換時發送 faceDetected / faceLost
      if (brightness >= this.triggerThreshold && !this._wasTriggered) {
        this._wasTriggered = true;
        this.eventBus.publish(`${this.id}:faceDetected`, { brightness });
      } else if (brightness < this.triggerThreshold * 0.5 && this._wasTriggered) {
        this._wasTriggered = false;
        this.eventBus.publish(`${this.id}:faceLost`, { brightness });
      }
    });

    this._process.stderr.on("data", () => {});
    this._process.on("close", (code) => {
      console.log(`[${this.id}] camera.py 已結束 (code: ${code})`);
      this._process = null;
    });

    return { status: "started" };
  }

  _stopCamera() {
    if (this._process) {
      console.log(`[${this.id}] 停止攝像頭偵測`);
      this._process.kill();
      this._process = null;
    }
    return { status: "stopped" };
  }
}

module.exports = CameraSensorDevice;
