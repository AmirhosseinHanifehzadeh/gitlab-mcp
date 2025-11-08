import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import process from 'node:process';
import { z } from 'zod';

// Define input schema for the tool
const toolInputSchemaShape = {
  project_id: z
    .string()
    .describe(
      'Numeric project ID or full path (e.g., "123" or "group/project")'
    ),
  merge_request_iid: z
    .string()
    .describe('Internal IID of the merge request (e.g., "456")'),
  per_page: z
    .number()
    .int()
    .min(1)
    .max(100)
    .optional()
    .describe('Number of discussions per page (GitLab default 20).'),
  page: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Page of discussions to fetch (GitLab default 1).'),
  include_resolved: z
    .boolean()
    .optional()
    .describe('If false (default), resolved comments are excluded.'),
};

type ToolArgs = z.infer<z.ZodObject<typeof toolInputSchemaShape>>;

type CommentPayload = {
  file: string | null;
  line: number | null;
  text: string;
  author: string | null;
  created_at: string | null;
  resolved: boolean;
};

const server = new McpServer({
  name: 'gitlab-mr-comments',
  version: '0.1.0',
});

server.registerTool(
  'gitlab.get_merge_request_comments',
  {
    description:
      'Fetch comments for a GitLab merge request and return filename, line, and text. Provide the project path (e.g., "mars/general-market") and merge request IID (e.g., "7380").',
    inputSchema: toolInputSchemaShape,
  },
  async (args): Promise<CallToolResult> => {
    try {
      console.error(
        '[MCP] Tool called with args:',
        JSON.stringify(args, null, 2)
      );
      const result = await fetchMergeRequestComments(args);
      console.error('[MCP] Successfully fetched', result.length, 'comments');
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      console.error('[MCP] Error in tool execution:', error);
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      const errorStack = error instanceof Error ? error.stack : undefined;

      console.error('[MCP] Error details:', {
        message: errorMessage,
        stack: errorStack,
      });

      return {
        content: [
          {
            type: 'text',
            text: `Error: ${errorMessage}`,
          },
        ],
        isError: true,
      };
    }
  }
);

// Server is ready to receive tool calls

async function fetchMergeRequestComments(
  args: ToolArgs
): Promise<CommentPayload[]> {
  console.error('[MCP] Starting fetchMergeRequestComments');

  try {
    const host = resolveHost();
    console.error('[MCP] GitLab host:', host);

    const token = resolveToken();
    console.error(
      '[MCP] GitLab token:',
      token ? `${token.substring(0, 4)}***` : 'NOT SET'
    );

    const sslVerify = resolveSslVerify();
    console.error('[MCP] SSL verify:', sslVerify);

    const projectId = encodeURIComponent(String(args.project_id));
    const mrIid = encodeURIComponent(String(args.merge_request_iid));

    console.error('[MCP] Project ID:', projectId);
    console.error('[MCP] MR IID:', mrIid);

    const searchParams = new URLSearchParams();
    if (args.per_page) searchParams.set('per_page', String(args.per_page));
    if (args.page) searchParams.set('page', String(args.page));

    const url = new URL(
      `/api/v4/projects/${projectId}/merge_requests/${mrIid}/discussions`,
      host
    );
    if ([...searchParams.keys()].length > 0) {
      url.search = searchParams.toString();
    }

    console.error('[MCP] Request URL:', url.toString());

    if (!sslVerify) {
      console.error('[MCP] Disabling SSL verification');
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    }

    console.error('[MCP] Sending request to GitLab API...');
    const response = await fetch(url, {
      headers: {
        'PRIVATE-TOKEN': token,
        Accept: 'application/json',
      },
    });

    console.error(
      '[MCP] Response status:',
      response.status,
      response.statusText
    );

    if (!response.ok) {
      const body = await safeReadBody(response);
      console.error('[MCP] Error response body:', body);
      throw new Error(`GitLab API error ${response.status}: ${body}`);
    }

    console.error('[MCP] Parsing response JSON...');
    const discussions = (await response.json()) as GitLabDiscussion[];
    console.error('[MCP] Received', discussions.length, 'discussions');

    const includeResolved = args.include_resolved ?? false;
    console.error('[MCP] Include resolved:', includeResolved);

    const comments: CommentPayload[] = [];

    for (const discussion of discussions) {
      if (!Array.isArray(discussion.notes)) continue;

      for (const note of discussion.notes) {
        if (!note) continue;
        if (note.system) continue;
        if (!includeResolved && note.resolvable && note.resolved) continue;

        const position = note.position ?? {};
        const file = position.new_path ?? position.old_path ?? null;
        const line = position.new_line ?? position.old_line ?? null;

        comments.push({
          file,
          line,
          text: note.body ?? '',
          author: note.author?.username ?? note.author?.name ?? null,
          created_at: note.created_at ?? null,
          resolved: note.resolved ?? false,
        });
      }
    }

    console.error('[MCP] Processed', comments.length, 'comments');
    return comments;
  } catch (error) {
    console.error('[MCP] Error in fetchMergeRequestComments:', error);
    throw error;
  }
}

type GitLabDiscussion = {
  notes?: GitLabNote[];
};

type GitLabNote = {
  body?: string;
  system?: boolean;
  resolvable?: boolean;
  resolved?: boolean;
  position?: {
    new_path?: string;
    old_path?: string;
    new_line?: number;
    old_line?: number;
  };
  author?: {
    username?: string;
    name?: string;
  };
  created_at?: string;
};

function resolveHost(): string {
  console.error('[MCP] Resolving GitLab host from environment');
  const host = process.env.GITLAB_HOST || process.env.GITLAB_BASE_URL;
  if (!host) {
    console.error('[MCP] ERROR: GITLAB_HOST environment variable not set');
    console.error(
      '[MCP] Available env vars:',
      Object.keys(process.env).filter((k) => k.startsWith('GITLAB'))
    );
    throw new Error('Missing GITLAB_HOST environment variable.');
  }
  const resolvedHost = host.endsWith('/') ? host.slice(0, -1) : host;
  console.error('[MCP] Resolved host:', resolvedHost);
  return resolvedHost;
}

function resolveToken(): string {
  console.error('[MCP] Resolving GitLab token from environment');
  const token =
    process.env.GITLAB_TOKEN || process.env.GITLAB_PERSONAL_ACCESS_TOKEN;
  if (!token) {
    console.error('[MCP] ERROR: GITLAB_TOKEN environment variable not set');
    console.error(
      '[MCP] Available env vars:',
      Object.keys(process.env).filter((k) => k.startsWith('GITLAB'))
    );
    throw new Error('Missing GITLAB_TOKEN environment variable.');
  }
  console.error('[MCP] Token found (length:', token.length, ')');
  return token;
}

function resolveSslVerify(): boolean {
  const raw = process.env.GITLAB_SSL_VERIFY;
  if (raw === undefined) {
    console.error('[MCP] SSL verification: enabled (default)');
    return true;
  }
  const verify = !['0', 'false', 'no'].includes(raw.toLowerCase());
  console.error('[MCP] SSL verification:', verify ? 'enabled' : 'disabled');
  return verify;
}

async function safeReadBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (err) {
    console.error('[MCP] Error reading response body:', err);
    return '';
  }
}

async function main(): Promise<void> {
  console.error('[MCP] ====================================');
  console.error('[MCP] GitLab MR Comments MCP Server');
  console.error('[MCP] Version: 0.1.0');
  console.error('[MCP] ====================================');
  console.error('[MCP] Node version:', process.version);
  console.error('[MCP] Platform:', process.platform);
  console.error('[MCP] CWD:', process.cwd());

  try {
    console.error('[MCP] Creating stdio transport...');
    const transport = new StdioServerTransport();

    console.error('[MCP] Connecting server to transport...');
    await server.connect(transport);

    console.error('[MCP] ====================================');
    console.error('[MCP] Server successfully connected!');
    console.error('[MCP] Ready to receive tool calls');
    console.error('[MCP] ====================================');
  } catch (error) {
    console.error('[MCP] ====================================');
    console.error('[MCP] FATAL ERROR during startup');
    console.error('[MCP] ====================================');
    console.error('[MCP] Error:', error);
    if (error instanceof Error) {
      console.error('[MCP] Message:', error.message);
      console.error('[MCP] Stack:', error.stack);
    }
    throw error;
  }
}

main().catch((error) => {
  console.error('[MCP] ====================================');
  console.error('[MCP] MCP server failed to start');
  console.error('[MCP] ====================================');
  console.error('[MCP] Error:', error);
  if (error instanceof Error) {
    console.error('[MCP] Message:', error.message);
    console.error('[MCP] Stack:', error.stack);
  }
  process.exitCode = 1;
});
