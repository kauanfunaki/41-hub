interface CertificateData {
  userName: string;
  rank: 1 | 2 | 3;
  wpm: number;
  accuracy: string;
  monthLabel: string;
  issuedLabel: string;
}

const RANK_STYLE: Record<1 | 2 | 3, { primary: string; medal: string; label: string }> = {
  1: { primary: "#F59E0B", medal: "🥇", label: "1º LUGAR" },
  2: { primary: "#94A3B8", medal: "🥈", label: "2º LUGAR" },
  3: { primary: "#B45309", medal: "🥉", label: "3º LUGAR" },
};

async function loadImg(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.crossOrigin = "anonymous";
    img.src = src;
  });
}

async function drawCertificate(data: CertificateData): Promise<HTMLCanvasElement> {
  const W = 1200, H = 800;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const s = RANK_STYLE[data.rank];

  // Background
  const bgGrad = ctx.createLinearGradient(0, 0, W, H);
  bgGrad.addColorStop(0, "#0a1628");
  bgGrad.addColorStop(1, "#0f172a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Radial glow in rank color
  const radial = ctx.createRadialGradient(W / 2, H * 0.42, 0, W / 2, H * 0.42, H * 0.7);
  radial.addColorStop(0, `${s.primary}18`);
  radial.addColorStop(1, "transparent");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, W, H);

  // Outer border
  ctx.strokeStyle = s.primary;
  ctx.lineWidth = 2;
  ctx.strokeRect(20, 20, W - 40, H - 40);

  // Inner border (subtle)
  ctx.strokeStyle = `${s.primary}30`;
  ctx.lineWidth = 1;
  ctx.strokeRect(30, 30, W - 60, H - 60);

  const accentLine = (y: number) => {
    const g = ctx.createLinearGradient(80, 0, W - 80, 0);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.2, s.primary);
    g.addColorStop(0.8, s.primary);
    g.addColorStop(1, "transparent");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(80, y);
    ctx.lineTo(W - 80, y);
    ctx.stroke();
  };

  // Logo
  ctx.textAlign = "center";
  const logo = await loadImg("/41tech-logo-white.png");
  if (logo) {
    const lh = 44, lw = (logo.width / logo.height) * lh;
    ctx.drawImage(logo, W / 2 - lw / 2, 48, lw, lh);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 26px Inter, Arial, sans-serif";
    ctx.fillText("41 Tech", W / 2, 82);
  }

  accentLine(110);

  // Title
  (ctx as any).letterSpacing = "0.22em";
  ctx.fillStyle = "#94a3b8";
  ctx.font = "700 12px Inter, Arial, sans-serif";
  ctx.fillText("CERTIFICADO DE DESTAQUE", W / 2, 142);

  (ctx as any).letterSpacing = "0";
  ctx.fillStyle = "#64748b";
  ctx.font = "400 14px Inter, Arial, sans-serif";
  ctx.fillText(`Ranking de Digitação — ${data.monthLabel}`, W / 2, 165);

  ctx.strokeStyle = "#1e293b";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(120, 184);
  ctx.lineTo(W - 120, 184);
  ctx.stroke();

  // Medal
  ctx.font = "82px serif";
  ctx.fillText(s.medal, W / 2, 284);

  // Rank label
  (ctx as any).letterSpacing = "0.22em";
  ctx.font = "700 13px Inter, Arial, sans-serif";
  ctx.fillStyle = s.primary;
  ctx.fillText(s.label, W / 2, 320);
  (ctx as any).letterSpacing = "0";

  // User name (auto-shrink if long)
  let fs = 58;
  ctx.font = `700 ${fs}px Inter, Arial, sans-serif`;
  while (ctx.measureText(data.userName).width > W - 120 && fs > 32) {
    fs -= 2;
    ctx.font = `700 ${fs}px Inter, Arial, sans-serif`;
  }
  ctx.fillStyle = "#f8fafc";
  ctx.fillText(data.userName, W / 2, 408);

  // Stats
  ctx.font = "400 20px Inter, Arial, sans-serif";
  ctx.fillStyle = "#94a3b8";
  ctx.fillText(
    `${data.wpm} PPM  ·  ${Number(data.accuracy).toFixed(0)}% de precisão`,
    W / 2,
    460,
  );

  accentLine(H - 112);

  // Footer
  ctx.font = "400 13px Inter, Arial, sans-serif";
  ctx.fillStyle = "#475569";
  ctx.fillText(
    `41 Tech Hub  ·  Emitido em ${data.issuedLabel}`,
    W / 2,
    H - 78,
  );

  return canvas;
}

export async function downloadCertificate(
  data: CertificateData,
  format: "png" | "pdf",
): Promise<void> {
  const canvas = await drawCertificate(data);

  if (format === "png") {
    const link = document.createElement("a");
    link.download = `certificado-digitacao-${data.rank}lugar.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
    return;
  }

  // PDF: open print dialog in new tab (browser → Save as PDF)
  const dataUrl = canvas.toDataURL("image/png");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
  <title>Certificado — ${data.userName}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;font-family:Arial,sans-serif;gap:20px}
    img{max-width:100%;height:auto;border-radius:8px;box-shadow:0 4px 24px rgba(0,0,0,.15)}
    .btns{display:flex;gap:12px}
    button{padding:10px 24px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600}
    .p{background:#0f172a;color:#fff}.c{background:#e2e8f0;color:#1e293b}
    @page{size:A4 landscape;margin:0}
    @media print{body{padding:0}.btns{display:none}img{box-shadow:none;width:100vw;height:auto}}
  </style>
</head><body>
  <img src="${dataUrl}" alt="Certificado de ${data.userName}" />
  <div class="btns">
    <button class="p" onclick="window.print()">Salvar como PDF</button>
    <button class="c" onclick="window.close()">Fechar</button>
  </div>
</body></html>`);
  win.document.close();
}

export function getMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, month - 1, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function getIssuedLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, month, 1); // mês seguinte
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
