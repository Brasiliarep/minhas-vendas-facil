// Minhas Vendas Fácil — vanilla JS + IndexedDB wrapper
// Dados no IndexedDB via IDB API básica
const DB_NAME = 'mvf-db';
const DB_VER = 1;
let db;

// util
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const fmt = v => (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const parseBR = str => { if(!str) return 0; // aceita 1234,56 ou 1234.56
  return Number(String(str).replace(/\./g,'').replace(',','.')) || Number(str) || 0;
};
const todayISO = () => new Date().toISOString();

// open DB
function openDB(){
  return new Promise((res,rej)=>{
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = e => {
      db = e.target.result;
      // stores
      db.createObjectStore('perfil',{keyPath:'id'});
      db.createObjectStore('clientes',{keyPath:'id'});
      db.createObjectStore('produtos',{keyPath:'id'});
      db.createObjectStore('pedidos',{keyPath:'id'});
      db.createObjectStore('despesas',{keyPath:'id'});
      db.createObjectStore('agenda',{keyPath:'id'});
      db.createObjectStore('prospects',{keyPath:'id'});
    };
    req.onsuccess = e => { db = e.target.result; res(); };
    req.onerror = e => rej(e);
  });
}
function tx(store, mode='readonly'){
  return db.transaction(store, mode).objectStore(store);
}
function put(store, obj){
  return new Promise((res,rej)=>{
    const r = tx(store,'readwrite').put(obj);
    r.onsuccess=()=>res(obj); r.onerror=rej;
  });
}
function add(store, obj){
  return new Promise((res,rej)=>{
    const r = tx(store,'readwrite').add(obj);
    r.onsuccess=()=>res(obj); r.onerror=rej;
  });
}
function getAll(store){
  return new Promise((res,rej)=>{
    const r = tx(store).getAll();
    r.onsuccess=()=>res(r.result||[]); r.onerror=rej;
  });
}
function remove(store, key){
  return new Promise((res,rej)=>{
    const r = tx(store,'readwrite').delete(key);
    r.onsuccess=()=>res(); r.onerror=rej;
  });
}
const uuid = () => Math.random().toString(36).slice(2)+Date.now().toString(36);

// navigation
function show(view){
  $$('section[id^="view-"]').forEach(s=>s.classList.add('hidden'));
  $('#view-'+view).classList.remove('hidden');
}
$$('nav button, .grid button, [data-view]').forEach(b=>{
  b.addEventListener('click', e => {
    const v = e.currentTarget.getAttribute('data-view');
    if(v){ show(v); if(v==='pedidos') renderPedidos(); if(v==='clientes') renderClientes(); if(v==='produtos') renderProdutos();
      if(v==='receitas') renderReceitas(); if(v==='despesas') renderDespesas(); if(v==='agenda') renderAgenda();
      if(v==='prospects') renderProspects(); if(v==='catalogos') renderCatalogos(); if(v==='novo') resetNovoPedidoUI();
      if(v==='home'){} }
  });
});
$('#gear').addEventListener('click', ()=>{ show('config'); loadPerfilForm(); });

// PERFIL (config)
async function loadPerfil(){
  const arr = await getAll('perfil');
  return arr.find(x=>x.id==='perfil') || null;
}
async function savePerfil(obj){
  obj.id = 'perfil';
  await put('perfil', obj);
}
function loadPerfilForm(){
  loadPerfil().then(p=>{
    $('#pfNome').value = p?.nome||'';
    $('#pfEmpresa').value = p?.empresa||'';
    $('#pfDoc').value = p?.doc||'';
    $('#pfTel').value = p?.tel||'';
    $('#pfEnd').value = p?.end||'';
    $('#pfEmail').value = p?.email||'';
    $('#pfPrefixo').value = p?.prefixo||'MVF-';
    $('#pfSeq').value = p?.seq||1;
    $('#pfObs').value = p?.obs||'';
  });
}
$('#savePerfil').addEventListener('click', async ()=>{
  await savePerfil({
    nome: $('#pfNome').value.trim(),
    empresa: $('#pfEmpresa').value.trim(),
    doc: $('#pfDoc').value.trim(),
    tel: $('#pfTel').value.trim(),
    end: $('#pfEnd').value.trim(),
    email: $('#pfEmail').value.trim(),
    prefixo: $('#pfPrefixo').value.trim()||'MVF-',
    seq: Number($('#pfSeq').value)||1,
    obs: $('#pfObs').value.trim()
  });
  alert('Configurações salvas ✓');
});
$('#resetPerfil').addEventListener('click', async ()=>{
  await remove('perfil','perfil').catch(()=>{});
  loadPerfilForm();
});

// CLIENTES helpers
async function upsertClienteByNomeTel({nome, telefone, endereco, tipo}){
  nome = (nome||'').trim(); telefone=(telefone||'').trim();
  const lista = await getAll('clientes');
  const found = lista.find(c => c.nome.toLowerCase()===nome.toLowerCase() && c.telefone===telefone);
  const base = { id: found?.id || uuid(), nome, telefone, endereco: endereco||'', tipo: tipo||'final', criadoEm: found?.criadoEm||todayISO(), atualizadoEm: todayISO() };
  await put('clientes', {...found, ...base});
  return base;
}
async function getClientes(){ return await getAll('clientes'); }

// PRODUTOS helpers
async function getProdutos(){ return await getAll('produtos'); }
async function upsertProduto(p){
  p.id = p.id || uuid();
  p.criadoEm = p.criadoEm || todayISO();
  p.atualizadoEm = todayISO();
  await put('produtos', p);
  return p;
}

// NOVO PEDIDO UI
function resetNovoPedidoUI(){
  $('#clienteNome').value=''; $('#clienteTelefone').value=''; $('#clienteEndereco').value=''; $('#pedidoObs').value=''; $('#tipoCliente').value='final';
  $('#itens').innerHTML=''; addItemRow();
  refreshClientesDatalist();
  calcTotal();
}
function addItemRow(data={}){
  const div = document.createElement('div');
  div.className='item';
  div.innerHTML = `
    <div class="row3">
      <div><label>Produto</label><input class="pNome" list="prodList" placeholder="Digite para buscar..."></div>
      <div><label>Qtde</label><input class="pQtd" type="number" min="1" value="${data.qtd||1}"></div>
      <div><label>Preço unit (R$)</label><input class="pPreco" placeholder="0,00"></div>
    </div>
    <datalist id="prodList"></datalist>
    <div class="row">
      <div class="muted">Subtotal: <span class="pSub">R$ 0,00</span></div>
      <div class="right"><button class="bad rem">Remover</button></div>
    </div>
  `;
  div.querySelector('.rem').addEventListener('click', ()=>{ div.remove(); calcTotal(); });
  div.querySelectorAll('.pNome,.pQtd,.pPreco').forEach(inp=>inp.addEventListener('input', ()=>{
    // quando seleciona produto, sugerir preço
    if(inp.classList.contains('pNome')) suggestPrice(div);
    calcRow(div); calcTotal();
  }));
  $('#itens').appendChild(div);
  refreshProdutosDatalist();
}
$('#addItem').addEventListener('click', ()=>addItemRow());

async function refreshClientesDatalist(){
  const tipoSel = $('#tipoCliente').value;
  const c = await getClientes();
  const list = $('#clientesList'); list.innerHTML='';
  c.filter(x=>!tipoSel || x.tipo===tipoSel).forEach(cli=>{
    const o = document.createElement('option'); o.value = cli.nome; o.label = cli.telefone; list.appendChild(o);
  });
}
async function refreshProdutosDatalist(){
  const prods = await getProdutos();
  $$('#prodList').forEach(dl=>{
    dl.innerHTML=''; prods.forEach(p=>{ const o=document.createElement('option'); o.value=p.nome; o.label=p.sku||''; dl.appendChild(o); });
  });
}
$('#tipoCliente').addEventListener('change', ()=>{ refreshClientesDatalist(); $$('#itens .item').forEach(calcRow); calcTotal(); });

async function suggestPrice(row){
  const nome = row.querySelector('.pNome').value.trim().toLowerCase();
  if(!nome) return;
  const prods = await getProdutos();
  const p = prods.find(x=>x.nome.toLowerCase()===nome);
  if(!p) return;
  const tipo = $('#tipoCliente').value;
  const preco = tipo==='final' ? p.precoVendaFinal : (tipo==='distribuicao' ? p.precoVendaDistrib : 0);
  row.querySelector('.pPreco').value = (preco||0).toFixed(2).replace('.',',');
}
function calcRow(row){
  const qtd = Number(row.querySelector('.pQtd').value)||1;
  const preco = parseBR(row.querySelector('.pPreco').value);
  const sub = qtd*preco;
  row.querySelector('.pSub').textContent = fmt(sub);
}
function calcTotal(){
  let tot=0;
  $$('#itens .item').forEach(row=>{
    const qtd = Number(row.querySelector('.pQtd').value)||1;
    const preco = parseBR(row.querySelector('.pPreco').value);
    tot += qtd*preco;
  });
  $('#totalPedido').textContent = tot.toLocaleString('pt-BR',{minimumFractionDigits:2, maximumFractionDigits:2});
  return tot;
}

// SALVAR PEDIDO
$('#salvarPedido').addEventListener('click', async ()=>{
  const tipo = $('#tipoCliente').value;
  const nome = $('#clienteNome').value.trim();
  if(!nome){ alert('Informe o cliente.'); return; }
  // upsert cliente
  const cli = await upsertClienteByNomeTel({nome, telefone: $('#clienteTelefone').value, endereco: $('#clienteEndereco').value, tipo});
  // compor itens
  const prods = await getProdutos();
  let itens = [];
  $$('#itens .item').forEach(row=>{
    const n = row.querySelector('.pNome').value.trim();
    if(!n) return;
    const qtd = Number(row.querySelector('.pQtd').value)||1;
    const preco = parseBR(row.querySelector('.pPreco').value);
    const prod = prods.find(x=>x.nome.toLowerCase()===n.toLowerCase());
    const custoUnit = prod ? (Number(prod.precoCompra||0)+Number(prod.freteUnit||0)+Number(prod.impostosUnit||0)) : 0;
    const regime = (tipo==='representacao')?'representacao':'propria';
    const subtotal = qtd*preco;
    const lucroUnit = regime==='propria' ? (preco - custoUnit) : 0;
    itens.push({
      produtoId: prod?.id||null, nome:n, qtd, precoUnitUsado:preco, custoUnitUsado:custoUnit,
      subtotal, lucroUnit, lucroSubtotal: lucroUnit*qtd
    });
  });
  if(itens.length===0){ alert('Adicione pelo menos 1 item.'); return; }
  const total = itens.reduce((a,b)=>a+b.subtotal,0);
  const lucroTotal = itens.reduce((a,b)=>a+b.lucroSubtotal,0);
  // número do pedido
  const perfil = await loadPerfil()||{prefixo:'MVF-',seq:1};
  const numero = (perfil.prefixo||'MVF-') + String(perfil.seq||1).padStart(4,'0');
  await savePerfil({...perfil, id:'perfil', seq:(Number(perfil.seq||1)+1)});
  const pedido = {
    id: uuid(), numero, dataHora: todayISO(),
    clienteId: cli.id, clienteNome: cli.nome, clienteTelefone: cli.telefone, clienteEndereco: cli.endereco,
    clienteTipo: tipo, itens, total, lucroTotal, margemPct: total? (lucroTotal/total):0,
    observacoes: $('#pedidoObs').value.trim(), regime: (tipo==='representacao')?'representacao':'propria'
  };
  await add('pedidos', pedido);
  alert('Pedido salvo ✓');
  show('pedidos'); renderPedidos();
});
$('#cancelarPedido').addEventListener('click', ()=> resetNovoPedidoUI());

// PEDIDOS LIST + DETALHE
function dateInRange(d, ini, fim){ const x=new Date(d).getTime(); return (!ini || x>=ini) && (!fim || x<=fim); }
function rangeFromPeriodo(sel){
  const now=new Date(); let ini=null,fim=null;
  const t = sel.value;
  if(t==='hoje'){
    ini = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    fim = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23,59,59).getTime();
  } else if(t==='semana'){
    const day = now.getDay(); const diff = (day===0?6:day-1); // segunda=0
    const s = new Date(now); s.setDate(now.getDate()-diff); s.setHours(0,0,0,0);
    const e = new Date(s); e.setDate(s.getDate()+6); e.setHours(23,59,59,999);
    ini=s.getTime(); fim=e.getTime();
  } else if(t==='mes'){
    ini = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    fim = new Date(now.getFullYear(), now.getMonth()+1, 0, 23,59,59).getTime();
  } else if(t==='ano'){
    ini = new Date(now.getFullYear(),0,1).getTime();
    fim = new Date(now.getFullYear(),11,31,23,59,59).getTime();
  }
  return {ini,fim};
}
async function renderPedidos(){
  const cont = $('#listaPedidos'); cont.innerHTML='';
  const all = (await getAll('pedidos')).sort((a,b)=> new Date(b.dataHora)-new Date(a.dataHora));
  let {ini,fim} = rangeFromPeriodo($('#filtroPeriodo'));
  if($('#filtroPeriodo').value==='intervalo'){
    $('#ini').classList.remove('hidden'); $('#fim').classList.remove('hidden');
    const i=$('#ini').value? new Date($('#ini').value).getTime():null;
    const f=$('#fim').value? new Date($('#fim').value).getTime():null;
    ini=i; fim=f? (f+86399999):null;
  } else { $('#ini').classList.add('hidden'); $('#fim').classList.add('hidden'); }
  const lista = all.filter(p=> $('#filtroPeriodo').value==='todos' ? true : dateInRange(p.dataHora, ini, fim));
  for(const p of lista){
    const el = document.createElement('div');
    el.className='item'; const dt = new Date(p.dataHora);
    el.innerHTML = `<div class="row"><div><b>${p.numero}</b> · ${dt.toLocaleString('pt-BR')}</div><div class="right">${fmt(p.total)} · <span class="muted">${p.clienteNome}</span></div></div>`;
    el.addEventListener('click', ()=> openPedidoModal(p));
    cont.appendChild(el);
  }
}
$('#filtroPeriodo').addEventListener('change', renderPedidos);
$('#ini').addEventListener('change', renderPedidos);
$('#fim').addEventListener('change', renderPedidos);

async function openPedidoModal(p){
  const perfil = await loadPerfil()||{};
  const wrap = $('#docPedido');
  const itensRows = p.itens.map(it=>`
    <tr>
      <td>${it.nome}</td><td style="text-align:center">${it.qtd}</td><td style="text-align:right">${fmt(it.precoUnitUsado)}</td><td style="text-align:right">${fmt(it.subtotal)}</td>
    </tr>
  `).join('');
  wrap.innerHTML = `
    <div>
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
        <div>
          <div style="font-weight:800;font-size:18px">${perfil.empresa||perfil.nome||'Emissor'}</div>
          <div class="muted">${perfil.doc||''}</div>
          <div class="muted">${perfil.end||''}</div>
          <div class="muted">${perfil.tel||''} ${perfil.email?('· '+perfil.email):''}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:18px;font-weight:800">Pedido de Venda</div>
          <div>Nº <b>${p.numero}</b></div>
          <div>Emitido em ${new Date(p.dataHora).toLocaleString('pt-BR')}</div>
        </div>
      </div>
      <hr>
      <div><b>Cliente:</b> ${p.clienteNome} · ${p.clienteTelefone||''}</div>
      <div><b>Endereço:</b> ${p.clienteEndereco||''}</div>
      <br>
      <table style="width:100%;border-collapse:collapse">
        <thead><tr>
          <th style="text-align:left;border-bottom:1px solid #374151;padding:6px 0">Item</th>
          <th style="text-align:center;border-bottom:1px solid #374151;padding:6px 0">Qtde</th>
          <th style="text-align:right;border-bottom:1px solid #374151;padding:6px 0">Preço</th>
          <th style="text-align:right;border-bottom:1px solid #374151;padding:6px 0">Subtotal</th>
        </tr></thead>
        <tbody>${itensRows}</tbody>
      </table>
      <div style="text-align:right;margin-top:10px;font-size:16px;font-weight:800">Total: ${fmt(p.total)}</div>
      ${p.observacoes? `<div style="margin-top:8px"><b>Observações:</b> ${p.observacoes}</div>`:''}
      ${perfil.obs? `<div style="margin-top:8px" class="muted">${perfil.obs}</div>`:''}
      <div class="muted" style="margin-top:16px">Gerado por Minhas Vendas Fácil</div>
    </div>
  `;
  $('#modal').classList.remove('hidden');
  $('#btnPrint').onclick = ()=>{ window.print(); };
  $('#btnClose').onclick = ()=> $('#modal').classList.add('hidden');
}

// CLIENTES view
async function renderClientes(){
  const cont = $('#listaClientes'); cont.innerHTML='';
  const busca = ($('#buscaCliente').value||'').toLowerCase();
  const tipo = $('#filtroTipoCliente').value;
  let lista = await getClientes();
  if(tipo) lista = lista.filter(c=>c.tipo===tipo);
  if(busca) lista = lista.filter(c=> [c.nome,c.telefone,c.endereco].join(' ').toLowerCase().includes(busca));
  // pedidos por cliente
  const pedidos = await getAll('pedidos');
  lista.sort((a,b)=> (a.nome||'').localeCompare(b.nome||''));
  for(const c of lista){
    const hist = pedidos.filter(p=>p.clienteId===c.id).sort((a,b)=> new Date(b.dataHora)-new Date(a.dataHora));
    const ultima = hist[0];
    const el = document.createElement('div');
    el.className='item';
    el.innerHTML = `
      <div class="row">
        <div><b>${c.nome}</b> · <span class="muted">${c.tipo}</span></div>
        <div class="right muted">${c.telefone||''}</div>
      </div>
      <div class="muted">${c.endereco||''}</div>
      <div class="muted">Última compra: ${ultima? (new Date(ultima.dataHora).toLocaleString('pt-BR')+' · '+fmt(ultima.total)) : '—'}</div>
      <div class="list">${hist.map(p=>`<div>• ${new Date(p.dataHora).toLocaleDateString('pt-BR')} — <b>${p.numero}</b> — ${fmt(p.total)}</div>`).join('')}</div>
    `;
    cont.appendChild(el);
  }
}
$('#buscaCliente').addEventListener('input', renderClientes);
$('#filtroTipoCliente').addEventListener('change', renderClientes);

// PRODUTOS view
async function renderProdutos(){
  const cont = $('#listaProdutos'); cont.innerHTML='';
  const busca = ($('#buscaProduto').value||'').toLowerCase();
  let lista = await getProdutos();
  if(busca) lista = lista.filter(p=> [p.nome,p.sku].join(' ').toLowerCase().includes(busca));
  lista.sort((a,b)=> (a.nome||'').localeCompare(b.nome||''));
  for(const p of lista){
    const custo = Number(p.precoCompra||0)+Number(p.freteUnit||0)+Number(p.impostosUnit||0);
    const lucroF = (p.precoVendaFinal||0)-custo;
    const lucroD = (p.precoVendaDistrib||0)-custo;
    const el = document.createElement('div');
    el.className='item';
    el.innerHTML = `
      <div class="row">
        <div><b>${p.nome}</b> ${p.sku?`· <span class="muted">${p.sku}</span>`:''}</div>
        <div class="right muted">${p.ativo===false?'Inativo':'Ativo'}</div>
      </div>
      <div class="row4">
        <div>Custo: <b>${fmt(custo)}</b></div>
        <div>PV Final: <b>${fmt(p.precoVendaFinal||0)}</b></div>
        <div>PV Distrib: <b>${fmt(p.precoVendaDistrib||0)}</b></div>
        <div>Lucro F/D: <b>${fmt(lucroF)}</b> / <b>${fmt(lucroD)}</b></div>
      </div>
    `;
    cont.appendChild(el);
  }
}
$('#buscaProduto').addEventListener('input', renderProdutos);

// RECEITAS
async function renderReceitas(){
  const painel = $('#painelReceitas'); painel.innerHTML='';
  const all = await getAll('pedidos');
  let {ini,fim} = rangeFromPeriodo($('#recPeriodo'));
  if($('#recPeriodo').value==='intervalo'){
    $('#recIni').classList.remove('hidden'); $('#recFim').classList.remove('hidden');
    const i=$('#recIni').value? new Date($('#recIni').value).getTime():null;
    const f=$('#recFim').value? new Date($('#recFim').value).getTime():null;
    ini=i; fim=f? (f+86399999):null;
  } else { $('#recIni').classList.add('hidden'); $('#recFim').classList.add('hidden'); }
  const tipo = $('#recTipo').value;
  const lista = all.filter(p => {
    const okData = ($('#recPeriodo').value==='todos')? true : dateInRange(p.dataHora,ini,fim);
    const okTipo = tipo? (p.clienteTipo===tipo) : true;
    return okData && okTipo;
  });
  // agregados
  let faturamento=0,custo=0,lucro=0,itens=0;
  for(const p of lista){
    faturamento += p.total;
    itens += p.itens.reduce((a,b)=>a+b.qtd,0);
    // custo só se regime propria
    if(p.regime==='propria'){
      custo += p.itens.reduce((a,b)=> a + (b.custoUnitUsado*b.qtd), 0);
      lucro += p.lucroTotal;
    }
  }
  const margem = faturamento? (lucro/faturamento):0;
  const card = document.createElement('div');
  card.className='item';
  card.innerHTML = `
    <div class="row4">
      <div>Faturamento: <b>${fmt(faturamento)}</b></div>
      <div>Custo: <b>${fmt(custo)}</b></div>
      <div>Lucro bruto: <b>${fmt(lucro)}</b> <span class="muted">(${(margem*100).toFixed(1)}%)</span></div>
      <div>Itens vendidos: <b>${itens}</b></div>
    </div>
  `;
  painel.appendChild(card);
  // tabela por pedido
  for(const p of lista.sort((a,b)=> new Date(b.dataHora)-new Date(a.dataHora))){
    const el = document.createElement('div');
    el.className='item';
    el.innerHTML = `<div class="row">
      <div><b>${p.numero}</b> · ${new Date(p.dataHora).toLocaleString('pt-BR')} · <span class="muted">${p.clienteNome} (${p.clienteTipo})</span></div>
      <div class="right">${fmt(p.total)} ${p.regime==='propria'?`· <span class="muted">Lucro ${fmt(p.lucroTotal)} (${(p.margemPct*100).toFixed(1)}%)</span>`:`· <span class="muted">Representação</span>`}</div>
    </div>`;
    painel.appendChild(el);
  }
}
$('#recPeriodo').addEventListener('change', renderReceitas);
$('#recIni').addEventListener('change', renderReceitas);
$('#recFim').addEventListener('change', renderReceitas);
$('#recTipo').addEventListener('change', renderReceitas);

// DESPESAS (mínimo viável)
$('#novaDespesaBtn')?.addEventListener('click', async ()=>{
  const valor = prompt('Valor da despesa (R$):','0,00');
  if(valor==null) return;
  const cat = prompt('Categoria (Presente/Degustação/Frete/Outras):','Outras')||'Outras';
  const obs = prompt('Observação:','')||'';
  await add('despesas',{id:uuid(), data: todayISO(), categoria:cat, valor: parseBR(valor), obs});
  renderDespesas();
});
async function renderDespesas(){
  const cont = $('#listaDespesas'); cont.innerHTML='';
  const lista = (await getAll('despesas')).sort((a,b)=> new Date(b.data)-new Date(a.data));
  let total = 0;
  for(const d of lista){
    total += d.valor||0;
    const el = document.createElement('div');
    el.className='item';
    el.innerHTML = `<div class="row"><div>${new Date(d.data).toLocaleString('pt-BR')} · <b>${d.categoria}</b></div><div class="right">${fmt(d.valor)}</div></div><div class="muted">${d.obs||''}</div>`;
    cont.appendChild(el);
  }
  const foot = document.createElement('div');
  foot.className='item'; foot.innerHTML = `<b>Total despesas:</b> ${fmt(total)}`;
  cont.prepend(foot);
}

// AGENDA (mínimo viável)
$('#novoCompromissoBtn')?.addEventListener('click', async ()=>{
  const tipo = prompt('Tipo (Visita/Entrega):','Visita')||'Visita';
  const quando = prompt('Data e hora (YYYY-MM-DD HH:MM):','')||'';
  const cliente = prompt('Cliente (nome):','')||'';
  await add('agenda',{id:uuid(), tipo, quando, cliente, status:'Planejado'});
  renderAgenda();
});
async function renderAgenda(){
  const cont = $('#listaAgenda'); cont.innerHTML='';
  const lista = (await getAll('agenda')).sort((a,b)=> new Date(a.quando)-new Date(b.quando));
  for(const a of lista){
    const el = document.createElement('div'); el.className='item';
    el.innerHTML = `<div class="row"><div><b>${a.tipo}</b> · ${a.cliente||''}</div><div class="right">${new Date(a.quando).toLocaleString('pt-BR')}</div></div><div class="muted">${a.status}</div>`;
    cont.appendChild(el);
  }
}

// PROSPECTS / GEO
$('#salvarPonto')?.addEventListener('click', ()=>{
  if(!navigator.geolocation){ alert('Geolocalização não suportada.'); return; }
  navigator.geolocation.getCurrentPosition(async pos=>{
    const lat = pos.coords.latitude, lng = pos.coords.longitude;
    const nome = prompt('Nome do local/cliente (opcional):','')||'';
    const obs = prompt('Observação (opcional):','')||'';
    await add('prospects',{id:uuid(), nome, lat, lng, observacao:obs, criadoEm: todayISO()});
    alert('Prospect salvo ✓'); renderProspects();
  }, err=> alert('Falha ao obter localização: '+err.message), {enableHighAccuracy:true,timeout:8000});
});
async function renderProspects(){
  const cont = $('#listaProspects'); cont.innerHTML='';
  const lista = (await getAll('prospects')).sort((a,b)=> new Date(b.criadoEm)-new Date(a.criadoEm));
  for(const p of lista){
    const el = document.createElement('div'); el.className='item';
    const maps = `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`;
    el.innerHTML = `<div class="row"><div><b>${p.nome||'Sem nome'}</b></div><div class="right muted">${new Date(p.criadoEm).toLocaleString('pt-BR')}</div></div>
    <div class="muted">Lat/Lng: ${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}</div>
    <div class="toolbar"><a class="btn" href="${maps}" target="_blank">Abrir no Maps</a></div>`;
    cont.appendChild(el);
  }
}

// CATALOGOS
async function renderCatalogos(){
  const wrap = $('#catalogoWrap'); wrap.innerHTML='';
  const modo = $('#modoCatalogo').value;
  const prods = await getProdutos();
  if(modo==='sistema'){
    for(const p of prods){
      const custo = Number(p.precoCompra||0)+Number(p.freteUnit||0)+Number(p.impostosUnit||0);
      const lucroF=(p.precoVendaFinal||0)-custo, lucroD=(p.precoVendaDistrib||0)-custo;
      const el=document.createElement('div'); el.className='item';
      el.innerHTML = `<div class="row"><div><b>${p.nome}</b></div><div class="right muted">${p.sku||''}</div></div>
      <div class="row4">
        <div>Compra: <b>${fmt(p.precoCompra||0)}</b></div>
        <div>Frete: <b>${fmt(p.freteUnit||0)}</b></div>
        <div>Impostos: <b>${fmt(p.impostosUnit||0)}</b></div>
        <div>Custo: <b>${fmt(custo)}</b></div>
      </div>
      <div class="row4">
        <div>PV Final: <b>${fmt(p.precoVendaFinal||0)}</b></div>
        <div>PV Distrib: <b>${fmt(p.precoVendaDistrib||0)}</b></div>
        <div>Lucro F: <b>${fmt(lucroF)}</b></div>
        <div>Lucro D: <b>${fmt(lucroD)}</b></div>
      </div>`;
      wrap.appendChild(el);
    }
  } else {
    for(const p of prods){
      const preco = (modo==='final')? (p.precoVendaFinal||0) : (p.precoVendaDistrib||0);
      const el=document.createElement('div'); el.className='item';
      el.innerHTML = `<div class="row"><div><b>${p.nome}</b></div><div class="right"><b>${fmt(preco)}</b></div></div>`;
      wrap.appendChild(el);
    }
  }
}
$('#modoCatalogo').addEventListener('change', renderCatalogos);

// NOVO CLIENTE / PRODUTO (diálogos simples para MVP)
$('#novoClienteBtn')?.addEventListener('click', async ()=>{
  const nome = prompt('Nome do cliente:','')||'';
  const tipo = prompt('Tipo (final/distribuicao/representacao):','final')||'final';
  const tel = prompt('Telefone:','')||'';
  const end = prompt('Endereço:','')||'';
  if(!nome) return;
  await upsertClienteByNomeTel({nome, telefone:tel, endereco:end, tipo});
  renderClientes(); refreshClientesDatalist();
});
$('#novoProdutoBtn')?.addEventListener('click', async ()=>{
  const nome = prompt('Nome do produto:','')||''; if(!nome) return;
  const sku = prompt('SKU/Ref (opcional):','')||'';
  const compra = parseBR(prompt('Preço de compra (R$):','0,00'));
  const frete = parseBR(prompt('Frete unitário (R$):','0,00'));
  const imp = parseBR(prompt('Impostos unitários (R$):','0,00'));
  const pvf = parseBR(prompt('Preço venda FINAL (R$):','0,00'));
  const pvd = parseBR(prompt('Preço venda DISTRIB (R$):','0,00'));
  await upsertProduto({nome, sku, precoCompra:compra, freteUnit:frete, impostosUnit:imp, precoVendaFinal:pvf, precoVendaDistrib:pvd, ativo:true});
  renderProdutos(); renderCatalogos();
});

// INIT
openDB().then(()=>{
  show('home');
});

// --- Fechar modal de detalhe do pedido ---
document.addEventListener("DOMContentLoaded", function() {
    const fecharBtn = document.getElementById("btnFecharDetalhe");
    if (fecharBtn) {
        fecharBtn.addEventListener("click", function() {
            const modal = document.getElementById("detalhePedidoModal");
            if (modal) {
                modal.style.display = "none";
            }
        });
    }
});

