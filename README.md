# Multi-Agent Observability System

Real-time monitoring and visualization for Claude Code agents through comprehensive hook event tracking. You can watch the [full breakdown here](https://youtu.be/9ijnN985O_c) and watch the latest enhancement where we compare Haiku 4.5 and Sonnet 4.5 [here](https://youtu.be/aA9KP7QIQvM).

## 🎯 Overview

This system provides complete observability into Claude Code agent behavior by capturing, storing, and visualizing Claude Code [Hook events](https://docs.anthropic.com/en/docs/claude-code/hooks) in real-time. It enables monitoring of multiple concurrent agents with session tracking, event filtering, and live updates. 

<img src="images/app.png" alt="Multi-Agent Observability Dashboard" style="max-width: 800px; width: 100%;">

## 🏗️ Architecture

```
Claude Agents → Hook Scripts → HTTP POST → Bun Server → SQLite → WebSocket → Vue Client
```

![Agent Data Flow Animation](images/AgentDataFlowV2.gif)

## 📋 Setup Requirements

Before getting started, ensure you have the following installed:

- **[Claude Code](https://docs.anthropic.com/en/docs/claude-code)** - Anthropic's official CLI for Claude
- **[Astral uv](https://docs.astral.sh/uv/)** - Fast Python package manager (required for hook scripts)
- **[Bun](https://bun.sh/)**, **npm**, or **yarn** - For running the server and client
- **Anthropic API Key** - Set as `ANTHROPIC_API_KEY` environment variable
- **OpenAI API Key** (optional) - For multi-model support with just-prompt MCP tool
- **ElevenLabs API Key** (optional) - For audio features

### System Requirements

Before installation, ensure these system packages are installed:

#### Ubuntu/Debian
```bash
sudo apt-get update
sudo apt-get install -y unzip curl git
```

#### macOS
```bash
# unzip is usually pre-installed
# Install others via Homebrew
brew install curl git
```

#### Windows (WSL2)
```bash
sudo apt-get update
sudo apt-get install -y unzip curl git
```

**Why these are needed**:
- `unzip`: Required by Bun installer to extract binaries
- `curl`: Used to download installers and test endpoints
- `git`: Required for cloning the repository

### Install Bun

Choose ONE of these methods:

#### Method 1: npm (Recommended if you have Node.js)

```bash
npm install -g bun
bun --version  # Verify installation
```

**Advantages**:
- Works on all platforms
- Uses npm's security infrastructure
- No additional system dependencies
- Fastest installation

#### Method 2: Official Installer (Inspect first)

```bash
# Step 1: Download installer
curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh

# Step 2: IMPORTANT - Inspect the script
less /tmp/bun-install.sh
# Review it to ensure:
#  - Only downloads from bun.sh or github.com/oven-sh
#  - Installs to ~/.bun/ (user directory)
#  - No suspicious commands

# Step 3: If safe, install
bash /tmp/bun-install.sh

# Step 4: Clean up
rm /tmp/bun-install.sh

# Step 5: Add to PATH (if needed)
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
```

**Note**: The official installer requires `unzip` to be installed first (see System Requirements above).

### Configure .claude Directory

To setup observability in your repo,we need to copy the .claude directory to your project root.

To integrate the observability hooks into your projects:

1. **Copy the entire `.claude` directory to your project root:**
   ```bash
   cp -R .claude /path/to/your/project/
   ```

2. **Update the `settings.json` configuration:**
   
   Open `.claude/settings.json` in your project and modify the `source-app` parameter to identify your project:
   
   ```json
   {
     "hooks": {
       "PreToolUse": [{
         "matcher": "",
         "hooks": [
           {
             "type": "command",
             "command": "uv run .claude/hooks/pre_tool_use.py"
           },
           {
             "type": "command",
             "command": "uv run .claude/hooks/send_event.py --source-app YOUR_PROJECT_NAME --event-type PreToolUse --summarize"
           }
         ]
       }],
       "PostToolUse": [{
         "matcher": "",
         "hooks": [
           {
             "type": "command",
             "command": "uv run .claude/hooks/post_tool_use.py"
           },
           {
             "type": "command",
             "command": "uv run .claude/hooks/send_event.py --source-app YOUR_PROJECT_NAME --event-type PostToolUse --summarize"
           }
         ]
       }],
       "UserPromptSubmit": [{
         "hooks": [
           {
             "type": "command",
             "command": "uv run .claude/hooks/user_prompt_submit.py --log-only"
           },
           {
             "type": "command",
             "command": "uv run .claude/hooks/send_event.py --source-app YOUR_PROJECT_NAME --event-type UserPromptSubmit --summarize"
           }
         ]
       }]
       // ... (similar patterns for Notification, Stop, SubagentStop, PreCompact, SessionStart, SessionEnd)
     }
   }
   ```
   
   Replace `YOUR_PROJECT_NAME` with a unique identifier for your project (e.g., `my-api-server`, `react-app`, etc.).

3. **Ensure the observability server is running:**
   ```bash
   # From the observability project directory (this codebase)
   ./scripts/start-system.sh
   ```

Now your project will send events to the observability system whenever Claude Code performs actions.

## 🚀 Quick Start

You can quickly view how this works by running this repositories .claude setup.

```bash
# 1. Start both server and client
./scripts/start-system.sh

# 2. Open http://localhost:5173 in your browser

# 3. Open Claude Code and run the following command:
Run git ls-files to understand the codebase.

# 4. Watch events stream in the client

# 5. Copy the .claude folder to other projects you want to emit events from.
cp -R .claude <directory of your codebase you want to emit events from>
```

## ✅ Verify Deployment

After starting the system, verify everything is working:

### 1. Check Server Health

```bash
curl http://localhost:4000/health
# Expected output: Multi-Agent Observability Server
```

### 2. Send Test Event

```bash
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{
    "source_app": "deployment-test",
    "session_id": "test-session-001",
    "hook_event_type": "PreToolUse",
    "payload": {
      "tool_name": "HealthCheck",
      "tool_input": {"command": "test"}
    }
  }'

# Expected output: JSON with "id" and "timestamp" fields
# Example: {"source_app":"deployment-test",...,"id":1,"timestamp":1234567890}
```

### 3. Check Dashboard

1. Open http://localhost:5173 in your browser
2. Look for the test event in the timeline
3. Verify it shows:
   - Source app: "deployment-test"
   - Event type: PreToolUse
   - Tool name: HealthCheck
   - Timestamp

### 4. Verify WebSocket Connection

In the dashboard, look for "Connected" status in the top right corner (green indicator).

If you see these working, your deployment is successful! ✅

## 📁 Project Structure

```
claude-code-hooks-multi-agent-observability/
│
├── apps/                    # Application components
│   ├── server/             # Bun TypeScript server
│   │   ├── src/
│   │   │   ├── index.ts    # Main server with HTTP/WebSocket endpoints
│   │   │   ├── db.ts       # SQLite database management & migrations
│   │   │   └── types.ts    # TypeScript interfaces
│   │   ├── package.json
│   │   └── events.db       # SQLite database (gitignored)
│   │
│   └── client/             # Vue 3 TypeScript client
│       ├── src/
│       │   ├── App.vue     # Main app with theme & WebSocket management
│       │   ├── components/
│       │   │   ├── EventTimeline.vue      # Event list with auto-scroll
│       │   │   ├── EventRow.vue           # Individual event display
│       │   │   ├── FilterPanel.vue        # Multi-select filters
│       │   │   ├── ChatTranscriptModal.vue # Chat history viewer
│       │   │   ├── StickScrollButton.vue  # Scroll control
│       │   │   └── LivePulseChart.vue     # Real-time activity chart
│       │   ├── composables/
│       │   │   ├── useWebSocket.ts        # WebSocket connection logic
│       │   │   ├── useEventColors.ts      # Color assignment system
│       │   │   ├── useChartData.ts        # Chart data aggregation
│       │   │   └── useEventEmojis.ts      # Event type emoji mapping
│       │   ├── utils/
│       │   │   └── chartRenderer.ts       # Canvas chart rendering
│       │   └── types.ts    # TypeScript interfaces
│       ├── .env.sample     # Environment configuration template
│       └── package.json
│
├── .claude/                # Claude Code integration
│   ├── hooks/             # Hook scripts (Python with uv)
│   │   ├── send_event.py  # Universal event sender
│   │   ├── pre_tool_use.py    # Tool validation & blocking
│   │   ├── post_tool_use.py   # Result logging
│   │   ├── notification.py    # User interaction events
│   │   ├── user_prompt_submit.py # User prompt logging & validation
│   │   ├── stop.py           # Session completion
│   │   └── subagent_stop.py  # Subagent completion
│   │
│   └── settings.json      # Hook configuration
│
├── scripts/               # Utility scripts
│   ├── start-system.sh   # Launch server & client
│   ├── reset-system.sh   # Stop all processes
│   └── test-system.sh    # System validation
│
└── logs/                 # Application logs (gitignored)
```

## 🔧 Component Details

### 1. Hook System (`.claude/hooks/`)

> If you want to master claude code hooks watch [this video](https://github.com/disler/claude-code-hooks-mastery)

The hook system intercepts Claude Code lifecycle events:

- **`send_event.py`**: Core script that sends event data to the observability server
  - Supports `--add-chat` flag for including conversation history
  - Validates server connectivity before sending
  - Handles all event types with proper error handling

- **Event-specific hooks**: Each implements validation and data extraction
  - `pre_tool_use.py`: Blocks dangerous commands, validates tool usage
  - `post_tool_use.py`: Captures execution results and outputs
  - `notification.py`: Tracks user interaction points
  - `user_prompt_submit.py`: Logs user prompts, supports validation (v1.0.54+)
  - `stop.py`: Records session completion with optional chat history
  - `subagent_stop.py`: Monitors subagent task completion
  - `pre_compact.py`: Tracks context compaction operations (manual/auto)
  - `session_start.py`: Logs session start, can load development context
  - `session_end.py`: Logs session end, saves session statistics

### 2. Server (`apps/server/`)

Bun-powered TypeScript server with real-time capabilities:

- **Database**: SQLite with WAL mode for concurrent access
- **Endpoints**:
  - `POST /events` - Receive events from agents
  - `GET /events/recent` - Paginated event retrieval with filtering
  - `GET /events/filter-options` - Available filter values
  - `WS /stream` - Real-time event broadcasting
- **Features**:
  - Automatic schema migrations
  - Event validation
  - WebSocket broadcast to all clients
  - Chat transcript storage

### 3. Client (`apps/client/`)

Vue 3 application with real-time visualization:

- **Visual Design**:
  - Dual-color system: App colors (left border) + Session colors (second border)
  - Gradient indicators for visual distinction
  - Dark/light theme support
  - Responsive layout with smooth animations

- **Features**:
  - Real-time WebSocket updates
  - Multi-criteria filtering (app, session, event type)
  - Live pulse chart with session-colored bars and event type indicators
  - Time range selection (1m, 3m, 5m) with appropriate data aggregation
  - Chat transcript viewer with syntax highlighting
  - Auto-scroll with manual override
  - Event limiting (configurable via `VITE_MAX_EVENTS_TO_DISPLAY`)

- **Live Pulse Chart**:
  - Canvas-based real-time visualization
  - Session-specific colors for each bar
  - Event type emojis displayed on bars
  - Smooth animations and glow effects
  - Responsive to filter changes

## 🔄 Data Flow

1. **Event Generation**: Claude Code executes an action (tool use, notification, etc.)
2. **Hook Activation**: Corresponding hook script runs based on `settings.json` configuration
3. **Data Collection**: Hook script gathers context (tool name, inputs, outputs, session ID)
4. **Transmission**: `send_event.py` sends JSON payload to server via HTTP POST
5. **Server Processing**:
   - Validates event structure
   - Stores in SQLite with timestamp
   - Broadcasts to WebSocket clients
6. **Client Update**: Vue app receives event and updates timeline in real-time

## 🎨 Event Types & Visualization

| Event Type       | Emoji | Purpose                | Color Coding  | Special Display                       |
| ---------------- | ----- | ---------------------- | ------------- | ------------------------------------- |
| PreToolUse       | 🔧     | Before tool execution  | Session-based | Tool name & details                   |
| PostToolUse      | ✅     | After tool completion  | Session-based | Tool name & results                   |
| Notification     | 🔔     | User interactions      | Session-based | Notification message                  |
| Stop             | 🛑     | Response completion    | Session-based | Summary & chat transcript             |
| SubagentStop     | 👥     | Subagent finished      | Session-based | Subagent details                      |
| PreCompact       | 📦     | Context compaction     | Session-based | Compaction details                    |
| UserPromptSubmit | 💬     | User prompt submission | Session-based | Prompt: _"user message"_ (italic)     |
| SessionStart     | 🚀     | Session started        | Session-based | Session source (startup/resume/clear) |
| SessionEnd       | 🏁     | Session ended          | Session-based | End reason (clear/logout/exit/other)  |

### UserPromptSubmit Event (v1.0.54+)

The `UserPromptSubmit` hook captures every user prompt before Claude processes it. In the UI:
- Displays as `Prompt: "user's message"` in italic text
- Shows the actual prompt content inline (truncated to 100 chars)
- Summary appears on the right side when AI summarization is enabled
- Useful for tracking user intentions and conversation flow

## 🔌 Integration

### For New Projects

1. Copy the event sender:
   ```bash
   cp .claude/hooks/send_event.py YOUR_PROJECT/.claude/hooks/
   ```

2. Add to your `.claude/settings.json`:
   ```json
   {
     "hooks": {
       "PreToolUse": [{
         "matcher": ".*",
         "hooks": [{
           "type": "command",
           "command": "uv run .claude/hooks/send_event.py --source-app YOUR_APP --event-type PreToolUse"
         }]
       }]
     }
   }
   ```

### For This Project

Already integrated! Hooks run both validation and observability:
```json
{
  "type": "command",
  "command": "uv run .claude/hooks/pre_tool_use.py"
},
{
  "type": "command", 
  "command": "uv run .claude/hooks/send_event.py --source-app cc-hooks-observability --event-type PreToolUse"
}
```

## 🧪 Testing

```bash
# System validation
./scripts/test-system.sh

# Manual event test
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{
    "source_app": "test",
    "session_id": "test-123",
    "hook_event_type": "PreToolUse",
    "payload": {"tool_name": "Bash", "tool_input": {"command": "ls"}}
  }'
```

## ⚙️ Configuration

### Environment Variables

The project includes a comprehensive `.env.sample` template with security warnings and detailed documentation.

**Setup**:
```bash
# Copy the hardened template
cp .env.sample .env

# Edit with your values
nano .env  # or vim, code, etc.
```

**Minimal Configuration** (for local development):
```bash
ENGINEER_NAME=YourName  # Your name for logging
```

**Optional API Keys** (for AI features):
```bash
ANTHROPIC_API_KEY=sk-ant-...  # For AI summaries (optional)
OPENAI_API_KEY=sk-...         # For multi-model support (optional)
ELEVENLABS_API_KEY=...        # For voice features (optional)
GEMINI_API_KEY=...            # For Gemini integration (optional)
```

**⚠️ Security Requirements**:
1. NEVER commit `.env` to git (it's in `.gitignore`)
2. Use SEPARATE keys for dev/staging/production
3. Use LEAST-PRIVILEGE permissions (minimum required)
4. Rotate keys every 30-90 days
5. For production: Use a secrets manager (AWS Secrets Manager, Vault)

See `.env.sample` for detailed documentation and `SECURITY.md` for complete security guidelines.

**Client** (`.env` file in `apps/client/.env`):
- `VITE_MAX_EVENTS_TO_DISPLAY=100` – Maximum events to show (removes oldest when exceeded)

### Server Ports

- Server: `4000` (HTTP/WebSocket)
- Client: `5173` (Vite dev server)

## 🛡️ Security

This system handles sensitive development data. Follow security best practices:

### Built-in Protections
- Blocks dangerous commands (`rm -rf`, etc.)
- Prevents access to sensitive files (`.env`, private keys)
- Validates all inputs before execution
- Local-only network binding by default

### Required Security Practices
- NEVER commit `.env` files to version control
- Use separate API keys for each environment
- Apply least-privilege permissions to API keys
- Rotate keys regularly (30-90 days)
- Use secrets managers in production

**📖 For complete security guidelines, see [SECURITY.md](SECURITY.md)**

This includes:
- Secrets management best practices
- Safe installation procedures
- Runtime security configuration
- Incident response procedures
- Security checklists for deployment

## 📊 Technical Stack

- **Server**: Bun, TypeScript, SQLite
- **Client**: Vue 3, TypeScript, Vite, Tailwind CSS
- **Hooks**: Python 3.8+, Astral uv, TTS (ElevenLabs or OpenAI), LLMs (Claude or OpenAI)
- **Communication**: HTTP REST, WebSocket

## 🔧 Troubleshooting

### Bun Installation Fails

**Symptoms**:
```bash
curl -fsSL https://bun.sh/install | bash
# Error: unzip is required to install bun
```

**Cause**: The `unzip` system package is not installed.

**Solutions**:

**Option 1**: Install unzip first
```bash
# Ubuntu/Debian/WSL
sudo apt-get install -y unzip

# macOS
brew install unzip
```

**Option 2**: Use npm method instead (recommended)
```bash
npm install -g bun
```

---

### Server Won't Start

**Symptoms**:
- `bun: command not found`
- Server fails to start after installation

**Solution**:
```bash
# Add Bun to PATH
export PATH="$HOME/.bun/bin:$PATH"

# Make permanent
echo 'export PATH="$HOME/.bun/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc

# Verify
bun --version
```

---

### Dashboard Shows "Waiting for events..."

**Possible causes**:

1. **Hooks not configured** - Check `.claude/settings.json` exists in your project
2. **Server not running** - Verify with `curl http://localhost:4000/health`
3. **Wrong source-app** - Events sent with different `source-app` name
4. **Fresh session needed** - Hooks only activate on new Claude Code sessions

**Debugging**:
```bash
# 1. Test server directly
curl -X POST http://localhost:4000/events \
  -H "Content-Type: application/json" \
  -d '{"source_app":"test","session_id":"123","hook_event_type":"PreToolUse","payload":{}}'

# 2. Check server logs for incoming events
# (Look for POST requests in server console)

# 3. Verify hooks configuration
cat .claude/settings.json

# 4. For hook activation: End Claude Code session and start fresh
```

---

### Hook Scripts Not Working

If your hook scripts aren't executing properly, it might be due to relative paths in your `.claude/settings.json`. Claude Code documentation recommends using absolute paths for command scripts.

**Solution**: Use the custom Claude Code slash command to automatically convert all relative paths to absolute paths:

```bash
# In Claude Code, simply run:
/convert_paths_absolute
```

This command will:
- Find all relative paths in your hook command scripts
- Convert them to absolute paths based on your current working directory
- Create a backup of your original settings.json
- Show you exactly what changes were made

This ensures your hooks work correctly regardless of where Claude Code is executed from.

## Master AI **Agentic Coding**
> And prepare for the future of software engineering

Learn tactical agentic coding patterns with [Tactical Agentic Coding](https://agenticengineer.com/tactical-agentic-coding?y=cchobvwh45)

Follow the [IndyDevDan YouTube channel](https://www.youtube.com/@indydevdan) to improve your agentic coding advantage.

