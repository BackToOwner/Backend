import { app } from './app.js';
import { env } from './config/env.js';
import './db/index.js';

app.listen(env.port, () => {
  console.log(`[backtoowner-admin-backend] listening on http://localhost:${env.port}`);
});
