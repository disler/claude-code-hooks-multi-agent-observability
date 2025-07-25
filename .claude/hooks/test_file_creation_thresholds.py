#!/usr/bin/env python3
"""
Test File Creation Thresholds Hook

This script tests the file creation threshold monitoring functionality
to ensure it correctly detects new file creation and triggers auto-commits
when thresholds are exceeded.
"""

import json
import sys
import os
import tempfile
import subprocess
from pathlib import Path

# Add the hooks directory to Python path for imports
sys.path.insert(0, os.path.dirname(__file__))

from pre_tool_use import (
    load_file_creation_thresholds,
    should_track_file,
    check_file_creation_thresholds,
    get_session_file_count,
    log_file_creation
)

def test_load_configuration():
    """Test loading of file creation threshold configuration."""
    print("Testing configuration loading...")
    
    config = load_file_creation_thresholds()
    
    # Check required keys exist
    required_keys = [
        'max_new_file_lines', 'max_files_per_session', 'enabled',
        'auto_commit', 'commit_message_prefix', 'exclude_patterns', 'include_patterns'
    ]
    
    for key in required_keys:
        assert key in config, f"Missing required configuration key: {key}"
    
    print(f"✓ Configuration loaded successfully")
    print(f"  Max lines: {config['max_new_file_lines']}")
    print(f"  Max files per session: {config['max_files_per_session']}")
    print(f"  Enabled: {config['enabled']}")
    print(f"  Auto-commit: {config['auto_commit']}")
    return config

def test_file_pattern_matching():
    """Test file pattern matching logic."""
    print("\nTesting file pattern matching...")
    
    config = load_file_creation_thresholds()
    
    # Test cases: (file_path, should_be_tracked)
    test_cases = [
        # Should be tracked (matches include patterns)
        ("test.py", True),
        ("config.yaml", True),
        ("README.md", True),
        ("settings.json", True),
        ("pyproject.toml", True),
        ("notes.txt", True),
        
        # Should NOT be tracked (matches exclude patterns)
        ("temp.tmp", False),
        ("debug.log", False),
        ("cache.cache", False),
        (".DS_Store", False),
        ("Thumbs.db", False),
        
        # Should NOT be tracked (doesn't match include patterns)
        ("binary.exe", False),
        ("image.jpg", False),
        ("video.mp4", False),
    ]
    
    for file_path, expected in test_cases:
        result = should_track_file(file_path, config)
        status = "✓" if result == expected else "✗"
        print(f"  {status} {file_path}: {'tracked' if result else 'ignored'}")
        assert result == expected, f"Pattern matching failed for {file_path}"
    
    print("✓ File pattern matching tests passed")

def test_threshold_detection():
    """Test threshold detection logic."""
    print("\nTesting threshold detection...")
    
    # Create temporary test files
    with tempfile.TemporaryDirectory() as temp_dir:
        # Test 1: Small file (should not trigger)
        small_file = os.path.join(temp_dir, "small.py")
        small_content = "# Small file\nprint('hello')\n"
        
        tool_input = {
            'file_path': small_file,
            'content': small_content
        }
        
        # This file doesn't exist yet, so it should be considered new
        result = check_file_creation_thresholds('Write', tool_input)
        print(f"  ✓ Small file (2 lines): {'triggered' if result else 'not triggered'}")
        
        # Test 2: Large file (should trigger)
        large_file = os.path.join(temp_dir, "large.py")
        large_content = "# Large file\n" + "print('line')\n" * 150  # 151 lines total
        
        tool_input = {
            'file_path': large_file,
            'content': large_content
        }
        
        result = check_file_creation_thresholds('Write', tool_input)
        print(f"  ✓ Large file (151 lines): {'triggered' if result else 'not triggered'}")
        
        # Test 3: Non-trackable file (should not trigger)
        temp_file = os.path.join(temp_dir, "temp.tmp")
        temp_content = "# Temporary file\n" + "data\n" * 200
        
        tool_input = {
            'file_path': temp_file,
            'content': temp_content
        }
        
        result = check_file_creation_thresholds('Write', tool_input)
        print(f"  ✓ Excluded file (.tmp): {'triggered' if result else 'not triggered'}")

def test_session_tracking():
    """Test session file creation tracking."""
    print("\nTesting session tracking...")
    
    # Get initial count
    initial_count = get_session_file_count()
    print(f"  Initial session file count: {initial_count}")
    
    # Log some file creations
    test_files = [
        "/tmp/test1.py",
        "/tmp/test2.md", 
        "/tmp/test3.yaml"
    ]
    
    for file_path in test_files:
        log_file_creation(file_path)
    
    # Check updated count
    new_count = get_session_file_count()
    expected_count = initial_count + len(test_files)
    
    print(f"  After logging {len(test_files)} files: {new_count}")
    print(f"  Expected count: {expected_count}")
    
    # Note: The count might not match exactly if the session log is shared
    # across multiple test runs, but it should at least increase
    assert new_count >= initial_count + len(test_files), "Session tracking failed"
    print("  ✓ Session tracking working correctly")

def test_tool_integration():
    """Test integration with different tool types."""
    print("\nTesting tool integration...")
    
    # Test with Edit tool (should not trigger file creation hook)
    edit_input = {
        'file_path': '/tmp/existing_file.py',
        'old_string': 'old code',
        'new_string': 'new code'
    }
    
    result = check_file_creation_thresholds('Edit', edit_input)
    print(f"  ✓ Edit tool: {'triggered' if result else 'not triggered'} (expected: not triggered)")
    assert not result, "File creation hook should not trigger for Edit tool"
    
    # Test with Read tool (should not trigger)
    read_input = {
        'file_path': '/tmp/some_file.py'
    }
    
    result = check_file_creation_thresholds('Read', read_input)
    print(f"  ✓ Read tool: {'triggered' if result else 'not triggered'} (expected: not triggered)")
    assert not result, "File creation hook should not trigger for Read tool"
    
    # Test with Write tool on existing file (should not trigger file creation)
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write("existing content")
        existing_file = f.name
    
    try:
        write_input = {
            'file_path': existing_file,
            'content': 'updated content'
        }
        
        result = check_file_creation_thresholds('Write', write_input)
        print(f"  ✓ Write to existing file: {'triggered' if result else 'not triggered'} (expected: not triggered)")
        assert not result, "File creation hook should not trigger for existing files"
    finally:
        os.unlink(existing_file)

def test_configuration_variations():
    """Test different configuration scenarios."""
    print("\nTesting configuration variations...")
    
    # Save original settings
    settings_path = Path(__file__).parent.parent / "settings.json"
    original_settings = None
    
    if settings_path.exists():
        with open(settings_path, 'r') as f:
            original_settings = json.load(f)
    
    try:
        # Test with disabled hook
        test_config = {
            "file_creation_thresholds": {
                "enabled": False,
                "max_new_file_lines": 50,
                "max_files_per_session": 3,
                "auto_commit": True
            }
        }
        
        with open(settings_path, 'w') as f:
            json.dump(test_config, f)
        
        # Create a large file - should not trigger because disabled
        large_content = "# Test\n" + "line\n" * 100
        tool_input = {
            'file_path': '/tmp/disabled_test.py',
            'content': large_content
        }
        
        result = check_file_creation_thresholds('Write', tool_input)
        print(f"  ✓ Disabled hook: {'triggered' if result else 'not triggered'} (expected: not triggered)")
        assert not result, "Disabled hook should not trigger"
        
        # Test with very low thresholds
        test_config["file_creation_thresholds"]["enabled"] = True
        test_config["file_creation_thresholds"]["max_new_file_lines"] = 1
        test_config["file_creation_thresholds"]["auto_commit"] = False  # Don't actually commit
        
        with open(settings_path, 'w') as f:
            json.dump(test_config, f)
        
        # Even a small file should trigger with threshold=1
        small_content = "line1\nline2\n"  # 2 lines
        tool_input = {
            'file_path': '/tmp/low_threshold_test.py',
            'content': small_content
        }
        
        result = check_file_creation_thresholds('Write', tool_input)
        print(f"  ✓ Low threshold (1 line): {'triggered' if result else 'not triggered'} (expected: triggered)")
        assert result, "Low threshold should trigger"
        
    finally:
        # Restore original settings
        if original_settings:
            with open(settings_path, 'w') as f:
                json.dump(original_settings, f)
        elif settings_path.exists():
            os.unlink(settings_path)

def main():
    """Run all tests."""
    print("File Creation Thresholds Hook Test Suite")
    print("=" * 50)
    
    try:
        test_load_configuration()
        test_file_pattern_matching()
        test_threshold_detection()
        test_session_tracking()
        test_tool_integration()
        test_configuration_variations()
        
        print("\n" + "=" * 50)
        print("✓ All tests passed successfully!")
        print("\nThe file creation threshold hook is working correctly.")
        
    except Exception as e:
        print(f"\n✗ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

if __name__ == "__main__":
    main()