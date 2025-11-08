# GitLab MR Comments MCP Server

A Model Context Protocol (MCP) server that fetches merge request comments from GitLab, including file names, line numbers, and comment text.

## Features

- Fetches comments from GitLab merge requests via the GitLab API
- Returns structured data with:
  - File name (if comment is on a specific file)
  - Line number (if comment is on a specific line)
  - Comment text
  - Author information
  - Creation timestamp
  - Resolution status
- Supports pagination
- Optional filtering of resolved comments
- SSL verification control

## Installation

```bash
npm install
npm run build
```

## Configuration

Set the following environment variables:

### Required

- `GITLAB_HOST` or `GITLAB_BASE_URL`: Your GitLab instance URL (e.g., `https://gitlab.com`)
- `GITLAB_TOKEN` or `GITLAB_PERSONAL_ACCESS_TOKEN`: Your GitLab personal access token

### Optional

- `GITLAB_SSL_VERIFY`: SSL certificate verification. Set to `0`, `false`, or `no` to disable (default: enabled)

## Usage

### As an MCP Server

Add to your MCP client configuration (e.g., Claude Desktop, Cline):

```json
{
  "mcpServers": {
    "gitlab-mr-comments": {
      "command": "node",
      "args": ["/path/to/gitlab-mr-comments/dist/index.js"],
      "env": {
        "GITLAB_HOST": "https://gitlab.com",
        "GITLAB_TOKEN": "your-gitlab-token-here"
      }
    }
  }
}
```

### Using with AI Assistants

When you paste a GitLab merge request URL to an AI assistant that has this MCP server configured, the AI should automatically:

1. Parse the URL to extract the project path and MR IID
2. Call the tool with the correct parameters
3. Return the comments in a readable format

**Example prompt:**

```
Show me the comments from this merge request:
https://mars-gitlab.systemgroup.net/mars/general-market/-/merge_requests/7380
```

The AI will extract:

- Project: `mars/general-market`
- MR IID: `7380`

And call the tool accordingly.

### Tool: `gitlab.get_merge_request_comments`

Fetches comments for a specific merge request.

#### Parameters

- `project_id` (string): Numeric project ID or full path (e.g., `"123"` or `"mygroup/myproject"`)
- `merge_request_iid` (string): Internal IID of the merge request (e.g., `"456"`)
- `per_page` (number, optional): Number of discussions per page (1-100, default: GitLab default of 20)
- `page` (number, optional): Page of discussions to fetch (default: 1)
- `include_resolved` (boolean, optional): Include resolved comments (default: `false`)

#### Extracting Parameters from a GitLab URL

Given a merge request URL like:

```
https://mars-gitlab.systemgroup.net/mars/general-market/-/merge_requests/7380
```

Extract the parameters as:

- `project_id`: `"mars/general-market"` (the path between the domain and `/-/merge_requests/`)
- `merge_request_iid`: `"7380"` (the number after `/merge_requests/`)

**Example:**

```javascript
{
  "project_id": "mars/general-market",
  "merge_request_iid": "7380"
}
```

#### Example Response

```json
[
  {
    "file": "src/index.ts",
    "line": 42,
    "text": "Consider refactoring this function for better readability",
    "author": "john.doe",
    "created_at": "2024-11-08T10:30:00.000Z",
    "resolved": false
  },
  {
    "file": "README.md",
    "line": 10,
    "text": "This documentation needs to be updated",
    "author": "jane.smith",
    "created_at": "2024-11-07T14:20:00.000Z",
    "resolved": true
  },
  {
    "file": null,
    "line": null,
    "text": "Overall, this looks good to merge!",
    "author": "bob.wilson",
    "created_at": "2024-11-08T09:00:00.000Z",
    "resolved": false
  }
]
```

## Development

### Build

```bash
npm run build
```

### Run

```bash
npm start
```

## API Details

This server uses the GitLab REST API v4:

- Endpoint: `/api/v4/projects/{project_id}/merge_requests/{merge_request_iid}/discussions`
- Authentication: Personal Access Token via `PRIVATE-TOKEN` header

## Debugging & Troubleshooting

### Viewing Logs

All logs are written to **stderr** with the prefix `[MCP]`. When running in an MCP client, these logs will typically appear in the client's log file or console.

**Example logs on startup:**

```
[MCP] ====================================
[MCP] GitLab MR Comments MCP Server
[MCP] Version: 0.1.0
[MCP] ====================================
[MCP] Node version: v20.x.x
[MCP] Platform: linux
[MCP] CWD: /path/to/project
[MCP] Creating stdio transport...
[MCP] Connecting server to transport...
[MCP] ====================================
[MCP] Server successfully connected!
[MCP] Ready to receive tool calls
[MCP] ====================================
```

**Example logs when tool is called:**

```
[MCP] Tool called with args: {
  "project_id": "mygroup/myproject",
  "merge_request_iid": 123
}
[MCP] Starting fetchMergeRequestComments
[MCP] Resolving GitLab host from environment
[MCP] Resolved host: https://gitlab.com
[MCP] Resolving GitLab token from environment
[MCP] Token found (length: 20)
[MCP] SSL verification: enabled (default)
[MCP] Project ID: mygroup%2Fmyproject
[MCP] MR IID: 123
[MCP] Request URL: https://gitlab.com/api/v4/projects/mygroup%2Fmyproject/merge_requests/123/discussions
[MCP] Sending request to GitLab API...
[MCP] Response status: 200 OK
[MCP] Parsing response JSON...
[MCP] Received 5 discussions
[MCP] Include resolved: false
[MCP] Processed 12 comments
[MCP] Successfully fetched 12 comments
```

### Common Issues

#### 1. Environment Variables Not Set

**Symptom:**

```
[MCP] ERROR: GITLAB_HOST environment variable not set
[MCP] Available env vars: []
```

**Solution:** Make sure to set `GITLAB_HOST` and `GITLAB_TOKEN` in your MCP client configuration:

```json
{
  "env": {
    "GITLAB_HOST": "https://gitlab.com",
    "GITLAB_TOKEN": "your-token-here"
  }
}
```

#### 2. Authentication Error

**Symptom:**

```
[MCP] Response status: 401 Unauthorized
[MCP] Error response body: {"message":"401 Unauthorized"}
```

**Solution:**

- Check that your GitLab token is valid
- Ensure the token has `api` or `read_api` scope
- Verify you're using the correct token for your GitLab instance

#### 3. Project Not Found

**Symptom:**

```
[MCP] Response status: 404 Not Found
[MCP] Error response body: {"message":"404 Project Not Found"}
```

**Solution:**

- Verify the project ID or path is correct
- Ensure you have access to the project
- For project paths with special characters, they will be automatically URL-encoded

#### 4. SSL Certificate Issues

**Symptom:**

```
Error: self signed certificate in certificate chain
```

**Solution:** Disable SSL verification (for development/testing only):

```json
{
  "env": {
    "GITLAB_SSL_VERIFY": "0"
  }
}
```

### Testing Locally

Use the included test script to verify your configuration:

```bash
# Set environment variables
export GITLAB_HOST="https://gitlab.com"
export GITLAB_TOKEN="your-token-here"

# Run test
./test-mcp.sh
```

The server will start and show you all initialization logs. Press Ctrl+C to stop.

### Checking MCP Client Logs

Different MCP clients store logs in different locations:

**Claude Desktop (macOS):**

```bash
tail -f ~/Library/Logs/Claude/mcp*.log
```

**Claude Desktop (Linux):**

```bash
tail -f ~/.config/Claude/logs/mcp*.log
```

**Cline (VS Code):**

- Check the VS Code Output panel
- Select "Cline" from the dropdown

## License

MIT
