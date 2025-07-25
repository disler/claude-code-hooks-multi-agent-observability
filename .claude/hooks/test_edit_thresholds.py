#!/usr/bin/env -S pixi run python
# /// script
# requires-python = ">=3.8"
# ///

"""
Test script for edit threshold functionality.

This script can be used to test the edit threshold checking functionality
by simulating different types of edit operations.
"""

import json
import sys
from pathlib import Path

# Add the hooks directory to the path for imports
sys.path.append(str(Path(__file__).parent))

from pre_tool_use import (
    load_edit_thresholds,
    estimate_edit_changes,
    check_edit_thresholds,
    count_file_lines
)

def test_edit_threshold_config():
    """Test loading edit threshold configuration."""
    print("Testing edit threshold configuration loading...")
    config = load_edit_thresholds()
    
    print("Configuration loaded:")
    for key, value in config.items():
        print(f"  {key}: {value}")
    
    return config

def test_line_counting():
    """Test file line counting functionality."""
    print("\nTesting line counting...")
    
    # Test with this file
    test_file = __file__
    line_count = count_file_lines(test_file)
    print(f"Lines in {test_file}: {line_count}")
    
    # Test with non-existent file
    non_existent = "/tmp/non_existent_file.txt"
    line_count_ne = count_file_lines(non_existent)
    print(f"Lines in {non_existent}: {line_count_ne}")

def test_edit_estimation():
    """Test edit change estimation."""
    print("\nTesting edit change estimation...")
    
    # Test Edit tool
    edit_input = {
        'file_path': '/tmp/test_file.py',
        'old_string': 'line1\nline2\nline3',
        'new_string': 'line1\nnew_line2\nnew_line3\nnew_line4\nnew_line5'
    }
    
    changes = estimate_edit_changes('Edit', edit_input)
    if changes:
        lines_added, lines_removed, file_path = changes
        print(f"Edit operation: +{lines_added}/-{lines_removed} lines in {file_path}")
    
    # Test MultiEdit tool
    multi_edit_input = {
        'file_path': '/tmp/test_file.py',
        'edits': [
            {
                'old_string': 'short',
                'new_string': 'much\nlonger\nreplacement\nwith\nmultiple\nlines'
            },
            {
                'old_string': 'another\nold\nblock',
                'new_string': 'new'
            }
        ]
    }
    
    changes = estimate_edit_changes('MultiEdit', multi_edit_input)
    if changes:
        lines_added, lines_removed, file_path = changes
        print(f"MultiEdit operation: +{lines_added}/-{lines_removed} lines in {file_path}")
    
    # Test Write tool (new file)
    write_input = {
        'file_path': '/tmp/new_file.py',
        'content': '\n'.join([f'line_{i}' for i in range(60)])  # 60 lines
    }
    
    changes = estimate_edit_changes('Write', write_input)
    if changes:
        lines_added, lines_removed, file_path = changes
        print(f"Write operation (new file): +{lines_added}/-{lines_removed} lines in {file_path}")

def test_threshold_checking():
    """Test threshold checking with various scenarios."""
    print("\nTesting threshold checking...")
    
    # Test small edit (should pass)
    small_edit = {
        'file_path': '/tmp/test_file.py',
        'old_string': 'line1',
        'new_string': 'modified_line1'
    }
    
    blocked = check_edit_thresholds('Edit', small_edit)
    print(f"Small edit blocked: {blocked}")
    
    # Test large edit (should trigger threshold)
    large_edit = {
        'file_path': '/tmp/test_file.py',
        'old_string': 'old_content',
        'new_string': '\n'.join([f'new_line_{i}' for i in range(70)])  # 70 lines
    }
    
    blocked = check_edit_thresholds('Edit', large_edit)
    print(f"Large edit blocked: {blocked}")
    
    # Test large MultiEdit
    large_multi_edit = {
        'file_path': '/tmp/test_file.py',
        'edits': [
            {
                'old_string': 'block1',
                'new_string': '\n'.join([f'replacement_{i}' for i in range(30)])
            },
            {
                'old_string': 'block2', 
                'new_string': '\n'.join([f'replacement_{i}' for i in range(25)])
            }
        ]
    }
    
    blocked = check_edit_thresholds('MultiEdit', large_multi_edit)
    print(f"Large MultiEdit blocked: {blocked}")

def simulate_hook_input(tool_name, tool_input):
    """Simulate the JSON input that the hook receives."""
    hook_input = {
        'tool_name': tool_name,
        'tool_input': tool_input,
        'session_id': 'test_session'
    }
    
    print(f"\nSimulating hook input for {tool_name}:")
    print(json.dumps(hook_input, indent=2))
    
    # Test the threshold checking
    blocked = check_edit_thresholds(tool_name, tool_input)
    print(f"Operation would be blocked: {blocked}")

def main():
    """Run all tests."""
    print("=" * 60)
    print("EDIT THRESHOLD TESTING")
    print("=" * 60)
    
    # Test configuration loading
    config = test_edit_threshold_config()
    
    # Test line counting
    test_line_counting()
    
    # Test edit estimation
    test_edit_estimation()
    
    # Test threshold checking
    test_threshold_checking()
    
    # Simulate various hook inputs
    print("\n" + "=" * 60)
    print("HOOK INPUT SIMULATION")
    print("=" * 60)
    
    # Simulate small edit
    simulate_hook_input('Edit', {
        'file_path': '/tmp/small_edit.py',
        'old_string': 'old line',
        'new_string': 'new line'
    })
    
    # Simulate large edit
    simulate_hook_input('Edit', {
        'file_path': '/tmp/large_edit.py',
        'old_string': 'old content',
        'new_string': '\n'.join([f'line_{i}' for i in range(80)])
    })
    
    # Simulate large file creation
    simulate_hook_input('Write', {
        'file_path': '/tmp/large_new_file.py',
        'content': '\n'.join([f'line_{i}' for i in range(120)])
    })
    
    print("\n" + "=" * 60)
    print("CONFIGURATION SUMMARY")
    print("=" * 60)
    print(f"Max lines added: {config['max_lines_added']}")
    print(f"Max lines removed: {config['max_lines_removed']}")
    print(f"Max total changes: {config['max_total_changes']}")
    print(f"Auto-commit enabled: {config['auto_commit']}")
    print(f"Threshold checking enabled: {config['enabled']}")

if __name__ == '__main__':
    main()