# 🎯 Iterative Target System Guide

## Overview

The Iterative Target System enhances Hydra agent briefings with clear, measurable targets that agents can iterate against. This system follows the principle that "Claude performs best when it has a clear target to iterate against" by providing structured success criteria for complex tasks.

## How It Works

### Automatic Inclusion
The system automatically includes iteration targets based on task characteristics:

- **Implementation tasks**: Create, build, develop, implement, design
- **Enhancement tasks**: Refactor, enhance, optimize, improve  
- **Validation tasks**: Test, QA, validate, verify

### Agent-Specific Targets
Each agent type gets specialized target templates:

- **Backend**: API specs, database schemas, performance requirements
- **Frontend**: Visual references, component requirements, browser compatibility
- **Testing**: Coverage goals, test scenarios, quality gates
- **DevOps**: Infrastructure specs, deployment pipelines, monitoring
- **VCS**: Branch strategies, commit standards, release processes
- **Task History**: Analysis scope, pattern recognition, reporting needs

## Target Structure

### Core Components

```markdown
### 🎯 ITERATION_TARGET
**Visual Reference**: [Mockups, specs, or documentation links]
**Test Cases**:
- Input: [Specific test scenarios]
- Expected Output: [Measurable success criteria]
- Acceptance Criteria: [Clear, testable requirements]

**Iteration Context**:
- Previous Attempts: [Summary of failed attempts]
- Known Constraints: [Technical or business limitations]
- Success Metrics: [How to measure completion]
```

### Agent-Specific Sections

#### Backend Agents
- **API Specification**: OpenAPI/Swagger specs
- **Database Schema**: Tables, migrations, constraints
- **Performance Requirements**: Response times, throughput

#### Frontend Agents  
- **Visual Reference**: Design files, wireframes
- **Component Requirements**: Layout, styling, interactions
- **Browser Compatibility**: Target browsers, features, performance

#### Testing Agents
- **Test Coverage Goals**: Coverage percentages by type
- **Test Scenarios**: Unit, integration, E2E scenarios
- **Quality Gates**: Coverage thresholds, performance limits

## Usage Examples

### Backend API Development
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

### Frontend Component Development
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

### Testing Implementation
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

## Configuration

### Project-Specific Targets
Edit `.hydra/context/agent-minimal-context.md` to customize targets for your project:

1. **Replace TODO placeholders** with actual project context
2. **Update target templates** with specific requirements
3. **Add visual references** with actual file paths
4. **Define success metrics** relevant to your project

### Template Customization
Modify `/opt/hydra/templates/context/agent-minimal-context.md` to change default target structures for new projects.

## Best Practices

### Writing Effective Targets

1. **Be Specific**: Use concrete numbers, file paths, and measurable criteria
2. **Include Context**: Mention previous attempts and known constraints
3. **Visual References**: Always include mockups, specs, or documentation links
4. **Test Cases**: Provide specific inputs and expected outputs
5. **Success Metrics**: Define clear completion criteria

### Target Maintenance

1. **Update Regularly**: Keep targets current with project evolution
2. **Learn from Failures**: Document failed approaches in "Previous Attempts"
3. **Track Success**: Monitor which target styles work best for your team
4. **Iterate Targets**: Improve target quality based on agent performance

## Integration with Existing Systems

### Backward Compatibility
- Targets are only included for complex implementation tasks
- Simple tasks (debugging, minor fixes) don't get targets to avoid overhead
- Existing projects without targets continue to work normally

### Context Size Management
- Targets add ~200-500 tokens per agent briefing
- Only included when task complexity warrants iteration guidance
- Works with existing context monitoring and size limits

### Agent Classification
- Targets are extracted based on detected agent type
- Custom agent types inherit general target structure
- Specialized agents get type-specific target templates

## Monitoring and Analytics

### Target Effectiveness
Monitor these metrics to assess target system effectiveness:

- **Task Success Rate**: Compare completion rates with/without targets
- **Iteration Count**: Track how many attempts tasks require
- **Context Utilization**: Measure how often targets are referenced
- **Agent Performance**: Assess quality improvements with clear targets

### Logging
Target usage is logged in `.hydra/logs/context-usage.log` with additional metadata:
- Whether targets were included
- Target extraction time
- Target content length
- Task completion status

## Troubleshooting

### Common Issues

1. **Targets Not Appearing**: Check task description matches inclusion criteria
2. **Wrong Target Type**: Verify agent classification is correct
3. **Empty Targets**: Ensure template contains target sections for agent type
4. **Context Overflow**: Targets might push context over size limits

### Debug Commands
```bash
# Check if targets would be included
bash /opt/hydra/core/hooks/inject-agent-briefing.sh "Implement user login" "Create authentication system"

# Verify target extraction
grep -A 20 "ITERATION_TARGET" .hydra/context/agent-minimal-context.md

# Monitor context size with targets
hydra-context-monitor --include-targets
```

## Future Enhancements

### Planned Features
- **Visual Target Validation**: OCR comparison with actual implementation
- **Target Version Control**: Track target evolution over time
- **Success Pattern Learning**: Automatically improve targets based on outcomes
- **Multi-Modal Targets**: Support for video, audio, and interactive references

### Extension Points
- Custom target extractors for specialized agent types
- Target template inheritance and composition
- Integration with external design tools and specifications
- Automated target generation from requirements documents

---

This system transforms Hydra from providing general context to delivering precise, actionable targets that agents can systematically work towards, dramatically improving task success rates and reducing iteration cycles.