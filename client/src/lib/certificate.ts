interface CertificateData {
  userName: string;
  rank: 1 | 2 | 3;
  wpm: number;
  accuracy: string;
  monthLabel: string;
  issuedLabel: string;
}

const RANK_STYLE: Record<1 | 2 | 3, { primary: string; glow: string; medal: string; label: string }> = {
  1: { primary: "#F59E0B", glow: "rgba(245,158,11,0.35)", medal: "🥇", label: "1º LUGAR" },
  2: { primary: "#94A3B8", glow: "rgba(148,163,184,0.30)", medal: "🥈", label: "2º LUGAR" },
  3: { primary: "#CD7F32", glow: "rgba(205,127,50,0.30)", medal: "🥉", label: "3º LUGAR" },
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function drawCorner(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  sz: number,
  flipX: boolean,
  flipY: boolean,
  color: string,
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);

  // Outer L
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, sz);
  ctx.lineTo(0, 0);
  ctx.lineTo(sz, 0);
  ctx.stroke();

  // Inner L
  ctx.strokeStyle = `${color}55`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, sz * 0.45);
  ctx.lineTo(0, sz * 0.16);
  ctx.arcTo(0, 0, sz * 0.16, 0, sz * 0.14);
  ctx.lineTo(sz * 0.45, 0);
  ctx.stroke();

  // Corner dot
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

async function drawCertificate(data: CertificateData): Promise<HTMLCanvasElement> {
  const W = 1200, H = 800;
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  const s = RANK_STYLE[data.rank];

  // ── Background ──────────────────────────────────────────────────────────────
  const bgGrad = ctx.createLinearGradient(0, H, W, 0);
  bgGrad.addColorStop(0, "#080f1e");
  bgGrad.addColorStop(0.5, "#0c1628");
  bgGrad.addColorStop(1, "#101e35");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Dot grid pattern
  ctx.fillStyle = "rgba(255,255,255,0.028)";
  for (let gx = 36; gx < W; gx += 36) {
    for (let gy = 36; gy < H; gy += 36) {
      ctx.beginPath();
      ctx.arc(gx, gy, 1, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Central rank-color radial glow
  const radial = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, 420);
  radial.addColorStop(0, `${s.primary}20`);
  radial.addColorStop(0.5, `${s.primary}08`);
  radial.addColorStop(1, "transparent");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, W, H);

  // ── Borders ─────────────────────────────────────────────────────────────────
  // Outer border
  ctx.strokeStyle = `${s.primary}90`;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(16, 16, W - 32, H - 32);

  // Inner border (subtle)
  ctx.strokeStyle = `${s.primary}28`;
  ctx.lineWidth = 1;
  ctx.strokeRect(26, 26, W - 52, H - 52);

  // ── Corner ornaments ────────────────────────────────────────────────────────
  const cornerSz = 46;
  const cornerPad = 16;
  drawCorner(ctx, cornerPad, cornerPad, cornerSz, false, false, s.primary);
  drawCorner(ctx, W - cornerPad, cornerPad, cornerSz, true, false, s.primary);
  drawCorner(ctx, cornerPad, H - cornerPad, cornerSz, false, true, s.primary);
  drawCorner(ctx, W - cornerPad, H - cornerPad, cornerSz, true, true, s.primary);

  // Accent line helper
  const accentLine = (y: number, opacity = 1) => {
    const g = ctx.createLinearGradient(80, 0, W - 80, 0);
    g.addColorStop(0, "transparent");
    g.addColorStop(0.18, `${s.primary}${opacity < 1 ? "44" : "cc"}`);
    g.addColorStop(0.82, `${s.primary}${opacity < 1 ? "44" : "cc"}`);
    g.addColorStop(1, "transparent");
    ctx.strokeStyle = g;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(80, y);
    ctx.lineTo(W - 80, y);
    ctx.stroke();
  };

  // ── Logo ─────────────────────────────────────────────────────────────────────
  ctx.textAlign = "center";
  const logo = await loadImg("/41tech-logo-white.png");
  if (logo) {
    const lh = 46, lw = (logo.width / logo.height) * lh;
    ctx.drawImage(logo, W / 2 - lw / 2, 46, lw, lh);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.font = "bold 28px Inter, Arial, sans-serif";
    ctx.fillText("41 Tech", W / 2, 84);
  }

  accentLine(106);

  // ── Title ────────────────────────────────────────────────────────────────────
  (ctx as any).letterSpacing = "0.3em";
  ctx.fillStyle = s.primary;
  ctx.font = "700 11px Inter, Arial, sans-serif";
  ctx.fillText("CERTIFICADO DE DESTAQUE", W / 2, 136);

  (ctx as any).letterSpacing = "0.04em";
  ctx.fillStyle = "#c8d8f0";
  ctx.font = "400 14px Inter, Arial, sans-serif";
  ctx.fillText(`Ranking de Digitação — ${data.monthLabel}`, W / 2, 158);
  (ctx as any).letterSpacing = "0";

  // Thin divider
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(160, 174);
  ctx.lineTo(W - 160, 174);
  ctx.stroke();

  // ── Medal with glow ─────────────────────────────────────────────────────────
  // Glow behind medal
  const medalGlow = ctx.createRadialGradient(W / 2, 258, 0, W / 2, 258, 70);
  medalGlow.addColorStop(0, s.glow);
  medalGlow.addColorStop(1, "transparent");
  ctx.fillStyle = medalGlow;
  ctx.fillRect(W / 2 - 80, 190, 160, 140);

  ctx.font = "76px serif";
  ctx.fillText(s.medal, W / 2, 282);

  // ── Rank label ───────────────────────────────────────────────────────────────
  (ctx as any).letterSpacing = "0.28em";
  ctx.font = "800 13px Inter, Arial, sans-serif";
  ctx.fillStyle = s.primary;

  // Text glow
  ctx.shadowColor = s.primary;
  ctx.shadowBlur = 12;
  ctx.fillText(s.label, W / 2, 316);
  ctx.shadowBlur = 0;
  (ctx as any).letterSpacing = "0";

  // ── "Concedido a" ────────────────────────────────────────────────────────────
  (ctx as any).letterSpacing = "0.08em";
  ctx.fillStyle = "#8faac8";
  ctx.font = "300 13px Inter, Arial, sans-serif";
  ctx.fillText("ESTE CERTIFICADO É CONCEDIDO A", W / 2, 348);
  (ctx as any).letterSpacing = "0";

  // ── User name ────────────────────────────────────────────────────────────────
  let fs = 56;
  ctx.font = `700 ${fs}px Inter, Arial, sans-serif`;
  while (ctx.measureText(data.userName).width > W - 140 && fs > 30) {
    fs -= 2;
    ctx.font = `700 ${fs}px Inter, Arial, sans-serif`;
  }
  // Subtle name glow
  ctx.shadowColor = "rgba(255,255,255,0.15)";
  ctx.shadowBlur = 20;
  ctx.fillStyle = "#ffffff";
  ctx.fillText(data.userName, W / 2, 414);
  ctx.shadowBlur = 0;

  // ── Stats boxes ─────────────────────────────────────────────────────────────
  const boxW = 190, boxH = 76, boxGap = 24;
  const boxY = 446;
  const box1X = W / 2 - boxW - boxGap / 2;
  const box2X = W / 2 + boxGap / 2;

  const drawStatBox = (bx: number, by: number, value: string, label: string) => {
    // Background
    ctx.fillStyle = `${s.primary}10`;
    roundRect(ctx, bx, by, boxW, boxH, 10);
    ctx.fill();

    // Border
    ctx.strokeStyle = `${s.primary}45`;
    ctx.lineWidth = 1;
    roundRect(ctx, bx, by, boxW, boxH, 10);
    ctx.stroke();

    // Top accent bar
    const barGrad = ctx.createLinearGradient(bx, by, bx + boxW, by);
    barGrad.addColorStop(0, "transparent");
    barGrad.addColorStop(0.5, `${s.primary}80`);
    barGrad.addColorStop(1, "transparent");
    ctx.fillStyle = barGrad;
    ctx.fillRect(bx + 10, by, boxW - 20, 2);

    // Value
    ctx.textAlign = "center";
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 28px Inter, Arial, sans-serif`;
    ctx.fillText(value, bx + boxW / 2, by + 42);

    // Label
    ctx.fillStyle = `${s.primary}cc`;
    ctx.font = "500 11px Inter, Arial, sans-serif";
    (ctx as any).letterSpacing = "0.1em";
    ctx.fillText(label, bx + boxW / 2, by + 62);
    (ctx as any).letterSpacing = "0";
  };

  drawStatBox(box1X, boxY, `${data.wpm} PPM`, "PALAVRAS POR MINUTO");
  drawStatBox(box2X, boxY, `${Number(data.accuracy).toFixed(0)}%`, "PRECISÃO");

  // ── Bottom section ───────────────────────────────────────────────────────────
  accentLine(560, 0.7);

  // Footer
  ctx.textAlign = "center";
  (ctx as any).letterSpacing = "0.06em";
  ctx.fillStyle = "#7a90aa";
  ctx.font = "400 12px Inter, Arial, sans-serif";
  ctx.fillText(`41 TECH HUB  ·  EMITIDO EM ${data.issuedLabel.toUpperCase()}`, W / 2, 594);
  (ctx as any).letterSpacing = "0";

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

  const dataUrl = canvas.toDataURL("image/png");
  const win = window.open("", "_blank");
  if (!win) return;
  win.document.write(`<!DOCTYPE html><html><head>
  <title>Certificado — ${data.userName}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{background:#0c1628;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;padding:24px;font-family:Arial,sans-serif;gap:20px}
    img{max-width:100%;height:auto;border-radius:10px;box-shadow:0 8px 40px rgba(0,0,0,.6)}
    .btns{display:flex;gap:12px}
    button{padding:10px 28px;border:none;border-radius:6px;cursor:pointer;font-size:14px;font-weight:600}
    .p{background:#F59E0B;color:#0c1628}.c{background:#1e2d45;color:#c8d8f0}
    @page{size:A4 landscape;margin:0}
    @media print{body{padding:0;background:white}.btns{display:none}img{box-shadow:none;width:100vw;height:auto}}
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
  const d = new Date(year, month, 1);
  const label = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
