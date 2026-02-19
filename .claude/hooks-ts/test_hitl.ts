/**
 * Test HITL Hook (TypeScript port)
 * Quick test script for Human-In-The-Loop permission requests.
 * Sends a simulated HITL permission request and waits for a response.
 *
 * This is a test/utility script, not a production hook.
 *
 * Usage: bun .claude/hooks-ts/test_hitl.ts
 */

async function main() {
  console.log("Sending HITL permission request...");
  console.log("Check your dashboard at http://localhost:5173");
  console.log("Waiting for your response...\n");

  const sessionData = {
    source_app: "hitl-test",
    session_id: "test-session-001",
  };

  const question = `WARNING: Agent wants to execute a potentially dangerous command:

    $ rm -rf /tmp/old_backups

This will permanently delete all files in /tmp/old_backups.

Do you want to allow this operation?`;

  // Send the HITL request to the server
  try {
    const response = await fetch("http://localhost:4000/events", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "Claude-Code-Hook/1.0",
      },
      body: JSON.stringify({
        source_app: sessionData.source_app,
        session_id: sessionData.session_id,
        hook_event_type: "PermissionRequest",
        payload: {
          question,
          session_id: sessionData.session_id,
        },
        timestamp: Date.now(),
      }),
      signal: AbortSignal.timeout(5000),
    });

    if (response.ok) {
      console.log("HITL request sent successfully.");
    } else {
      console.log(`Server returned status: ${response.status}`);
    }
  } catch (e) {
    console.log(`Failed to send HITL request: ${e}`);
  }

  process.exit(0);
}

try {
  await main();
} catch {
  process.exit(0);
}
