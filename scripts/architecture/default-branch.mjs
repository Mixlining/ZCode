export function selectDefaultBranchRef({ originHead, hasCommit }) {
  // Bug 原因：新分支首次 push 没有 remote SHA；若直接回退 origin/main，
  // 会把集成分支 dev 尚未合入 main 的历史差异误算成本分支变更，并错误扩大架构检查范围。
  return ["origin/dev", originHead, "origin/main", "origin/master", "main", "master"].find(
    (candidate) => candidate && hasCommit(candidate),
  );
}
