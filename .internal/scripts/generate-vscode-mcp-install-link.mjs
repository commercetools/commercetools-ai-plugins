import { config } from "./util.mjs";

const key = "commercetools-knowledge";
const obj = {
  "name": key,
  transport: config.mcpServers[key].transport,
  url: config.mcpServers[key].url,
}
const link = `vscode:mcp/install?${encodeURIComponent(JSON.stringify(obj))}`;
console.log(link);