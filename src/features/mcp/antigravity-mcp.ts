import { join } from "node:path";

import { z } from "zod/mini";

import { ValidationResult } from "../../types/ai-file.js";
import { McpServer, McpServerSchema, McpServers } from "../../types/mcp.js";
import { readFileContent } from "../../utils/file.js";
import { RulesyncMcp } from "./rulesync-mcp.js";
import {
  ToolMcp,
  ToolMcpForDeletionParams,
  ToolMcpFromFileParams,
  ToolMcpFromRulesyncMcpParams,
  ToolMcpParams,
  ToolMcpSettablePaths,
} from "./tool-mcp.js";

// Antigravity MCP server schema
const AntigravityMcpServerSchema = z.extend(McpServerSchema, {
  serverUrl: z.optional(z.string()),
});

const AntigravityMcpConfigSchema = z.object({
  mcpServers: z.record(z.string(), AntigravityMcpServerSchema),
});

type AntigravityMcpConfig = z.infer<typeof AntigravityMcpConfigSchema>;

function convertFromAntigravityFormat(json: AntigravityMcpConfig): McpServers {
  return Object.fromEntries(
    Object.entries(json.mcpServers).map(([serverName, serverConfig]) => {
      const { serverUrl, ...rest } = serverConfig;
      const standardConfig: McpServer = {
        ...rest,
        ...(serverUrl ? { url: serverUrl } : {}),
      };
      return [serverName, standardConfig];
    }),
  );
}

function convertToAntigravityFormat(mcpServers: McpServers): AntigravityMcpConfig {
  const mcpServersConfig = Object.fromEntries(
    Object.entries(mcpServers).map(([serverName, serverConfig]) => {
      const { url, httpUrl, ...rest } = serverConfig;
      const urlToUse = url ?? httpUrl;
      const isRemote =
        serverConfig.type === "sse" ||
        serverConfig.type === "http" ||
        url !== undefined ||
        httpUrl !== undefined;
      const antigravityConfig: McpServer = {
        ...rest,
        ...(isRemote && urlToUse ? { serverUrl: urlToUse } : {}),
      };
      return [serverName, antigravityConfig];
    }),
  );
  return { mcpServers: mcpServersConfig };
}

export class AntigravityMcp extends ToolMcp {
  private readonly json: AntigravityMcpConfig;

  constructor(params: ToolMcpParams) {
    super(params);
    this.json = this.fileContent !== undefined ? JSON.parse(this.fileContent) : { mcpServers: {} };
  }

  getJson(): AntigravityMcpConfig {
    return this.json;
  }

  static getSettablePaths({ global = false }: { global?: boolean } = {}): ToolMcpSettablePaths {
    if (global) {
      return {
        relativeDirPath: join(".gemini", "antigravity"),
        relativeFilePath: "mcp_config.json",
        alternativePaths: [
          {
            relativeDirPath: join(".gemini", "antigravity-cli"),
            relativeFilePath: "mcp_config.json",
          },
          {
            relativeDirPath: join(".gemini", "antigravity-ide"),
            relativeFilePath: "mcp_config.json",
          },
        ],
      };
    }
    return {
      relativeDirPath: ".agents",
      relativeFilePath: "mcp_config.json",
    };
  }

  static async fromFile({
    outputRoot = process.cwd(),
    validate = true,
    global = false,
    relativeDirPath,
    relativeFilePath,
  }: ToolMcpFromFileParams): Promise<AntigravityMcp> {
    const paths = this.getSettablePaths({ global });
    const actualDirPath = relativeDirPath ?? paths.relativeDirPath;
    const actualFilePath = relativeFilePath ?? paths.relativeFilePath;
    const fileContent = await readFileContent(join(outputRoot, actualDirPath, actualFilePath));

    return new AntigravityMcp({
      outputRoot,
      relativeDirPath: actualDirPath,
      relativeFilePath: actualFilePath,
      fileContent,
      validate,
      global,
    });
  }

  static fromRulesyncMcp({
    outputRoot = process.cwd(),
    rulesyncMcp,
    validate = true,
    global = false,
    relativeDirPath,
    relativeFilePath,
  }: ToolMcpFromRulesyncMcpParams): AntigravityMcp {
    const antigravityConfig = convertToAntigravityFormat(rulesyncMcp.getMcpServers());
    const paths = this.getSettablePaths({ global });
    const actualDirPath = relativeDirPath ?? paths.relativeDirPath;
    const actualFilePath = relativeFilePath ?? paths.relativeFilePath;
    return new AntigravityMcp({
      outputRoot,
      relativeDirPath: actualDirPath,
      relativeFilePath: actualFilePath,
      fileContent: JSON.stringify(antigravityConfig, null, 2),
      validate,
      global,
    });
  }

  toRulesyncMcp(): RulesyncMcp {
    const mcpServers = convertFromAntigravityFormat(this.json);
    return this.toRulesyncMcpDefault({
      fileContent: JSON.stringify({ mcpServers }, null, 2),
    });
  }

  validate(): ValidationResult {
    const json = JSON.parse(this.fileContent || "{}");
    const result = AntigravityMcpConfigSchema.safeParse(json);
    if (!result.success) {
      return { success: false, error: result.error };
    }
    return { success: true, error: null };
  }

  static forDeletion({
    outputRoot = process.cwd(),
    relativeDirPath,
    relativeFilePath,
    global = false,
  }: ToolMcpForDeletionParams): AntigravityMcp {
    return new AntigravityMcp({
      outputRoot,
      relativeDirPath,
      relativeFilePath,
      fileContent: JSON.stringify({ mcpServers: {} }, null, 2),
      validate: false,
      global,
    });
  }
}
