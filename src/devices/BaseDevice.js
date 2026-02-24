// 裝置抽象基類 — 所有裝置插件必須繼承此類並實作對應方法

class BaseDevice {
  /**
   * @param {string} id        裝置唯一識別碼（對應 config/devices.json 中的 id）
   * @param {object} config    裝置專屬設定（IP、埠號、路徑等）
   * @param {EventBus} eventBus 中央事件匯流排
   */
  constructor(id, config, eventBus) {
    this.id = id;
    this.config = config;
    this.eventBus = eventBus;
    this.status = "offline"; // offline | connecting | online | error
    this.lastError = null;
  }

  /**
   * 初始化裝置（建立連線、啟動子程序等）
   * 子類必須覆寫
   */
  async init() {
    throw new Error(`[${this.id}] init() 未實作`);
  }

  /**
   * 執行指定動作
   * @param {string} action   動作名稱
   * @param {object} params   動作參數
   * @returns {any}           動作結果
   */
  async execute(action, params = {}) {
    throw new Error(`[${this.id}] execute() 未實作 — action: ${action}`);
  }

  /**
   * 取得裝置目前狀態，供 Dashboard 顯示
   */
  getStatus() {
    return {
      id: this.id,
      type: this.constructor.name,
      status: this.status,
      lastError: this.lastError,
    };
  }

  /**
   * 取得此裝置支援的動作清單（供 Dashboard 動態生成 UI）
   * 子類可覆寫以提供更詳細的動作描述
   */
  getSupportedActions() {
    return [];
  }

  /**
   * 銷毀裝置（關閉連線、清理資源）
   * 子類必須覆寫
   */
  async destroy() {
    this.status = "offline";
  }

  // ---- 內部輔助 ----

  _setStatus(status, error = null) {
    this.status = status;
    this.lastError = error;
    this.eventBus.publish(`${this.id}:status`, { status, error });
  }
}

module.exports = BaseDevice;
