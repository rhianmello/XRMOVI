// XRMOVI Monitor — widget iPhone (Scriptable)
// Instale no aplicativo Scriptable. Nunca publique aqui sua senha.
// Dados: RPCs administrativas do XRMOVI + visitas consentidas.
const API = "https://ztqtcbzjesrkuaijmylm.supabase.co";
const ANON = "sb_publishable_Lh0A_Ykm2h66ur3LojJKTQ_JdUVMK9d"; // chave pública
const KEY = "xrmovi-monitor-auth-v1";
const ADMIN = "https://frota.nospassa.com.br/admin/";
const green = new Color("#36db73");
const white = new Color("#f6f7f8");
const muted = new Color("#b9b9bd");
const blank = { visitors: "—", online: "—", signups: "—", active: "—", revenue: "—", status: "Conecte sua conta", updated: null };

async function post(path, body, token) {
  const req = new Request(API + path);
  req.method = "POST";
  req.timeoutInterval = 18;
  req.headers = { "apikey": ANON, "Content-Type": "application/json" };
  if (token) req.headers.Authorization = "Bearer " + token;
  req.body = JSON.stringify(body);
  const data = await req.loadJSON();
  const code = req.response ? req.response.statusCode : 0;
  if (code >= 400 || (data && data.error)) {
    throw new Error((data && (data.msg || data.error_description || data.message || data.error)) || "Falha " + code);
  }
  return data;
}
function readSession() {
  if (!Keychain.contains(KEY)) return null;
  try { return JSON.parse(Keychain.get(KEY)); } catch (_) { Keychain.remove(KEY); return null; }
}
function saveSession(payload) {
  const s = { access_token: payload.access_token, refresh_token: payload.refresh_token,
    expires_at: Date.now() + Number(payload.expires_in || 3600) * 1000 };
  if (!s.access_token || !s.refresh_token) throw new Error("Resposta de autenticação inválida.");
  Keychain.set(KEY, JSON.stringify(s));
  return s;
}
async function login() {
  const alert = new Alert();
  alert.title = "XRMOVI Monitor";
  alert.message = "Entre com o e-mail e a senha de administrador do XRMOVI. A senha não fica salva no script.";
  alert.addTextField("E-mail do administrador", "");
  alert.addSecureTextField("Senha", "");
  alert.addAction("Entrar");
  alert.addCancelAction("Cancelar");
  if (await alert.present() !== 0) return null;
  const email = alert.textFieldValue(0).trim();
  const password = alert.textFieldValue(1);
  if (!email || !password) throw new Error("Informe o e-mail e a senha.");
  return saveSession(await post("/auth/v1/token?grant_type=password", { email, password }));
}
async function sessionToken() {
  let session = readSession();
  if (!session) return null;
  if (session.expires_at > Date.now() + 180000) return session.access_token;
  try {
    session = saveSession(await post("/auth/v1/token?grant_type=refresh_token",
      { refresh_token: session.refresh_token }));
    return session.access_token;
  } catch (err) {
    Keychain.remove(KEY);
    throw new Error("Sessão expirada. Abra o Scriptable e faça login novamente.");
  }
}
async function rpc(name, token) {
  return await post("/rest/v1/rpc/" + name, {}, token);
}
const today = () => new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
const dateBR = iso => new Date(iso).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
function monthKey() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit"
  }).formatToParts(now);
  return parts.find(x => x.type === "year").value + "-" + parts.find(x => x.type === "month").value;
}
async function fetchMetrics() {
  const token = await sessionToken();
  if (!token) return { ...blank };
  const ok = await rpc("xrmovi_platform_is_admin", token);
  if (ok !== true) throw new Error("Somente o administrador do XRMOVI pode ver os indicadores.");
  const result = await Promise.allSettled([
    rpc("xrmovi_commercial_admin_overview", token),
    rpc("xrmovi_widget_traffic_stats", token)
  ]);
  if (result[0].status !== "fulfilled") throw new Error("Não foi possível obter os indicadores comerciais.");
  const overview = result[0].value;
  const traffic = result[1].status === "fulfilled" ? result[1].value : null;
  const accounts = Array.isArray(overview.accounts) ? overview.accounts : [];
  const period = monthKey();
  const revenue = Array.isArray(overview.revenue) ?
    overview.revenue.find(x => x.period === period) : null;
  return {
    visitors: traffic ? Number(traffic.visitors_today) : "—",
    online: traffic ? Number(traffic.online_now) : "—",
    signups: accounts.filter(x => x.created_at && dateBR(x.created_at) === today()).length,
    active: Number(overview.summary?.active || 0),
    revenue: Number(revenue?.amount || 0),
    updated: new Date(),
    status: traffic ? "Sincronizado" : "Comercial conectado"
  };
}
function text(parent, value, size, color, bold) {
  const label = parent.addText(String(value));
  label.font = bold ? Font.boldSystemFont(size) : Font.systemFont(size);
  label.textColor = color;
  label.lineLimit = 1;
  label.minimumScaleFactor = 0.65;
  return label;
}
function rowMetric(row, title, value, width, height) {
  const card = row.addStack();
  card.layoutVertically();
  card.backgroundColor = new Color("#050505");
  card.borderColor = new Color("#333338");
  card.borderWidth = 0.7;
  card.cornerRadius = 12;
  card.size = new Size(width, height);
  card.setPadding(10, 10, 8, 8);
  text(card, title, 10, muted, false);
  card.addSpacer(4);
  text(card, value, 25, white, true);
  return card;
}
function formatCount(n) {
  return typeof n === "number" && Number.isFinite(n) ? n.toLocaleString("pt-BR") : "—";
}
function money(n) {
  return typeof n === "number" && Number.isFinite(n) ?
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }) : "—";
}
function createWidget(data) {
  const widget = new ListWidget();
  const grad = new LinearGradient();
  grad.colors = [new Color("#29292b"), new Color("#1c1c1f")];
  grad.locations = [0, 1];
  widget.backgroundGradient = grad;
  widget.setPadding(14, 13, 12, 13);
  widget.url = ADMIN;
  widget.refreshAfterDate = new Date(Date.now() + 15 * 60 * 1000);
  const isSmall = config.widgetFamily === "small";
  const header = widget.addStack();
  header.layoutHorizontally();
  header.centerAlignContent();
  const icon = header.addImage(SFSymbol.named("chart.line.uptrend.xyaxis").image);
  icon.imageSize = new Size(17, 17);
  icon.tintColor = white;
  header.addSpacer(7);
  text(header, isSmall ? "XRMOVI" : "XRMOVI Monitor", isSmall ? 13 : 15, white, true);
  if (!isSmall) {
    header.addSpacer();
    const pill = header.addStack();
    pill.backgroundColor = new Color(data.updated ? "#173a27" : "#39332a");
    pill.cornerRadius = 10;
    pill.setPadding(4, 8, 4, 8);
    text(pill, data.updated ? "Sincronizado" : "Desconectado", 9,
      data.updated ? green : new Color("#ffc37a"), true);
  }
  widget.addSpacer(isSmall ? 8 : 11);
  if (isSmall) {
    text(widget, "Assinaturas ativas", 10, muted, false);
    text(widget, formatCount(data.active), 30, white, true);
    widget.addSpacer(9);
    text(widget, "Faturamento do mês", 10, muted, false);
    text(widget, money(data.revenue), 18, green, true);
    widget.addSpacer();
    text(widget, "Toque para abrir o painel", 8, muted, false);
    return widget;
  }
  const gridA = widget.addStack();
  gridA.layoutHorizontally();
  rowMetric(gridA, "Visitantes hoje", formatCount(data.visitors), 140, 65);
  gridA.addSpacer(7);
  rowMetric(gridA, "Online agora", formatCount(data.online), 140, 65);
  widget.addSpacer(8);
  const gridB = widget.addStack();
  gridB.layoutHorizontally();
  rowMetric(gridB, "Novos cadastros", formatCount(data.signups), 140, 65);
  gridB.addSpacer(7);
  rowMetric(gridB, "Assinaturas ativas", formatCount(data.active), 140, 65);
  widget.addSpacer(8);
  const revenue = widget.addStack();
  revenue.layoutVertically();
  revenue.backgroundColor = new Color("#050505");
  revenue.borderColor = new Color("#333338");
  revenue.borderWidth = 0.7;
  revenue.cornerRadius = 12;
  revenue.size = new Size(287, 62);
  revenue.setPadding(9, 10, 8, 9);
  text(revenue, "Faturamento do mês", 10, muted, false);
  revenue.addSpacer(3);
  text(revenue, money(data.revenue), 22, green, true);
  widget.addSpacer();
  const foot = widget.addStack();
  foot.layoutHorizontally();
  text(foot, data.updated ? "Supabase • visitas consentidas" : data.status, 9, muted, false);
  foot.addSpacer();
  text(foot, data.updated ? new Date(data.updated).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : "↻", 9, muted, false);
  return widget;
}
async function main() {
  let data = { ...blank };
  try {
    if (!config.runsInWidget && readSession()) {
      const menu = new Alert();
      menu.title = "XRMOVI Monitor";
      menu.message = "A conta já está conectada neste iPhone.";
      menu.addAction("Visualizar widget");
      menu.addDestructiveAction("Sair / trocar de conta");
      menu.addCancelAction("Cancelar");
      const choice = await menu.present();
      if (choice === 2 || choice < 0) return;
      if (choice === 1) Keychain.remove(KEY);
    }
    if (!config.runsInWidget && !readSession()) await login();
    if (readSession()) data = await fetchMetrics();
  } catch (error) {
    data = { ...blank, status: String(error.message || error) };
    if (!config.runsInWidget) {
      const a = new Alert();
      a.title = "XRMOVI Monitor — atenção";
      a.message = data.status;
      a.addAction("OK");
      await a.present();
    }
  }
  const widget = createWidget(data);
  Script.setWidget(widget);
  if (!config.runsInWidget) await widget.presentLarge();
}
await main();
Script.complete();
