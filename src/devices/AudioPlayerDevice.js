// 音訊播放裝置 — 播放 WAV 音檔，含播放鎖定機制防止重疊
// 播放完畢時透過 EventBus 發送 audio:finished 事件

const path = require("path");
const player = require("node-wav-player");
const BaseDevice = require("./BaseDevice");

class AudioPlayerDevice extends BaseDevice {
  constructor(id, config, eventBus) {
    super(id, config, eventBus);
    this.audioDir = path.resolve(config.audioDir || "./public/audio");
    this.isPlaying = false;
    this.currentFile = null;
  }

  async init() {
    this._setStatus("online");
  }

  async execute(action, params = {}) {
    switch (action) {
      case "play":
        return this._play(params.file);
      case "stop":
        return this._stop();
      case "isPlaying":
        return { isPlaying: this.isPlaying, currentFile: this.currentFile };
      default:
        throw new Error(`[${this.id}] 不支援的動作: ${action}`);
    }
  }

  getSupportedActions() {
    return [
      { action: "play", params: { file: "string" }, description: "播放音檔" },
      { action: "stop", params: {}, description: "停止播放" },
      { action: "isPlaying", params: {}, description: "查詢播放狀態" },
    ];
  }

  getStatus() {
    return {
      ...super.getStatus(),
      isPlaying: this.isPlaying,
      currentFile: this.currentFile,
    };
  }

  async destroy() {
    this._stop();
    await super.destroy();
  }

  // ---- 私有方法 ----

  async _play(file) {
    if (this.isPlaying) {
      console.log(`[${this.id}] 忽略播放請求 — 音樂播放中: ${this.currentFile}`);
      return { status: "busy", currentFile: this.currentFile };
    }

    this.isPlaying = true;
    this.currentFile = file;
    const filePath = path.join(this.audioDir, file);
    console.log(`[${this.id}] 開始播放: ${file}`);
    this.eventBus.publish(`${this.id}:playing`, { file });

    try {
      await player.play({ path: filePath, sync: true });
      console.log(`[${this.id}] 播放結束: ${file}`);
    } catch (err) {
      console.error(`[${this.id}] 播放錯誤:`, err.message);
    } finally {
      this.isPlaying = false;
      this.currentFile = null;
      this.eventBus.publish(`${this.id}:finished`, { file });
    }

    return { status: "ok" };
  }

  _stop() {
    if (this.isPlaying) {
      try { player.stop(); } catch {}
      this.isPlaying = false;
      this.currentFile = null;
      this.eventBus.publish(`${this.id}:stopped`, {});
    }
  }
}

module.exports = AudioPlayerDevice;
