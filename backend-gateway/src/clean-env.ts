import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

// Force load .env and overwrite any existing environment variables (such as those exported in the terminal shell)
const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const envConfig = dotenv.parse(fs.readFileSync(envPath));
  for (const k in envConfig) {
    process.env[k] = envConfig[k];
  }
} else {
  dotenv.config();
}

// Strictly delete GOOGLE_API_KEY to prevent conflict and force the use of GEMINI_API_KEY
delete process.env.GOOGLE_API_KEY;

console.log("[Clean Env] Forced API Key from .env. Key prefix:", process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.substring(0, 10) : "none");
