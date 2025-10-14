# Security Policy

## Overview

This observability system handles sensitive development data including:
- Claude Code hook events with tool inputs/outputs
- Session transcripts with conversation history
- API keys for AI services (Anthropic, OpenAI, ElevenLabs)
- Local SQLite database with event history

This document provides security best practices for safe deployment.

---

## 🔐 Environment Variables & Secrets

### Critical Rules

1. **NEVER commit `.env` files to version control**
   - The `.env` file is in `.gitignore` by default
   - Verify: `git check-ignore .env` should output `.env`
   - If not ignored: `echo '.env' >> .gitignore && git rm --cached .env`

2. **Use SEPARATE API keys for each environment**
   - Development: Low-cost tier keys with rate limits
   - Staging: Medium-cost tier for testing
   - Production: Production keys with monitoring

3. **Apply LEAST-PRIVILEGE permissions**
   - Anthropic: Only `messages:write` permission needed
   - OpenAI: Only `chat.completions` permission needed
   - ElevenLabs: Only text-to-speech API access needed

4. **Rotate keys regularly**
   - Development keys: Every 90 days
   - Production keys: Every 30-60 days
   - Document rotation dates in `.env` (see `.env.sample` template)

5. **Use secrets managers in production**
   - AWS Secrets Manager
   - HashiCorp Vault
   - Azure Key Vault
   - Do NOT store production secrets in `.env` files

### .env.sample Template

The project includes a comprehensive `.env.sample` with:
- Security warnings at the top
- Purpose documentation for each variable
- Cost estimates for API usage
- Key rotation tracking section
- Setup checklist

**Always use `.env.sample` as your starting point**, not examples from documentation.

---

## 📦 Installation Security

### System Package Installation

#### ✅ Safe: Package Manager Installation

```bash
# Ubuntu/Debian
sudo apt-get update
sudo apt-get install -y unzip curl git nodejs npm

# macOS
brew install unzip curl git node
```

#### ⚠️ Caution: Direct Downloads

When using `curl | bash` installers (like Bun's official installer), follow these steps:

```bash
# Step 1: Download installer to inspect it
curl -fsSL https://bun.sh/install -o /tmp/bun-install.sh

# Step 2: Read the script BEFORE executing
less /tmp/bun-install.sh
# Or open in your editor: code /tmp/bun-install.sh

# Step 3: Verify it only:
#   - Downloads from official domains (bun.sh, github.com/oven-sh)
#   - Installs to user directory (~/.bun/)
#   - Doesn't request sudo unless explicitly needed
#   - Has clear, understandable code

# Step 4: If safe, execute
bash /tmp/bun-install.sh

# Step 5: Clean up
rm /tmp/bun-install.sh
```

#### 🎯 Recommended: npm-based Bun Installation

If you already have Node.js installed:

```bash
# Safest method - uses npm's security infrastructure
npm install -g bun

# Verify installation
bun --version
```

This method:
- Uses npm's package verification
- Requires no script inspection
- Works across all platforms
- Leverages existing Node.js installation

---

## 🔒 Runtime Security

### Network Exposure

**Default Configuration** (Safe for local development):
- Server: `http://localhost:4000` (localhost only)
- Client: `http://localhost:5173` (localhost only)
- No external network access

**If Remote Access Required** (Use with caution):

```bash
# Option 1: SSH Tunnel (Recommended)
ssh -L 4000:localhost:4000 -L 5173:localhost:5173 user@remote-host

# Option 2: Firewall Rules (If necessary)
sudo ufw allow 4000/tcp comment 'Observability Server - Internal Only'
sudo ufw allow 5173/tcp comment 'Observability Client - Internal Only'

# ⚠️ NEVER expose to public internet without:
# - Authentication layer
# - HTTPS/TLS encryption
# - Rate limiting
# - IP allowlisting
```

### Database Security

The SQLite database (`events.db`) contains:
- All hook events with tool inputs/outputs
- Chat transcripts (if `--add-chat` flag used)
- Session metadata

**Protection measures**:

```bash
# Set restrictive file permissions
chmod 600 apps/server/events.db

# Exclude from backups if storing sensitive data
echo 'apps/server/events.db' >> .git/info/exclude

# For production: Encrypt database
# Use SQLCipher or full-disk encryption
```

### Data Retention

Events are stored indefinitely by default. Implement retention policies:

```bash
# Option 1: Periodic manual cleanup
sqlite3 apps/server/events.db "DELETE FROM events WHERE timestamp < strftime('%s', 'now', '-30 days') * 1000;"

# Option 2: Add to cron (monthly cleanup)
0 0 1 * * sqlite3 /path/to/events.db "DELETE FROM events WHERE timestamp < strftime('%s', 'now', '-30 days') * 1000;"

# Option 3: Configure in code (future feature)
# Add MAX_EVENT_AGE_DAYS to .env
```

---

## 🛡️ Hook Security

### Command Blocking

The hook system includes built-in protections:

```python
# pre_tool_use.py includes dangerous command blocking
DANGEROUS_PATTERNS = [
    r'rm\s+-rf\s+/',
    r'sudo\s+rm',
    r'mkfs\.',
    r'dd\s+if=.*of=/dev/',
    # ... more patterns
]
```

### Sensitive File Protection

Hooks prevent access to:
- `.env` files
- Private SSH keys (`.ssh/id_*`)
- Cloud credentials (`~/.aws/`, `~/.config/gcloud/`)
- Browser cookies and passwords

### Custom Blocking Rules

Add project-specific blocks to `pre_tool_use.py`:

```python
# Example: Block access to production database
BLOCKED_PATHS = [
    '/var/lib/postgresql',
    '/production/db',
    # Add your sensitive paths
]
```

---

## 🔍 Audit & Monitoring

### Enable Audit Logging

In `.env`:
```bash
ENABLE_AUDIT_LOG=true
LOG_LEVEL=INFO  # Use DEBUG only in development
```

### Monitor for Suspicious Activity

Watch for:
- Unusual spike in events (potential infinite loop)
- Failed authentication attempts (if auth added)
- Large payload sizes (potential data exfiltration)
- Connections from unexpected IPs (if remote access enabled)

### Log Rotation

```bash
# Add to logrotate.d/observability
/path/to/observability-system/logs/*.log {
    daily
    rotate 7
    compress
    delaycompress
    notifempty
    create 0640 user group
}
```

---

## 🚨 Incident Response

### If API Keys Are Compromised

1. **Immediately rotate keys**:
   - Anthropic: https://console.anthropic.com/keys
   - OpenAI: https://platform.openai.com/api-keys
   - ElevenLabs: Account settings

2. **Check usage logs** for unauthorized activity

3. **Update `.env`** with new keys

4. **Restart services**: `./scripts/reset-system.sh && ./scripts/start-system.sh`

5. **Review recent commits** to ensure keys weren't committed

### If Database Contains Sensitive Data

1. **Stop services**: `./scripts/reset-system.sh`

2. **Backup database**: `cp apps/server/events.db apps/server/events.db.backup`

3. **Sanitize data**:
   ```bash
   sqlite3 apps/server/events.db "UPDATE events SET payload = '{}' WHERE timestamp < ..."
   ```

4. **Implement encryption** for future data

### If Unauthorized Access Detected

1. **Immediately stop all services**

2. **Check for backdoors**:
   ```bash
   # Review recent file modifications
   find . -type f -mtime -7 -ls

   # Check for suspicious processes
   ps aux | grep -E 'bun|node|npm'
   ```

3. **Rotate all credentials**

4. **Review audit logs** for entry point

5. **Update firewall rules** to block unauthorized IPs

---

## ✅ Security Checklist

### Before First Deployment

- [ ] Copied `.env.sample` to `.env` (not committed to git)
- [ ] Set `ENGINEER_NAME` to actual name
- [ ] Added API keys with least-privilege permissions
- [ ] Verified `.env` is in `.gitignore`
- [ ] Installed system packages via package manager (apt/brew)
- [ ] Reviewed hook scripts for suspicious code
- [ ] Set restrictive file permissions on `events.db`
- [ ] Configured firewall rules (if remote access needed)

### Regular Maintenance (Monthly)

- [ ] Rotate API keys (or per schedule)
- [ ] Review audit logs for anomalies
- [ ] Clean up old events (>30 days)
- [ ] Update dependencies (`bun update`, `npm update`)
- [ ] Check for security advisories (`npm audit`, `bun audit`)
- [ ] Verify `.env` still in `.gitignore`
- [ ] Review database size and performance

### Before Production Deployment

- [ ] Migrate to secrets manager (no `.env` files)
- [ ] Enable HTTPS/TLS encryption
- [ ] Implement authentication layer
- [ ] Set up monitoring and alerting
- [ ] Configure automatic key rotation
- [ ] Implement rate limiting
- [ ] Set up IP allowlisting
- [ ] Enable database encryption
- [ ] Configure automated backups
- [ ] Document incident response procedures

---

## 📚 Additional Resources

- [Claude Code Security Best Practices](https://docs.anthropic.com/en/docs/claude-code/security)
- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [SQLite Security Best Practices](https://www.sqlite.org/security.html)
- [Node.js Security Best Practices](https://nodejs.org/en/docs/guides/security/)

---

## 📧 Reporting Security Vulnerabilities

If you discover a security vulnerability in this project:

1. **DO NOT create a public GitHub issue**
2. Email the maintainer directly (see repository owner's profile)
3. Include:
   - Detailed description of the vulnerability
   - Steps to reproduce
   - Potential impact assessment
   - Suggested fix (if available)

We aim to respond within 48 hours and will provide credit for responsible disclosure.

---

**Last Updated**: 2025-10-14
**Version**: 1.0.0
