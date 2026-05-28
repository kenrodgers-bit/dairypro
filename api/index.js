let appPromise;

module.exports = async function handler(req, res) {
  if (!appPromise) {
    appPromise = import('../server/src/app.js').then((module) => {
      module.assertRequiredEnv();
      return module.app;
    });
  }

  const app = await appPromise;
  return app(req, res);
};
