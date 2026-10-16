
import * as vscode from 'vscode';
import { simpleGit } from 'simple-git';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

async function findSensitiveFiles(root: string): Promise<string[]> {
  const found: string[] = [];
  const ignoredDirs = new Set([
    '.git', 'node_modules', '.next', 'dist', 'build', 'coverage'
  ]);

  async function scan(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isSymbolicLink()) { continue; }

      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          await scan(fullPath);
        }
        continue;
      }

      if (!entry.isFile()) { continue; }

      const name = entry.name.toLowerCase();
      const relativePath = path.relative(root, fullPath);

      const sensitive =
        /^\.env($|\.)/.test(name) && name !== '.env.example' ||
        /\.(pem|key|p12|pfx)$/i.test(name) ||
        /^id_(rsa|dsa|ecdsa|ed25519)$/.test(name) ||
        /^(credentials|service-account)\.json$/.test(name);

      if (sensitive) { found.push(relativePath); }
    }
  }

  await scan(root);
  return found;
}

export function activate(context: vscode.ExtensionContext) {
  const command = vscode.commands.registerCommand(
    'repo-pilot.createRepository',
    async () => {
      try {
        // 1. Select the project folder
        const folders = vscode.workspace.workspaceFolders;

        if (!folders?.length) {
          vscode.window.showErrorMessage(
            'Open a project folder before using RepoPilot.'
          );
          return;
        }

        let workspace = folders[0];

        if (folders.length > 1) {
          const selected = await vscode.window.showQuickPick(
            folders.map(folder => ({
              label: folder.name,
              description: folder.uri.fsPath,
              folder
            })),
            { placeHolder: 'Choose the project to upload' }
          );

          if (!selected) { return; }
          workspace = selected.folder;
        }

        const root = workspace.uri.fsPath;

        // 2. Ask for repository details
        const repositoryName = await vscode.window.showInputBox({
          prompt: 'Enter a new GitHub repository name',
          placeHolder: 'my-awesome-project',
          validateInput: value => {
            if (!value.trim()) { return 'Repository name is required.'; }
            if (!/^[a-zA-Z0-9._-]+$/.test(value)) {
              return 'Use letters, numbers, dots, hyphens, and underscores.';
            }
            return null;
          }
        });

        if (!repositoryName) { return; }

        const visibility = await vscode.window.showQuickPick(
          ['Private', 'Public'],
          { placeHolder: 'Choose repository visibility' }
        );

        if (!visibility) { return; }

        // 3. Check Git and existing remotes before creating anything
        const git = simpleGit(root);

        await git.version();

        const isRepo = await git.checkIsRepo();

        if (!isRepo) {
          await git.init();
        }


        const remotes = await git.getRemotes(true);

        if (remotes.some(remote => remote.name === 'origin')) {
          const choice = await vscode.window.showWarningMessage(
            'This project already has an origin remote. What would you like to do?',
            { modal: true },
            'Replace origin',
            'Cancel'
          );

          if (choice !== 'Replace origin') {
            return;
          }

          await git.removeRemote('origin');
        }


        // 4. Check for common sensitive files
        const sensitiveFiles = await findSensitiveFiles(root);

        if (sensitiveFiles.length > 0) {
          const notIgnored: string[] = [];
          const alreadyTracked: string[] = [];

          for (const file of sensitiveFiles) {
            const gitPath = file.replace(/\\/g, '/');

            // Check whether Git ignores this file.
            let ignored = false;

            try {
              await git.raw([
                'check-ignore',
                '--no-index',
                '--',
                gitPath
              ]);
              ignored = true;
            } catch {
              ignored = false;
            }

            // Check whether the file is already tracked by Git.
            let tracked = false;

            try {
              await git.raw([
                'ls-files',
                '--error-unmatch',
                '--',
                gitPath
              ]);
              tracked = true;
            } catch {
              tracked = false;
            }

            if (tracked) {
              alreadyTracked.push(file);
            } else if (!ignored) {
              notIgnored.push(file);
            }
          }

          if (alreadyTracked.length > 0) {
            vscode.window.showErrorMessage(
              'Sensitive files are already tracked by Git: ' +
              alreadyTracked.join(', ') +
              '. Remove them from Git tracking with ' +
              '`git rm --cached -- <file>` and ensure they are in .gitignore. ' +
              'Then run RepoPilot again.'
            );
            return;
          }

          if (notIgnored.length > 0) {
            vscode.window.showWarningMessage(
              'Add these files to .gitignore before uploading: ' +
              notIgnored.join(', ') +
              '. Save .gitignore and run RepoPilot again.'
            );
            return;
          }

        }


        const confirmation = await vscode.window.showWarningMessage(
          `Create a ${visibility.toLowerCase()} GitHub repository named ` +
          `"${repositoryName}" and push files from "${workspace.name}"?`,
          { modal: true },
          'Create and Push'
        );

        if (confirmation !== 'Create and Push') { return; }

        // 5. Authenticate with GitHub
        const session = await vscode.authentication.getSession(
          'github',
          ['repo'],
          { createIfNone: true }
        );

        const { Octokit } = await import('@octokit/rest');
        const octokit = new Octokit({
          auth: session.accessToken
        });

        // 6. Create the remote repository
        const response = await octokit.repos.createForAuthenticatedUser({
          name: repositoryName,
          private: visibility === 'Private',
          auto_init: false
        });

        const repositoryUrl = response.data.html_url;
        const cloneUrl = response.data.clone_url;

        // 7. Stage and commit files
        await git.add('.');
        const status = await git.status();

        if (status.staged.length > 0) {
          await git.commit('Initial commit');
        } else if (status.current === null) {
          throw new Error(
            'No files were staged. Add project files and try again.'
          );
        }

        // 8. Set main as the branch for a newly initialized repository
        if (!isRepo) {
          await git.branch(['-M', 'main']);
        }

        const branchStatus = await git.status();
        const branchName = branchStatus.current;

        if (!branchName) {
          throw new Error('Could not determine the current Git branch.');
        }

        // 9. Connect to GitHub and push
        await git.addRemote('origin', cloneUrl);
        await git.push(['-u', 'origin', branchName]);

        const action = await vscode.window.showInformationMessage(
          `RepoPilot: Code pushed successfully to ${repositoryName}!`,
          'Open on GitHub'
        );

        if (action === 'Open on GitHub') {
          await vscode.env.openExternal(vscode.Uri.parse(repositoryUrl));
        }
      } catch (error) {
        const message =
          error instanceof Error ? error.message : String(error);

        vscode.window.showErrorMessage(
          `RepoPilot: ${message}`
        );
      }
    }
  );

  context.subscriptions.push(command);
}

export function deactivate() { }
