import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  RULESYNC_MCP_SCHEMA_URL,
  RULESYNC_RELATIVE_DIR_PATH,
} from "../../constants/rulesync-paths.js";
import { setupTestDirectory } from "../../test-utils/test-directories.js";
import { ensureDir, writeFileContent } from "../../utils/file.js";
import { AntigravityMcp } from "./antigravity-mcp.js";
import { RulesyncMcp } from "./rulesync-mcp.js";

describe("AntigravityMcp", () => {
  let testDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    ({ testDir, cleanup } = await setupTestDirectory());
    vi.spyOn(process, "cwd").mockReturnValue(testDir);
  });

  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should create instance with default parameters in project mode", () => {
      const validJsonContent = JSON.stringify({
        mcpServers: {
          filesystem: {
            command: "npx",
            args: ["-y", "@anthropic-ai/mcp-server-filesystem", "/workspace"],
          },
        },
      });

      const mcp = new AntigravityMcp({
        relativeDirPath: ".agents",
        relativeFilePath: "mcp.json",
        fileContent: validJsonContent,
      });

      expect(mcp).toBeInstanceOf(AntigravityMcp);
      expect(mcp.getRelativeDirPath()).toBe(".agents");
      expect(mcp.getRelativeFilePath()).toBe("mcp.json");
      expect(mcp.getFileContent()).toBe(validJsonContent);
    });

    it("should create instance with custom outputRoot in global mode", () => {
      const validJsonContent = JSON.stringify({
        mcpServers: {},
      });

      const mcp = new AntigravityMcp({
        outputRoot: "/custom/path",
        relativeDirPath: join(".gemini", "antigravity"),
        relativeFilePath: "mcp.json",
        fileContent: validJsonContent,
        global: true,
      });

      expect(mcp.getFilePath()).toBe("/custom/path/.gemini/antigravity/mcp.json");
    });
  });

  describe("fromFile", () => {
    it("should create instance from file in project mode", async () => {
      const mcpDir = join(testDir, ".agents");
      await ensureDir(mcpDir);

      const jsonData = {
        mcpServers: {
          filesystem: {
            command: "npx",
            args: ["-y", "@modelcontextprotocol/server-filesystem", testDir],
          },
        },
      };
      await writeFileContent(join(mcpDir, "mcp.json"), JSON.stringify(jsonData, null, 2));

      const mcp = await AntigravityMcp.fromFile({
        outputRoot: testDir,
        global: false,
      });

      expect(mcp).toBeInstanceOf(AntigravityMcp);
      expect(mcp.getJson()).toEqual(jsonData);
      expect(mcp.getFilePath()).toBe(join(testDir, ".agents/mcp.json"));
    });

    it("should create instance from file in global mode", async () => {
      const globalDir = join(testDir, ".gemini", "antigravity");
      await ensureDir(globalDir);

      const jsonData = {
        mcpServers: {
          remote: {
            type: "sse",
            serverUrl: "http://localhost:8080/mcp",
          },
        },
      };
      await writeFileContent(join(globalDir, "mcp.json"), JSON.stringify(jsonData));

      const mcp = await AntigravityMcp.fromFile({
        outputRoot: testDir,
        global: true,
      });

      expect(mcp.getFilePath()).toBe(join(testDir, ".gemini/antigravity/mcp.json"));
      expect(mcp.getJson()).toEqual(jsonData);
    });
  });

  describe("fromRulesyncMcp", () => {
    it("should translate url to serverUrl for remote servers", () => {
      const inputMcpServers = {
        remote: {
          type: "sse" as const,
          url: "http://localhost:8080/mcp",
        },
      };
      const rulesyncMcp = new RulesyncMcp({
        relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
        relativeFilePath: "mcp.json",
        fileContent: JSON.stringify({ mcpServers: inputMcpServers }),
      });

      const mcp = AntigravityMcp.fromRulesyncMcp({
        rulesyncMcp,
      });

      expect(mcp).toBeInstanceOf(AntigravityMcp);
      expect(mcp.getJson()).toEqual({
        mcpServers: {
          remote: {
            type: "sse",
            serverUrl: "http://localhost:8080/mcp",
          },
        },
      });
    });

    it("should translate httpUrl to serverUrl for remote servers", () => {
      const inputMcpServers = {
        remote: {
          type: "http" as const,
          httpUrl: "http://localhost:8080/mcp",
        },
      };
      const rulesyncMcp = new RulesyncMcp({
        relativeDirPath: RULESYNC_RELATIVE_DIR_PATH,
        relativeFilePath: "mcp.json",
        fileContent: JSON.stringify({ mcpServers: inputMcpServers }),
      });

      const mcp = AntigravityMcp.fromRulesyncMcp({
        rulesyncMcp,
      });

      expect(mcp.getJson()).toEqual({
        mcpServers: {
          remote: {
            type: "http",
            serverUrl: "http://localhost:8080/mcp",
          },
        },
      });
    });
  });

  describe("toRulesyncMcp", () => {
    it("should translate serverUrl back to url", () => {
      const inputMcpServers = {
        remote: {
          type: "sse",
          serverUrl: "http://localhost:8080/mcp",
        },
      };
      const mcp = new AntigravityMcp({
        relativeDirPath: ".agents",
        relativeFilePath: "mcp.json",
        fileContent: JSON.stringify({ mcpServers: inputMcpServers }),
      });

      const rulesyncMcp = mcp.toRulesyncMcp();

      expect(rulesyncMcp).toBeInstanceOf(RulesyncMcp);
      expect(rulesyncMcp.getJson()).toEqual({
        mcpServers: {
          remote: {
            type: "sse",
            url: "http://localhost:8080/mcp",
          },
        },
        $schema: RULESYNC_MCP_SCHEMA_URL,
      });
    });
  });

  describe("validate", () => {
    it("should return successful validation result", () => {
      const mcp = new AntigravityMcp({
        relativeDirPath: ".agents",
        relativeFilePath: "mcp.json",
        fileContent: JSON.stringify({
          mcpServers: {
            test: {
              type: "stdio",
              command: "node",
            },
          },
        }),
      });

      expect(mcp.validate().success).toBe(true);
    });

    it("should fail validation for invalid config", () => {
      const mcp = new AntigravityMcp({
        relativeDirPath: ".agents",
        relativeFilePath: "mcp.json",
        fileContent: JSON.stringify({
          mcpServers: {
            test: {
              type: 123, // Invalid: type must be string
            },
          },
        }),
        validate: false,
      });

      expect(mcp.validate().success).toBe(false);
    });
  });
});
