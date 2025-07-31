# Smaller Commits with Nice Messages

## Overview

This project implements intelligent Git hooks that automatically create smaller, more meaningful commits based on code analysis. The system provides two main features:

1. **Chunked Edits**: Automatically splits large file changes into smaller commits
1. **Meaningful Commit Messages**: Analyzes code content to generate descriptive commit messages

## Features

### 1. Automatic Chunked Edits

When file edits exceed configured thresholds, the system automatically:

- Splits large changes into smaller chunks (≤25 lines each)
- Commits each chunk separately with descriptive messages
- Prevents single massive commits that are hard to review

### 2. Intelligent Code Analysis

The system analyzes code content across multiple programming languages:

- **Python** (`.py`, `.pyi`): Functions, classes, imports, constants, docstrings
- **JavaScript/TypeScript** (`.js`, `.ts`, `.jsx`, `.tsx`): Functions, classes, imports, constants
- **Mojo** (`.mojo`, `.🔥`): Functions, structs, imports
- **Generic**: Fallback analysis for other file types

### 3. Enhanced Commit Messages

Instead of generic messages, commits now include detailed information about code changes:

- What functions/classes were added or removed
- Import count and dependency changes
- Code structure modifications
- Line count with meaningful context

## Configuration

### Edit Thresholds (`edit_thresholds`)

```json
{
  "edit_thresholds": {
    "max_lines_added": 25,
    "max_lines_removed": 25,
    "max_total_changes": 50,
    "enabled": true,
    "auto_commit": true,
    "commit_message_prefix": "Auto-commit: Large file changes detected - "
  }
}
```

### File Creation Thresholds (`file_creation_thresholds`)

```json
{
  "file_creation_thresholds": {
    "max_new_file_lines": 20,
    "max_files_per_session": 5,
    "enabled": true,
    "auto_commit": true,
    "commit_message_prefix": "Auto-commit: New file created - ",
    "exclude_patterns": ["*.tmp", "*.log", "*.cache", ".DS_Store", "Thumbs.db"],
    "include_patterns": ["*.py", "*.md", "*.yaml", "*.yml", "*.json", "*.toml", "*.txt"]
  }
}
```

## Example Commit Messages

### Before Enhancement

```
Auto-commit: New file created - test.py (45 lines)
Auto-commit: Large file changes detected - chunk 1/3 - removed 30 lines
```

### After Enhancement

```
Auto-commit: New file created - data_processor.py (45 lines) - functions: __init__, process, analyze (+2 more) | classes: DataProcessor, ResultAnalyzer | 5 imports | 3 constants | 8 docstrings

Auto-commit: Large file changes detected - chunk 1/3 - api_client.py - added authenticate, fetch_data methods | removed legacy_connect function | added class APIClient

Auto-commit: Large file changes detected - chunk 2/3 - api_client.py - added error_handler, retry_logic functions | 3 imports

Auto-commit: Large file changes detected - chunk 3/3 - api_client.py - added CONFIG_URL, MAX_RETRIES constants | 2 docstrings
```

## Language-Specific Analysis

### Python Analysis

Detects and reports:

- **Functions**: `def function_name():`
- **Classes**: `class ClassName:`
- **Imports**: `import module` and `from module import item`
- **Constants**: Uppercase variables with assignments
- **Docstrings**: Triple-quoted documentation strings

**Example Output**:

```
functions: __init__, process, validate (+1 more) | classes: DataProcessor | 3 imports | 2 constants | 4 docstrings
```

### JavaScript/TypeScript Analysis

Detects and reports:

- **Functions**: `function name()`, arrow functions `const name = () =>`
- **Classes**: `class ClassName`
- **Imports**: `import` and `export` statements
- **Constants**: `const UPPERCASE_VAR`

**Example Output**:

```
functions: ComponentRenderer, handleClick | classes: UIComponent | 4 imports | 1 constants
```

### Mojo Analysis

Detects and reports:

- **Functions**: `fn function_name()`
- **Structs**: `struct StructName`
- **Imports**: `from module import item`

**Example Output**:

```
functions: __init__, calculate, process (+1 more) | structs: Vector3D, Matrix | 2 imports
```

### Generic Analysis

For unrecognized file types:

- **Comments**: Detects `#`, `//`, `/*` style comments
- **Line Count**: Basic file size information

**Example Output**:

```
25 lines of code
```

## Edit Change Detection

For file modifications, the system compares old and new content to identify:

### Function Changes

- **Added Functions**: New functions in the updated code
- **Removed Functions**: Functions that were deleted
- **Modified Functions**: Existing functions with changes

### Class Changes

- **Added Classes**: New class definitions
- **Removed Classes**: Deleted class definitions

### Fallback Analysis

When no specific patterns are detected:

- **Line Count Changes**: "expanded by X lines" or "reduced by X lines"
- **Generic Changes**: "modified content"

**Example Edit Message**:

```
modified user_service.py - added validate_user, hash_password functions | removed deprecated_auth function | added class UserValidator | removed class LegacyAuth
```

## Chunked Edit Process

When a large edit is detected:

1. **Detection**: System identifies edits exceeding thresholds
1. **Analysis**: Analyzes old and new content for meaningful changes
1. **Chunking**: Splits changes into smaller pieces (≤25 lines each)
1. **Sequential Commits**: Creates separate commits for each chunk
1. **Meaningful Messages**: Each commit describes what code was changed

### Chunking Strategies

#### Removal-Heavy Edits

For edits removing more content than adding:

1. Process removals from end to beginning
1. Replace chunks with corresponding new content
1. Commit each replacement with analysis

#### Addition-Heavy Edits

For edits adding more content than removing:

1. Remove old content in first commit
1. Add new content in subsequent commits
1. Each addition commit analyzes the added code

## Benefits

### For Developers

- **Clearer History**: Understand what changed at a glance
- **Better Reviews**: Smaller, focused commits are easier to review
- **Debugging**: Identify which specific changes introduced issues
- **Documentation**: Commit messages serve as code change documentation

### For Teams

- **Code Understanding**: New team members can understand changes better
- **Change Tracking**: Monitor evolution of specific functions/classes
- **Quality Control**: Easier to spot problematic changes in small commits

### For Project Management

- **Progress Tracking**: Monitor development progress by feature/function
- **Impact Analysis**: Understand scope of changes across releases
- **Automated Documentation**: Commit messages create development logs

## Technical Implementation

### Code Analysis Pipeline

1. **File Type Detection**: Uses file extension and content analysis
1. **Language-Specific Parsing**: Applies appropriate syntax patterns
1. **Pattern Extraction**: Identifies functions, classes, imports, etc.
1. **Summary Generation**: Creates concise, informative descriptions
1. **Message Composition**: Combines analysis into readable commit messages

### Error Handling

- **Graceful Fallbacks**: Falls back to generic analysis if specific parsing fails
- **Safe Defaults**: Uses line count information when pattern detection fails
- **Error Recovery**: Continues operation even if individual analyses fail

### Performance Considerations

- **Efficient Parsing**: Uses simple regex patterns, not full AST parsing
- **Limited Scope**: Analyzes only changed content, not entire files
- **Configurable Limits**: Respects threshold settings to avoid processing huge files

## Troubleshooting

### Common Issues

1. **Hook Not Triggering**

   - Verify hook configuration in `.claude/settings.json`
   - Check that `enabled: true` in both threshold configurations
   - Ensure pixi tasks are properly configured

1. **Chunking Not Working**

   - Verify edit thresholds are set appropriately
   - Check that `auto_commit: true` in edit_thresholds
   - Ensure git repository is properly initialized

1. **Poor Analysis Results**

   - Check file extension is supported
   - Verify code follows standard syntax patterns
   - Review include/exclude patterns for file creation

### Debug Information

The system provides extensive debug output:

- Threshold checking results
- Code analysis details
- Commit operation status
- Error messages with stack traces

### Manual Testing

Test the analysis functions directly:

```bash
cd .claude/hooks
python3 -c "
from pre_tool_use import analyze_code_content, generate_meaningful_commit_message

# Test analysis
content = 'your code here'
analysis = analyze_code_content(content, 'filename.py')
print(analysis)

# Test commit message generation
msg = generate_meaningful_commit_message('create', 'file.py', '', content, 'Created ')
print(msg)
"
```

## Future Enhancements

### Planned Features

- **More Languages**: Support for Rust, Go, C++, Java
- **Semantic Analysis**: Deeper understanding of code relationships
- **Diff Optimization**: Smarter chunking based on logical code blocks
- **Custom Patterns**: User-defined analysis patterns for domain-specific languages

### Configuration Improvements

- **Per-Language Thresholds**: Different limits for different file types
- **Project-Specific Rules**: Custom analysis patterns per project
- **Integration Options**: Hooks for external analysis tools

## Conclusion

The enhanced commit system transforms generic, uninformative commits into meaningful, descriptive records of code changes. By automatically creating smaller commits with intelligent analysis, it improves code review processes, debugging capabilities, and project documentation while maintaining a clean, understandable Git history.
