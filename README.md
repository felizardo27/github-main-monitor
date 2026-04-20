# GitHub Main Monitor

A simple monitor that detects new commits on a GitHub repository branch and sends an email notification through the Resend API.

The project is designed to run through GitHub Actions. It fetches the latest commit from the configured branch, compares it with the SHA stored in `state.json`, and sends an email when a new commit is found.

## How It Works

1. The `.github/workflows/monitor.yml` workflow runs the check every 5 minutes.
2. The `scripts/check-commit.js` script calls the GitHub API to fetch the latest commit from the configured branch.
3. The returned SHA is compared with the value stored in `state.json`.
4. On the first run, the current SHA is saved without sending an email.
5. If a new commit is found, the project sends an email with the commit details.
6. After sending the email, `state.json` is updated and committed automatically by GitHub Actions.

## Structure

```text
.
├── .github/workflows/monitor.yml
├── scripts/check-commit.js
├── package.json
├── state.json
└── README.md
```

## GitHub Configuration

The workflow uses the `GITHUB_MONITOR` environment and expects the following secrets:

| Secret | Description |
| --- | --- |
| `OWNER` | Owner or organization of the monitored repository. |
| `REPO` | Name of the monitored repository. |
| `BRANCH` | Monitored branch. Example: `main` or `master`. |
| `RESEND_API_KEY` | Resend API key used to send emails. |
| `TO_EMAIL` | Email address that receives notifications. |
| `FROM_EMAIL` | Sender address verified in Resend. |
| `GH_TOKEN` | GitHub token used to call the API. |

The workflow also needs write access to repository contents because it updates `state.json` automatically:

```yaml
permissions:
  contents: write
```

## Workflow

The workflow runs in three situations:

- Every 5 minutes through cron.
- Manually through `workflow_dispatch`.
- On pushes to the `master` branch of this repository.

Main trigger configuration:

```yaml
on:
  push:
    branches:
      - master
  schedule:
    - cron: "*/5 * * * *"
  workflow_dispatch:
```

## Running Locally

This project has no external dependencies in `package.json`. It uses native Node.js features, including `fetch`, so use Node.js 20 or newer.

Set the environment variables and run:

```bash
npm run check
```

Example:

```bash
GITHUB_OWNER=octocat \
GITHUB_REPO=hello-world \
GITHUB_BRANCH=main \
RESEND_API_KEY=re_xxxxxxxxx \
TO_EMAIL=target@example.com \
FROM_EMAIL=monitor@example.com \
GITHUB_TOKEN=ghp_xxxxxxxxx \
npm run check
```

## State File

The `state.json` file stores the last checked SHA:

```json
{
  "lastSha": "97f5393757e9c3d543cecc78ac5161b02dbdd3f3"
}
```

This file prevents duplicate notifications for the same commit.

If it is empty or does not have `lastSha`, the next run is treated as the first run and no email is sent. It only saves the current SHA.

## Email Content

When a new commit is detected, the email contains:

- Monitored repository.
- Monitored branch.
- Short commit SHA.
- Author.
- Date.
- Commit message.
- Link to view the commit on GitHub.

## Notes

- The monitored branch is defined by the `BRANCH` secret. If `GITHUB_BRANCH` is not provided, the script defaults to `main`.
- The workflow push trigger is configured for the `master` branch of this repository, not necessarily the monitored branch.
- The first monitoring run does not send an email to avoid an unwanted initial notification.
