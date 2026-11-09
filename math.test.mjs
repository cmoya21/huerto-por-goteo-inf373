import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_PARAMS, heunStep, rk4Step, simulate } from './math.mjs';

function close(actual, expected, tol = 1e-11) {
  assert.ok(Math.abs(actual - expected) <= tol, `${actual} ≈ ${expected} (tolerancia ${tol})`);
}

test('Heun promedia pendientes de inicio y de fin, RK4 evalúa las dos intermedias', () => {
  const f = (t, y) => t + y;
  // y'=t+y, y(0)=1, h=1/2. Cálculo manual: Heun k=(1,2), RK4 k=(1,1.5,1.625,2.3125).
  close(heunStep(f, 0, 1, 0.5), 1.75);
  close(rk4Step(f, 0, 1, 0.5), 1 + 0.5 * (1 + 2 * 1.5 + 2 * 1.625 + 2.3125) / 6);
});

test('referencia satisface la condición inicial, la EDO y la meta', () => {
  const s = simulate();
  const { C, r, k, y0, target } = s.params;
  assert.equal(s.exact(0), y0);
  close(s.lambda, 0.3);
  close(s.equilibrium, 80 / 3);
  for (const t of [0.5, 2, 7]) {
    const delta = 0.00001;
    const derivative = (s.exact(t + delta) - s.exact(t - delta)) / (2 * delta);
    close(derivative, r * (1 - s.exact(t) / C) - k * s.exact(t), 1e-9);
  }
  assert.equal(s.threshold.status, 'reached');
  close(s.threshold.time, Math.log(7) / 0.3);
  close(s.exact(s.threshold.time), target);
  assert.ok(s.exact(s.threshold.time - 0.1) < target);
});

test('la tabla por pasos de h=2 h y h=1 h coincide con recálculo independiente', () => {
  const s = simulate();
  close(s.primary.rows[1].heun, 15.84);
  close(s.primary.rows[1].rk4, 16.4112);
  const exact = 80 / 3 - (56 / 3) * Math.exp(-2.4);
  for (const [mesh, n] of [[s.primary, 4], [s.refined, 8]]) {
    const z = -0.3 * mesh.h;
    const amplificationHeun = 1 + z + z ** 2 / 2;
    const amplificationRk4 = amplificationHeun + z ** 3 / 6 + z ** 4 / 24;
    assert.equal(mesh.rows.length, n + 1);
    close(mesh.end.exact, exact);
    close(mesh.end.heun, 80 / 3 - (56 / 3) * amplificationHeun ** n);
    close(mesh.end.rk4, 80 / 3 - (56 / 3) * amplificationRk4 ** n);
    close(mesh.end.heunAbs, Math.abs(mesh.end.heun - exact));
    close(mesh.end.rk4Pct, 100 * Math.abs(mesh.end.rk4 - exact) / exact);
    assert.ok(mesh.end.rk4Abs < mesh.end.heunAbs);
  }
  assert.ok(s.refined.end.heunAbs < s.primary.end.heunAbs);
  assert.ok(s.refined.end.rk4Abs < s.primary.end.rk4Abs);
});

test('en mallas suficientemente finas aparecen los órdenes 2 y 4', () => {
  const { primary, refined } = simulate({ h: 0.125 });
  const orderHeun = Math.log2(primary.end.heunAbs / refined.end.heunAbs);
  const orderRk4 = Math.log2(primary.end.rk4Abs / refined.end.rk4Abs);
  close(orderHeun, 2, 0.05);
  close(orderRk4, 4, 0.05);
});

test('un paso final corto lleva a los dos métodos exactamente a T', () => {
  const s = simulate({ T: 7.75, h: 3 });
  assert.deepEqual(s.primary.rows.map(row => row.t), [0, 3, 6, 7.75]);
  assert.deepEqual(s.refined.rows.map(row => row.t), [0, 1.5, 3, 4.5, 6, 7.5, 7.75]);
  assert.equal(s.primary.end.step, 1.75);
  assert.equal(s.refined.end.step, 0.25);
  assert.ok(s.primary.shortened && s.refined.shortened);
  assert.equal(s.primary.end.exact, s.refined.end.exact);
  assert.equal(simulate({ T: 0.3, h: 0.1 }).primary.rows.length, 4);
});

test('la meta contempla inicio, horizonte insuficiente, asíntota e imposibilidad', () => {
  assert.deepEqual(simulate({ y0: 24 }).threshold, { status: 'initial', time: 0 });
  assert.equal(simulate({ T: 4 }).threshold.status, 'after');
  assert.deepEqual(simulate({ r: 8, C: 40, k: 0.2, target: 20 }).threshold, { status: 'asymptotic', time: null });
  assert.deepEqual(simulate({ target: 35 }).threshold, { status: 'unreachable', time: null });
  const decreasing = simulate({ y0: 35, target: 30 });
  assert.equal(decreasing.threshold.status, 'initial');
  assert.ok(decreasing.primary.end.exact < 30);
});

test('sin aporte ni drenaje la reserva es constante y un cero exacto no da porcentaje', () => {
  const s = simulate({ r: 0, k: 0, y0: 0 });
  assert.equal(s.lambda, 0);
  assert.equal(s.equilibrium, null);
  assert.equal(s.threshold.status, 'unreachable');
  for (const row of s.primary.rows) {
    assert.equal(row.exact, 0);
    assert.equal(row.heun, 0);
    assert.equal(row.rk4, 0);
    assert.equal(row.heunPct, null);
    assert.equal(row.rk4Pct, null);
  }
  assert.equal(simulate({ y0: 0 }).refined.rows[1].heunPct !== null, true);
});

test('se exponen amplificación y valores fuera del dominio físico, sin recortar', () => {
  const s = simulate({ h: 8 });
  assert.equal(s.primary.stability.heun, false);
  assert.equal(s.primary.stability.rk4, true);
  assert.equal(s.primary.outsidePhysical.heun, true);
  assert.equal(s.refined.stability.heun, true);
  assert.ok(s.primary.end.heun < 0);
  assert.ok(s.warnings.some(w => w.includes('fuera de [0, C]')));
});

test('los desbordamientos quedan marcados y la referencia sigue disponible', () => {
  const s = simulate({ C: 0.001, r: 1e6, k: 0, y0: 0, target: 0.0005, T: 200, h: 1 });
  assert.ok(s.primary.overflowAt.heun > 0);
  assert.ok(s.primary.overflowAt.rk4 > 0);
  assert.equal(s.primary.end.rk4, null);
  assert.equal(s.primary.end.heunAbs, null);
  close(s.primary.end.exact, 0.001);
  assert.ok(s.warnings.some(w => w.includes('desbordó')));
});

test('validación de entradas y límite de pasos', () => {
  for (const bad of [
    { C: 0 }, { r: -1 }, { k: -0.1 }, { y0: 41 }, { target: -1 }, { T: 0 }, { h: 9 },
    { h: 0.0001 }, { C: Infinity }, { h: '2' }, { T: '' }, { z: 1 },
  ]) assert.throws(() => simulate(bad), RangeError);
  assert.throws(() => simulate(null), TypeError);
  assert.throws(() => simulate().exact(-1), RangeError);
  assert.equal(simulate(DEFAULT_PARAMS).warnings.length, 0);
});
