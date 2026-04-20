import fs from "fs";

const {
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = "main",
  RESEND_API_KEY,
  TO_EMAIL,
  FROM_EMAIL,
  GITHUB_TOKEN
} = process.env;

if (!GITHUB_OWNER || !GITHUB_REPO || !RESEND_API_KEY || !TO_EMAIL || !FROM_EMAIL) {
  console.error("Missing required environment variables.");
  process.exit(1);
}

const statePath = "./state.json";

function readState() {
  if (!fs.existsSync(statePath)) {
    return { lastSha: "" };
  }

  try {
    const raw = fs.readFileSync(statePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return { lastSha: "" };
  }
}

function writeState(data) {
  fs.writeFileSync(statePath, JSON.stringify(data, null, 2));
}

async function getLatestCommit() {
  const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=${encodeURIComponent(GITHUB_BRANCH)}&per_page=1`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/vnd.github+json",
      ...(GITHUB_TOKEN ? { Authorization: `Bearer ${GITHUB_TOKEN}` } : {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to fetch commits from GitHub: ${response.status} - ${text}`);
  }

  const commits = await response.json();

  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error("No commits found.");
  }

  const latest = commits[0];

  return {
    sha: latest.sha,
    shortSha: latest.sha.slice(0, 7),
    message: latest.commit?.message ?? "(no message)",
    authorName: latest.commit?.author?.name ?? "unknown",
    date: latest.commit?.author?.date ?? "",
    htmlUrl: latest.html_url ?? ""
  };
}

async function sendEmail(commit) {
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: FROM_EMAIL,
      to: [TO_EMAIL],
      subject: `[GitHub] New commit on ${GITHUB_BRANCH}: ${GITHUB_OWNER}/${GITHUB_REPO}`,
      html: `
        <h2>New commit detected</h2>
        <p><strong>Repository:</strong> ${GITHUB_OWNER}/${GITHUB_REPO}</p>
        <p><strong>Branch:</strong> ${GITHUB_BRANCH}</p>
        <p><strong>SHA:</strong> ${commit.shortSha}</p>
        <p><strong>Author:</strong> ${commit.authorName}</p>
        <p><strong>Date:</strong> ${commit.date}</p>
        <p><strong>Message:</strong></p>
        <pre>${escapeHtml(commit.message)}</pre>
        <p><a href="${commit.htmlUrl}">View commit on GitHub</a></p>
      `
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send email: ${response.status} - ${text}`);
  }

  console.log("Email sent successfully.");
}

function escapeHtml(str) {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function main() {
  const state = readState();
  const latest = await getLatestCommit();

  console.log("Saved latest SHA:", state.lastSha || "(empty)");
  console.log("Current latest SHA:", latest.sha);

  if (!state.lastSha) {
    console.log("First run. Saving SHA without sending email.");
    writeState({ lastSha: latest.sha });
    return;
  }

  if (state.lastSha === latest.sha) {
    console.log("No new commit.");
    return;
  }

  await sendEmail(latest);
  writeState({ lastSha: latest.sha });
  console.log("SHA updated.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
