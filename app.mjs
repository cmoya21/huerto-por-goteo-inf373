import { DEFAULT_PARAMS, simulate } from './math.mjs';

const byId = id => document.getElementById(id);
const form = byId('config');
const parameterKeys = Object.keys(DEFAULT_PARAMS);
const generalFormat = new Intl.NumberFormat('es-BO', { maximumSignificantDigits: 7 });
const scientificFormat = new Intl.NumberFormat('es-BO', { notation: 'scientific', maximumSignificantDigits: 5 });
const shortFormat = new Intl.NumberFormat('es-BO', { maximumSignificantDigits: 4 });
const color = { exact: '#244734', heun: '#a8472d', rk4: '#315982', goal: '#707965' };
const svgns = 'http://www.w3.org/2000/svg';
let result;
let meshName = 'primary';

function number(value) {
  if (!Number.isFinite(value)) return '—';
  if (value !== 0 && (Math.abs(value) < 0.0001 || Math.abs(value) > 9999999)) return scientificFormat.format(value);
  return generalFormat.format(value);
}

function tickNumber(value) {
  if (value !== 0 && (Math.abs(value) < 0.001 || Math.abs(value) >= 10000)) return scientificFormat.format(value);
  return shortFormat.format(value);
}

function svg(tag, attributes = {}, text) {
  const element = document.createElementNS(svgns, tag);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  if (text !== undefined) element.textContent = text;
  return element;
}

function plotFrame(chart, maxTime, maxValue, yTitle) {
  const { width, height } = chart.viewBox.baseVal;
  const plot = { left: 78, top: 34, right: width - 25, bottom: height - 46 };
  const pw = plot.right - plot.left;
  const ph = plot.bottom - plot.top;
  const x = t => plot.left + (t / maxTime) * pw;
  const y = v => plot.bottom - (v / maxValue) * ph;
  chart.replaceChildren();
  for (let i = 0; i <= 5; i++) {
    const fraction = i / 5;
    const axisX = x(maxTime * fraction);
    const axisY = y(maxValue * fraction);
    chart.append(
      svg('line', { x1: axisX, y1: plot.top, x2: axisX, y2: plot.bottom, class: 'gridline' }),
      svg('line', { x1: plot.left, y1: axisY, x2: plot.right, y2: axisY, class: 'gridline' }),
      svg('text', { x: axisX, y: plot.bottom + 19, 'text-anchor': 'middle', class: 'axistext' }, tickNumber(maxTime * fraction)),
      svg('text', { x: plot.left - 8, y: axisY + 4, 'text-anchor': 'end', class: 'axistext' }, tickNumber(maxValue * fraction)),
    );
  }
  chart.append(
    svg('path', { d: 'M' + plot.left + ',' + plot.top + ' V' + plot.bottom + ' H' + plot.right, class: 'axis', fill: 'none' }),
    svg('text', { x: plot.left, y: plot.top - 12, class: 'axislabel' }, yTitle),
    svg('text', { x: plot.right, y: height - 9, 'text-anchor': 'end', class: 'axislabel' }, 'Tiempo (h)'),
  );
  const clipId = chart.id + '-area';
  const defs = svg('defs');
  const clip = svg('clipPath', { id: clipId });
  clip.append(svg('rect', { x: plot.left - 4, y: plot.top - 4, width: pw + 8, height: ph + 8 }));
  defs.append(clip);
  const layer = svg('g', { 'clip-path': 'url(#' + clipId + ')' });
  chart.append(defs, layer);
  return { x, y, layer };
}

function trace(frame, points, style) {
  let path = '';
  let draw = false;
  for (const [t, v] of points) {
    if (!Number.isFinite(v)) {
      draw = false;
      continue;
    }
    const sx = frame.x(t);
    const sy = Math.max(-1e7, Math.min(1e7, frame.y(v)));
    path += (draw ? 'L' : 'M') + sx.toFixed(2) + ' ' + sy.toFixed(2);
    draw = true;
  }
  frame.layer.append(svg('path', {
    d: path, fill: 'none', stroke: style.stroke, 'stroke-width': style.width ?? 2.1,
    'stroke-dasharray': style.dash ?? '', 'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }));
  if (!style.mark) return;
  const stride = Math.max(1, Math.ceil(points.length / 140));
  points.forEach(([t, value], index) => {
    if ((index % stride !== 0 && index !== points.length - 1) || !Number.isFinite(value)) return;
    const sx = frame.x(t);
    const sy = frame.y(value);
    if (!Number.isFinite(sy) || Math.abs(sy) > 1e7) return;
    const mark = style.mark === 'square'
      ? svg('rect', { x: sx - 2.5, y: sy - 2.5, width: 5, height: 5, fill: '#fffdf6', stroke: style.stroke, 'stroke-width': 1.4 })
      : svg('circle', { cx: sx, cy: sy, r: 2.5, fill: style.stroke });
    frame.layer.append(mark);
  });
}

function drawCharts() {
  const mesh = result[meshName];
  const p = result.params;
  const reserve = byId('curve-chart');
  const shown = plotFrame(reserve, p.T, p.C, 'Reserva (L)');
  trace(shown, [[0, p.target], [p.T, p.target]], { stroke: color.goal, dash: '3 5', width: 1.4 });
  trace(shown, Array.from({ length: 181 }, (_, i) => {
    const t = p.T * (i / 180);
    return [t, result.exact(t)];
  }), { stroke: color.exact, width: 2.8 });
  trace(shown, mesh.rows.map(row => [row.t, row.heun]), { stroke: color.heun, dash: '8 5', mark: 'circle' });
  trace(shown, mesh.rows.map(row => [row.t, row.rk4]), { stroke: color.rk4, dash: '2 4', mark: 'square' });

  const maxErrors = mesh.rows.flatMap(row => [row.heunAbs, row.rk4Abs]).filter(Number.isFinite);
  const highest = Math.max(0, ...maxErrors);
  const errorLimit = highest === 0 ? 1 : highest * (highest > Number.MAX_VALUE / 1.1 ? 1 : 1.1);
  const errorPlot = plotFrame(byId('error-chart'), p.T, errorLimit, 'Error absoluto (L)');
  trace(errorPlot, mesh.rows.map(row => [row.t, row.heunAbs]), { stroke: color.heun, dash: '8 5', mark: 'circle' });
  trace(errorPlot, mesh.rows.map(row => [row.t, row.rk4Abs]), { stroke: color.rk4, dash: '2 4', mark: 'square' });

  reserve.setAttribute('aria-label', 'Reserva en litros de 0 a ' + number(p.T) + ' horas. Paso de ' + number(mesh.h) + ' horas. El eje vertical cubre de 0 a ' + number(p.C) + ' litros.');
  byId('error-chart').setAttribute('aria-label', 'Error absoluto en litros. Con paso de ' + number(mesh.h) + ' horas, el máximo es ' + number(mesh.maxError.heun) + ' para Heun y ' + number(mesh.maxError.rk4) + ' para RK4.');
  for (const button of byId('mesh-controls').querySelectorAll('button')) {
    button.setAttribute('aria-pressed', String(button.dataset.mesh === meshName));
  }
}

function renderResult() {
  const { params, threshold, equilibrium, primary, refined } = result;
  let headline = number(primary.end.exact) + ' L';
  let label = 'Reserva exacta al final del ensayo';
  if (threshold.status === 'initial' || threshold.status === 'reached') {
    headline = number(threshold.time) + ' h';
    label = threshold.status === 'initial' ? 'La meta ya se cumple al comenzar' : 'Tiempo exacto para llegar a la meta';
  }
  const metrics = [
    ['Reserva a las ' + number(params.T) + ' h', number(primary.end.exact) + ' L'],
    ['Reserva de equilibrio', equilibrium === null ? 'No es única' : number(equilibrium) + ' L'],
  ];
  byId('result').innerHTML = '<p class="small-heading">Lectura del ensayo</p>'
    + '<p class="key-number">' + headline + '</p><p class="key-label">' + label + '</p>'
    + '<p class="result-message">' + result.summary + '</p><dl>'
    + metrics.map(([term, value]) => '<div><dt>' + term + '</dt><dd>' + value + '</dd></div>').join('') + '</dl>';
  const warningBox = byId('warnings');
  const warnings = [...result.warnings];
  if ([primary, refined].some(mesh => Object.values(mesh.outsidePhysical).some(Boolean))) {
    warnings.push('La gráfica de reserva muestra solo el rango físico de 0 a C. Consulta la tabla para ver las aproximaciones fuera de ese rango.');
  }
  warningBox.hidden = warnings.length === 0;
  warningBox.replaceChildren();
  if (warnings.length) {
    const title = document.createElement('p');
    title.textContent = 'Notas sobre esta simulación';
    const list = document.createElement('ul');
    for (const warning of warnings) {
      const item = document.createElement('li');
      item.textContent = warning;
      list.append(item);
    }
    warningBox.append(title, list);
  }
}

function compareMesh(mesh) {
  const { heun, rk4 } = mesh.maxError;
  if (!Number.isFinite(heun) || !Number.isFinite(rk4)) return null;
  return heun === rk4 ? 'tie' : heun > rk4 ? 'RK4' : 'Heun';
}

function describeAccuracy() {
  const first = compareMesh(result.primary);
  const second = compareMesh(result.refined);
  if (!first || !second) return 'Hay resultados que se desbordan. Reduce el paso antes de comparar los métodos.';
  if (first === 'tie' && second === 'tie') return 'En estas mallas los dos métodos obtuvieron el mismo error máximo.';
  if (first === second) return first + ' produjo el menor error absoluto máximo en las dos mallas de este ensayo.';
  return 'El método con menor error absoluto máximo cambia entre las dos mallas. Compáralas con las mismas entradas.';
}

function describeRefinement() {
  const changes = ['heun', 'rk4'].map(method => {
    const a = result.primary.maxError[method];
    const b = result.refined.maxError[method];
    return Number.isFinite(a) && Number.isFinite(b) ? Math.sign(b - a) : null;
  });
  if (changes.every(x => x === -1)) return 'Al reducir el paso a la mitad bajó el error máximo de ambos métodos.';
  if (changes.every(x => x === 0)) return 'Al reducir el paso, el error máximo se mantuvo en los dos métodos.';
  return 'El efecto de reducir el paso se lee por método en la tabla.';
}

function renderErrorSummary() {
  const { primary, refined } = result;
  byId('error-summary').innerHTML = '<table aria-label="Error absoluto máximo en litros"><thead><tr>'
    + '<th scope="col">Paso</th><th scope="col">Heun (L)</th><th scope="col">RK4 (L)</th></tr></thead><tbody>'
    + [primary, refined].map(mesh => '<tr><th scope="row">' + number(mesh.h) + ' h</th><td>'
      + number(mesh.maxError.heun) + '</td><td>' + number(mesh.maxError.rk4) + '</td></tr>').join('')
    + '</tbody></table><p><strong>Error máximo en la malla.</strong> ' + describeRefinement()
    + '</p><p>' + describeAccuracy() + '</p>';
}

function meshTable(mesh, open, name) {
  const details = document.createElement('details');
  details.open = open;
  const pageSize = 12;
  let page = 0;
  const pageCount = Math.ceil(mesh.rows.length / pageSize);
  const short = mesh.shortened ? ' · último paso ajustado' : '';
  details.innerHTML = '<summary>' + name + ' · paso ' + number(mesh.h) + ' h'
    + '<span>' + (mesh.rows.length - 1) + ' pasos' + short + '</span></summary>'
    + '<div class="table-scroll"><table class="iterations" aria-label="' + name + '"><thead><tr>'
    + ['n', 't (h)', 'Δt (h)', 'Analítica (L)', 'Heun (L)', 'RK4 (L)', 'Abs. Heun (L)', 'Rel. Heun (%)', 'Abs. RK4 (L)', 'Rel. RK4 (%)']
      .map(label => '<th scope="col">' + label + '</th>').join('') + '</tr></thead><tbody></tbody></table></div>';
  function renderPage() {
    const pageStart = page * pageSize;
    details.querySelector('tbody').innerHTML = mesh.rows.slice(pageStart, pageStart + pageSize).map(row => '<tr>'
      + [row.n, row.t, row.step, row.exact, row.heun, row.rk4, row.heunAbs, row.heunPct, row.rk4Abs, row.rk4Pct]
        .map(value => '<td>' + number(value) + '</td>').join('') + '</tr>').join('');
    const pager = details.querySelector('.pager');
    if (pager) {
      pager.children[0].disabled = page === 0;
      pager.children[1].textContent = 'Página ' + (page + 1) + ' de ' + pageCount;
      pager.children[2].disabled = page === pageCount - 1;
    }
  }
  if (pageCount > 1) {
    const pager = document.createElement('div');
    pager.className = 'pager';
    pager.innerHTML = '<button type="button">Anterior</button><span aria-live="polite"></span><button type="button">Siguiente</button>';
    pager.children[0].addEventListener('click', () => { page--; renderPage(); });
    pager.children[2].addEventListener('click', () => { page++; renderPage(); });
    details.append(pager);
  }
  renderPage();
  return details;
}

function render() {
  renderResult();
  const controls = byId('mesh-controls');
  controls.replaceChildren();
  for (const name of ['primary', 'refined']) {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.mesh = name;
    button.textContent = 'h = ' + number(result[name].h) + ' h';
    button.addEventListener('click', () => {
      meshName = name;
      drawCharts();
    });
    controls.append(button);
  }
  drawCharts();
  renderErrorSummary();
  byId('step-tables').replaceChildren(meshTable(result.primary, true, 'Malla inicial'), meshTable(result.refined, false, 'Malla refinada'));
}

function apply() {
  const error = byId('error');
  error.hidden = true;
  try {
    const inputs = Object.fromEntries(parameterKeys.map(key => [key, form.elements.namedItem(key).valueAsNumber]));
    result = simulate(inputs);
    meshName = 'primary';
    render();
  } catch (problem) {
    error.textContent = problem.message + (result ? ' Se conserva el último ensayo válido.' : '');
    error.hidden = false;
  }
}

form.addEventListener('submit', event => {
  event.preventDefault();
  apply();
});
byId('reset').addEventListener('click', () => {
  for (const key of parameterKeys) form.elements.namedItem(key).value = DEFAULT_PARAMS[key];
  apply();
});
apply();
