import { app } from './app.js';
import { env } from './config/env.js';


const PORT = process.env.PORT || 5001;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
