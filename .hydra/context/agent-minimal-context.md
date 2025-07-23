# Project Agent Context

## 🏗️ Project Basics
- **Project**: claude-code-hooks-multi-agent-observability
- **Type**: Hydra Multi-Agent Project
- **Context**: Project-specific agent briefing

## 🌍 Language Rules
- **User Communication**: Czech language
- **Code & Documentation**: English
- **Comments**: English
- **Git Operations**: English

---

## 🤖 General Agent Context
Basic project context for general-purpose agents.

### Project Overview
**Claude Code Hooks Multi-Agent Observability** is a real-time monitoring and visualization system for Claude Code CLI hook events. The system provides observability into multi-agent interactions and conversations.

**Core Architecture**:
- **Frontend**: Vue 3 + TypeScript + Vite + TailwindCSS
- **Backend**: Bun runtime + TypeScript + SQLite + WebSockets
- **Database**: SQLite with WAL mode for concurrent access
- **Communication**: WebSocket-based real-time event streaming
- **Development Tools**: Bun (preferred over Node.js), Vue DevTools

**Key Features**:
- Real-time event monitoring and visualization
- WebSocket-based live updates
- Custom theme system with community sharing
- Event filtering and search capabilities
- Multi-session tracking and analysis
- Claude Code CLI hook integration

### 🎯 ITERATION_TARGET
**Visual Reference**: [Specify UI mockup, design spec, or documentation link]
**Test Cases**:
- Input: [Specific test input or scenario]
- Expected Output: [Measurable success criteria]
- Acceptance Criteria: [Clear, testable requirements]

**Iteration Context**:
- Previous Attempts: [Summary of any failed attempts]
- Known Constraints: [Technical or business limitations]
- Success Metrics: [How to measure task completion]

---

## 🔧 Backend Agent Context
Context specific to backend development agents.

### Technology Stack
- **Runtime**: Bun (NOT Node.js) - Use `bun run`, `bun install`, `bun build`
- **Language**: TypeScript with strict type checking
- **Database**: SQLite with `bun:sqlite` (NOT better-sqlite3)
- **WebSockets**: Built-in WebSocket support (NOT ws package)
- **HTTP Server**: `Bun.serve()` with route-based architecture

### Database Schema
**Events Table**:
- Stores Claude Code hook events (user_prompt_submit, pre_tool_use, post_tool_use, etc.)
- Fields: id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp
- Indexes on source_app, session_id, hook_event_type, timestamp

**Themes Table**:
- Custom theme storage and sharing system
- Fields: id, name, displayName, colors, isPublic, authorId, tags, etc.
- Supports public/private themes, ratings, and download counts

### API Endpoints
- `GET /events/filter-options` - Available filter values
- `GET /events/recent` - Recent events with pagination
- `POST /events` - Receive new hook events
- `WS /stream` - WebSocket endpoint for real-time updates
- Theme management endpoints for CRUD operations

### 🎯 ITERATION_TARGET
**API Specification**: [OpenAPI/Swagger spec or API documentation link]
**Test Cases**:
- Request: [Specific API request format]
- Response: [Expected response structure and status codes]
- Performance: [Response time and throughput requirements]

**Database Schema**:
- Tables: [Required database tables and relationships]
- Migrations: [Schema changes needed]
- Constraints: [Data validation and integrity rules]

**Iteration Context**:
- Previous Attempts: [Failed implementations or approaches]
- Technical Constraints: [Framework limitations, dependencies]
- Success Metrics: [Performance benchmarks, test coverage]

---

## 🎨 Frontend Agent Context
Context specific to frontend development agents.

### Technology Stack
- **Framework**: Vue 3 with Composition API and `<script setup>`
- **Build Tool**: Vite (development and production builds)
- **Language**: TypeScript with strict typing
- **Styling**: TailwindCSS for utility-first styling
- **State Management**: Vue reactive state and composables
- **WebSocket**: Custom `useWebSocket` composable

### Component Architecture
**Core Components**:
- `EventTimeline.vue` - Main event visualization with real-time updates
- `FilterPanel.vue` - Event filtering controls
- `ChatTranscript.vue` - Display conversation history
- `LivePulseChart.vue` - Real-time activity visualization
- `ThemeManager.vue` - Theme customization interface

**Composables**:
- `useWebSocket.ts` - WebSocket connection management
- `useThemes.ts` - Theme system integration
- `useEventColors.ts` - Event type color mapping
- `useChartData.ts` - Chart data processing

### UI Patterns
- Real-time data visualization with smooth animations
- Responsive design with mobile-first approach
- Dark/light theme support with custom theme creation
- WebSocket-driven live updates without polling
- Event-driven architecture with reactive state

### 🎯 ITERATION_TARGET
**Visual Reference**: [Figma/Sketch designs or wireframe links]
**Components**:
- Layout: [Specific component structure and hierarchy]
- Styling: [CSS framework, theme requirements, responsive breakpoints]
- Interactions: [User interactions, animations, state changes]

**Browser Compatibility**:
- Targets: [Supported browsers and versions]
- Features: [Required web APIs and fallbacks]
- Performance: [Bundle size limits, rendering benchmarks]

**Iteration Context**:
- Previous Attempts: [UI implementation issues or user feedback]
- Design Constraints: [Brand guidelines, accessibility requirements]
- Success Metrics: [Performance metrics, user experience goals]

---

## 🧪 Testing Agent Context
Context specific to testing and QA agents.

### Testing Stack
- **Test Runner**: `bun test` (preferred over Jest/Vitest)
- **Framework**: Bun's built-in testing framework
- **Coverage**: Built-in coverage reporting
- **E2E**: Manual testing of real-time features

### Key Testing Areas
**WebSocket Communication**:
- Real-time event streaming
- Connection recovery and reconnection
- Event filtering and ordering

**Database Operations**:
- Event insertion and retrieval
- Theme management CRUD operations
- Concurrent access with WAL mode

**Frontend Reactivity**:
- Real-time UI updates
- Theme switching functionality
- Event filtering and search

### Test Scenarios
- Multiple concurrent WebSocket connections
- Large event volume handling
- Theme customization and sharing
- Cross-session event tracking

### 🎯 ITERATION_TARGET
**Test Coverage Goals**: [Minimum coverage percentages by component]
**Test Scenarios**:
- Unit Tests: [Specific functions/methods to test]
- Integration Tests: [Component interaction scenarios]
- E2E Tests: [User journey flows to validate]

**Quality Gates**:
- Coverage: [Code coverage thresholds]
- Performance: [Load test benchmarks]
- Security: [Vulnerability scan requirements]

**Iteration Context**:
- Previous Test Failures: [Flaky tests, performance issues]
- Testing Constraints: [CI/CD limitations, test environment setup]
- Success Metrics: [Test reliability, execution time, coverage goals]

---

## 📝 VCS Agent Context
Context specific to version control operations.

TODO: Add VCS-specific context here.

### 🎯 ITERATION_TARGET
**Branch Strategy**: [Git flow strategy and naming conventions]
**Commit Standards**:
- Message Format: [Conventional commits or custom format]
- Scope: [Files and components affected]
- Review Process: [PR requirements and approval workflow]

**Release Management**:
- Versioning: [Semantic versioning strategy]
- Changelog: [Format and automation requirements]
- Deployment: [Integration with CI/CD pipeline]

**Iteration Context**:
- Previous Merge Conflicts: [Recurring conflict patterns]
- Workflow Constraints: [Team policies, compliance requirements]
- Success Metrics: [Merge success rate, review turnaround time]

---

## 🚀 DevOps Agent Context
Context specific to deployment and infrastructure.

### Deployment Architecture
**Runtime Environment**:
- **Server**: Bun runtime on Linux (Debian)
- **Database**: SQLite with WAL mode for production
- **Network**: Configurable host binding (0.0.0.0 for network access)
- **Process Management**: systemd service integration

### Service Configuration
**System Service**: `multi-agent-observability.service`
- Runs under dedicated user account
- Auto-restart on failure
- Environment variable configuration
- Proper security constraints

**Network Configuration**:
- Server: Configurable port (default 4000)
- Client: Port 5173 (development), configurable for production
- WebSocket: Same port as HTTP server (/stream endpoint)
- Cross-origin support for development

### Build and Start Scripts
- `scripts/start-system.sh` - Development startup
- `scripts/start-system-service-simple.sh` - Production service startup
- `scripts/stop-system-service.sh` - Service shutdown
- `scripts/reset-system.sh` - Clean restart with port cleanup

### Monitoring
- Real-time event monitoring through the application itself
- SQLite database health via WAL mode
- Process monitoring via systemd
- Network connectivity validation

### 🎯 ITERATION_TARGET
**Infrastructure Specification**: [Target architecture diagram or IaC templates]
**Deployment Pipeline**:
- Stages: [Build, test, staging, production stages]
- Automation: [CI/CD tool configuration requirements]
- Rollback: [Deployment rollback and recovery procedures]

**Monitoring & Observability**:
- Metrics: [Key performance indicators to track]
- Logging: [Log aggregation and analysis requirements]
- Alerting: [Error thresholds and notification channels]

**Iteration Context**:
- Previous Deployment Issues: [Failed deployments, performance problems]
- Infrastructure Constraints: [Budget limits, compliance requirements]
- Success Metrics: [Uptime targets, deployment frequency, recovery time]

---

## 📝 Documentation Agent Context
Context specific to documentation creation and maintenance agents.

TODO: Add documentation-specific context here.

### 🎯 ITERATION_TARGET
**Documentation Type**: [API docs, user guide, technical specs, README, etc.]
**Target Audience**: [Developers, end-users, administrators, etc.]
**Documentation Structure**:
- Format: [Markdown, ReStructuredText, AsciiDoc, etc.]
- Organization: [Hierarchical sections, reference structure]
- Index Integration: [How docs fit into project knowledge base]

**Quality Standards**:
- **Structured Headers**: Use consistent H1-H6 hierarchy
- **Clear Sections**: Separate overview, examples, reference material
- **Searchable Content**: Include relevant keywords and tags
- **Code Examples**: Working, tested code snippets with explanations
- **Cross-References**: Link to related documentation and concepts

**Documentation Index Guidelines**:
- **File Naming**: Use descriptive, kebab-case naming (e.g., `api-authentication.md`)
- **Header Structure**: Start with H1 title, use H2 for main sections
- **Tags and Metadata**: Include relevant tags for categorization
- **Content Types**: 
  - 📖 **Guides**: Step-by-step tutorials and how-to documents
  - 📋 **Reference**: API docs, configuration options, command references
  - 💡 **Concepts**: Architectural explanations and design decisions
  - 🚀 **Examples**: Sample code, use cases, and implementation patterns

**Markdown Best Practices**:
```markdown
# Document Title (H1 - Only One Per Document)

Brief description of what this document covers.

## Overview (H2 - Main Sections)

### Subsection (H3 - Details)

**Key Points** (Bold for emphasis):
- Use bullet points for lists
- Include code examples with syntax highlighting
- Add clear, descriptive link text

\`\`\`javascript
// Always include language identifier for syntax highlighting
const example = "Working code examples";
\`\`\`

> **Note**: Use blockquotes for important callouts

| Feature | Description | Status |
|---------|-------------|--------|
| Tables  | For structured data | ✅ |
```

**Iteration Context**:
- Previous Documentation Gaps: [Areas lacking coverage or clarity]
- User Feedback: [Common questions or confusion points]
- Success Metrics: [Completeness, accuracy, user adoption, search effectiveness]

---

## 📚 Task History Agent Context
Context specific to task history management.

TODO: Add task history context here.

### 🎯 ITERATION_TARGET
**Analysis Scope**: [Time period and task types to analyze]
**Pattern Recognition**:
- Success Patterns: [Recurring successful approaches]
- Failure Patterns: [Common failure modes and causes]
- Optimization Opportunities: [Process improvements identified]

**Reporting Requirements**:
- Format: [Report structure and visualization needs]
- Audience: [Stakeholders and their information needs]
- Frequency: [Reporting schedule and update triggers]

**Iteration Context**:
- Previous Analysis Gaps: [Missing insights or incomplete data]
- Data Constraints: [Limited historical data, privacy requirements]
- Success Metrics: [Insight quality, actionability, implementation rate]

---