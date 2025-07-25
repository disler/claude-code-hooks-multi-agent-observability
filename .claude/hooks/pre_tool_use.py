#!/usr/bin/env -S pixi run python
# /// script
# requires-python = ">=3.8"
# ///

import json
import sys
import re
import os
import subprocess
from datetime import datetime
from pathlib import Path
from utils.constants import ensure_session_log_dir

def analyze_code_content(content, file_path=""):
    """
    Analyze code content to extract meaningful information for commit messages.
    
    Args:
        content: The code content to analyze
        file_path: Path to the file (for context)
        
    Returns:
        dict: Analysis results with summary information
    """
    if not content or not content.strip():
        return {"summary": "empty content", "details": []}
    
    lines = content.splitlines()
    analysis = {
        "summary": "",
        "details": [],
        "functions": [],
        "classes": [],
        "imports": [],
        "comments": [],
        "docstrings": [],
        "constants": [],
        "total_lines": len(lines)
    }
    
    # Detect file type from extension
    file_ext = Path(file_path).suffix.lower() if file_path else ""
    
    # Analyze Python code
    if file_ext in ['.py', '.pyi'] or any('python' in line.lower() for line in lines[:3]):
        analysis.update(_analyze_python_code(lines))
    # Analyze JavaScript/TypeScript
    elif file_ext in ['.js', '.ts', '.jsx', '.tsx']:
        analysis.update(_analyze_javascript_code(lines))
    # Analyze other code files
    elif file_ext in ['.mojo', '.🔥']:
        analysis.update(_analyze_mojo_code(lines))
    # Generic code analysis
    else:
        analysis.update(_analyze_generic_code(lines))
    
    # Generate summary
    analysis["summary"] = _generate_code_summary(analysis)
    
    return analysis

def _analyze_python_code(lines):
    """Analyze Python-specific code patterns."""
    result = {"functions": [], "classes": [], "imports": [], "docstrings": [], "constants": []}
    
    in_docstring = False
    docstring_quotes = None
    
    for i, line in enumerate(lines):
        stripped = line.strip()
        
        # Handle docstrings
        if not in_docstring:
            if stripped.startswith('"""') or stripped.startswith("'''"):
                docstring_quotes = stripped[:3]
                in_docstring = True
                if stripped.count(docstring_quotes) >= 2:  # Single line docstring
                    result["docstrings"].append(stripped[3:-3].strip())
                    in_docstring = False
        else:
            if docstring_quotes in stripped:
                in_docstring = False
        
        if in_docstring:
            continue
            
        # Functions
        if stripped.startswith('def '):
            func_name = stripped[4:].split('(')[0].strip()
            result["functions"].append(func_name)
        
        # Classes
        elif stripped.startswith('class '):
            class_name = stripped[6:].split('(')[0].split(':')[0].strip()
            result["classes"].append(class_name)
        
        # Imports
        elif stripped.startswith('import ') or stripped.startswith('from '):
            result["imports"].append(stripped)
        
        # Constants (uppercase variables)
        elif '=' in stripped and not stripped.startswith('#'):
            var_part = stripped.split('=')[0].strip()
            if var_part.isupper() and var_part.isidentifier():
                result["constants"].append(var_part)
    
    return result

def _analyze_javascript_code(lines):
    """Analyze JavaScript/TypeScript-specific code patterns."""
    result = {"functions": [], "classes": [], "imports": [], "constants": []}
    
    for line in lines:
        stripped = line.strip()
        
        # Functions
        if 'function ' in stripped:
            try:
                func_name = stripped.split('function ')[1].split('(')[0].strip()
                result["functions"].append(func_name)
            except IndexError:
                pass
        elif '=>' in stripped and ('const ' in stripped or 'let ' in stripped or 'var ' in stripped):
            try:
                func_name = stripped.split('=')[0].replace('const', '').replace('let', '').replace('var', '').strip()
                result["functions"].append(func_name)
            except IndexError:
                pass
        
        # Classes
        elif stripped.startswith('class '):
            try:
                class_name = stripped[6:].split(' ')[0].split('{')[0].strip()
                result["classes"].append(class_name)
            except IndexError:
                pass
        
        # Imports
        elif stripped.startswith('import ') or stripped.startswith('export '):
            result["imports"].append(stripped)
        
        # Constants
        elif stripped.startswith('const ') and stripped.isupper():
            try:
                const_name = stripped[6:].split('=')[0].strip()
                result["constants"].append(const_name)
            except IndexError:
                pass
    
    return result

def _analyze_mojo_code(lines):
    """Analyze Mojo-specific code patterns."""
    result = {"functions": [], "classes": [], "imports": [], "structs": []}
    
    for line in lines:
        stripped = line.strip()
        
        # Functions
        if stripped.startswith('fn '):
            try:
                func_name = stripped[3:].split('(')[0].strip()
                result["functions"].append(func_name)
            except IndexError:
                pass
        
        # Structs
        elif stripped.startswith('struct '):
            try:
                struct_name = stripped[7:].split(':')[0].split('(')[0].strip()
                result["structs"].append(struct_name)
            except IndexError:
                pass
        
        # Imports
        elif stripped.startswith('from ') and 'import' in stripped:
            result["imports"].append(stripped)
    
    return result

def _analyze_generic_code(lines):
    """Generic code analysis for unknown file types."""
    result = {"functions": [], "classes": [], "imports": [], "comments": []}
    
    for line in lines:
        stripped = line.strip()
        
        # Comments
        if stripped.startswith('#') or stripped.startswith('//') or stripped.startswith('/*'):
            if len(stripped) > 3:  # Skip very short comments
                result["comments"].append(stripped[:50] + '...' if len(stripped) > 50 else stripped)
    
    return result

def _generate_code_summary(analysis):
    """Generate a concise summary of the code analysis."""
    parts = []
    
    if analysis.get("functions"):
        func_names = analysis["functions"][:3]  # Show first 3 functions
        if len(analysis["functions"]) > 3:
            parts.append(f"functions: {', '.join(func_names)} (+{len(analysis['functions'])-3} more)")
        else:
            parts.append(f"functions: {', '.join(func_names)}")
    
    if analysis.get("classes"):
        class_names = analysis["classes"][:2]  # Show first 2 classes
        if len(analysis["classes"]) > 2:
            parts.append(f"classes: {', '.join(class_names)} (+{len(analysis['classes'])-2} more)")
        else:
            parts.append(f"classes: {', '.join(class_names)}")
    
    if analysis.get("structs"):
        struct_names = analysis["structs"][:2]
        parts.append(f"structs: {', '.join(struct_names)}")
    
    if analysis.get("imports") and len(analysis["imports"]) > 0:
        parts.append(f"{len(analysis['imports'])} imports")
    
    if analysis.get("constants") and len(analysis["constants"]) > 0:
        parts.append(f"{len(analysis['constants'])} constants")
    
    if analysis.get("docstrings") and len(analysis["docstrings"]) > 0:
        parts.append(f"{len(analysis['docstrings'])} docstrings")
    
    # If no specific patterns found, describe generically
    if not parts:
        if analysis.get("total_lines", 0) > 0:
            return f"{analysis['total_lines']} lines of code"
        else:
            return "code changes"
    
    return " | ".join(parts)

def generate_meaningful_commit_message(operation_type, file_path, old_content="", new_content="", base_message=""):
    """
    Generate a meaningful commit message based on code analysis.
    
    Args:
        operation_type: "create", "edit", "remove"
        file_path: Path to the file
        old_content: Original content (for edits/removals)
        new_content: New content (for edits/creates)
        base_message: Base message prefix
        
    Returns:
        str: Enhanced commit message
    """
    file_name = Path(file_path).name
    
    if operation_type == "create":
        analysis = analyze_code_content(new_content, file_path)
        return f"{base_message}{file_name} ({analysis['total_lines']} lines) - {analysis['summary']}"
    
    elif operation_type == "edit":
        old_analysis = analyze_code_content(old_content, file_path) if old_content else {"summary": "empty"}
        new_analysis = analyze_code_content(new_content, file_path) if new_content else {"summary": "empty"}
        
        # Determine what changed
        old_funcs = set(old_analysis.get("functions", []))
        new_funcs = set(new_analysis.get("functions", []))
        added_funcs = new_funcs - old_funcs
        removed_funcs = old_funcs - new_funcs
        
        old_classes = set(old_analysis.get("classes", []))
        new_classes = set(new_analysis.get("classes", []))
        added_classes = new_classes - old_classes
        removed_classes = old_classes - new_classes
        
        changes = []
        if added_funcs:
            changes.append(f"added {', '.join(list(added_funcs)[:3])}")
        if removed_funcs:
            changes.append(f"removed {', '.join(list(removed_funcs)[:3])}")
        if added_classes:
            changes.append(f"added class {', '.join(list(added_classes)[:2])}")
        if removed_classes:
            changes.append(f"removed class {', '.join(list(removed_classes)[:2])}")
        
        if changes:
            change_desc = " | ".join(changes)
        else:
            # Fallback to line count changes
            old_lines = old_analysis.get("total_lines", 0)
            new_lines = new_analysis.get("total_lines", 0)
            if new_lines > old_lines:
                change_desc = f"expanded by {new_lines - old_lines} lines"
            elif new_lines < old_lines:
                change_desc = f"reduced by {old_lines - new_lines} lines"
            else:
                change_desc = "modified content"
        
        return f"{base_message}{file_name} - {change_desc}"
    
    elif operation_type == "remove":
        analysis = analyze_code_content(old_content, file_path) if old_content else {"summary": "unknown content"}
        return f"{base_message}{file_name} - removed {analysis['summary']}"
    
    return base_message

def is_dangerous_rm_command(command):
    """
    Comprehensive detection of dangerous rm commands.
    Matches various forms of rm -rf and similar destructive patterns.
    """
    # Normalize command by removing extra spaces and converting to lowercase
    normalized = ' '.join(command.lower().split())
    
    # Pattern 1: Standard rm -rf variations
    patterns = [
        r'\brm\s+.*-[a-z]*r[a-z]*f',  # rm -rf, rm -fr, rm -Rf, etc.
        r'\brm\s+.*-[a-z]*f[a-z]*r',  # rm -fr variations
        r'\brm\s+--recursive\s+--force',  # rm --recursive --force
        r'\brm\s+--force\s+--recursive',  # rm --force --recursive
        r'\brm\s+-r\s+.*-f',  # rm -r ... -f
        r'\brm\s+-f\s+.*-r',  # rm -f ... -r
    ]
    
    # Check for dangerous patterns
    for pattern in patterns:
        if re.search(pattern, normalized):
            return True
    
    # Pattern 2: Check for rm with recursive flag targeting dangerous paths
    dangerous_paths = [
        r'/',           # Root directory
        r'/\*',         # Root with wildcard
        r'~',           # Home directory
        r'~/',          # Home directory path
        r'\$HOME',      # Home environment variable
        r'\.\.',        # Parent directory references
        r'\*',          # Wildcards in general rm -rf context
        r'\.',          # Current directory
        r'\.\s*$',      # Current directory at end of command
    ]
    
    if re.search(r'\brm\s+.*-[a-z]*r', normalized):  # If rm has recursive flag
        for path in dangerous_paths:
            if re.search(path, normalized):
                return True
    
    return False

def is_env_file_access(tool_name, tool_input):
    """
    Check if any tool is trying to access .env files containing sensitive data.
    """
    if tool_name in ['Read', 'Edit', 'MultiEdit', 'Write', 'Bash']:
        # Check file paths for file-based tools
        if tool_name in ['Read', 'Edit', 'MultiEdit', 'Write']:
            file_path = tool_input.get('file_path', '')
            if '.env' in file_path and not file_path.endswith('.env.sample'):
                return True
        
        # Check bash commands for .env file access
        elif tool_name == 'Bash':
            command = tool_input.get('command', '')
            # Pattern to detect .env file access (but allow .env.sample)
            env_patterns = [
                r'\b\.env\b(?!\.sample)',  # .env but not .env.sample
                r'cat\s+.*\.env\b(?!\.sample)',  # cat .env
                r'echo\s+.*>\s*\.env\b(?!\.sample)',  # echo > .env
                r'touch\s+.*\.env\b(?!\.sample)',  # touch .env
                r'cp\s+.*\.env\b(?!\.sample)',  # cp .env
                r'mv\s+.*\.env\b(?!\.sample)',  # mv .env
            ]
            
            for pattern in env_patterns:
                if re.search(pattern, command):
                    return True
    
    return False

def load_edit_thresholds():
    """
    Load edit threshold configuration from settings.json.
    
    Returns:
        dict: Edit threshold configuration with defaults
    """
    default_config = {
        "max_lines_added": 50,
        "max_lines_removed": 50,
        "max_total_changes": 100,
        "enabled": True,
        "auto_commit": True,
        "commit_message_prefix": "Auto-commit: Large file changes detected - "
    }
    
    try:
        settings_path = Path(__file__).parent.parent / "settings.json"
        if settings_path.exists():
            with open(settings_path, 'r') as f:
                settings = json.load(f)
                return settings.get("edit_thresholds", default_config)
    except Exception:
        pass
    
    return default_config

def load_file_creation_thresholds():
    """
    Load file creation threshold configuration from settings.json.
    
    Returns:
        dict: File creation threshold configuration with defaults
    """
    default_config = {
        "max_new_file_lines": 100,
        "max_files_per_session": 5,
        "enabled": True,
        "auto_commit": True,
        "commit_message_prefix": "Auto-commit: New file created - ",
        "exclude_patterns": ["*.tmp", "*.log", "*.cache", ".DS_Store", "Thumbs.db"],
        "include_patterns": ["*.py", "*.md", "*.yaml", "*.yml", "*.json", "*.toml", "*.txt"]
    }
    
    try:
        settings_path = Path(__file__).parent.parent / "settings.json"
        if settings_path.exists():
            with open(settings_path, 'r') as f:
                settings = json.load(f)
                return settings.get("file_creation_thresholds", default_config)
    except Exception:
        pass
    
    return default_config

def should_track_file(file_path, config):
    """
    Check if a file should be tracked based on include/exclude patterns.
    
    Args:
        file_path: Path to the file
        config: File creation threshold configuration
        
    Returns:
        bool: True if file should be tracked
    """
    import fnmatch
    
    file_name = os.path.basename(file_path)
    
    # Check exclude patterns first
    for pattern in config.get('exclude_patterns', []):
        if fnmatch.fnmatch(file_name, pattern):
            return False
    
    # Check include patterns
    include_patterns = config.get('include_patterns', [])
    if not include_patterns:
        return True  # If no include patterns, include all (except excluded)
    
    for pattern in include_patterns:
        if fnmatch.fnmatch(file_name, pattern):
            return True
    
    return False

def get_session_file_count():
    """
    Get the number of files created in the current session.
    
    Returns:
        int: Number of files created in current session
    """
    try:
        session_log_dir = ensure_session_log_dir("current")
        file_creation_log = session_log_dir / "file_creations.log"
        
        if not file_creation_log.exists():
            return 0
        
        with open(file_creation_log, 'r') as f:
            return len(f.readlines())
    except Exception:
        return 0

def log_file_creation(file_path):
    """
    Log a file creation event.
    
    Args:
        file_path: Path to the created file
    """
    try:
        session_log_dir = ensure_session_log_dir("current")
        file_creation_log = session_log_dir / "file_creations.log"
        
        with open(file_creation_log, 'a') as f:
            from datetime import datetime
            timestamp = datetime.now().isoformat()
            f.write(f"{timestamp}: {file_path}\n")
    except Exception:
        pass

def check_file_creation_thresholds(tool_name, tool_input):
    """
    Check if file creation operation should trigger auto-commit.
    
    Args:
        tool_name: Name of the tool being used
        tool_input: Tool input parameters
        
    Returns:
        bool: True if auto-commit should be triggered, False otherwise
    """
    # Debug logging
    print(f"DEBUG: check_file_creation_thresholds called with tool_name={tool_name}", file=sys.stderr)
    
    config = load_file_creation_thresholds()
    
    # Skip if threshold checking is disabled
    if not config.get('enabled', True):
        print("DEBUG: File creation threshold checking is disabled", file=sys.stderr)
        return False
    
    # Only check Write tool for new file creation
    if tool_name != 'Write':
        print(f"DEBUG: Skipping - tool is {tool_name}, not Write", file=sys.stderr)
        return False
    
    file_path = tool_input.get('file_path', '')
    content = tool_input.get('content', '')
    
    print(f"DEBUG: Write tool detected - file_path={file_path}", file=sys.stderr)
    
    if not file_path:
        return False
    
    # Check if this is a new file creation
    if os.path.exists(file_path):
        print(f"DEBUG: File already exists, not a new creation: {file_path}", file=sys.stderr)
        return False  # File already exists, not a new creation
    
    # Check if file should be tracked
    if not should_track_file(file_path, config):
        return False
    
    # Check file size threshold
    new_lines = len(content.splitlines()) if content else 0
    max_lines = config.get('max_new_file_lines', 100)
    
    # Check session file count threshold
    current_file_count = get_session_file_count()
    max_files = config.get('max_files_per_session', 5)
    
    threshold_exceeded = (
        new_lines > max_lines or 
        current_file_count >= max_files
    )
    
    if threshold_exceeded:
        print("NEW FILE CREATION THRESHOLD EXCEEDED:", file=sys.stderr)
        print(f"  File: {file_path}", file=sys.stderr)
        print(f"  Lines in new file: {new_lines} (max: {max_lines})", file=sys.stderr)
        print(f"  Files created this session: {current_file_count} (max: {max_files})", file=sys.stderr)
        
        if config.get('auto_commit', True):
            print("AUTO-COMMIT: Will commit new file creation", file=sys.stderr)
            
            # Log the file creation
            log_file_creation(file_path)
            
            # Try to commit any existing staged changes first
            try:
                result = subprocess.run(['git', 'status', '--porcelain'], 
                                      capture_output=True, text=True, cwd=os.getcwd())
                
                if result.stdout.strip():
                    # Generate meaningful commit message for file creation
                    meaningful_commit_msg = generate_meaningful_commit_message(
                        "create", file_path, "", content, 
                        config.get('commit_message_prefix', 'Auto-commit: New file created - ')
                    )
                    
                    print(f"AUTO-COMMIT: Staging changes for commit", file=sys.stderr)
                    subprocess.run(['git', 'add', '.'], cwd=os.getcwd(), capture_output=True)
                    
                    print(f"AUTO-COMMIT: Creating commit: {meaningful_commit_msg}", file=sys.stderr)
                    subprocess.run(['git', 'commit', '-m', meaningful_commit_msg], 
                                 cwd=os.getcwd(), capture_output=True)
                    
                    print("AUTO-COMMIT: Commit completed successfully", file=sys.stderr)
                    
            except Exception as e:
                print(f"AUTO-COMMIT: Error during commit: {e}", file=sys.stderr)
        
        return True
    
    # If not exceeding thresholds, still log the file creation
    log_file_creation(file_path)
    return False

def count_file_lines(file_path):
    """
    Count the number of lines in a file.
    
    Args:
        file_path: Path to the file
        
    Returns:
        int: Number of lines in the file, 0 if file doesn't exist
    """
    try:
        if not os.path.exists(file_path):
            return 0
        
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return len(f.readlines())
    except Exception:
        return 0

def estimate_edit_changes(tool_name, tool_input):
    """
    Estimate the number of lines that will be added/removed for edit operations.
    
    Args:
        tool_name: Name of the tool being used
        tool_input: Tool input parameters
        
    Returns:
        tuple: (lines_added, lines_removed, file_path) or None if not an edit operation
    """
    if tool_name == 'Edit':
        file_path = tool_input.get('file_path', '')
        old_string = tool_input.get('old_string', '')
        new_string = tool_input.get('new_string', '')
        
        if not file_path:
            return None
            
        # Count lines in old and new strings
        old_lines = len(old_string.splitlines()) if old_string else 0
        new_lines = len(new_string.splitlines()) if new_string else 0
        
        print(f"DEBUG: estimate_edit_changes - old_string preview: {repr(old_string[:100])}", file=sys.stderr)
        print(f"DEBUG: estimate_edit_changes - old_lines={old_lines}, new_lines={new_lines}", file=sys.stderr)
        
        lines_removed = old_lines
        lines_added = new_lines
        
        return (lines_added, lines_removed, file_path)
    
    elif tool_name == 'MultiEdit':
        file_path = tool_input.get('file_path', '')
        edits = tool_input.get('edits', [])
        
        if not file_path or not edits:
            return None
            
        total_added = 0
        total_removed = 0
        
        for edit in edits:
            old_string = edit.get('old_string', '')
            new_string = edit.get('new_string', '')
            
            old_lines = len(old_string.splitlines()) if old_string else 0
            new_lines = len(new_string.splitlines()) if new_string else 0
            
            total_removed += old_lines
            total_added += new_lines
        
        return (total_added, total_removed, file_path)
    
    elif tool_name == 'Write':
        file_path = tool_input.get('file_path', '')
        content = tool_input.get('content', '')
        
        if not file_path:
            return None
            
        # For Write operations, count existing lines vs new lines
        existing_lines = count_file_lines(file_path)
        new_lines = len(content.splitlines()) if content else 0
        
        if existing_lines == 0:
            # New file creation
            return (new_lines, 0, file_path)
        else:
            # File replacement
            return (new_lines, existing_lines, file_path)
    
    return None

def perform_auto_commit(file_path, config, changes_summary):
    """
    Perform automatic git commit for large file changes.
    
    Args:
        file_path: Path to the file being modified
        config: Edit threshold configuration
        changes_summary: Summary of changes (lines_added, lines_removed)
    """
    try:
        # Change to the repository root directory
        repo_root = subprocess.check_output(['git', 'rev-parse', '--show-toplevel'], 
                                          cwd=os.path.dirname(file_path), 
                                          stderr=subprocess.DEVNULL).decode().strip()
        
        # Add the specific file
        subprocess.run(['git', 'add', file_path], 
                      cwd=repo_root, 
                      check=True, 
                      capture_output=True)
        
        # Create commit message
        lines_added, lines_removed = changes_summary
        commit_msg = (f"{config['commit_message_prefix']}"
                     f"+{lines_added}/-{lines_removed} lines in {os.path.basename(file_path)}")
        
        # Commit the changes
        subprocess.run(['git', 'commit', '-m', commit_msg], 
                      cwd=repo_root, 
                      check=True, 
                      capture_output=True)
        
        print(f"AUTO-COMMIT: Committed changes to {file_path} (+{lines_added}/-{lines_removed} lines)", 
              file=sys.stderr)
        return True
        
    except subprocess.CalledProcessError:
        print(f"WARNING: Auto-commit failed for {file_path}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"WARNING: Auto-commit error for {file_path}: {e}", file=sys.stderr)
        return False

def split_text_into_chunks(text, chunk_size):
    """
    Split text into chunks of approximately chunk_size lines.
    
    Args:
        text: Text to split
        chunk_size: Maximum lines per chunk
        
    Returns:
        list: List of text chunks
    """
    lines = text.splitlines(keepends=True)
    chunks = []
    
    for i in range(0, len(lines), chunk_size):
        chunk = ''.join(lines[i:i + chunk_size])
        chunks.append(chunk)
    
    return chunks

def perform_chunked_edit(file_path, old_string, new_string, config):
    """
    Perform a large edit by splitting it into smaller chunks and committing each.
    
    Args:
        file_path: Path to the file being edited
        old_string: Original content to replace
        new_string: New content
        config: Edit threshold configuration
        
    Returns:
        bool: True if successful, False otherwise
    """
    import difflib
    import traceback
    
    print(f"DEBUG: Starting chunked edit for {file_path}", file=sys.stderr)
    print(f"DEBUG: Current working directory: {os.getcwd()}", file=sys.stderr)
    print(f"DEBUG: Old string length: {len(old_string)} chars, {len(old_string.splitlines())} lines", file=sys.stderr)
    print(f"DEBUG: New string length: {len(new_string)} chars, {len(new_string.splitlines())} lines", file=sys.stderr)
    
    old_lines = old_string.splitlines(keepends=True)
    new_lines = new_string.splitlines(keepends=True)
    
    # Generate unified diff
    diff = list(difflib.unified_diff(old_lines, new_lines, lineterm=''))
    
    max_lines = min(config.get('max_lines_added', 25), config.get('max_lines_removed', 25))
    print(f"DEBUG: Max lines per chunk: {max_lines}", file=sys.stderr)
    
    # Make file path absolute if relative
    if not os.path.isabs(file_path):
        # Try to find the file relative to the project root
        project_root = "/home/uge/mfc-project"
        abs_file_path = os.path.join(project_root, file_path)
        if os.path.exists(abs_file_path):
            file_path = abs_file_path
        else:
            print(f"ERROR: File not found at {file_path} or {abs_file_path}", file=sys.stderr)
            return False
    
    # Read the current file content
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            current_content = f.read()
        print(f"DEBUG: Successfully read file, length: {len(current_content)} chars", file=sys.stderr)
    except Exception as e:
        print(f"ERROR: Failed to read file {file_path}: {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        return False
    
    # If the old_string doesn't match current content exactly, abort
    if old_string not in current_content:
        print(f"ERROR: Old string not found in {file_path}", file=sys.stderr)
        print(f"DEBUG: File content preview: {current_content[:100]}...", file=sys.stderr)
        print(f"DEBUG: Old string preview: {old_string[:100]}...", file=sys.stderr)
        return False
    
    # Split the change into chunks
    old_chunks = split_text_into_chunks(old_string, max_lines)
    new_chunks = split_text_into_chunks(new_string, max_lines)
    
    print(f"DEBUG: Split into {len(old_chunks)} old chunks and {len(new_chunks)} new chunks", file=sys.stderr)
    
    # If we're removing more than adding, process removals first
    if len(old_chunks) > len(new_chunks):
        print(f"DEBUG: Removing content mode (more old chunks than new)", file=sys.stderr)
        # Remove chunks from the end to the beginning
        for i in range(len(old_chunks) - 1, -1, -1):
            try:
                print(f"DEBUG: Processing chunk {i+1}/{len(old_chunks)}", file=sys.stderr)
                
                # Read current content
                with open(file_path, 'r', encoding='utf-8') as f:
                    current_content = f.read()
                
                # Replace this chunk with empty or corresponding new chunk
                chunk_to_remove = old_chunks[i]
                chunk_to_add = new_chunks[i] if i < len(new_chunks) else ''
                
                print(f"DEBUG: Chunk to remove has {len(chunk_to_remove.splitlines())} lines", file=sys.stderr)
                print(f"DEBUG: Chunk to add has {len(chunk_to_add.splitlines())} lines", file=sys.stderr)
                
                if chunk_to_remove in current_content:
                    new_content = current_content.replace(chunk_to_remove, chunk_to_add, 1)
                    
                    # Write the change
                    with open(file_path, 'w', encoding='utf-8') as f:
                        f.write(new_content)
                    print(f"DEBUG: File written successfully", file=sys.stderr)
                    
                    # Commit this chunk
                    result = subprocess.run(['git', 'add', file_path], capture_output=True, text=True)
                    if result.returncode != 0:
                        print(f"ERROR: git add failed: {result.stderr}", file=sys.stderr)
                        return False
                    
                    # Generate meaningful commit message
                    meaningful_msg = generate_meaningful_commit_message(
                        "edit", file_path, chunk_to_remove, chunk_to_add, 
                        f"{config['commit_message_prefix']}chunk {i+1}/{len(old_chunks)} - "
                    )
                    
                    result = subprocess.run(['git', 'commit', '-m', meaningful_msg], capture_output=True, text=True)
                    if result.returncode != 0:
                        print(f"ERROR: git commit failed: {result.stderr}", file=sys.stderr)
                        return False
                        
                    print(f"CHUNKED EDIT: Committed chunk {i+1}/{len(old_chunks)} - {meaningful_msg}", file=sys.stderr)
                else:
                    print(f"WARNING: Chunk not found in current content", file=sys.stderr)
                
            except Exception as e:
                print(f"ERROR: Failed to process chunk {i+1}: {e}", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                return False
    
    else:
        print(f"DEBUG: Adding content mode (more new chunks than old)", file=sys.stderr)
        # Adding more than removing - do a direct chunked replacement
        # Start by replacing with empty content, then add chunks
        try:
            # First, remove all old content
            with open(file_path, 'r', encoding='utf-8') as f:
                current_content = f.read()
            
            new_content = current_content.replace(old_string, '', 1)
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(new_content)
            
            result = subprocess.run(['git', 'add', file_path], capture_output=True, text=True)
            if result.returncode != 0:
                print(f"ERROR: git add failed: {result.stderr}", file=sys.stderr)
                return False
            
            # Generate meaningful commit message for removal
            removal_msg = generate_meaningful_commit_message(
                "remove", file_path, old_string, "", 
                f"{config['commit_message_prefix']}"
            )
                
            result = subprocess.run(['git', 'commit', '-m', removal_msg], 
                         capture_output=True, text=True)
            if result.returncode != 0:
                print(f"ERROR: git commit failed: {result.stderr}", file=sys.stderr)
                return False
            
            print(f"DEBUG: Removed old content", file=sys.stderr)
            
            # Now add new content in chunks
            insertion_point = current_content.index(old_string)
            
            for i, chunk in enumerate(new_chunks):
                print(f"DEBUG: Adding chunk {i+1}/{len(new_chunks)}", file=sys.stderr)
                
                with open(file_path, 'r', encoding='utf-8') as f:
                    current_content = f.read()
                
                # Insert chunk at the appropriate position
                new_content = current_content[:insertion_point] + chunk + current_content[insertion_point:]
                insertion_point += len(chunk)
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    f.write(new_content)
                
                result = subprocess.run(['git', 'add', file_path], capture_output=True, text=True)
                if result.returncode != 0:
                    print(f"ERROR: git add failed: {result.stderr}", file=sys.stderr)
                    return False
                
                # Generate meaningful commit message for chunk addition
                chunk_addition_msg = generate_meaningful_commit_message(
                    "create", file_path, "", chunk, 
                    f"{config['commit_message_prefix']}chunk {i+1}/{len(new_chunks)} - "
                )
                    
                result = subprocess.run(['git', 'commit', '-m', chunk_addition_msg], capture_output=True, text=True)
                if result.returncode != 0:
                    print(f"ERROR: git commit failed: {result.stderr}", file=sys.stderr)
                    return False
                    
                print(f"CHUNKED EDIT: Committed chunk {i+1}/{len(new_chunks)} - {chunk_addition_msg}", file=sys.stderr)
                
        except Exception as e:
            print(f"ERROR: Failed during chunked addition: {e}", file=sys.stderr)
            traceback.print_exc(file=sys.stderr)
            return False
    
    print(f"DEBUG: Chunked edit completed successfully", file=sys.stderr)
    return True

def check_edit_thresholds(tool_name, tool_input):
    """
    Check if edit operation exceeds configured thresholds and handle accordingly.
    
    Args:
        tool_name: Name of the tool being used
        tool_input: Tool input parameters
        
    Returns:
        bool: True if operation should be blocked, False otherwise
    """
    config = load_edit_thresholds()
    
    # Skip if threshold checking is disabled
    if not config.get('enabled', True):
        return False
    
    # Estimate changes for edit operations
    changes = estimate_edit_changes(tool_name, tool_input)
    if not changes:
        return False  # Not an edit operation
    
    lines_added, lines_removed, file_path = changes
    total_changes = lines_added + lines_removed
    
    # Check thresholds
    max_added = config.get('max_lines_added', 50)
    max_removed = config.get('max_lines_removed', 50)
    max_total = config.get('max_total_changes', 100)
    
    threshold_exceeded = (
        lines_added > max_added or 
        lines_removed > max_removed or 
        total_changes > max_total
    )
    
    print(f"DEBUG: Checking thresholds - lines_added={lines_added}, lines_removed={lines_removed}, total={total_changes}", file=sys.stderr)
    print(f"DEBUG: Thresholds - max_added={max_added}, max_removed={max_removed}, max_total={max_total}", file=sys.stderr)
    print(f"DEBUG: Threshold exceeded: {threshold_exceeded}", file=sys.stderr)
    
    if threshold_exceeded:
        print("LARGE EDIT DETECTED:", file=sys.stderr)
        print(f"  File: {file_path}", file=sys.stderr)
        print(f"  Lines to add: {lines_added} (max: {max_added})", file=sys.stderr)
        print(f"  Lines to remove: {lines_removed} (max: {max_removed})", file=sys.stderr)
        print(f"  Total changes: {total_changes} (max: {max_total})", file=sys.stderr)
        
        if config.get('auto_commit', True):
            print("CHUNKED EDIT MODE: Will split edit into smaller chunks", file=sys.stderr)
            
            # Only handle simple Edit operations for chunking
            if tool_name == 'Edit':
                old_string = tool_input.get('old_string', '')
                new_string = tool_input.get('new_string', '')
                
                print(f"DEBUG: About to call perform_chunked_edit with file_path={file_path}", file=sys.stderr)
                
                # Perform chunked edit
                if perform_chunked_edit(file_path, old_string, new_string, config):
                    print("CHUNKED EDIT COMPLETE: All chunks committed successfully", file=sys.stderr)
                    # Block the original edit since we've already performed it in chunks
                    return True
                else:
                    print("CHUNKED EDIT FAILED: Falling back to regular edit", file=sys.stderr)
            else:
                print("COMPLEX EDIT: MultiEdit not supported for chunking, proceeding normally", file=sys.stderr)
        else:
            print("DEBUG: Auto-commit disabled, proceeding normally", file=sys.stderr)
        
        # If chunking is disabled or failed, proceed normally
        return False
    
    return False

def main():
    print("DEBUG: pre_tool_use.py hook started", file=sys.stderr)
    
    # Log hook execution to a file for debugging
    try:
        with open('/tmp/hook_debug.log', 'a') as f:
            f.write(f"Hook called at {datetime.now()}\n")
    except:
        pass
    
    try:
        # Read JSON input from stdin
        input_data = json.load(sys.stdin)
        
        tool_name = input_data.get('tool_name', '')
        tool_input = input_data.get('tool_input', {})
        
        print(f"DEBUG: Received tool_name={tool_name}", file=sys.stderr)
        print(f"DEBUG: Tool input keys: {list(tool_input.keys())}", file=sys.stderr)
        
        # Check edit thresholds for large file changes
        if check_edit_thresholds(tool_name, tool_input):
            print("BLOCKED: Edit operation exceeds configured thresholds", file=sys.stderr)
            sys.exit(2)  # Exit code 2 blocks tool call and shows error to Claude
        
        # Check file creation thresholds for new file creation
        if check_file_creation_thresholds(tool_name, tool_input):
            print("FILE CREATION: Threshold exceeded, auto-commit triggered", file=sys.stderr)
            # Note: We don't block file creation, just trigger auto-commit
        
        # Check for .env file access (blocks access to sensitive environment files)
        if is_env_file_access(tool_name, tool_input):
            print("BLOCKED: Access to .env files containing sensitive data is prohibited", file=sys.stderr)
            print("Use .env.sample for template files instead", file=sys.stderr)
            sys.exit(2)  # Exit code 2 blocks tool call and shows error to Claude
        
        # Check for dangerous rm -rf commands
        if tool_name == 'Bash':
            command = tool_input.get('command', '')
            
            # Block rm -rf commands with comprehensive pattern matching
            if is_dangerous_rm_command(command):
                print("BLOCKED: Dangerous rm command detected and prevented", file=sys.stderr)
                sys.exit(2)  # Exit code 2 blocks tool call and shows error to Claude
        
        # Extract session_id
        session_id = input_data.get('session_id', 'unknown')
        
        # Ensure session log directory exists
        log_dir = ensure_session_log_dir(session_id)
        log_path = log_dir / 'pre_tool_use.json'
        
        # Read existing log data or initialize empty list
        if log_path.exists():
            with open(log_path, 'r') as f:
                try:
                    log_data = json.load(f)
                except (json.JSONDecodeError, ValueError):
                    log_data = []
        else:
            log_data = []
        
        # Append new data
        log_data.append(input_data)
        
        # Write back to file with formatting
        with open(log_path, 'w') as f:
            json.dump(log_data, f, indent=2)
        
        sys.exit(0)
        
    except json.JSONDecodeError:
        # Gracefully handle JSON decode errors
        sys.exit(0)
    except Exception:
        # Handle any other errors gracefully
        sys.exit(0)

if __name__ == '__main__':
    main()