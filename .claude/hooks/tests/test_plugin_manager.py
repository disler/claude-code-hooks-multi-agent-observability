#!/usr/bin/env python3
"""
Plugin Manager Test Suite

Comprehensive tests for plugin_manager.py functionality.

Usage:
    python3 test_plugin_manager.py
    python3 test_plugin_manager.py --verbose
"""

import sys
import json
import tempfile
import shutil
from pathlib import Path

# Add hooks directory to path
hooks_dir = Path(__file__).parent.parent
sys.path.insert(0, str(hooks_dir))

import plugin_manager
from plugin_manager import (
    _is_version_compatible,
    _validate_metadata,
    Plugin,
    PluginManager,
    execute_plugins,
    PLUGIN_METADATA_SCHEMA
)


class TestResults:
    """Track test results"""
    def __init__(self):
        self.passed = 0
        self.failed = 0
        self.errors = []

    def record_pass(self, test_name):
        self.passed += 1
        print(f"✓ {test_name}")

    def record_fail(self, test_name, error):
        self.failed += 1
        self.errors.append((test_name, error))
        print(f"✗ {test_name}: {error}")

    def summary(self):
        total = self.passed + self.failed
        print("\n" + "=" * 60)
        print(f"Test Results: {self.passed}/{total} passed")
        if self.failed > 0:
            print(f"\nFailed tests:")
            for name, error in self.errors:
                print(f"  - {name}: {error}")
        print("=" * 60)
        return self.failed == 0


results = TestResults()


def test_version_compatibility():
    """Test version comparison logic"""
    test_name = "Version compatibility check"

    try:
        # Test exact match
        assert _is_version_compatible("1.0.0", "1.0.0"), "Exact version should be compatible"

        # Test newer version
        assert _is_version_compatible("1.0.0", "1.2.0"), "Newer version should be compatible"
        assert _is_version_compatible("1.0.0", "2.0.0"), "Major version upgrade should be compatible"

        # Test older version (should fail)
        assert not _is_version_compatible("2.0.0", "1.0.0"), "Older version should not be compatible"
        assert not _is_version_compatible("1.5.0", "1.2.0"), "Older minor version should not be compatible"

        # Test patch versions
        assert _is_version_compatible("1.0.0", "1.0.1"), "Patch version should be compatible"
        assert not _is_version_compatible("1.0.5", "1.0.2"), "Older patch should not be compatible"

        results.record_pass(test_name)
    except AssertionError as e:
        results.record_fail(test_name, str(e))
    except Exception as e:
        results.record_fail(test_name, f"Unexpected error: {e}")


def test_metadata_validation():
    """Test metadata validation"""
    test_name = "Metadata validation"

    try:
        # Valid metadata
        valid_metadata = {
            "name": "test_plugin",
            "version": "1.0.0",
            "entry_point": "src.plugin:handle_hook"
        }
        is_valid, error = _validate_metadata(valid_metadata)
        assert is_valid, f"Valid metadata rejected: {error}"

        # Missing required field
        invalid_metadata = {
            "name": "test_plugin",
            "version": "1.0.0"
            # missing entry_point
        }
        is_valid, error = _validate_metadata(invalid_metadata)
        assert not is_valid, "Missing required field should fail validation"
        assert "entry_point" in error, "Error should mention missing field"

        # Invalid name format (uppercase)
        invalid_metadata = {
            "name": "TestPlugin",
            "version": "1.0.0",
            "entry_point": "src.plugin:handle_hook"
        }
        is_valid, error = _validate_metadata(invalid_metadata)
        assert not is_valid, "Invalid name format should fail"

        # Invalid version format
        invalid_metadata = {
            "name": "test_plugin",
            "version": "1.0",  # should be x.y.z
            "entry_point": "src.plugin:handle_hook"
        }
        is_valid, error = _validate_metadata(invalid_metadata)
        assert not is_valid, "Invalid version format should fail"

        # Invalid entry point format
        invalid_metadata = {
            "name": "test_plugin",
            "version": "1.0.0",
            "entry_point": "invalid"  # should have :
        }
        is_valid, error = _validate_metadata(invalid_metadata)
        assert not is_valid, "Invalid entry point should fail"

        results.record_pass(test_name)
    except AssertionError as e:
        results.record_fail(test_name, str(e))
    except Exception as e:
        results.record_fail(test_name, f"Unexpected error: {e}")


def test_plugin_class():
    """Test Plugin class functionality"""
    test_name = "Plugin class"

    try:
        # Create a mock handler
        def mock_handler(hook_type, input_data):
            return f"handled {hook_type}"

        # Create plugin with basic metadata
        metadata = {
            "name": "test_plugin",
            "version": "1.0.0",
            "enabled": True,
            "hooks": ["PostToolUse", "Stop"],
            "priority": 50
        }

        plugin = Plugin("test_plugin", metadata, mock_handler)

        # Test properties
        assert plugin.name == "test_plugin", "Plugin name mismatch"
        assert plugin.version == "1.0.0", "Plugin version mismatch"
        assert plugin.enabled == True, "Plugin should be enabled"
        assert plugin.supported_hooks == ["PostToolUse", "Stop"], "Hooks mismatch"

        # Test hook support
        assert plugin.supports_hook("PostToolUse"), "Should support PostToolUse"
        assert plugin.supports_hook("Stop"), "Should support Stop"
        assert not plugin.supports_hook("SessionStart"), "Should not support SessionStart"

        # Test execution (should not raise)
        plugin.execute("PostToolUse", {"test": "data"})

        # Test disabled plugin
        metadata["enabled"] = False
        disabled_plugin = Plugin("disabled", metadata, mock_handler)
        # Execute should return early for disabled plugin
        disabled_plugin.execute("PostToolUse", {"test": "data"})

        results.record_pass(test_name)
    except AssertionError as e:
        results.record_fail(test_name, str(e))
    except Exception as e:
        results.record_fail(test_name, f"Unexpected error: {e}")


def test_plugin_error_handling():
    """Test plugin error handling"""
    test_name = "Plugin error handling"

    try:
        # Create handler that raises exception
        def failing_handler(hook_type, input_data):
            raise ValueError("Intentional test error")

        metadata = {
            "name": "failing_plugin",
            "version": "1.0.0",
            "enabled": True,
            "hooks": ["PostToolUse"]
        }

        plugin = Plugin("failing_plugin", metadata, failing_handler)

        # Execute should catch the error and not raise
        plugin.execute("PostToolUse", {"test": "data"})

        results.record_pass(test_name)
    except Exception as e:
        results.record_fail(test_name, f"Plugin error was not caught: {e}")


def test_plugin_manager_discovery():
    """Test plugin discovery from directory"""
    test_name = "Plugin manager discovery"

    try:
        # Create temporary plugin directory
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            plugins_dir = temp_path / "plugins"
            plugins_dir.mkdir()

            # Create a valid test plugin
            test_plugin_dir = plugins_dir / "test_plugin"
            test_plugin_dir.mkdir()
            (test_plugin_dir / "src").mkdir()

            # Write plugin.json
            plugin_json = {
                "name": "test_plugin",
                "version": "1.0.0",
                "description": "Test plugin",
                "enabled": True,
                "entry_point": "src.plugin:handle_hook"
            }
            with open(test_plugin_dir / "plugin.json", 'w') as f:
                json.dump(plugin_json, f)

            # Write plugin handler
            plugin_code = """
def handle_hook(hook_type, input_data):
    pass
"""
            with open(test_plugin_dir / "src" / "plugin.py", 'w') as f:
                f.write(plugin_code)

            # Initialize plugin manager
            manager = PluginManager(plugins_dir)

            # Check plugin was discovered
            assert len(manager.get_plugins()) == 1, "Should discover 1 plugin"
            plugin = manager.get_plugin("test_plugin")
            assert plugin is not None, "Plugin should be loaded"
            assert plugin.name == "test_plugin", "Plugin name mismatch"

            results.record_pass(test_name)
    except AssertionError as e:
        results.record_fail(test_name, str(e))
    except Exception as e:
        results.record_fail(test_name, f"Unexpected error: {e}")


def test_plugin_manager_version_check():
    """Test plugin manager version compatibility checking"""
    test_name = "Plugin version compatibility"

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            plugins_dir = temp_path / "plugins"
            plugins_dir.mkdir()

            # Create plugin requiring newer manager version
            incompatible_dir = plugins_dir / "incompatible_plugin"
            incompatible_dir.mkdir()
            (incompatible_dir / "src").mkdir()

            plugin_json = {
                "name": "incompatible_plugin",
                "version": "1.0.0",
                "entry_point": "src.plugin:handle_hook",
                "min_manager_version": "99.0.0"  # Way too new
            }
            with open(incompatible_dir / "plugin.json", 'w') as f:
                json.dump(plugin_json, f)

            plugin_code = "def handle_hook(hook_type, input_data): pass"
            with open(incompatible_dir / "src" / "plugin.py", 'w') as f:
                f.write(plugin_code)

            # Initialize manager
            manager = PluginManager(plugins_dir)

            # Plugin should be skipped due to version incompatibility
            assert len(manager.get_plugins()) == 0, "Incompatible plugin should be skipped"

            results.record_pass(test_name)
    except AssertionError as e:
        results.record_fail(test_name, str(e))
    except Exception as e:
        results.record_fail(test_name, f"Unexpected error: {e}")


def test_plugin_manager_reload():
    """Test plugin reload functionality"""
    test_name = "Plugin reload"

    try:
        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            plugins_dir = temp_path / "plugins"
            plugins_dir.mkdir()

            # Create initial plugin
            plugin_dir = plugins_dir / "test_plugin"
            plugin_dir.mkdir()
            (plugin_dir / "src").mkdir()

            plugin_json = {
                "name": "test_plugin",
                "version": "1.0.0",
                "entry_point": "src.plugin:handle_hook"
            }
            with open(plugin_dir / "plugin.json", 'w') as f:
                json.dump(plugin_json, f)

            plugin_code = "def handle_hook(hook_type, input_data): pass"
            with open(plugin_dir / "src" / "plugin.py", 'w') as f:
                f.write(plugin_code)

            # Initialize manager
            manager = PluginManager(plugins_dir)
            assert len(manager.get_plugins()) == 1, "Should have 1 plugin"

            # Add another plugin
            plugin2_dir = plugins_dir / "test_plugin2"
            plugin2_dir.mkdir()
            (plugin2_dir / "src").mkdir()

            plugin2_json = {
                "name": "test_plugin2",
                "version": "1.0.0",
                "entry_point": "src.plugin:handle_hook"
            }
            with open(plugin2_dir / "plugin.json", 'w') as f:
                json.dump(plugin2_json, f)

            with open(plugin2_dir / "src" / "plugin.py", 'w') as f:
                f.write(plugin_code)

            # Reload plugins
            manager.reload_plugins()

            # Should now have 2 plugins
            assert len(manager.get_plugins()) == 2, "Should have 2 plugins after reload"

            results.record_pass(test_name)
    except AssertionError as e:
        results.record_fail(test_name, str(e))
    except Exception as e:
        results.record_fail(test_name, f"Unexpected error: {e}")


def test_plugin_priority_execution():
    """Test plugins execute in priority order"""
    test_name = "Plugin priority execution"

    try:
        execution_order = []

        def make_handler(name):
            def handler(hook_type, input_data):
                execution_order.append(name)
            return handler

        # Create plugins with different priorities
        plugin1 = Plugin("low_priority", {"priority": 80}, make_handler("low"))
        plugin2 = Plugin("high_priority", {"priority": 10}, make_handler("high"))
        plugin3 = Plugin("medium_priority", {"priority": 50}, make_handler("medium"))

        # Create manager and manually add plugins
        with tempfile.TemporaryDirectory() as temp_dir:
            manager = PluginManager(Path(temp_dir) / "plugins")
            manager.plugins = {
                "low_priority": plugin1,
                "high_priority": plugin2,
                "medium_priority": plugin3
            }

            # Execute hook
            manager.execute_hook("PostToolUse", {"test": "data"})

            # Check execution order (lower priority number = higher priority)
            expected_order = ["high", "medium", "low"]
            assert execution_order == expected_order, \
                f"Wrong execution order: {execution_order}, expected: {expected_order}"

            results.record_pass(test_name)
    except AssertionError as e:
        results.record_fail(test_name, str(e))
    except Exception as e:
        results.record_fail(test_name, f"Unexpected error: {e}")


def test_execute_plugins_function():
    """Test the execute_plugins convenience function"""
    test_name = "execute_plugins function"

    try:
        # Reset singleton
        plugin_manager._manager = None

        with tempfile.TemporaryDirectory() as temp_dir:
            temp_path = Path(temp_dir)
            plugins_dir = temp_path / "plugins"
            plugins_dir.mkdir()

            # Create test plugin
            plugin_dir = plugins_dir / "test_plugin"
            plugin_dir.mkdir()
            (plugin_dir / "src").mkdir()

            plugin_json = {
                "name": "test_plugin",
                "version": "1.0.0",
                "entry_point": "src.plugin:handle_hook",
                "enabled": True,
                "hooks": ["PostToolUse"]
            }
            with open(plugin_dir / "plugin.json", 'w') as f:
                json.dump(plugin_json, f)

            plugin_code = """
executed = False
def handle_hook(hook_type, input_data):
    global executed
    executed = True
"""
            with open(plugin_dir / "src" / "plugin.py", 'w') as f:
                f.write(plugin_code)

            # Manually set manager plugins_dir for testing
            plugin_manager._manager = PluginManager(plugins_dir)

            # Execute plugins
            execute_plugins("PostToolUse", {"test": "data"})

            # Should not raise even if plugin errors
            execute_plugins("UnknownHook", {})

            results.record_pass(test_name)
    except Exception as e:
        results.record_fail(test_name, f"Unexpected error: {e}")
    finally:
        # Reset singleton
        plugin_manager._manager = None


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Plugin Manager Test Suite")
    parser.add_argument("--verbose", action="store_true", help="Enable verbose output")
    args = parser.parse_args()

    print("Plugin Manager Test Suite")
    print("=" * 60)
    print()

    # Run all tests
    test_version_compatibility()
    test_metadata_validation()
    test_plugin_class()
    test_plugin_error_handling()
    test_plugin_manager_discovery()
    test_plugin_manager_version_check()
    test_plugin_manager_reload()
    test_plugin_priority_execution()
    test_execute_plugins_function()

    # Print summary
    success = results.summary()

    # Exit with appropriate code
    sys.exit(0 if success else 1)
