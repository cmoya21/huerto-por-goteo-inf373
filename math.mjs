/** Reserva de agua de un sustrato con aporte limitado por espacio libre y drenaje lineal. */
export const DEFAULT_PARAMS = Object.freeze({
  C: 40, r: 8, k: 0.1, y0: 8, target: 24, T: 8, h: 2,
});

export const MAX_STEPS = 2000;
const LABELS = {
  C: 'La capacidad C', r: 'El aporte r', k: 'El coeficiente k',
  y0: 'La reserva inicial', target: 'La meta', T: 'El tiempo final', h: 'El paso h',
};
const format = new Intl.NumberFormat('es-BO', { maximumSignificantDigits: 6 });
const fmt = x => format.format(x);

function validate(input) {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError('Se requiere un objeto de parámetros.');
  }
  for (const name of Object.keys(input)) {
    if (!Object.hasOwn(DEFAULT_PARAMS, name)) throw new RangeError('Parámetro no reconocido: ' + name);
    if (!Number.isFinite(input[name])) throw new RangeError(LABELS[name] + ' debe ser un número finito.');
  }
  const p = { ...DEFAULT_PARAMS, ...input };
  if (p.C < 0.0001 || p.C > 1e6) throw new RangeError('La capacidad C debe estar entre 0,0001 y 1 000 000 L.');
  if (p.r < 0 || p.r > 1e6) throw new RangeError('El aporte r debe estar entre 0 y 1 000 000 L/h.');
  if (p.k < 0 || p.k > 1e6) throw new RangeError('El coeficiente k debe estar entre 0 y 1 000 000 h⁻¹.');
  if (p.y0 < 0 || p.y0 > p.C) throw new RangeError('La reserva inicial debe estar entre 0 y C.');
  if (p.target < 0 || p.target > p.C) throw new RangeError('La meta debe estar entre 0 y C.');
  if (p.T <= 0 || p.T > 1e6) throw new RangeError('El tiempo final debe ser positivo y no mayor que 1 000 000 h.');
  if (p.h <= 0 || p.h > p.T) throw new RangeError('El paso h debe ser positivo y no mayor que el tiempo final.');
  if (p.h / 2 === 0 || stepCount(p.T, p.h / 2) > MAX_STEPS) {
    throw new RangeError('La malla fina supera ' + MAX_STEPS + ' pasos. Aumenta h o reduce el tiempo final.');
  }
  return p;
}

function stepCount(T, h) {
  const ratio = T / h;
  const nearest = Math.round(ratio);
  const integer = Math.abs(nearest - ratio) <= 8 * Number.EPSILON * Math.max(1, ratio);
  return integer ? nearest : Math.ceil(ratio);
}

export function heunStep(f, t, y, h) {
  const k1 = f(t, y);
  const k2 = f(t + h, y + h * k1);
  return y + h * ((k1 + k2) / 2);
}

export function rk4Step(f, t, y, h) {
  const k1 = f(t, y);
  const k2 = f(t + h / 2, y + h * k1 / 2);
  const k3 = f(t + h / 2, y + h * k2 / 2);
  const k4 = f(t + h, y + h * k3);
  return y + h * ((k1 + 2 * k2 + 2 * k3 + k4) / 6);
}

function error(value, reference) {
  if (value === null) return { abs: null, pct: null };
  const abs = Math.abs(value - reference);
  const pct = reference !== 0 ? 100 * (abs / Math.abs(reference)) : null;
  return { abs, pct: Number.isFinite(pct) ? pct : null };
}

function runMesh(p, h, f, exact, lambda) {
  const count = stepCount(p.T, h);
  const rows = [];
  const maxError = { heun: 0, rk4: 0 };
  const maxErrorPct = { heun: null, rk4: null };
  const overflowAt = { heun: null, rk4: null };
  const outsidePhysical = { heun: false, rk4: false };
  const steps = { heun: heunStep, rk4: rk4Step };
  let t = 0;
  let maxStep = 0;
  let shortened = false;
  const approximations = { heun: p.y0, rk4: p.y0 };
  const slack = 16 * Number.EPSILON * Math.max(1, p.C);

  for (let n = 0; n <= count; n += 1) {
    const next = n === count ? p.T : n * h;
    const step = next - t;
    if (n > 0) {
      maxStep = Math.max(step, maxStep);
      shortened ||= step < h - 16 * Number.EPSILON * Math.max(p.T, h);
    }
    const reference = exact(next);
    const row = { n, t: next, step, exact: reference };
    for (const [method, advance] of Object.entries(steps)) {
      if (n > 0 && approximations[method] !== null) {
        const estimate = advance(f, t, approximations[method], step);
        if (Number.isFinite(estimate)) {
          approximations[method] = estimate;
          outsidePhysical[method] ||= estimate < -slack || estimate > p.C + slack;
        } else {
          approximations[method] = null;
          overflowAt[method] = n;
        }
      }
      const value = approximations[method];
      const { abs, pct } = error(value, reference);
      row[method] = value;
      row[method + 'Abs'] = abs;
      row[method + 'Pct'] = pct;
      maxError[method] = abs === null ? null : Math.max(abs, maxError[method]);
      if (pct !== null) maxErrorPct[method] = Math.max(pct, maxErrorPct[method] ?? 0);
      if (value === null) maxErrorPct[method] = null;
    }
    rows.push(row);
    t = next;
  }

  const z = -lambda * maxStep;
  const heunFactor = 1 + z * (1 + z / 2);
  const rk4Factor = 1 + z * (1 + z * (1 / 2 + z * (1 / 6 + z / 24)));
  // For this real nonpositive eigenvalue, each stability interval is contiguous from z = 0.
  const stability = { z, heunFactor, rk4Factor, heun: Math.abs(heunFactor) <= 1 + 1e-12,
    rk4: Math.abs(rk4Factor) <= 1 + 1e-12 };
  return { h, rows, end: rows.at(-1), maxError, maxErrorPct, shortened, stability, overflowAt, outsidePhysical };
}

function goal(p, lambda, equilibrium) {
  if (p.y0 >= p.target) return { status: 'initial', time: 0 };
  if (lambda === 0 || equilibrium < p.target) return { status: 'unreachable', time: null };
  if (equilibrium === p.target) return { status: 'asymptotic', time: null };
  const fraction = (p.target - p.y0) / (equilibrium - p.y0);
  const numerator = fraction < 0.5
    ? -Math.log1p(-fraction)
    : Math.log((equilibrium - p.y0) / (equilibrium - p.target));
  const time = numerator / lambda;
  if (!Number.isFinite(time)) return { status: 'after', time: null };
  return { status: time <= p.T ? 'reached' : 'after', time };
}

function describeGoal(p, g, equilibrium) {
  switch (g.status) {
    case 'initial':
      return 'La reserva ya cumple la meta al comenzar.';
    case 'reached':
      return 'El modelo alcanza ' + fmt(p.target) + ' L en ' + fmt(g.time) + ' h.';
    case 'after':
      return g.time === null ? 'La meta queda fuera del intervalo de simulación.'
        : 'La meta se alcanzaría a las ' + fmt(g.time) + ' h, después del intervalo simulado.';
    case 'asymptotic':
      return 'La reserva se acerca a ' + fmt(p.target) + ' L sin llegar a esa meta en tiempo finito.';
    default:
      return equilibrium === null ? 'Sin aporte ni drenaje, la reserva permanece por debajo de la meta.'
        : 'La reserva permanece por debajo de la meta porque el equilibrio es de ' + fmt(equilibrium) + ' L.';
  }
}

function addMeshWarnings(mesh, label, warnings) {
  if (mesh.shortened) warnings.push('En la malla ' + label + ' se acortó el último paso para terminar exactamente en T. Los dos métodos usan los mismos pasos.');
  for (const [method, name] of [['heun', 'Heun'], ['rk4', 'RK4']]) {
    if (!mesh.stability[method]) {
      warnings.push(name + ' en la malla ' + label + ' tiene |R(−λΔt)| > 1 para el paso mayor. Puede amplificar perturbaciones. Reduce h.');
    }
    if (mesh.outsidePhysical[method]) {
      warnings.push(name + ' en la malla ' + label + ' obtuvo reservas fuera de [0, C]. Son valores numéricos sin interpretación física.');
    }
    if (mesh.overflowAt[method] !== null) {
      warnings.push(name + ' en la malla ' + label + ' desbordó la precisión en el paso ' + mesh.overflowAt[method] + '. Se omiten sus valores posteriores.');
    }
  }
}

export function simulate(input = {}) {
  const params = validate(input);
  const { C, r, k, y0, h } = params;
  const lambda = r / C + k;
  // When λ=0, every reserve is a stationary solution and there is no unique equilibrium.
  const equilibrium = lambda === 0 ? null : (r / C) / lambda * C;
  const exact = t => {
    if (!Number.isFinite(t) || t < 0) throw new RangeError('El tiempo debe ser finito y no negativo.');
    if (lambda === 0) return y0;
    const z = -lambda * t;
    return y0 * Math.exp(z) - equilibrium * Math.expm1(z);
  };
  const f = (_t, y) => r - lambda * y;
  const primary = runMesh(params, h, f, exact, lambda);
  const refined = runMesh(params, h / 2, f, exact, lambda);
  const threshold = goal(params, lambda, equilibrium);
  const warnings = [];
  addMeshWarnings(primary, 'h', warnings);
  addMeshWarnings(refined, 'h/2', warnings);
  const summary = 'A las ' + fmt(params.T) + ' h, la solución exacta da ' + fmt(primary.end.exact) + ' L. '
    + describeGoal(params, threshold, equilibrium);
  return { params, lambda, equilibrium, threshold, exact, primary, refined, warnings, summary };
}
