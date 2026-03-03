#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "anthropic",
#     "python-dotenv",
# ]
# ///

"""
Multi-Agent Observability Hook Script
Sends Claude Code hook events to the observability server.

Supported event types (12 total):
  SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse,
  PostToolUseFailure, PermissionRequest, Notification, SubagentStart,
  SubagentStop, Stop, PreCompact
"""

import json
import sys
import os
import argparse
import urllib.request
import urllib.error
from datetime import datetime
from utils.summarizer import generate_event_summary
from utils.model_extractor import get_model_from_transcript

def send_event_to_server(event_data, server_url='http://localhost:4000/events'):
    """Send event data to the observability server."""
    try:
        # Prepare the request
        req = urllib.request.Request(
            server_url,
            data=json.dumps(event_data).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'Claude-Code-Hook/1.0'
            }
        )
        
        # Send the request
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status == 200:
                return True
            else:
                print(f"Server returned status: {response.status}", file=sys.stderr)
                return False
                
    except urllib.error.URLError as e:
        print(f"Failed to send event: {e}", file=sys.stderr)
        return False
    except Exception as e:
        print(f"Unexpected error: {e}", file=sys.stderr)
        return False

def main():
    # Parse command line arguments
    parser = argparse.ArgumentParser(description='Send Claude Code hook events to observability server')
    parser.add_argument('--source-app', required=True, help='Source application name')
    parser.add_argument('--event-type', required=True, help='Hook event type (PreToolUse, PostToolUse, etc.)')
    parser.add_argument('--server-url', default='http://localhost:4000/events', help='Server URL')
    parser.add_argument('--add-chat', action='store_true', help='Include chat transcript if available')
    parser.add_argument('--summarize', action='store_true', help='Generate AI summary of the event')
    
    args = parser.parse_args()
    
    try:
        # Read hook data from stdin
        input_data = json.load(sys.stdin)
    except json.JSONDecodeError as e:
        print(f"Failed to parse JSON input: {e}", file=sys.stderr)
        sys.exit(1)
    
    # Extract model name from transcript (with caching)
    session_id = input_data.get('session_id', 'unknown')
    transcript_path = input_data.get('transcript_path', '')
    model_name = ''
    if transcript_path:
        model_name = get_model_from_transcript(session_id, transcript_path)

    # Prepare event data for server
    event_data = {
        'source_app': args.source_app,
        'session_id': session_id,
        'hook_event_type': args.event_type,
        'payload': input_data,
        'timestamp': int(datetime.now().timestamp() * 1000),
        'model_name': model_name
    }

    # Forward event-specific fields as top-level properties for easier querying.
    # These fields are only present for certain event types.

    # tool_name: PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest
    if 'tool_name' in input_data:
        event_data['tool_name'] = input_data['tool_name']

    # tool_use_id: PreToolUse, PostToolUse, PostToolUseFailure
    if 'tool_use_id' in input_data:
        event_data['tool_use_id'] = input_data['tool_use_id']

    # error, is_interrupt: PostToolUseFailure
    if 'error' in input_data:
        event_data['error'] = input_data['error']
    if 'is_interrupt' in input_data:
        event_data['is_interrupt'] = input_data['is_interrupt']

    # permission_suggestions: PermissionRequest
    if 'permission_suggestions' in input_data:
        event_data['permission_suggestions'] = input_data['permission_suggestions']

    # agent_id: SubagentStart, SubagentStop
    if 'agent_id' in input_data:
        event_data['agent_id'] = input_data['agent_id']

    # agent_type: SessionStart, SubagentStart, SubagentStop
    if 'agent_type' in input_data:
        event_data['agent_type'] = input_data['agent_type']

    # agent_transcript_path: SubagentStop
    if 'agent_transcript_path' in input_data:
        event_data['agent_transcript_path'] = input_data['agent_transcript_path']

    # stop_hook_active: Stop, SubagentStop
    if 'stop_hook_active' in input_data:
        event_data['stop_hook_active'] = input_data['stop_hook_active']

    # notification_type: Notification
    if 'notification_type' in input_data:
        event_data['notification_type'] = input_data['notification_type']

    # custom_instructions: PreCompact
    if 'custom_instructions' in input_data:
        event_data['custom_instructions'] = input_data['custom_instructions']

    # source: SessionStart
    if 'source' in input_data:
        event_data['source'] = input_data['source']

    # reason: SessionEnd
    if 'reason' in input_data:
        event_data['reason'] = input_data['reason']
    
    # Handle --add-chat option
    if args.add_chat and 'transcript_path' in input_data:
        transcript_path = input_data['transcript_path']
        if os.path.exists(transcript_path):
            # Read .jsonl file and convert to JSON array
            chat_data = []
            try:
                with open(transcript_path, 'r') as f:
                    for line in f:
                        line = line.strip()
                        if line:
                            try:
                                chat_data.append(json.loads(line))
                            except json.JSONDecodeError:
                                pass  # Skip invalid lines
                
                # Add chat to event data
                event_data['chat'] = chat_data
            except Exception as e:
                print(f"Failed to read transcript: {e}", file=sys.stderr)
    
    # Generate summary if requested
    if args.summarize:
        summary = generate_event_summary(event_data)
        if summary:
            event_data['summary'] = summary
        # Continue even if summary generation fails
    
    # Send to server
    success = send_event_to_server(event_data, args.server_url)
    
    # Always exit with 0 to not block Claude Code operations
    sys.exit(0)

if __name__ == '__main__':
    main()