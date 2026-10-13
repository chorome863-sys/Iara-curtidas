const form = document.getElementById('form');
const result = document.getElementById('result');
const service = document.getElementById('service');
document.getElementById('year').textContent = new Date().getFullYear();

// Configure seu número comercial em .env. O backend injeta o link pelo endpoint abaixo.
fetch('/api/config').then(r => r.json()).then(data => {
  if (data.whatsapp) document.getElementById('wa').href = `https://wa.me/${data.whatsapp}?text=${encodeURIComponent('Olá, Iara! Quero saber sobre os serviços de divulgação.')}`;
}).catch(() => {});

document.querySelectorAll('[data-service]').forEach(button => button.addEventListener('click', () => {
  service.value = button.dataset.service;
  document.getElementById('pedido').scrollIntoView({behavior:'smooth'});
  document.getElementById('name').focus({preventScroll:true});
}));

form.addEventListener('submit', async event => {
  event.preventDefault();
  result.className = 'result';
  result.textContent = 'Enviando pedido…';
  const payload = {
    name: document.getElementById('name').value,
    email: document.getElementById('email').value,
    phone: document.getElementById('phone').value,
    network: document.getElementById('network').value,
    service: service.value,
    profileUrl: document.getElementById('profile').value,
    goal: document.getElementById('goal').value
  };
  try {
    const response = await fetch('/api/orders', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Não foi possível enviar o pedido.');
    result.className = 'result good';
    if (data.pix?.copyPaste) {
      const code = document.createElement('span');
      code.className = 'pix'; code.textContent = data.pix.copyPaste;
      const title = document.createElement('strong'); title.textContent = `Pedido ${data.orderId.slice(0,8)} criado · R$ ${Number(data.amount).toFixed(2).replace('.',',')}`;
      const button = document.createElement('button'); button.className='copy'; button.type='button'; button.textContent='Copiar código Pix';
      button.addEventListener('click', async () => { await navigator.clipboard.writeText(data.pix.copyPaste); button.textContent='Pix copiado!'; });
      result.replaceChildren(title, document.createElement('br'), document.createTextNode('Use o código Pix abaixo para pagar:'), code, button);
      if (data.pix.ticketUrl) { const a=document.createElement('a'); a.href=data.pix.ticketUrl; a.target='_blank'; a.rel='noopener'; a.textContent='Abrir pagamento'; result.append(document.createElement('br'),a); }
    } else {
      result.textContent = `Pedido ${data.orderId.slice(0,8)} registrado. ${data.message || 'Aguarde as instruções da equipe.'}`;
    }
  } catch (e) { result.className='result bad'; result.textContent=e.message || 'Erro de conexão. Tente novamente.'; }
});
