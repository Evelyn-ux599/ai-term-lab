# 启用 GitHub 自动检查与 Pages

这两个工作流模板保存在文档目录中，便于在没有 `workflow` 令牌权限的环境下克隆和发布项目源代码。

在拥有仓库工作流写入权限的环境中执行：

```sh
mkdir -p .github/workflows
cp docs/github-workflows/ci.yml .github/workflows/ci.yml
cp docs/github-workflows/deploy.yml .github/workflows/deploy.yml
git add .github/workflows
git commit -m "ci: enable checks and Pages deployment"
git push
```

然后在 GitHub 仓库 Settings → Pages 将 Source 设为 **GitHub Actions**。`ci.yml` 在拉取请求和主分支推送时运行检查与构建；`deploy.yml` 会将 `dist/` 发布到 GitHub Pages。

如果命令提示 OAuth token 不具备 `workflow` scope，请由仓库所有者在 GitHub CLI 重新授权该权限，或使用拥有该权限的 Git 客户端完成上述提交。
