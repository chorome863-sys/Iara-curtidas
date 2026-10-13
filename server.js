import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import Database from 'better-sqlite3';
import { z } from 'zod';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const db = new Database(path.join(here, '../iara.sqlite'));
db.pragma('journal_mode = WAL');
db.exec(`
CREATE TABLE IF NOT EXISTS orders (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
 network TEXT NOT NULL, service TEXT NOT NULL, profile_url TEXT NOT NULL,
 goal TEXT NOT NULL, amount_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
 payment_id TEXT, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS campaigns (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, network TEXT NOT NULL,
 description TEXT NOT NULL, budget_cents INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`);
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
app.use('/api/', rateLimit({ windowMs: 60_000, limit: 25, standardHeaders: true, legacyHeaders: false }));
app.use(express.static(path.join(here, '../public')));

const services = {
 audit: { name: 'Diagnóstico de perfil', price: 1900 },
 plan: { name: 'Plano de divulgação de 7 dias', price: 3900 },
 content: { name: 'Pacote de 5 ideias e legendas', price: 2900 },
 campaign: { name: 'Planejamento de campanha', price: 5900 }
};
const schema = z.object({
 name: z.string().trim().min(2).max(80),
 email: z.string().trim().email().max(254),
 phone: z.string().transform(v => v.replace(/\D/g, '')).refine(v => /^\d{10,15}$/.test(v), 'Informe o telefone com país e DDD.'),
 network: z.enum(['instagram', 'tiktok', 'youtube', 'facebook']),
 service: z.enum(['audit', 'plan', 'content', 'campaign']),
 profileUrl: z.string().trim().url().max(500),
 goal: z.string().trim().min(8).max(1000)
});
const campaignSchema = z.object({
 title: z.string().trim().min(3).max(100),
 network: z.enum(['instagram', 'tiktok', 'youtube', 'facebook']),
 description: z.string().trim().min(10).max(1000),
 budget: z.number().min(10).max(100000)
});

function safeEqual(a = '', b = '') {
 const aa = Buffer.from(String(a)); const bb = Buffer.from(String(b));
 return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}
function brl(cents) {
 return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
}
async function sendWhatsApp(to, body) {
 const token = process.env.WHATSAPP_TOKEN;
 const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
 if (!token || !phoneId) { console.log(`[WhatsApp não configurado] ${to}: ${body}`); return; }
 const r = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body } })
 });
 if (!r.ok) console.error('Erro WhatsApp Cloud API:', r.status, (await r.text()).slice(0, 300));
}
async function createPix(order) {
 const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
 if (!token) return { configured: false };
 const r = await fetch('https://api.mercadopago.com/v1/payments', {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'X-Idempotency-Key': order.id },
  body: JSON.stringify({
   transaction_amount: order.amount_cents / 100,
   description: `${services[order.service].name} - Iara ${order.id.slice(0, 8)}`,
   payment_method_id: 'pix',
   payer: { email: order.email },
   external_reference: order.id,
   notification_url: `${process.env.BASE_URL}/webhooks/mercadopago`,
   metadata: { order_id: order.id }
  })
 });
 const data = await r.json().catch(() => ({}));
 if (!r.ok) throw new Error('Falha ao criar cobrança Pix');
 return {
  configured: true, paymentId: String(data.id), status: data.status,
  copyPaste: data.point_of_interaction?.transaction_data?.qr_code || '',
  qrCodeBase64: data.point_of_interaction?.transaction_data?.qr_code_base64 || '',
  ticketUrl: data.point_of_interaction?.transaction_data?.ticket_url || ''
 };
}

// Meta webhook verification and message handler. Raw body is used to validate signature.
app.get('/webhooks/whatsapp', (req, res) => {
 const ok = req.query['hub.mode'] === 'subscribe' &&
   safeEqual(req.query['hub.verify_token'], process.env.WHATSAPP_VERIFY_TOKEN || '');
 return ok ? res.status(200).send(String(req.query['hub.challenge'] || '')) : res.sendStatus(403);
});
app.post('/webhooks/whatsapp', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
 const secret = process.env.WHATSAPP_APP_SECRET;
 const signature = req.get('x-hub-signature-256') || '';
 if (!secret && process.env.NODE_ENV === 'production') return res.status(503).send('Configure WHATSAPP_APP_SECRET.');
 if (secret) {
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(req.body).digest('hex');
  if (!safeEqual(signature, expected)) return res.sendStatus(401);
 }
 let payload;
 try { payload = JSON.parse(req.body.toString('utf8')); } catch { return res.sendStatus(400); }
 try {
  for (const entry of payload.entry || []) for (const change of entry.changes || []) {
   for (const msg of change.value?.messages || []) {
    if (!msg.from || msg.type !== 'text') continue;
    const text = (msg.text?.body || '').trim();
    const t = text.toLowerCase();
    let reply;
    if (['oi','olá','ola','menu','ajuda'].includes(t)) {
     reply = 'Olá! 💜 Sou a Iara Curtidas.\\n\\n1 — Serviços e preços\\n2 — Como funcionam as campanhas\\n3 — Quero divulgar meu perfil\\n\\nTrabalho com conteúdo, estratégia e campanhas legítimas; não vendo curtidas falsas nem garanto números.';
    } else if (t === '1' || t.includes('preço') || t.includes('serviço')) {
     reply = 'Serviços Iara Curtidas:\\n• Diagnóstico de perfil — R$ 19,00\\n• Plano de divulgação de 7 dias — R$ 39,00\\n• 5 ideias e legendas — R$ 29,00\\n• Planejamento de campanha — R$ 59,00\\n\\nPeça pelo site: ' + (process.env.BASE_URL || 'link do site');
    } else if (t === '2' || t.includes('campanha')) {
     reply = 'Ajudamos com estratégia, conteúdo e campanhas promocionais transparentes. Resultados dependem do público, criativo, orçamento e plataforma. Nunca pedimos senha ou código de login.';
    } else if (t === '3' || t.includes('divulgar')) {
     reply = 'Legal! Acesse ' + (process.env.BASE_URL || 'o site') + ' e envie seu perfil público, rede social e objetivo. Não envie senhas.';
    } else {
     reply = 'Posso ajudar com ideias de conteúdo, divulgação e serviços. Digite MENU para ver opções ou acesse ' + (process.env.BASE_URL || 'nosso site') + '.';
    }
    await sendWhatsApp(msg.from, reply);
   }
  }
 } catch (e) { console.error('Webhook WhatsApp error:', e); }
 res.sendStatus(200);
});

app.use(express.json({ limit: '32kb' }));
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.get('/api/config', (_req, res) => res.json({ whatsapp: (process.env.BUSINESS_WHATSAPP || '').replace(/\\D/g, '') }));
app.get('/api/services', (_req, res) => res.json(Object.entries(services).map(([id, s]) => ({ id, name: s.name, price: s.price / 100 }))));
app.post('/api/orders', async (req, res) => {
 const parsed = schema.safeParse(req.body);
 if (!parsed.success) return res.status(400).json({ error: 'Confira os campos do formulário.', fields: parsed.error.flatten().fieldErrors });
 const d = parsed.data, id = crypto.randomUUID(), amount = services[d.service].price;
 db.prepare(`INSERT INTO orders (id,name,email,phone,network,service,profile_url,goal,amount_cents)
 VALUES (?,?,?,?,?,?,?,?,?)`).run(id,d.name,d.email,d.phone,d.network,d.service,d.profileUrl,d.goal,amount);
 try {
  const payment = await createPix({ id, email: d.email, amount_cents: amount, service: d.service });
  if (!payment.configured) return res.status(201).json({ orderId:id, amount:amount/100, status:'pending_configuration', message:'Pedido registrado. O administrador precisa configurar o Pix no servidor.' });
  db.prepare('UPDATE orders SET payment_id=? WHERE id=?').run(payment.paymentId,id);
  res.status(201).json({ orderId:id, amount:amount/100, status:payment.status, pix:payment });
 } catch (e) {
  console.error(e);
  res.status(502).json({ error:'Pedido salvo, mas não foi possível gerar o Pix. Tente mais tarde.', orderId:id });
 }
});

// Lightweight campaign planner record. This is not an ad-platform charge or automatic ad launch.
app.post('/api/campaigns', (req, res) => {
 const parsed = campaignSchema.safeParse(req.body);
 if (!parsed.success) return res.status(400).json({ error:'Confira os dados da campanha.' });
 const d = parsed.data, id = crypto.randomUUID();
 db.prepare('INSERT INTO campaigns (id,title,network,description,budget_cents) VALUES (?,?,?,?,?)')
  .run(id,d.title,d.network,d.description,Math.round(d.budget*100));
 res.status(201).json({ id, status:'draft', message:'Rascunho de campanha salvo. Revise as políticas da plataforma antes de publicar.' });
});

app.post('/webhooks/mercadopago', async (req, res) => {
 const paymentId = req.query['data.id'] || req.body?.data?.id;
 const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
 if (!paymentId || !token) return res.sendStatus(200);
 try {
  const r = await fetch(`https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`, { headers:{ Authorization:`Bearer ${token}` } });
  if (!r.ok) return res.sendStatus(200);
  const payment = await r.json();
  const id = payment.external_reference;
  const order = id && db.prepare('SELECT * FROM orders WHERE id=?').get(id);
  if (order && Math.round(Number(payment.transaction_amount)*100) === order.amount_cents) {
   const status = payment.status === 'approved' ? 'paid' : payment.status === 'rejected' ? 'rejected' : 'pending';
   db.prepare('UPDATE orders SET status=? WHERE id=?').run(status,id);
   if (status === 'paid') await sendWhatsApp(order.phone, `Pagamento confirmado! ✅ Pedido ${id.slice(0,8)}. Recebemos seu pedido para ${services[order.service].name}. Nossa equipe entrará em contato.`);
  }
 } catch (e) { console.error('Mercado Pago webhook error:',e); }
 res.sendStatus(200);
});

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Iara Curtidas rodando na porta ${port}`));
