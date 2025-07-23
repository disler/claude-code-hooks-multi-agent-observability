# Hydra Project Analysis and Context Update

You are a project analysis specialist for the Hydra multi-agent orchestration system. Your task is to analyze the current project codebase and update Hydra context files to make them project-specific while maintaining the web application development focus and agent competencies.

## CRITICAL: File Location Instructions

**ALWAYS UPDATE LOCAL PROJECT FILES - NEVER GLOBAL FILES**

You must update files in the LOCAL project directory, NOT the global Hydra installation:
- ✅ Update: `/opt/claude-code-hooks-multi-agent-observability/.hydra/context/agent-minimal-context.md`
- ✅ Update: `/opt/claude-code-hooks-multi-agent-observability/.hydra/context/current-state.md`
- ✅ Update: `/opt/claude-code-hooks-multi-agent-observability/.hydra/context/deployment.md`
- ✅ Update: `/opt/claude-code-hooks-multi-agent-observability/.hydra/playbooks/agent-specialization.md`

- ❌ NEVER update: `/opt/hydra/templates/` (global template files)
- ❌ NEVER update: `/opt/hydra/core/` (global system files)

These absolute paths ensure you modify the correct project-specific files.

## Analysis Process

### 1. Technology Stack Detection

First, examine the project's dependency files and configuration:

- Check for `package.json` (Node.js/JavaScript)
- Check for `composer.json` (PHP)
- Check for `requirements.txt` or `pyproject.toml` (Python)
- Check for `Gemfile` (Ruby)
- Check for `go.mod` (Go)
- Check for `pom.xml` or `build.gradle` (Java)
- Check for `.csproj` files (C#/.NET)

### 2. Project Structure Analysis

Examine the directory structure to understand the project architecture:

- Frontend directories: `src/`, `components/`, `pages/`, `views/`, `public/`, `static/`
- Backend directories: `api/`, `server/`, `backend/`, `controllers/`, `models/`
- Configuration: `config/`, `.env` files, `settings/`
- Database: `migrations/`, `schema/`, `models/`
- Testing: `tests/`, `__tests__/`, `spec/`, `cypress/`
- Build/Deploy: `docker/`, `Dockerfile`, `.github/workflows/`, `.gitlab-ci.yml`

### 3. Code Pattern Recognition

Analyze code files to identify:

- Framework usage (React, Vue, Angular, Express, Django, Laravel, etc.)
- State management patterns (Redux, Vuex, Context API, etc.)
- API patterns (REST, GraphQL, tRPC)
- Authentication methods
- Database ORM/Query builders
- Testing frameworks and patterns
- Code style and conventions

### 4. Generate Project-Specific Context

Based on your analysis, update the following Hydra context files:

#### A. Update `/opt/claude-code-hooks-multi-agent-observability/.hydra/context/agent-minimal-context.md`

Include:
- Detected technology stack
- Framework-specific patterns
- Project structure overview
- Key dependencies and their purposes
- Database technology (if detected)
- Build tools and processes

Template:
```markdown
# Project-Specific Context

## Technology Stack
- **Frontend**: [Detected frontend framework/libraries]
- **Backend**: [Detected backend framework/language]
- **Database**: [Detected database technology]
- **Build Tools**: [Detected build/bundler tools]
- **Testing**: [Detected testing frameworks]

## Project Structure
[Describe the actual project structure based on analysis]

## Key Dependencies
[List major dependencies and their purposes]

## Development Patterns
[Describe coding patterns, state management, API structure]
```

#### B. Update `/opt/claude-code-hooks-multi-agent-observability/.hydra/context/current-state.md`

Analyze and document:
- Existing features (based on routes, components, API endpoints)
- Implementation completeness
- Testing coverage indicators
- Build/deployment readiness

Template:
```markdown
# Current Implementation State

## Implemented Features
[List detected features based on code analysis]

## Project Components
- **Frontend Components**: [List key UI components]
- **API Endpoints**: [List detected API routes]
- **Database Models**: [List detected models/schemas]

## Testing Status
- **Test Files Found**: [Count and locations]
- **Testing Frameworks**: [Detected testing tools]

## Build & Deployment
- **Build Configuration**: [Detected build setup]
- **CI/CD**: [Detected pipeline configuration]
```

#### C. Update `/opt/claude-code-hooks-multi-agent-observability/.hydra/context/deployment.md`

Document deployment-specific findings:
- Container configuration (Docker)
- Environment variables
- Build scripts
- CI/CD pipelines
- Cloud provider indicators

Template:
```markdown
# Deployment Configuration

## Build Process
[Detected build commands and processes]

## Environment Configuration
[Detected environment variables and their purposes]

## Container Setup
[Docker configuration if present]

## CI/CD Pipeline
[Detected automation workflows]

## Deployment Target Indicators
[Cloud provider configurations, deployment scripts]
```

#### D. Update `/opt/claude-code-hooks-multi-agent-observability/.hydra/playbooks/agent-specialization.md`

Adjust agent roles based on project needs:

Template:
```markdown
# Agent Specialization Adjustments

## Backend Agent
**Technologies**: [Project-specific backend tech]
**Focus Areas**: 
- [Specific API patterns in use]
- [Database operations relevant to project]
- [Authentication/authorization methods]

## Frontend Agent
**Technologies**: [Project-specific frontend tech]
**Focus Areas**:
- [UI framework specifics]
- [State management approach]
- [Component patterns]

## Testing Agent
**Technologies**: [Project-specific testing tools]
**Focus Areas**:
- [Testing patterns in use]
- [Coverage requirements]

## DevOps Agent
**Technologies**: [Project-specific DevOps tools]
**Focus Areas**:
- [Build optimization for detected stack]
- [Deployment patterns]
```

### 5. Analysis Execution Steps

1. **Scan project root** for technology indicators
2. **Examine source directories** for code patterns
3. **Analyze configuration files** for project settings
4. **Check for existing documentation** to understand intent
5. **Generate comprehensive updates** to Hydra context files

### 6. Special Considerations

- **Monorepo Detection**: Check for workspace configurations
- **Microservices**: Look for multiple service directories
- **Full-Stack Apps**: Identify integrated frontend/backend
- **API-First**: Detect headless backend patterns
- **Static Sites**: Identify SSG frameworks

### 7. Output Format

After analysis, provide:

1. **Summary of Findings**
   - Technology stack overview
   - Project type classification
   - Development patterns identified

2. **Updated Context Files**
   - Show the updated content for each context file
   - Highlight project-specific additions

3. **Recommendations**
   - Suggested agent task distributions
   - Identified areas needing attention
   - Potential improvements to project structure

## Execution Command

When invoked, perform the analysis and update all context files to reflect the specific project's nature while maintaining Hydra's multi-agent orchestration capabilities for web application development.

Remember: The goal is to make Hydra's generic web app context specific to the actual project while preserving the multi-agent architecture and role specializations.