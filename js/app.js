// Логика конфигуратора: шаги, выбор опций, пересчёт цены, связь с 3D.
import { Viewer } from './viewer.js';

// Другая машина — отдельный файл в data/ и ссылка вида ?car=имя-файла
const carParam = new URLSearchParams(location.search).get('car');
const DATA_URL = `data/${/^[a-z0-9-]+$/.test(carParam ?? '') ? carParam : 'zeekr-8x'}.json`;

const $ = s => document.querySelector(s);
const el = (tag, cls, html) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
};

let data, viewer, fmt;
let current = 0;
const state = {};   // stepId → id опции (single) или Set id (multi)

// Шаги, которые красят 3D-модель: stepId → группа в model.targets
const MATERIAL_STEPS = { paint: 'paint', rims: 'rims', interior: 'interior' };

init();

async function init() {
  data = await fetch(DATA_URL).then(r => r.json());
  fmt = new Intl.NumberFormat(data.locale, { maximumFractionDigits: 0 });
  document.title = `${data.title} — ${data.subtitle}`;
  $('#car-title').textContent = data.title;
  if (data.model.demoNotice) {
    $('#demo-notice').textContent = data.model.demoNotice;
    $('#demo-notice').hidden = false;
  }

  for (const step of data.steps) {
    state[step.id] = step.type === 'multi'
      ? new Set(step.options.filter(o => o.default).map(o => o.id))
      : (step.options.find(o => o.default) ?? step.options[0]).id;
  }

  applyUrlParams();

  renderTabs();
  renderStep();
  renderTotal();

  viewer = new Viewer($('#stage'), data.model);
  updatePano();
  $('#view-ext').onclick = () => setView('exterior');
  $('#view-int').onclick = () => setView('interior');
  try {
    await viewer.load(p => { $('#loader-bar').style.width = `${Math.round(p * 100)}%`; });
    for (const stepId of Object.keys(MATERIAL_STEPS)) applyMaterial(stepId);
    updatePano();
    $('#loader').classList.add('done');
  } catch (e) {
    console.error(e);
    $('#loader').innerHTML = '<p>Не удалось загрузить 3D-модель</p>';
  }
}

// Переход со страницы /showroom/: конфигуратор без фона, в цвете выбранной машины, с кнопкой назад.
function applyUrlParams() {
  const q = new URLSearchParams(location.search);
  if (!q.has('plain')) return;
  delete data.model.stage;
  document.body.classList.add('plain');
  const paint = data.steps.find(s => s.id === 'paint');
  const id = q.get('paint');
  if (paint && id) {
    const extra = data.showroom?.cars.find(c => c.id === id && c.color);
    if (extra && !option(paint, id)) paint.options.push(extra);
    if (option(paint, id)) state.paint = id;
  }
  if (q.get('back') === 'showroom') {
    const a = el('a', 'back-link', '← Назад к машинам');
    a.href = 'showroom/';
    $('#car-title').before(a);
  }
}

const money = n => `${fmt.format(Math.round(n))} ${data.currency}`;
const withVat = n => n * (1 + data.vat);
const option = (step, id) => step.options.find(o => o.id === id);

function selected(step) {
  const v = state[step.id];
  return step.type === 'multi' ? step.options.filter(o => v.has(o.id)) : [option(step, v)];
}

function netTotal() {
  return data.steps.reduce((sum, s) => sum + selected(s).reduce((a, o) => a + (o.price || 0), 0), 0);
}

// ---------- Вкладки шагов ----------
function renderTabs() {
  const nav = $('#steps');
  nav.innerHTML = '';
  data.steps.forEach((step, i) => {
    const count = step.type === 'multi' ? state[step.id].size : 0;
    const b = el('button', 'tab' + (i === current ? ' active' : '') + (i < current ? ' passed' : ''),
      `<span class="num">${i + 1}</span><span class="label">${step.title}</span>` +
      (count ? `<span class="badge">${count}</span>` : ''));
    b.onclick = () => go(i);
    nav.appendChild(b);
  });
  nav.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
}

function go(i) {
  current = Math.max(0, Math.min(data.steps.length - 1, i));
  renderTabs();
  renderStep();
  const view = data.steps[current].view;
  // Камеру двигаем только при смене вида, чтобы не сбрасывать поворот, который выбрал пользователь.
  if (view && viewer && viewer.view !== view) setView(view);
}

function setView(name) {
  viewer.applyView(name);
  const inside = data.model.views[name]?.inside ?? name === 'interior';
  $('#view-ext').classList.toggle('active', !inside);
  $('#view-int').classList.toggle('active', inside);
  updatePano();
}

// Панорама салона зависит от выбранного экрана; если выбран другой цвет салона, честно подписываем.
function updatePano() {
  const p = data.model.pano;
  if (!p || !viewer) return;
  viewer.setPano(p.dirs[state[p.step]] ?? Object.values(p.dirs)[0]);
  const other = Object.entries(p.matches ?? {}).some(([k, v]) => state[k] !== v);
  const note = $('#demo-notice');
  note.textContent = p.note ?? '';
  note.hidden = !(viewer.inside && other && p.note);
}

// ---------- Содержимое шага ----------
function renderStep() {
  const step = data.steps[current];
  const box = $('#options');
  box.innerHTML = '';
  box.appendChild(el('h2', 'step-title', step.title));

  if (step.id === 'paint' || step.id === 'interior') {
    const sel = option(step, state[step.id]);
    box.appendChild(el('p', 'step-sub', `${sel.name}${sel.price ? ' · +' + money(sel.price) : ''}`));
    const row = el('div', 'swatches');
    for (const o of step.options) {
      const sw = el('button', 'swatch' + (o.id === state[step.id] ? ' on' : ''));
      sw.title = o.name;
      sw.style.background = o.swatch
        ? `linear-gradient(135deg, ${o.swatch[0]} 50%, ${o.swatch[1]} 50%)`
        : o.color;
      sw.onclick = () => pick(step, o.id);
      row.appendChild(sw);
    }
    box.appendChild(row);
  }

  const list = el('div', 'cards');
  for (const o of step.options) {
    const on = step.type === 'multi' ? state[step.id].has(o.id) : state[step.id] === o.id;
    const card = el('button', 'card' + (on ? ' on' : '') + (step.type === 'multi' ? ' multi' : ''));
    const dot = o.color
      ? `<span class="dot" style="background:${o.swatch ? `linear-gradient(135deg, ${o.swatch[0]} 50%, ${o.swatch[1]} 50%)` : o.color}"></span>`
      : `<span class="check"></span>`;
    const price = step.id === 'edition'
      ? money(withVat(o.price))
      : o.price ? `+${money(o.price)}` : step.id === 'payment' ? '' : 'Включено';
    // Фото опции: поле "image" в данных, путь вида assets/options/имя.webp
    const thumb = o.image ? `<img class="thumb" src="${o.image}" alt="" loading="lazy">` : '';
    card.innerHTML = `
      ${dot}
      ${thumb}
      <span class="card-body">
        <span class="card-name">${o.name}</span>
        ${o.note ? `<span class="card-note">${o.note}</span>` : ''}
      </span>
      <span class="card-price">${price}</span>`;
    card.onclick = () => pick(step, o.id);
    list.appendChild(card);

    if (o.specs && on) {
      const specs = el('div', 'specs');
      for (const s of o.specs) specs.appendChild(el('div', 'spec', `<b>${s.value}</b><span>${s.label}</span>`));
      list.appendChild(specs);
    }
  }
  box.appendChild(list);

  if (step.id === 'payment') box.appendChild(paymentBlock());

  $('#prev').disabled = current === 0;
  $('#next').textContent = current === data.steps.length - 1 ? 'Оставить заявку' : 'Далее';
}

function pick(step, id) {
  if (step.type === 'multi') {
    const s = state[step.id];
    s.has(id) ? s.delete(id) : s.add(id);
  } else {
    state[step.id] = id;
    if (MATERIAL_STEPS[step.id]) applyMaterial(step.id);
    updatePano();
  }
  renderTabs();
  renderStep();
  renderTotal();
}

function applyMaterial(stepId) {
  const step = data.steps.find(s => s.id === stepId);
  if (!step || !viewer) return;
  const o = option(step, state[stepId]);
  viewer.setMaterial(MATERIAL_STEPS[stepId], o);
}

// ---------- Оплата и итог ----------
function creditInfo() {
  const pay = data.steps.find(s => s.id === 'payment');
  const c = pay && option(pay, state.payment)?.credit;
  if (!c) return null;
  const total = withVat(netTotal());
  const down = total * c.downPayment;
  const r = c.rate / 12;
  const monthly = (total - down) * r / (1 - Math.pow(1 + r, -c.months));
  return { down, monthly, months: c.months };
}

function paymentBlock() {
  const c = creditInfo();
  if (!c) return el('div');
  return el('div', 'credit',
    `<div><span>Первый взнос</span><b>${money(c.down)}</b></div>
     <div><span>Ежемесячно, ${c.months} мес.</span><b>${money(c.monthly)}</b></div>
     <p>Расчёт предварительный, точные условия — у банка-партнёра.</p>`);
}

function renderTotal() {
  const total = withVat(netTotal());
  const c = creditInfo();
  $('#total-label').textContent = c ? 'Итого · кредит' : 'Итого · полная оплата';
  $('#total').textContent = c ? `${money(c.monthly)} / мес.` : money(total);
  $('#total-vat').textContent = c ? `стоимость ${money(total)}, ${data.vatLabel}` : data.vatLabel;
  const ed = selected(data.steps[0])[0];
  $('#edition-line').textContent = `${ed.name} · ${money(total)}`;
  renderSummary();
}

function renderSummary() {
  const box = $('#summary-list');
  box.innerHTML = '';
  for (const step of data.steps) {
    const items = selected(step);
    if (!items.length) continue;
    box.appendChild(el('dt', null, step.title));
    for (const o of items) {
      const price = step.id === 'edition' ? money(o.price) : o.price ? `+${money(o.price)}` : '';
      box.appendChild(el('dd', null, `<span>${o.name}</span><span>${price}</span>`));
    }
  }
}

$('#prev').onclick = () => go(current - 1);
$('#next').onclick = () => current === data.steps.length - 1 ? openLead() : go(current + 1);
$('#summary-toggle').onclick = () => $('#summary').classList.toggle('open');

// ---------- Заявка ----------
// Отправка пока не подключена: здесь собирается вся конфигурация, её останется передать в CRM / Telegram / почту.
function openLead() {
  $('#lead').showModal();
}

$('#lead-form').onsubmit = e => {
  e.preventDefault();
  const form = Object.fromEntries(new FormData(e.target));
  const config = Object.fromEntries(data.steps.map(s => [s.id, selected(s).map(o => o.name)]));
  const payload = { car: data.title, ...form, config, total: Math.round(withVat(netTotal())) };
  console.log('Заявка:', payload);
  e.target.innerHTML = '<h3>Спасибо!</h3><p>Менеджер свяжется с вами в ближайшее время.</p><button type="button" class="btn" onclick="this.closest(\'dialog\').close()">Закрыть</button>';
};
