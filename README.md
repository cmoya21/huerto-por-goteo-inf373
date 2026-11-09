# Huerto por goteo

Desafío individual de **INF 373 · Métodos Numéricos**  
**Carlos Angel Moya Choque** · Mención Desarrollo de Software  
Docente: Lic. Brigida Alexandra Carvajal Blanco

En un huerto vecinal hipotético de El Alto se quiere recuperar la reserva de agua del sustrato después de un período seco. La pregunta es **¿cuándo se alcanzan 24 L de agua almacenada si el riego por goteo funciona durante ocho horas?**

## Cómo ejecutar

La aplicación usa HTML, CSS y JavaScript. No requiere servidor de datos, cuenta ni instalación de paquetes.

- Para probar la copia del código, ejecuta `node servir.mjs` con Node.js 20 o superior y abre [http://127.0.0.1:8774/](http://127.0.0.1:8774/).
- Para correr las pruebas, ejecuta `node --test math.test.mjs`.
- Para publicar, sube la carpeta fuente a GitHub y selecciona **Settings → Pages → Deploy from a branch → main → / (root)**. Todos los recursos de la web usan rutas relativas.

## Modelo

Sea `y(t)` la reserva de agua del sustrato en litros y `t` el tiempo en horas. Se supone que parte del agua que llega al lecho escurre a medida que disminuye el espacio disponible. Con capacidad efectiva `C`, tasa máxima de aporte `r` y pérdida proporcional `k`:

```text
aporte neto al lecho = r (1 − y/C)
pérdida por drenaje = k y
y′ = r (1 − y/C) − k y = r − λ y,     λ = r/C + k
y(0) = y₀
```

`C` y `y₀` se miden en L, `r` en L/h y `k` en h⁻¹. Los valores son supuestos didácticos. El modelo representa un volumen agregado con parámetros constantes y omite lluvia, cambios de clima, raíces y diferencias de humedad dentro del suelo.

## Solución exacta

Para λ > 0, al multiplicar la ecuación por exp(λt) se obtiene (exp(λt)y)′ = r exp(λt). Al integrar y aplicar y(0) = y₀:

```text
y(t) = y_eq + (y₀ − y_eq) exp(−λt),   y_eq = r/λ
```

En t = 0 se recupera y₀. La derivada es −λ(y₀ − y_eq) exp(−λt), que coincide con r − λy(t) porque λy_eq = r. Si λ = 0, r y k son cero y y(t) = y₀.

Si y₀ < meta < y_eq, el primer tiempo de cruce es
`t_meta = log((y_eq − y₀)/(y_eq − meta))/λ`. La meta ya está cumplida si y₀ ≥ meta. Si la meta coincide con el equilibrio y se parte por debajo, solo se aproxima en el límite. Si la meta supera el equilibrio y se parte por debajo, el modelo no predice un cruce.

## Métodos numéricos

Ambos métodos usan las mismas entradas y la misma malla para cada ensayo.

```text
Heun
  k₁ = f(tₙ, yₙ)
  k₂ = f(tₙ + h, yₙ + h k₁)
  yₙ₊₁ = yₙ + h(k₁ + k₂)/2

RK4 clásico
  k₁ = f(tₙ, yₙ)
  k₂ = f(tₙ + h/2, yₙ + h k₁/2)
  k₃ = f(tₙ + h/2, yₙ + h k₂/2)
  k₄ = f(tₙ + h, yₙ + h k₃)
  yₙ₊₁ = yₙ + h(k₁ + 2k₂ + 2k₃ + k₄)/6
```

El error absoluto es |aproximación − exacta| en L. El error relativo porcentual es 100 veces ese error dividido por |exacta|. Se omite cuando el valor exacto es cero. La web presenta las dos mallas, sus trazas completas y la evolución de los errores.

## Caso base reproducible

`C = 40 L`, `r = 8 L/h`, `k = 0,10 h⁻¹`, `y₀ = 8 L`, meta `24 L`, horizonte `8 h`. Se obtiene λ = 0,30 h⁻¹, equilibrio de 26,6667 L y cruce analítico a las **6,4864 h** (aproximadamente 6 h 29 min).

| Paso | Exacta a 8 h (L) | Heun (L) | Error abs. Heun (L) | RK4 (L) | Error abs. RK4 (L) |
| --- | ---: | ---: | ---: | ---: | ---: |
| 2 h | 24,973265 | 24,554254 | 0,419011 | 24,965991 | 0,007273 |
| 1 h | 24,973265 | 24,895265 | 0,077999 | 24,972912 | 0,000353 |

Con estos parámetros, la meta se supera antes de las ocho horas y el modelo termina cerca de 25 L. Al reducir el paso disminuye el error de ambos métodos. RK4 es más preciso en estos ensayos, a costa de cuatro evaluaciones de la función por paso frente a dos de Heun. Los resultados ilustran la comparación numérica y deben calibrarse con mediciones antes de tomar decisiones sobre un huerto real.

Para revisar la primera fila a mano, con h = 2 h la pendiente inicial es 5,6 L/h.
Heun predice 19,2 L y evalúa allí una segunda pendiente de 2,24 L/h, con lo que obtiene 15,84 L.
RK4 usa las pendientes 5,6, 3,92, 4,424 y 2,9456 L/h y obtiene 16,4112 L.
La referencia exacta a las 2 h es 16,4222 L.
