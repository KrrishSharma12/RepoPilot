# RepoPilot

**Create GitHub repositories and push your local projects directly from VS Code.**

RepoPilot helps you publish your current project to GitHub without switching between multiple tools.

## Features

- **Create GitHub repositories** — Create a new repository from VS Code.
- **Public or private repositories** — Choose the visibility of your repository.
- **Automatic Git setup** — Initialize Git when the current project is not already a repository.
- **Commit and push** — Stage project files, create an initial commit when needed, and push to GitHub.
- **Existing remote handling** — Choose whether to replace an existing `origin` remote or cancel.
- **Sensitive-file checks** — Detect potentially sensitive filenames, such as `.env`, `.pem`, and `.key` files, and check Git ignore/tracking status before proceeding.

## Requirements

- Visual Studio Code
- A Git installation
- A GitHub account
- GitHub authentication available in VS Code
- Git configured with your name and email for committing

## How to Use

1. Open your project folder in VS Code.
2. Open the Command Palette using `Ctrl + Shift + P`.
3. Search for **RepoPilot: Create GitHub Repository**.
4. Enter your desired repository name.
5. Select **Public** or **Private**.
6. Sign in to GitHub if prompted and grant the requested permissions.
7. Review any warnings and confirm the operation.
8. RepoPilot creates the repository and attempts to commit and push your project.

## Security Notes

- Review your files before publishing a repository, especially if it will be public.
- Add secrets and environment files to `.gitignore`.
- If a sensitive file has already been committed, adding it to `.gitignore` alone does not remove it from Git history.
- Filename-based checks cannot detect every secret. Review your staged files before pushing.

## Troubleshooting

**Git is not installed:** Install Git and restart VS Code.

**GitHub authentication fails:** Sign in to GitHub through VS Code and retry.

**Push fails:** Check your Git credentials, remote URL, branch, and network connection.

**Repository already exists:** Choose a different repository name.

## Development

Install dependencies:

```bash
npm install
```

Compile:

```bash
npm run compile
```

Lint:

```bash
npm run lint
```

Run tests:

```bash
npm test
```

Package the extension:

```bash
npx @vscode/vsce package
```

## License

Add a `LICENSE` file before distributing this extension publicly.
