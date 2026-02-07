import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";

export async function startMcpServer({ tools, callTool, serverInfo }) {
  const server = new Server(
    {
      name: serverInfo?.name || "tron-mcp-server",
      version: serverInfo?.version || "0.1.0"
    },
    {
      capabilities: {
        tools: {}
      }
    }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
  });

  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const name = request?.params?.name;
    const args = request?.params?.arguments ?? {};
    const result = await callTool(name, args);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(result, null, 2)
        }
      ],
      isError: result?.ok === false
    };
  });

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
