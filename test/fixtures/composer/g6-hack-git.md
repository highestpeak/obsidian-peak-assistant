---
created: 2023-03-27 21:38:00
updated: 2023-04-30 00:01:12
aliases: [差异化配置]
---

# 差异化配置

#配置

有时候不同目录下的 git 配置可能不同，例如 公司的代码仓库都在 `work` 目录下，个人的项目都在 `personal` 目录下，他们需要使用不同的通信地址邮箱用户名等

![[m_21549947a8a3920d684ea57b188d4491_r.png]]

# 游离 head

#todo

游离的 head ，在游离 head 上提交的 commit ，如果没有和一个分支绑定，之后不好找到。游离 head 什么时候用呢？（不想创建新分支，单纯想看看某个 commit 处的代码并调试？？）

游离的 head ，在游离 head 上提交的 commit ，如果没有和一个分支绑定，之后不好找到

游离 head 什么时候用呢？

- 不想创建新分支，单纯想看看某个 commit 处的代码并调试

commit 区间开闭情况

```shell
git rebase -i commitId1 commitId2 左开右区 (commitId1, commitId2]
git cherry-pick commitId1^..commitId2 闭区间 [commitId1, commitId2]
git cherry-pick commitId1..commitId2 左开右闭 (commitId1, commitId2]
git cherry-pick commitId1 commitId2 两个 commit
```

# git worktree

> 对这个命令有着很多疑问，因为他并没有在我自己的工作流中广泛的使用上，但是看了各种资料后，感觉貌似可以帮助自己解决一些问题。可以解决的问题是：

- 能不能在同一个 repo 中同时有两份代码，并且可以保持两份相似但不是完全相同的代码并行开发
- 在大型软件开发过程中可能经常需要维护一个古老的分支，比如三年前的分支，当然 git 允许你每个分支维护一个版本，但是切换 branch 的成本太高，尤其是当代码变动很大的时候，有可能改变了项目结构，甚至可能变更了 build system，如果切换 branch，IDE 可能需要花费大量的时间来重新索引和设置（例如 docs 项目，有 50w 行代码，每次切换分支会带来巨大的 index 构建损耗）

> 对这个命令的主要困惑在于：（当然下面可能会直接解答了，但是自己并没有亲自去试一试这些优缺点的帮助有多大）

- 这个方案和本地同时 clone 多个仓库，保留多份代码有什么区别和优势？磁盘空间占用？（那么节省在哪里呢？）git worktree 满足什么用例。如果您迫切需要检出两个分支，为什么不克隆两次呢
  - 为什么不克隆两次？
    - 有时这很好，但如果历史记录足够大（如 Linux 内核的情况），它可能会在空间方面开始失控。如果您有一个重复数据删除文件系统，那会有所帮助，但仅此而已。
    - 随着时间的推移，所有内容的历史都会比任何给定点的工作树文件大得多。即 `.git` 会越来越大，并且由于这样的文件夹中有特别多的小文件，导致了文件系统更慢的操作很多内容

> 简要的原理/好处：

- 对于 IDE 和 构建系统 以及 依赖于文件夹 等的操作的好处：
  - 每一个分支都在一个新的文件夹之中，每一个分支都可以有一个独立的 IDE 工程。
  - 如果您的构建系统每个分支需要不同的参数，git worktrees 也很有用。例如，如果您在计算机上并排安装了多个发布分支，则在工作树上只运行一次 `./configure --prefix=/opt/release-XY` 会更容易，而不是每次都重复此过程你切换分支的时间。这样，您甚至可以保留所有目标文件并节省再次编译它们的时间。
  - 有一个用例是使用其他工具进行文件比较，而不是 git-diff 像 normal diff，在两个目录之间而不是在两个分支之间。即使用 diff 工具比较两个目录的差异。
- 不同的 worktree 的提交可以在同一个项目中共享
  - 某个用户： 我使用工作树而不是两个克隆的主要原因是您可以立即提交一个并立即挑选另一个，而无需推送/获取。您可以在工作树 1 中的其他内容之上重新调整工作树 2 中开发中的分支。
- 某个用户提出的非常好的用处：可能也是每个人都应该使用的最常见的用例 git worktree 是审查队友的拉取请求，同时仍在主工作树中处理您的更改。这样可以通过 IDE 的 ui 来方便的查看代码（如果远程 git 仓库不满足要求的话）

> 使用：

git worktree 的命令只有几行非常容易记住

```shell
git worktree add ../new-dir some-existing-branch
git worktree add [path] [branch]
```

这行命令将在 new-dir 目录中将 some-existing-branch 中的内容 check out 出来，就像在该目录中 clone 了一份新代码一样。新的文件地址可以在文件系统中的任何位置，但是注意千万不要将目录放到主仓库中。在此之后新目录中的内容就可以和主仓库中的内容一样，新建分支，push 到远端。

当工作结束后可以直接删除该目录，然后运行 git worktree prune.

不能多个工作树对应同一个分支

> 参考

- https://einverne.github.io/post/2019/03/git-worktree.html#fn:2
- https://news.ycombinator.com/item?id=19007761
- https://stackoverflow.com/questions/31935776/what-would-i-use-git-worktree-for

# git rebase

这个 rebase 操作不仅仅是 merge 代码的另一种处理策略，他还有很多其他的操作技巧

> 常规 rebase 操作

先 checkout 再 rebase. https://stackoverflow.com/questions/14893399/rebase-feature-branch-onto-another-feature-branch

> git rebase -i \<commitId\>

交互式变基，可以在其中直接更改某个 commitId 为另一个 commitId，来达到替换 commit 的目的 （但是这个地方具体的原理自己还不知道 😂 是 kuaishou-docs-wangkun 教给自己的）

> 参考

- https://git-scm.com/book/zh/v2/Git-%E5%B7%A5%E5%85%B7-%E9%87%8D%E5%86%99%E5%8E%86%E5%8F%B2
- https://git-scm.com/docs/git-rebase

# git hook

- 一个好用的点：本地在提交前执行 checkstyle ，pre-commit hook for running checkstyle （一个 hook 的好用的地方）
- #todo 各种常见的 hook，有用的 hook
- #todo 利用 Git 钩子做一些衍生工具和自动化脚本

# git stash

`git stash` 类似 idea 的 shelve changelist， 主要用处是：

- 自己不想把现在的修改提交（例如我仅仅为了本地测试方便，改变了几个参数，但是我并不希望提交）
- 当前的工作区的修改比较杂乱，不希望提交

git stash 会把所有未提交的修改（包括暂存的和非暂存的）都保存起来，用于后续恢复当前工作目录。
stash 是本地的

```shell
git stash
# 给 stash 加一个 message
git stash save "message"

# 现有的 stash list
git stash list
# 重新应用缓存的 stash
git stash pop
# 使用指定名称的 stash
git stash apply <stash name>

```

参考
https://www.cnblogs.com/tocy/p/git-stash-reference.html

# 批量按条件删除分支

开发过程中会创建很多临时分支，这些分支只使用了一次，但是从来没删除过，强迫症表示要删除他们
删除逻辑是：按照每个分支最新一个 commit 作为筛选标准，执行批量删除

只用首行 commit 的提交信息有点删除不完全，例如有些分支是这样的：自己的首行 commit 不在筛选条件内，自己创建的分支，最后一个提交是别人。原因是后来又 rebase 了一次 master，所有代码都在 master 上了

```shell
# 批量删除分支

# 获取所有分支 all-branchs.txt
git branch --all > all-branchs.txt

# 输出目标筛选格式 branch-result.txt
# 以方便筛选的格式输出
while read branchName; do (echo -n $branchName "@@" >> branch-result.txt && echo -n $(git log $branchName --pretty=format:"%h@@%an@@%ad@@%s" --date=format:'%Y%m%d' | head -n 1)  >> branch-result.txt && echo -n "\n" >> branch-result.txt); done < all-branchs.txt

# 筛选并输出待删除分支到新文件
# awk -F"@@" '$3=="zhangjike" || $4<20220701 {print $0}'
# 筛选 (最后一个 commit 是自己 并且 最后一个提交时间在很早以前)
while read resultLine;do ( echo $( echo $resultLine | awk -F"@@" '$3=="zhangjike" && $4<20220701 {print $1}' ) >> result-filter.txt ); done < branch-result.txt

# 删除空行
sed -r '/^\s*$/d' result-filter.txt > result-filter-reuslt.txt

# 删除本地和远程分支
while read branchToDel; do (git branch -D $branchToDel && git push --delete origin $branchToDel); done < final-del-result.txt

```

# 其他

#idea

- 利用 Git 是增强文件系统的特点来继续增强文件系统 #idea
  - Git 更像是一个小型的文件系统，提供了许多以此为基础构建的超强工具
  - 例如 可以针对 `git status -s` 的输出，进行解析，从而实现新的功能
  - 例如 可以针对 `git log …` 的输出，进行解析，从而实现新的功能
- 基于 Git 的协同工具也屡见不鲜，不少项目管理和项目跟踪工具都集成了 Git 、GitHub 等 #idea
- 自建 Git 服务器： Git 支持多种数据传输协议。 上面的例子使用的是 https:// 协议，不过你也可以使用 git:// 协议或者使用 SSH 传输协议，比如 user@server:path/to/repo.git
  参考：[4.2 服务器上的 Git - 在服务器上搭建 Git](https://git-scm.com/book/zh/v2/%E6%9C%8D%E5%8A%A1%E5%99%A8%E4%B8%8A%E7%9A%84-Git-%E5%9C%A8%E6%9C%8D%E5%8A%A1%E5%99%A8%E4%B8%8A%E6%90%AD%E5%BB%BA-Git#_getting_git_on_a_server)
- 可以通过配置来设置一些常见命令或命令组合的 **别名**，Git 只是简单地将别名替换为对应的命令。 然而，你可能想要执行外部命令，而不是一个 Git 子命令。 如果是那样的话，可以在命令前面加入 `!` 符号 #todo
	- 如果你自己要写一些与 Git 仓库协作的工具的话，那会很有用。
