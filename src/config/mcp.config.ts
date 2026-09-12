import "dotenv/config";
import { createRequire } from "node:module";

export interface McpServerConfig {
  type: "stdio";
  command: string;
  args: string[];
  env?: Record<string, string>;
}

// Resolve the installed, lockfile-pinned server; avoids Windows npx shell issues.
const require = createRequire(import.meta.url);
export const mcpServersConfig: Record<string, McpServerConfig> = {
  a11y: {
    type: "stdio",
    command: process.execPath,
    args: [require.resolve("accessibility-scanner-mcp/server.mjs")],
    env: process.env.CHROME_PATH ? { CHROME_PATH: process.env.CHROME_PATH } : {},
  },
};
export const accessibilityTools = ["mcp__a11y__scan_accessibility"];
