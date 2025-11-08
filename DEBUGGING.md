# GitLab MR Comments MCP - Debugging Guide

## Quick Start Debugging

### 1. Check Your Environment

```bash
echo "GITLAB_HOST: $GITLAB_HOST"
echo "GITLAB_TOKEN: ${GITLAB_TOKEN:0:4}***"
```

### 2. Test Locally

```bash
./test-mcp.sh
```

This will show you all startup logs. Look for:

- ✓ Server successfully connected
- ✓ Ready to receive tool calls

### 3. Common Log Patterns

#### Success Pattern

```
[MCP] Server successfully connected!
[MCP] Ready to receive tool calls
```

#### Environment Error Pattern

```
[MCP] ERROR: GITLAB_HOST environment variable not set
[MCP] Available env vars: [...]
```

#### API Error Pattern

```
[MCP] Response status: 401 Unauthorized
[MCP] Error response body: {"message":"401 Unauthorized"}
```

## What Gets Logged

### On Startup

- Server version and info
- Node.js version
- Platform details
- Transport connection status

### On Each Tool Call

- Input arguments (project_id, merge_request_iid, etc.)
- Environment variable resolution
- GitLab host and token info (token partially masked)
- SSL verification status
- Full request URL
- HTTP response status
- Number of discussions received
- Number of comments processed
- Any errors with full stack traces

### On Errors

- Error message
- Error stack trace
- Response body from GitLab API
- Environment variables that start with GITLAB\_\*

## Finding Logs

### In Claude Desktop

**macOS:**

```bash
tail -f ~/Library/Logs/Claude/mcp*.log | grep "\[MCP\]"
```

**Linux:**

```bash
tail -f ~/.config/Claude/logs/mcp*.log | grep "\[MCP\]"
```

### In Cline (VS Code)

1. Open Command Palette (Ctrl/Cmd + Shift + P)
2. Type "Output: Show Output Panel"
3. Select "Cline" from dropdown

### In Your Own MCP Client

All logs go to **stderr**, so redirect it to a file:

```bash
node dist/index.js 2> mcp-debug.log
```

## Troubleshooting Steps

### Step 1: Verify Build

```bash
npm run build
ls -la dist/index.js  # Should exist
```

### Step 2: Verify Environment

```bash
node -e "console.log('GITLAB_HOST:', process.env.GITLAB_HOST)"
node -e "console.log('GITLAB_TOKEN:', process.env.GITLAB_TOKEN ? 'SET' : 'NOT SET')"
```

### Step 3: Test GitLab API Manually

```bash
curl -H "PRIVATE-TOKEN: $GITLAB_TOKEN" \
  "$GITLAB_HOST/api/v4/projects/YOUR_PROJECT_ID/merge_requests/123/discussions"
```

### Step 4: Check MCP Configuration

Verify your MCP client config includes:

```json
{
  "mcpServers": {
    "gitlab-mr-comments": {
      "command": "node",
      "args": ["/absolute/path/to/dist/index.js"],
      "env": {
        "GITLAB_HOST": "https://your-gitlab-instance.com",
        "GITLAB_TOKEN": "your-token-here"
      }
    }
  }
}
```

## Example Debug Session

Here's what a successful call looks like:

```
[MCP] Tool called with args: {
  "project_id": "123",
  "merge_request_iid": "456"
}
[MCP] Starting fetchMergeRequestComments
[MCP] Resolving GitLab host from environment
[MCP] Resolved host: https://gitlab.example.com
[MCP] Resolving GitLab token from environment
[MCP] Token found (length: 20)
[MCP] SSL verification: enabled (default)
[MCP] Project ID: 123
[MCP] MR IID: 456
[MCP] Request URL: https://gitlab.example.com/api/v4/projects/123/merge_requests/456/discussions
[MCP] Sending request to GitLab API...
[MCP] Response status: 200 OK
[MCP] Parsing response JSON...
[MCP] Received 3 discussions
[MCP] Include resolved: false
[MCP] Processed 8 comments
[MCP] Successfully fetched 8 comments
```

## Need More Help?

1. **Check the full README.md** for configuration examples
2. **Run `./test-mcp.sh`** to test locally
3. **Look for `[MCP]` prefix** in your client's logs
4. **Verify GitLab API access** with curl command above
