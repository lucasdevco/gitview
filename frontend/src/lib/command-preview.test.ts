import { describe, expect, it } from "vitest"
import {
  abortMergeCommand,
  abortRebaseCommand,
  checkoutCommand,
  commitCommand,
  createBranchCommand,
  deleteBranchesCommand,
  discardHunkCommand,
  fetchCommand,
  formatGitCommand,
  mergeCommand,
  rebaseCommand,
  renameBranchCommand,
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
