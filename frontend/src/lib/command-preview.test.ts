import { describe, expect, it } from "vitest"
import {
  abortCherryPickCommand,
  abortMergeCommand,
  abortRebaseCommand,
  abortRevertCommand,
  checkoutCommand,
  cherryPickCommand,
  commitCommand,
  createBranchCommand,
  createTagCommand,
  deleteBranchesCommand,
  discardHunkCommand,
  fetchCommand,
  fetchIntoCommand,
  formatGitCommand,
  mergeCommand,
  placeholder,
  pullCommand,
  pushCommands,
  rebaseCommand,
  renameBranchCommand,
  resetCommand,
  revertCommand,
  setUpstreamCommand,
  stageCommand,
  stageHunkCommand,
  stashApplyCommand,
  stashDropCommand,
  stashPushCommand,
  unstageCommand,
  unstageHunkCommand,
} from "./command-preview"

// Expected strings are the ones the backend reports for the same requests
// (internal/server/operations_test.go), so previews match the command log.
describe("formatGitCommand", () => {
  it("leaves plain arguments bare and single-quotes the rest like a POSIX shell", () => {
    expect(formatGitCommand(["log", "--oneline", "-n", "5", "origin/main", "HEAD~1", "a@b.c", "x=1,y:2", "^v1"])).toBe(
      "git log --oneline -n 5 origin/main HEAD~1 a@b.c x=1,y:2 ^v1",
    )
    expect(formatGitCommand(["commit", "-m", ""])).toBe("git commit -m ''")
    expect(formatGitCommand(["add", "--", "new file.txt", "a*b", "$HOME", "目录/文件"])).toBe(
      "git add -- 'new file.txt' 'a*b' '$HOME' '目录/文件'",
    )
    expect(formatGitCommand(["commit", "-m", "it's"])).toBe(`git commit -m 'it'\\''s'`)
  })

  it("shows a placeholder for a value not entered yet as <label>, unquoted", () => {
    expect(createBranchCommand({ name: placeholder("新分支"), checkout: true })).toBe("git switch -c <新分支>")
    // A real name that looks like one is still quoted.
    expect(formatGitCommand(["branch", "<新分支>"])).toBe("git branch '<新分支>'")
  })
})

describe("stage and unstage", () => {
  it("pass each path as a literal pathspec", () => {
    expect(stageCommand(["tracked.txt", "new file.txt"])).toBe(
      "git add -- ':(literal)tracked.txt' ':(literal)new file.txt'",
    )
    expect(unstageCommand(["new.txt", "old.txt", "kept.txt"])).toBe(
      "git reset --quiet -- ':(literal)new.txt' ':(literal)old.txt' ':(literal)kept.txt'",
    )
  })
})

describe("commitCommand", () => {
  it("passes the whole message, newlines included, as one argument", () => {
    expect(commitCommand({ message: "Fix the widget\n\nIt's been broken since Tuesday." })).toBe(
      "git commit -m 'Fix the widget\n\nIt'\\''s been broken since Tuesday.'",
    )
  })

  it("adds --amend and --no-verify in the backend's order", () => {
    expect(commitCommand({ message: "typo fixed", amend: true })).toBe("git commit --amend -m 'typo fixed'")
    expect(commitCommand({ message: "wip", noVerify: true })).toBe("git commit --no-verify -m wip")
    expect(commitCommand({ message: "both", amend: true, noVerify: true })).toBe(
      "git commit --amend --no-verify -m both",
    )
  })
})

describe("hunk operations", () => {
  it("apply a patch of the one hunk, read from standard input", () => {
    expect(stageHunkCommand()).toBe("git apply --cached")
    expect(unstageHunkCommand()).toBe("git apply --cached -R")
    expect(discardHunkCommand()).toBe("git apply -R")
  })
})

describe("branch operations", () => {
  it("checkout switches to a local branch", () => {
    expect(checkoutCommand({ branch: "feature/login" })).toBe("git switch feature/login")
  })

  it("createBranch uses git branch, or git switch -c when checking out", () => {
    expect(createBranchCommand({ name: "feature/login" })).toBe("git branch feature/login")
    expect(createBranchCommand({ name: "hotfix", startPoint: "0123456789", checkout: true })).toBe(
      "git switch -c hotfix 0123456789",
    )
    expect(createBranchCommand({ name: "x", startPoint: "", checkout: false })).toBe("git branch x")
  })

  it("deleteBranches lists every branch, with -D when forced", () => {
    expect(deleteBranchesCommand({ branches: ["done/one", "done/two"] })).toBe("git branch -d done/one done/two")
    expect(deleteBranchesCommand({ branches: ["wip"], force: true })).toBe("git branch -D wip")
  })

  it("renameBranch and setUpstream", () => {
    expect(renameBranchCommand({ branch: "feature", newName: "feature/login" })).toBe(
      "git branch -m feature feature/login",
    )
    expect(setUpstreamCommand({ branch: "feature", upstream: "origin/main" })).toBe(
      "git branch --set-upstream-to=origin/main feature",
    )
  })
})

describe("stash", () => {
  it("always includes untracked files and trims the message like the backend", () => {
    expect(stashPushCommand({ message: "half-done login" })).toBe(
      "git stash push --include-untracked -m 'half-done login'",
    )
    expect(stashPushCommand({ message: "  ", keepIndex: true })).toBe("git stash push --include-untracked --keep-index")
    expect(stashPushCommand({})).toBe("git stash push --include-untracked")
  })

  it("names the stash by its reflog entry", () => {
    expect(stashApplyCommand({ index: 0, oid: "abc" })).toBe("git stash apply 'stash@{0}'")
    expect(stashDropCommand({ index: 1, oid: "abc" })).toBe("git stash drop 'stash@{1}'")
  })
})

describe("fetch", () => {
  it("asks for progress and passes the options in dialog order", () => {
    expect(fetchCommand({ all: true })).toBe("git fetch --progress --all")
    expect(fetchCommand({ remote: "origin", prune: true, tags: true })).toBe(
      "git fetch --progress origin --prune --tags",
    )
    expect(fetchCommand({})).toBe("git fetch --progress")
  })
})

describe("pull", () => {
  it("always names the integration mode and adds the merge options in the backend's order", () => {
    expect(pullCommand({ remote: "origin", branch: "main" })).toBe("git pull --progress --no-rebase origin main")
    expect(pullCommand({ remote: "origin", branch: "main", log: true, noFastForward: true })).toBe(
      "git pull --progress --no-rebase --no-ff --log origin main",
    )
    expect(pullCommand({ remote: "origin", branch: "main", noCommit: true })).toBe(
      "git pull --progress --no-rebase --no-commit origin main",
    )
    expect(pullCommand({ remote: "origin", branch: "main", rebase: true })).toBe(
      "git pull --progress --rebase origin main",
    )
  })
})

describe("push", () => {
  it("pushes tracked branches with -u first, then the others", () => {
    expect(
      pushCommands({
        remote: "origin",
        branches: [
          { local: "feature", remote: "feature", track: true },
          { local: "docs", remote: "published-docs" },
        ],
        tags: true,
      }),
    ).toEqual([
      "git push --progress -u --tags origin feature:feature",
      "git push --progress origin docs:published-docs",
    ])
    expect(pushCommands({ remote: "origin", branches: [{ local: "main", remote: "main", track: true }] })).toEqual([
      "git push --progress -u origin main:main",
    ])
  })

  it("pushes only tags when no branch is chosen", () => {
    expect(pushCommands({ remote: "origin", branches: [], tags: true })).toEqual(["git push --progress --tags origin"])
  })

  it("fetches into a branch that is not checked out", () => {
    expect(fetchIntoCommand({ remote: "origin", branch: "feature", local: "feature" })).toBe(
      "git fetch --progress origin feature:feature",
    )
  })
})

describe("merge and rebase", () => {
  it("adds the chosen merge options in the backend's order", () => {
    expect(mergeCommand({ branch: "topic" })).toBe("git merge topic")
    expect(mergeCommand({ branch: "topic", noFastForward: true, log: true })).toBe("git merge --no-ff --log topic")
    expect(mergeCommand({ branch: "origin/main", noCommit: true })).toBe("git merge --no-commit origin/main")
  })

  it("rebases the current branch onto the chosen one", () => {
    expect(rebaseCommand({ onto: "topic" })).toBe("git rebase topic")
  })

  it("aborts the merge or rebase in progress", () => {
    expect(abortMergeCommand()).toBe("git merge --abort")
    expect(abortRebaseCommand()).toBe("git rebase --abort")
  })
})

// The same requests as internal/server/commit_ops_test.go.
describe("commit operations", () => {
  const oid = "0123456789abcdef0123456789abcdef01234567"

  it("checks out a commit with HEAD detached", () => {
    expect(checkoutCommand({ commit: oid })).toBe(`git switch --detach ${oid}`)
  })

  it("makes an annotated tag when there is a message, else a lightweight one", () => {
    expect(createTagCommand({ name: "v1.0", commit: oid, message: "First release" })).toBe(
      `git tag -a -m 'First release' v1.0 ${oid}`,
    )
    expect(createTagCommand({ name: "release/v1", commit: oid, message: "  " })).toBe(`git tag release/v1 ${oid}`)
    expect(createTagCommand({ name: "v2", commit: oid })).toBe(`git tag v2 ${oid}`)
  })

  it("resets with the chosen mode, mixed by default", () => {
    expect(resetCommand({ commit: oid, mode: "soft" })).toBe(`git reset --soft ${oid}`)
    expect(resetCommand({ commit: oid })).toBe(`git reset --mixed ${oid}`)
    expect(resetCommand({ commit: oid, mode: "hard" })).toBe(`git reset --hard ${oid}`)
  })

  it("reverts and cherry-picks a merge commit relative to its first parent", () => {
    expect(revertCommand({ commit: oid }, { merge: false })).toBe(`git revert --no-edit ${oid}`)
    expect(revertCommand({ commit: oid }, { merge: true })).toBe(`git revert --no-edit -m 1 ${oid}`)
    expect(cherryPickCommand({ commit: oid }, { merge: false })).toBe(`git cherry-pick ${oid}`)
    expect(cherryPickCommand({ commit: oid }, { merge: true })).toBe(`git cherry-pick -m 1 ${oid}`)
  })

  it("aborts the cherry-pick or revert in progress", () => {
    expect(abortCherryPickCommand()).toBe("git cherry-pick --abort")
    expect(abortRevertCommand()).toBe("git revert --abort")
  })
})
