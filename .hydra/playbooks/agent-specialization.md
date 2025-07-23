# Agent Specialization Guide

## Project: claude-code-hooks-multi-agent-observability

## Backend Agent Role
**Specialized for Bun TypeScript backend with real-time WebSocket capabilities**

### Core Responsibilities
- **API Development**: RESTful endpoints for event ingestion and theme management
- **WebSocket Management**: Real-time event streaming to multiple clients
- **Database Operations**: SQLite with WAL mode for concurrent access
- **Event Processing**: Claude Code hook event ingestion and storage
- **Performance Optimization**: High-throughput event processing

### Technology Focus
- **Runtime**: Bun (NOT Node.js) - Use `bun run`, `bun install`, `bun build`
- **Database**: `bun:sqlite` (NOT better-sqlite3 or external SQLite)
- **WebSockets**: Built-in WebSocket support (NOT ws package)
- **HTTP**: `Bun.serve()` with route-based architecture
- **TypeScript**: Strict typing with real-time data structures

### Key Implementation Areas
- Event ingestion pipeline optimization
- WebSocket connection management and broadcasting
- Database schema migrations and indexing
- Theme management system (CRUD operations)
- Real-time data filtering and querying

### Example Iteration Targets

**API Development Target**:
```markdown
### 🎯 ITERATION_TARGET
**API Specification**: `/docs/api/user-management.yaml`
**Test Cases**:
- Request: `POST /api/users` with valid JSON payload
- Response: `201 Created` with user ID and timestamps
- Performance: < 200ms response time, handle 1000 req/min

**Database Schema**:
- Tables: `users`, `user_profiles`, `user_sessions`
- Migrations: Add email_verified column, create indexes
- Constraints: Unique email, password min 8 chars

**Iteration Context**:
- Previous Attempts: JWT implementation had token expiry issues
- Technical Constraints: PostgreSQL 13, FastAPI 0.68+
- Success Metrics: All tests pass, OpenAPI spec validates
```

**Microservice Target**:
```markdown
### 🎯 ITERATION_TARGET
**Service Architecture**: Event-driven microservice with Redis pub/sub
**Test Cases**:
- Event: `user.created` publishes to Redis
- Consumer: Email service receives and processes event
- Retry: Failed events retry 3x with exponential backoff

**Performance Requirements**:
- Throughput: 10k events/minute
- Latency: < 50ms event processing
- Reliability: 99.9% successful event delivery

**Iteration Context**:
- Previous Attempts: Message queue overloaded at scale
- Technical Constraints: Docker Swarm, Redis Cluster
- Success Metrics: Load test passes, zero message loss
```

---

## Frontend Agent Role
**Specialized for Vue 3 real-time observability interfaces**

### Core Responsibilities
- **Real-time UI**: WebSocket-driven live event visualization
- **Event Management**: Filtering, searching, and displaying hook events
- **Theme System**: Custom theme creation and community sharing
- **Responsive Design**: Mobile-first approach with Tailwind CSS
- **Performance**: Smooth animations and efficient real-time updates

### Technology Focus
- **Framework**: Vue 3 with Composition API and `<script setup>`
- **Build Tool**: Vite for development and production
- **Styling**: TailwindCSS with custom theme system
- **State**: Reactive composables pattern (no Vuex/Pinia needed)
- **WebSocket**: Custom `useWebSocket` composable
- **TypeScript**: Strict typing with Vue component types

### Key Implementation Areas
- Real-time event timeline visualization
- WebSocket connection management with auto-reconnect
- Custom theme creation and preview system
- Event filtering and search interfaces
- Responsive chart and visualization components
- Chat transcript display and modal interfaces

### Example Iteration Targets

**Component Development Target**:
```markdown
### 🎯 ITERATION_TARGET
**Visual Reference**: `/designs/dashboard-layout.figma`
**Components**:
- Layout: Responsive grid with sidebar navigation
- Styling: Tailwind CSS, dark/light theme support
- Interactions: Smooth animations, keyboard navigation

**Browser Compatibility**:
- Targets: Chrome 90+, Firefox 88+, Safari 14+
- Features: CSS Grid, Intersection Observer API
- Performance: < 100ms initial render, 95+ Lighthouse score

**Iteration Context**:
- Previous Attempts: Mobile layout broke on iOS Safari
- Design Constraints: WCAG 2.1 AA compliance required
- Success Metrics: Cross-browser testing passes, accessible
```

**Progressive Web App Target**:
```markdown
### 🎯 ITERATION_TARGET
**Visual Reference**: `/specs/pwa-requirements.md`
**PWA Features**:
- Service Worker: Cache-first strategy for static assets
- Manifest: App icons, theme colors, display mode
- Offline: Core functionality works without network

**Performance Goals**:
- First Contentful Paint: < 1.5s
- Largest Contentful Paint: < 2.5s
- Bundle Size: < 250KB initial, < 100KB per route

**Iteration Context**:
- Previous Attempts: Service worker cache invalidation issues
- Technical Constraints: React 18, Vite build tool
- Success Metrics: PWA audit passes, offline functionality verified
```

---

## Testing Agent Role
**Specialized for Bun-based testing with real-time system validation**

### Core Responsibilities
- **System Testing**: End-to-end real-time event flow validation
- **WebSocket Testing**: Connection stability and real-time communication
- **Database Testing**: SQLite WAL mode and concurrent access
- **Performance Testing**: Event throughput and WebSocket scaling
- **Integration Testing**: Client-server communication validation

### Technology Focus
- **Test Runner**: `bun test` (preferred over Jest/Vitest)
- **Framework**: Bun's built-in testing capabilities
- **E2E**: Manual testing with real-time validation
- **Performance**: Load testing for WebSocket connections
- **Database**: SQLite transaction and WAL mode testing

### Key Testing Areas
- Real-time event ingestion and display
- WebSocket connection recovery and reconnection
- Theme management functionality
- Event filtering and search accuracy
- Cross-browser WebSocket compatibility
- Multi-client concurrent access testing
- Database migration and schema validation

### Example Iteration Targets

**Unit Testing Target**:
```markdown
### 🎯 ITERATION_TARGET
**Test Coverage Goals**: 90% line coverage, 85% branch coverage
**Test Scenarios**:
- Unit Tests: All utility functions, API endpoints, React hooks
- Integration Tests: Database operations, external API calls
- Edge Cases: Error handling, boundary conditions, null values

**Quality Gates**:
- Coverage: Jest reports meet thresholds
- Performance: Test suite runs in < 30 seconds
- Reliability: Zero flaky tests, deterministic results

**Iteration Context**:
- Previous Test Failures: Async tests with race conditions
- Testing Constraints: CI/CD pipeline timeout at 5 minutes
- Success Metrics: All tests pass, coverage gates enforced
```

**E2E Testing Target**:
```markdown
### 🎯 ITERATION_TARGET
**User Journey Coverage**: Critical paths for all user roles
**Test Scenarios**:
- Authentication: Login/logout, password reset, MFA
- Data Operations: CRUD operations, bulk actions, exports
- Edge Cases: Network failures, slow responses, concurrent users

**Playwright Configuration**:
- Browsers: Chromium, Firefox, WebKit
- Viewports: Desktop 1920x1080, Mobile 390x844
- Environments: Staging, production-like test environment

**Iteration Context**:
- Previous Issues: Tests failed due to animation timing
- Environment Constraints: Limited test data, shared staging
- Success Metrics: 99% test reliability, < 5 min execution time
```

---

## DevOps Agent Role
**Specialized for Bun runtime deployment and SystemD service management**

### Core Responsibilities
- **Service Management**: SystemD service configuration and monitoring
- **Network Configuration**: Multi-interface binding and WebSocket setup
- **Database Management**: SQLite WAL mode and backup strategies
- **Process Monitoring**: Service health and automatic recovery
- **Environment Management**: Development vs production configuration

### Technology Focus
- **Runtime**: Bun deployment on Linux (Debian/Ubuntu)
- **Service Management**: SystemD integration with proper security
- **Database**: SQLite with WAL mode for production
- **Networking**: Configurable host binding (0.0.0.0 vs localhost)
- **Monitoring**: SystemD journals and built-in observability

### Key Implementation Areas
- SystemD service file configuration and security
- Production environment variable management
- Database backup and recovery procedures
- Network interface configuration for multi-host access
- Service monitoring and alerting setup
- Deployment scripts and automation
- Performance monitoring and optimization

### Example Iteration Targets

**CI/CD Pipeline Target**:
```markdown
### 🎯 ITERATION_TARGET
**Infrastructure Specification**: `/infra/pipeline-architecture.yaml`
**Deployment Pipeline**:
- Stages: Build → Test → Security Scan → Deploy → Smoke Test
- Automation: GitHub Actions with matrix builds
- Rollback: Blue-green deployment with automatic rollback

**Performance Requirements**:
- Build Time: < 5 minutes for typical changes
- Deployment Time: < 2 minutes to production
- Success Rate: 99% successful deployments

**Iteration Context**:
- Previous Issues: Docker builds failed intermittently
- Infrastructure Constraints: AWS ECS, limited CPU credits
- Success Metrics: Zero-downtime deployments, rollback < 30s
```

**Infrastructure as Code Target**:
```markdown
### 🎯 ITERATION_TARGET
**IaC Specification**: Terraform modules for AWS infrastructure
**Components**:
- Compute: ECS Fargate with auto-scaling
- Storage: RDS PostgreSQL with read replicas
- Networking: VPC, ALB, CloudFront CDN

**Monitoring & Observability**:
- Metrics: CloudWatch custom metrics, application APM
- Logging: Centralized logging with log aggregation
- Alerting: PagerDuty integration for critical alerts

**Iteration Context**:
- Previous Problems: State drift, manual configuration changes
- Compliance Requirements: SOC 2, encryption at rest/transit
- Success Metrics: Infrastructure reproducible, monitoring complete
```

---

## VCS Agent Role
**Specialized for monorepo management with client/server coordination**

### Core Responsibilities
- **Monorepo Management**: Coordinating changes across client and server
- **Feature Branching**: Managing real-time features requiring both frontend and backend
- **Release Coordination**: Ensuring client/server compatibility
- **Dependency Management**: Bun lockfiles and package synchronization
- **Documentation**: Keeping README and deployment docs current

### Technology Focus
- **Repository Structure**: Monorepo with `apps/client` and `apps/server`
- **Package Management**: Bun lockfiles (`bun.lock`) management
- **Branching**: Feature branches for coordinated client/server changes
- **Commit Standards**: Descriptive commits for both components
- **Documentation**: Markdown files and inline code documentation

### Key Implementation Areas
- Coordinated client/server feature development
- Database migration version control
- Environment configuration management
- Script and service file versioning
- Documentation updates for deployment procedures
- Dependency updates across both applications

### Example Iteration Targets

**Branch Management Target**:
```markdown
### 🎯 ITERATION_TARGET
**Branch Strategy**: GitFlow with feature branches and release candidates
**Commit Standards**:
- Message Format: Conventional Commits (feat/fix/docs/refactor)
- Scope: Component or module affected
- Review Process: 2 approvals required, CI checks must pass

**Automation Goals**:
- Auto-merge: Dependabot PRs after CI passes
- Branch Protection: Force push disabled, up-to-date required
- Release Notes: Auto-generated from conventional commits

**Iteration Context**:
- Previous Issues: Merge conflicts in package-lock.json
- Team Constraints: 8 developers, async code reviews
- Success Metrics: < 2 hour PR turnaround, clean git history
```

**Release Management Target**:
```markdown
### 🎯 ITERATION_TARGET
**Versioning Strategy**: Semantic versioning with automated releases
**Release Process**:
- Tagging: Automated based on conventional commits
- Changelog: Generated from commit messages and PR titles
- Deployment: Triggered by GitHub release creation

**Quality Gates**:
- Tests: All tests pass, coverage maintained
- Security: Dependency vulnerability scan clean
- Documentation: README and API docs updated

**Iteration Context**:
- Previous Problems: Manual releases error-prone
- Compliance Needs: Release approval workflow for production
- Success Metrics: Weekly releases, zero rollback incidents
```

---