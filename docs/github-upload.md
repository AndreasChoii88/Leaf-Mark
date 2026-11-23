# 将 Leaf Mark v1.10.3 发布到 GitHub

解压 `leaf-mark-github-v1.10.3.zip`，打开里面的 `leaf-mark` 文件夹。仓库根目录应直接包含 `README.md`、`.gitignore`、`.github/`、`extension/`、`docs/` 和 `tests/`。

## 网页上传

1. 登录 GitHub，在 **Settings → Emails** 打开 **Keep my email addresses private**。
2. 新建空仓库。此目录已经包含 README 和 `.gitignore`。
3. 选择 **uploading an existing file**，上传 `leaf-mark` 文件夹内的内容。Mac 上可在 Finder 按 **⌘ + Shift + .** 显示隐藏文件。
4. 提交后检查 README 截图是否显示，并确认仓库中存在 `.github/workflows/test.yml`。

## 用 Git 上传

从刚解压的 `leaf-mark` 目录开始。将下面的邮箱替换为 GitHub 的 **Settings → Emails** 中提供的完整 `noreply` 地址，将远程地址替换为你刚创建的空仓库地址。

```sh
git init -b main
git config user.email "YOUR_GITHUB_NOREPLY_EMAIL"
git add .github docs extension tests .gitignore README.md CHANGELOG.md DESIGN.md PRODUCT.md PRIVACY.md
git diff --cached --stat
git commit -m "Publish Leaf Mark v1.10.3"
git remote add origin https://github.com/YOUR_USERNAME/leaf-mark.git
git push -u origin main
```

新建提交时，Git 也会记录 `user.name`。如需用公开昵称，在提交前执行 `git config user.name "YOUR_PUBLIC_NAME"`。如果把文件补传到有旧提交的仓库，旧提交的作者信息仍保留。

## 供他人安装

读者可从 GitHub 点 **Code → Download ZIP**，解压后在 `chrome://extensions` 开启开发者模式，选择 **加载已解压的扩展程序**，加载 `extension/` 文件夹。也可以将本 ZIP 作为 Release 附件提供。

仓库只需包含上面的公开文件。浏览器配置、书签导出、扩展打包私钥和私人截图请存放在发布目录之外。
