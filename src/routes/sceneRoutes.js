// 場景控制 REST API 路由

const express = require("express");

/**
 * @param {SceneManager} sceneManager
 */
function createSceneRoutes(sceneManager) {
  const router = express.Router();

  // 取得所有場景列表
  router.get("/scenes", (req, res) => {
    res.json({ scenes: sceneManager.listScenes() });
  });

  // 觸發指定場景
  router.post("/scenes/:name/trigger", async (req, res) => {
    try {
      const result = await sceneManager.triggerScene(req.params.name);
      res.json(result);
    } catch (err) {
      res.status(500).json({ status: "error", error: err.message });
    }
  });

  // 重新載入場景設定
  router.post("/scenes/reload", (req, res) => {
    try {
      const configPath = req.app.get("scenesConfigPath");
      sceneManager.reloadConfig(configPath);
      res.json({ status: "ok", count: sceneManager.scenes.size });
    } catch (err) {
      res.status(500).json({ status: "error", error: err.message });
    }
  });

  return router;
}

module.exports = createSceneRoutes;
