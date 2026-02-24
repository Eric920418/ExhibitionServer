// RemoteDevice — 遠端裝置代理
// 在雲端 Server 上代表一個透過 Bridge 連接的本地裝置
// 所有 execute 指令都透過 BridgeManager 轉發到展場本地

const BaseDevice = require("./BaseDevice");

class RemoteDevice extends BaseDevice {
  /**
   * @param {string} id
   * @param {object} remoteInfo  Bridge 回報的裝置資訊（type, status, ...）
   * @param {EventBus} eventBus
   * @param {BridgeManager} bridgeManager
   */
  constructor(id, remoteInfo, eventBus, bridgeManager) {
    super(id, remoteInfo, eventBus);
    this._bridgeManager = bridgeManager;
    this._remoteType = remoteInfo.type || "Unknown";
    this._remoteStatus = remoteInfo.status || "online";
    this._supportedActions = remoteInfo.supportedActions || [];
    this.status = this._remoteStatus;
  }

  async init() {
    this._setStatus(this._remoteStatus);
  }

  async execute(action, params = {}) {
    return this._bridgeManager.executeRemote(this.id, action, params);
  }

  getSupportedActions() {
    return this._supportedActions;
  }

  getStatus() {
    return {
      id: this.id,
      type: this._remoteType,
      status: this.status,
      lastError: this.lastError,
      remote: true,
    };
  }

  /**
   * Bridge 回報裝置狀態更新時呼叫
   */
  _updateRemoteStatus(info) {
    if (info.status) {
      this.status = info.status;
      this._remoteStatus = info.status;
    }
    if (info.lastError !== undefined) this.lastError = info.lastError;
    if (info.supportedActions) this._supportedActions = info.supportedActions;
  }

  async destroy() {
    this.status = "offline";
  }
}

module.exports = RemoteDevice;
