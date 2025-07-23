# 🏥 Context Optimization Guide

## Purpose
This guide helps identify and fix oversized context files that slow down agents and waste tokens.

## Quick Reference

### Context Size Limits
- ✅ **Optimal**: < 1000 tokens per file
- ⚠️ **Warning**: 1500+ tokens per file  
- 🚫 **Critical**: 2000+ tokens per file

### Agent-Specific Context Sizes (Including Targets)
- **General Agent**: 500-800 tokens optimal (+200-300 with targets)
- **Backend Agent**: 700-1200 tokens optimal (+300-500 with targets)
- **Frontend Agent**: 600-1000 tokens optimal (+250-400 with targets)
- **Testing Agent**: 400-800 tokens optimal (+200-350 with targets)
- **DevOps Agent**: 600-1000 tokens optimal (+300-450 with targets)

**Note**: ITERATION_TARGET sections add approximately 200-500 tokens per agent but only for complex implementation tasks.

## Optimization Strategies

### 1. Content Pruning 🔄
- Remove outdated information
- Keep only current technology versions
- Delete deprecated patterns
- Remove duplicate information

### 2. Section Splitting 📄
Large files can be split by:
- **Technology stack** (React vs Vue)
- **Functionality** (auth vs data)  
- **Agent type** (backend vs frontend)
- **Project phase** (setup vs maintenance)

### 3. Reference Reduction 🔗
- Move detailed examples to separate files
- Use bullet points instead of paragraphs
- Replace long code blocks with key patterns
- Link to external documentation instead of copying

### 4. Language Efficiency 💬
- Use Czech for user communication rules
- Keep English technical terms concise
- Remove redundant explanations
- Use active voice and clear commands

## Context Files by Priority

### Critical Files (Monitor Closely)
1. **agent-minimal-context.md** - Core agent briefing (includes ITERATION_TARGET sections)
2. **current-state.md** - Backend/API state
3. **deployment.md** - DevOps deployment info
4. **iterative-target-guide.md** - Target system documentation

### Secondary Files
- **project-specific guides** - Domain knowledge
- **technology patterns** - Framework-specific rules
- **quality standards** - Code review criteria

## Red Flags 🚨

### Immediate Attention Needed
- Any file > 2000 tokens
- Multiple files > 1500 tokens  
- Agent response slowdown
- High token consumption in logs

### Warning Signs
- Context files growing monthly
- Duplicated information across files
- Outdated technology references
- Long paragraphs and explanations

## Optimization Tools

### Built-in Commands
```bash
# Check current context health
hydra-context-monitor

# Get detailed analysis with recommendations
hydra-context-monitor --recommendations

# Get agent routing suggestions based on context size
hydra-context-health --routing

# Monitor usage patterns
tail -f .hydra/logs/context-usage.log
```

### Manual Optimization Process
1. **Identify oversized files** with context monitor
2. **Analyze content relevance** - what's actually used?
3. **Split or prune** based on usage patterns
4. **Test agent performance** with reduced context
5. **Monitor improvements** in usage logs

## Context Efficiency Principles

### Keep
- Current technology versions
- Active project requirements
- Frequently referenced patterns
- Critical safety constraints
- Agent specialization rules

### Remove
- Outdated documentation
- Unused technology references
- Verbose explanations
- Duplicate information
- Historical development notes

### Optimize
- Convert long text to bullet points
- Replace examples with patterns
- Use references instead of full content
- Combine related small sections
- Standardize formatting

## Measurement Success

### Before Optimization
- Document current token counts
- Note agent response times
- Record context usage frequency

### After Optimization
- Verify reduced token counts
- Test agent performance
- Monitor usage efficiency
- Validate functionality preserved

### Success Metrics
- 20-50% token reduction
- Maintained agent effectiveness
- No loss of critical functionality
- Improved response times

## Emergency Procedures

### Critical Context Overload (2000+ tokens)
1. **STOP** all parallel agent deployment
2. **IDENTIFY** the largest context files
3. **IMMEDIATE** pruning of non-essential content
4. **TEST** with single agent first
5. **GRADUAL** re-introduction of parallelization

### Warning Level (1500+ tokens)  
1. **LIMIT** to 3 concurrent agents maximum
2. **ANALYZE** context usage in logs
3. **PLAN** optimization during low activity
4. **MONITOR** agent performance closely

This guide should be used whenever context monitors indicate size warnings or performance degradation.