import { app, assertRequiredEnv, connectDatabase } from './app.js';

const PORT = process.env.PORT || 5000;

assertRequiredEnv();

connectDatabase()
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`API running on ${PORT}`));
  })
  .catch((err) => {
    console.error('MongoDB connection failed:', err.message);
    process.exit(1);
  });
