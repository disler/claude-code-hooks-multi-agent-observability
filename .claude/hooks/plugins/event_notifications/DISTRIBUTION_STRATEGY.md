# Audio Announcements Plugin - Distribution Strategy Analysis

## Current State

We've successfully implemented an audio announcements plugin for the claude-code-hooks-multi-agent-observability project with the following characteristics:

- **Location**: `.claude/hooks/plugins/audio_announcements/`
- **Installation**: Automated install/uninstall/reapply scripts that patch hook files
- **Features**: TTS announcements, OS notifications, volume control, sound effects, template system
- **Branch**: `feature/audio-announcements-plugin` (4 commits, ready for PR)
- **User Config**: Users create their own `config/audio_config.json` (git ignored, but still shows as modified)

## The Question

How should this plugin be distributed and maintained, especially if:
1. The upstream repo maintainer wants time to review before merging
2. We want independent maintenance and updates
3. We want to avoid complicating the installation/update process

## Distribution Strategy Options

### Option 1: Feature Branch Only (Current Approach)

**Description**: Keep the plugin on the feature branch, submit PR, wait for merge.

**Pros**:
- Simplest approach
- Standard git workflow
- No additional tooling or repositories
- Clean integration once merged

**Cons**:
- Users can't easily get updates until PR is merged
- Independent maintenance blocked until merge
- If PR is rejected, need to rethink distribution
- Users need to manually cherry-pick or switch branches

**Best For**: When you expect quick PR approval and merge

**Installation**:
```bash
git fetch origin feature/audio-announcements-plugin
git checkout feature/audio-announcements-plugin
cd .claude/hooks/plugins/audio_announcements
./install.sh
```

**Updates**:
```bash
git pull origin feature/audio-announcements-plugin
cd .claude/hooks/plugins/audio_announcements
./reapply.sh
```

---

### Option 2: Git Submodule

**Description**: Create separate repo for plugin, include it as a git submodule in the main project.

**Pros**:
- True independent maintenance - plugin has its own repo, releases, issues
- Easy updates: `git submodule update --remote`
- Can version the plugin independently
- Plugin can be used in other projects
- Clear separation of concerns

**Cons**:
- Adds git submodule complexity (developers often struggle with submodules)
- Installation requires extra steps: `git submodule init && git submodule update`
- Submodule updates require committing the reference change
- Not all users comfortable with submodule workflows
- Complicates the PR (need to coordinate two repos)

**Best For**: When you want maximum independence and reusability across projects

**Repository Structure**:
```
Main repo: github.com/user/claude-code-hooks-multi-agent-observability
Plugin repo: github.com/user/claude-audio-announcements-plugin

In main repo:
.gitmodules:
[submodule ".claude/hooks/plugins/audio_announcements"]
    path = .claude/hooks/plugins/audio_announcements
    url = https://github.com/user/claude-audio-announcements-plugin.git
```

**Installation** (for users):
```bash
git clone --recurse-submodules https://github.com/user/claude-code-hooks-multi-agent-observability.git
# OR if already cloned:
git submodule init
git submodule update
cd .claude/hooks/plugins/audio_announcements
./install.sh
```

**Updates**:
```bash
git submodule update --remote
cd .claude/hooks/plugins/audio_announcements
./reapply.sh
```

---

### Option 3: Git Subtree

**Description**: Create separate repo for plugin, merge it into main repo using git subtree.

**Pros**:
- Independent plugin repository with its own history
- Easier for users than submodules (appears as regular directory)
- Can pull updates with `git subtree pull`
- Can push changes back to plugin repo with `git subtree push`
- No `.gitmodules` complexity

**Cons**:
- More complex for maintainers (need to understand subtree commands)
- Pollutes main repo history with plugin commits
- Harder to sync bidirectionally (main repo ↔ plugin repo)
- Less commonly used than submodules (fewer developers know it)

**Best For**: When you want independent maintenance but simpler user experience than submodules

**Setup**:
```bash
# In main repo
git subtree add --prefix .claude/hooks/plugins/audio_announcements \
    https://github.com/user/claude-audio-announcements-plugin.git main --squash

# Pull updates
git subtree pull --prefix .claude/hooks/plugins/audio_announcements \
    https://github.com/user/claude-audio-announcements-plugin.git main --squash

# Push changes back to plugin repo
git subtree push --prefix .claude/hooks/plugins/audio_announcements \
    https://github.com/user/claude-audio-announcements-plugin.git main
```

**Installation** (for users):
```bash
# Same as normal clone - subtree is transparent
git clone https://github.com/user/claude-code-hooks-multi-agent-observability.git
cd .claude/hooks/plugins/audio_announcements
./install.sh
```

---

### Option 4: Package Manager Approach

**Description**: Publish plugin as installable package (npm, pip, or custom script).

**Pros**:
- Professional distribution mechanism
- Easy installation: `npm install -g @user/claude-audio-announcements`
- Semantic versioning
- Can install plugin anywhere, not just this project
- Clear update path: `npm update`

**Cons**:
- Requires packaging infrastructure (npm/pip account, package.json/setup.py)
- Plugin wouldn't live in `.claude/hooks/plugins/` naturally
- Installation script would need to symlink or copy into place
- Overkill for a single-project plugin
- Adds dependency management overhead

**Best For**: When you want wide distribution beyond this single project

**Installation**:
```bash
npm install -g @user/claude-audio-announcements
claude-audio-announcements install /path/to/project/.claude/hooks
```

---

### Option 5: Hybrid Approach (Recommended)

**Description**: Feature branch for PR + separate repo for independent distribution.

**Strategy**:
1. Keep `feature/audio-announcements-plugin` branch for PR submission
2. Create separate repo `claude-audio-announcements-plugin`
3. Maintain both in sync (use subtree or manual sync)
4. Users can choose:
   - Use feature branch if they have the main repo cloned
   - Clone plugin repo directly into `plugins/` directory

**Pros**:
- PR stays clean and simple (feature branch)
- Independent maintenance possible (separate repo)
- Users have options (branch vs separate repo)
- No complex tooling required (submodules/subtrees optional)
- Plugin can be used in other projects

**Cons**:
- Need to maintain two copies (manual sync or subtree)
- Risk of drift between plugin repo and feature branch
- Slightly more maintenance overhead

**Installation Option A** (via feature branch):
```bash
git checkout feature/audio-announcements-plugin
cd .claude/hooks/plugins/audio_announcements
./install.sh
```

**Installation Option B** (via separate repo):
```bash
cd .claude/hooks/plugins
git clone https://github.com/user/claude-audio-announcements-plugin.git audio_announcements
cd audio_announcements
./install.sh
```

**Sync Strategy**:
```bash
# Maintainer syncs from feature branch to plugin repo:
git subtree push --prefix .claude/hooks/plugins/audio_announcements \
    https://github.com/user/claude-audio-announcements-plugin.git main

# Or manual:
cd /tmp
git clone https://github.com/user/claude-audio-announcements-plugin.git
cd claude-audio-announcements-plugin
# copy files from feature branch
git commit && git push
```

---

## The User Config Conflict Issue

**Problem**: All approaches face this issue:
- User creates `config/audio_config.json` during installation
- This file is `.gitignore`'d to prevent committing personal settings
- Git still shows the file as modified
- Running `reapply.sh` preserves the file, but git status still shows modification

**Why This Happens**:
- The example config is tracked in git
- User copies it to create their personal config
- Git sees the tracked file has changed (even though we're ignoring changes)
- This is because `.gitignore` only works for untracked files

**Solutions**:

1. **Use a different config filename** (Recommended):
   ```bash
   # Track: examples/audio_config.example.json
   # Ignore: config/audio_config.json (user creates this)
   # Install script copies example to config/ on first run
   ```
   Status: Already implemented

2. **Git update-index --assume-unchanged**:
   ```bash
   git update-index --assume-unchanged config/audio_config.json
   ```
   Pros: Hides the modification from git status
   Cons: User must remember to run this, can cause issues with updates

3. **Separate config directory outside git**:
   ```bash
   # Config at: ~/.config/claude-audio-announcements/audio_config.json
   ```
   Pros: Clean separation, no git conflicts
   Cons: Harder to back up with project, less discoverable

**Current Best Practice**: Use approach #1 (different filename for example vs user config), which we've already implemented. The git status issue happens because we modified the *example* file after the user copied it. This is expected and not actually a problem.

---

## Recommendations

### Short-Term (Immediate)

**Stick with Feature Branch Only**
- Submit PR from `feature/audio-announcements-plugin`
- Wait for maintainer review (1-2 weeks)
- If quick approval: merge and done
- If slow approval or rejection: move to mid-term plan

**Why**: Don't over-engineer until you know if you need it. If the PR gets merged quickly, all the submodule/subtree complexity was unnecessary.

### Mid-Term (If PR Delayed or Rejected)

**Hybrid Approach**
1. Create separate repo: `github.com/user/claude-audio-announcements-plugin`
2. Push plugin code to new repo
3. Keep feature branch in sync with plugin repo (manual or subtree)
4. Announce in PR: "Also available as standalone plugin for immediate use"
5. Users can install from either source

**Why**: Provides independent distribution without blocking the PR or adding complexity to the main repo.

### Long-Term (If Plugin Gains Traction)

**Package Manager Distribution**
1. Continue maintaining standalone repo
2. Publish to npm as `@user/claude-audio-announcements`
3. Create install CLI: `npx @user/claude-audio-announcements install`
4. Support installation in any claude-code-hooks project

**Why**: Professional distribution, wide adoption, easy installation/updates.

---

## Implementation Steps

### For "Feature Branch Only" (Current)

1. ✅ Already done - plugin on feature branch
2. Submit PR to upstream
3. Wait for review
4. Address feedback
5. Merge (or move to hybrid if delayed)

### For "Hybrid Approach" (If Needed)

1. Create new GitHub repo: `claude-audio-announcements-plugin`
2. Copy plugin directory contents to new repo:
   ```bash
   cd /tmp
   git clone https://github.com/user/claude-audio-announcements-plugin.git
   cd claude-audio-announcements-plugin
   cp -r /path/to/main-repo/.claude/hooks/plugins/audio_announcements/* .
   git add . && git commit -m "Initial plugin release"
   git push
   ```

3. Add installation instructions to plugin README:
   ```bash
   cd your-project/.claude/hooks/plugins
   git clone https://github.com/user/claude-audio-announcements-plugin.git audio_announcements
   cd audio_announcements
   ./install.sh
   ```

4. Keep feature branch updated:
   ```bash
   # In main repo on feature branch
   git subtree push --prefix .claude/hooks/plugins/audio_announcements \
       https://github.com/user/claude-audio-announcements-plugin.git main
   ```

5. Update PR description with standalone repo link

### For "Submodule Approach" (If Maximum Independence Needed)

1. Same as hybrid steps 1-3
2. In main repo, remove plugin directory and add as submodule:
   ```bash
   git rm -r .claude/hooks/plugins/audio_announcements
   git commit -m "Remove plugin directory to replace with submodule"
   git submodule add https://github.com/user/claude-audio-announcements-plugin.git \
       .claude/hooks/plugins/audio_announcements
   git commit -m "Add audio announcements plugin as submodule"
   ```

3. Update installation docs to include submodule steps

---

## My Recommendation

**Start Simple, Evolve As Needed**:

1. **This Week**: Submit PR with feature branch (current state)
2. **If Approved Quickly**: Done! Merge and celebrate.
3. **If Delayed (>2 weeks)**: Create standalone repo, announce availability, keep both in sync
4. **If Rejected**: Standalone repo becomes primary distribution, feature branch becomes legacy

**Rationale**:
- Don't add complexity until proven necessary
- Feature branch is clean and ready to go
- Standalone repo is easy to create later if needed
- Submodules/subtrees add ongoing maintenance burden

**Exception**: If you *already know* you want to maintain this independently regardless of PR outcome, go straight to the hybrid approach.

---

## Questions for Discussion

1. **Timeline Expectations**: How long are you willing to wait for PR review before pursuing independent distribution?

2. **Maintenance Commitment**: Do you plan to maintain this plugin long-term, or is it more of a "set it and forget it" feature?

3. **Reusability**: Do you envision this plugin being useful for other claude-code-hooks projects, or is it specific to this observability system?

4. **User Base**: Are you distributing this to a small team (→ feature branch) or wider community (→ standalone repo)?

5. **Update Frequency**: Will you be making frequent updates/improvements (→ need easy distribution) or is this mostly feature-complete (→ feature branch is fine)?

---

## Summary Table

| Approach | Complexity | Independence | User Ease | Best For |
|----------|-----------|--------------|-----------|----------|
| Feature Branch | ⭐ Low | ❌ None | ⭐⭐⭐ Easy | Quick PR merge |
| Submodule | ⭐⭐⭐ High | ⭐⭐⭐ Full | ⭐ Hard | Multi-project reuse |
| Subtree | ⭐⭐⭐ High | ⭐⭐ Good | ⭐⭐ Medium | Independent maintenance |
| Package Manager | ⭐⭐⭐⭐ Very High | ⭐⭐⭐ Full | ⭐⭐⭐ Easy | Wide distribution |
| Hybrid | ⭐⭐ Medium | ⭐⭐ Good | ⭐⭐⭐ Easy | Flexibility |

**Legend**: ⭐ = Low/Hard/None, ⭐⭐⭐ = High/Easy/Full

---

## Final Thought

The beauty of git is that **you can start simple and evolve**. Submit the PR with the feature branch. If the maintainer merges it quickly, you're done. If not, creating a standalone repo takes ~10 minutes and doesn't invalidate any work you've already done.

Don't optimize for a problem you might not have.
