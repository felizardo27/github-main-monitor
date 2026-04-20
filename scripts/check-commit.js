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
  console.error("Faltam variáveis de ambiente obrigatórias.");
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
    throw new Error(`Erro ao buscar commits no GitHub: ${response.status} - ${text}`);
  }

  const commits = await response.json();

  if (!Array.isArray(commits) || commits.length === 0) {
    throw new Error("Nenhum commit encontrado.");
  }

  const latest = commits[0];

  return {
    sha: latest.sha,
    shortSha: latest.sha.slice(0, 7),
    message: latest.commit?.message ?? "(sem mensagem)",
    authorName: latest.commit?.author?.name ?? "desconhecido",
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
      subject: `[GitHub] Novo commit na ${GITHUB_BRANCH}: ${GITHUB_OWNER}/${GITHUB_REPO}`,
      html: `
        <h2>Novo commit detectado</h2>
        <p><strong>Repositório:</strong> ${GITHUB_OWNER}/${GITHUB_REPO}</p>
        <p><strong>Branch:</strong> ${GITHUB_BRANCH}</p>
        <p><strong>SHA:</strong> ${commit.shortSha}</p>
        <p><strong>Autor:</strong> ${commit.authorName}</p>
        <p><strong>Data:</strong> ${commit.date}</p>
        <p><strong>Mensagem:</strong></p>
        <pre>${escapeHtml(commit.message)}</pre>
        <p><a href="${commit.htmlUrl}">Ver commit no GitHub</a></p>
      `
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Erro ao enviar email: ${response.status} - ${text}`);
  }

  console.log("Email enviado com sucesso.");
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

  console.log("Último SHA salvo:", state.lastSha || "(vazio)");
  console.log("Último SHA atual:", latest.sha);

  if (!state.lastSha) {
    console.log("Primeira execução. Salvando SHA sem enviar email.");
    writeState({ lastSha: latest.sha });
    return;
  }

  if (state.lastSha === latest.sha) {
    console.log("Sem novo commit.");
    return;
  }

  await sendEmail(latest);
  writeState({ lastSha: latest.sha });
  console.log("SHA atualizado.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});