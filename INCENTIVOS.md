# Módulo de Incentivos

## Ajuste v1.1.0

La iteración actual ya no presenta el módulo como liquidación final. Ahora trabaja como:

- `Desempeño e Incentivos`
- `Resultado preliminar`
- `Elegibilidad estimada`
- `Revisión manual`
- `No evaluable con datos actuales`

También suma:

- `antiGamingRules`
- riesgo de inequidad por flujo
- soporte conceptual para iniciativas positivas
- soporte conceptual para evaluación mensual
- diferenciación inicial por rol

Todavía no implementa liquidación monetaria definitiva.

## Qué agrega

El sistema mantiene intactas las vistas existentes de:

- carga de `historico.csv`
- histórico de puntos
- ranking
- calculadora por puntos ponderados

Sobre esa base se suma un módulo nuevo de incentivos con:

- vista ejecutiva
- score por colaborador
- bandas de incentivo
- reglas configurables
- aceleradores, penalizadores, mínimos y exclusiones
- simulación en tiempo real
- auditoría de configuración
- exportación de resultados

## Diseño técnico

La app sigue siendo local y sin backend. La integración se hace con dos archivos nuevos:

- [incentives-module.js](C:\Users\ezequ\Downloads\Gestiq_Repo_Completo\puntos\incentives-module.js)
- [incentives-module.css](C:\Users\ezequ\Downloads\Gestiq_Repo_Completo\puntos\incentives-module.css)

`index.html` expone un contexto mínimo (`window.CATALOGO_CTX`) y dispara eventos de actualización cuando cambian los datos base.

El módulo nuevo:

- reutiliza `historico.csv` para productividad, tareas, IDs trabajados, HOLD, incidencias y señales anti-gaming básicas
- toma `auditados.csv` para calidad auditada SdC, desvíos leves/graves, dominios con error y auditorías
- toma `auditados_mao.csv` para calidad auditada MAO y desvíos MAO
- toma `equipo_colaboradores.csv` para nombre visible, rol, equipo, ubicación y antigüedad
- acepta `metricas_incentivos.csv` sólo como complemento opcional para futuras métricas no disponibles hoy

## Actualización operativa con fuentes reales

La iteración actual ya no exige `metricas_incentivos.csv` para calcular el resultado preliminar principal.

### Fuentes usadas por métrica

- Productividad: `historico.csv`
  - tareas totales
  - IDs trabajados
  - días activos
  - tareas por día activo
  - IDs por día activo
  - puntos ponderados por flujo
  - flujo dominante
  - mix de flujos
  - concentración en flujos de alto peso
- Calidad auditada: `auditados.csv` + `auditados_mao.csv`
  - auditorías totales
  - sugerencias/casos correctos
  - calidad por sugerencia
  - calidad por caso cuando aplica
  - errores leves y graves
  - desvío principal
  - dominios con mayor error
  - calidad combinada, SdC y MAO
- HOLD: `historico.csv`
  - registros en HOLD
  - IDs únicos en HOLD
  - `% HOLD sobre tareas`
  - `% HOLD sobre IDs`
  - HOLD por flujo
  - HOLD por incidencia
  - lead time HOLD cuando se puede derivar
- Incidencias: `historico.csv`
  - cantidad de registros con incidencia
  - incidencias por tipo
  - incidencias por flujo
  - incidencia principal
  - ratio sobre tareas
  - ratio sobre HOLD
  - posible subregistro en contextos sensibles
- Rol y padrón: `equipo_colaboradores.csv`
  - rol
  - equipo
  - ubicación
  - antigüedad
  - segmento de antigüedad
  - match / fuera de padrón

### Fórmula de score preliminar

El score integral actual usa:

- Productividad ponderada: `35%`
- Calidad auditada: `30%`
- HOLD / fricción: `15%`
- Incidencias / gestión operativa: `10%`
- Consistencia / días activos: `10%`

Por ahora no entran al score principal:

- horas productivas
- asistencia
- evaluación mensual

Esas dimensiones quedan preparadas como evolución futura o complemento.

### Robustez del score

La plataforma no trata los faltantes como cero.

- `Alta robustez`: productividad + calidad + HOLD + incidencias disponibles
- `Robustez media`: productividad + calidad, con señales operativas parciales
- `Baja robustez`: falta calidad auditada o la evidencia es incompleta
- `No evaluable`: sin productividad o sin base suficiente de match / padrón

Si falta calidad auditada, el resultado sigue siendo preliminar y debe leerse con cautela aunque el resto del score exista.

## Simulación económica estimada

La app suma una capa de simulación económica, no de liquidación final.

Lenguaje visible en UI:

- `Simulación económica`
- `Asignación estimada`
- `No representa liquidación final`
- `Sujeto a validación de dirección`

### Configuración económica

Se persiste en `localStorage` dentro de la configuración del módulo:

- `budget`
- `currency`
- `pools.base`
- `pools.performance`
- `pools.excellence`
- `includeBaseBand`
- `includeManualReview`
- `maxIndividualBudgetShare`
- `baseMinimumAmount`
- `roundingStep`

### Modelo de reparto implementado

1. Universo elegible

- se excluye por defecto a `No evaluable`
- se excluye por defecto a `Revisión manual`
- se excluye por defecto a `No elegible`
- se excluye a perfiles sin productividad o con exclusión activa

2. Pools

- `base`
- `performance`
- `excellence`

3. Reparto

- `base`: distribución base entre perfiles elegibles configurados para ese pool
- `performance`: reparto proporcional según score ajustado sobre el umbral base
- `excellence`: reparto para la banda superior configurada

4. Tope individual

- se aplica un máximo configurable como `% del presupuesto`
- si alguien supera ese techo, el excedente no se asigna y queda explícito como remanente

5. Redondeo

- la simulación redondea a múltiplos configurables como `100` o `500`
- nunca supera el presupuesto total
- informa diferencia de redondeo o remanente no asignado

### Alertas globales del modelo económico

- presupuesto en cero
- no hay perfiles elegibles
- demasiada revisión manual
- demasiada robustez baja
- pool sin beneficiarios
- diferencia por redondeo
- falta calidad auditada extendida
- riesgo de inequidad por flujos

### Advertencia explícita

La simulación económica:

- no es liquidación final
- no reemplaza validación humana
- no asigna dinero a revisión manual por defecto
- no inventa datos faltantes
- puede dejar presupuesto sin asignar si no hay universo elegible suficiente

## Fórmula recomendada implementada

Se usa una fórmula explicable y auditable:

1. Score base balanceado

- productividad vs objetivo
- calidad
- horas productivas
- HOLD
- incidencias
- asistencia / disponibilidad
- consistencia semanal

Cada métrica se normaliza a 0-100 usando pisos/targets/techos configurables.

2. Reglas

- `minimum`: requisitos mínimos
- `exclusion`: bloqueos automáticos
- `accelerator`: suma puntos extra
- `penalty`: resta puntos

3. Score final

`score_final = clamp((score_base + delta_puntos) * multiplicadores, min, max)`

La elegibilidad no depende sólo del score. Si hay exclusiones, fallas de mínimos o datos insuficientes, el estado cambia a:

- `No elegible`
- `Excluido`
- `Revisión manual requerida`

## Supuestos importantes

- El repo actual no tiene backend ni persistencia remota, así que la configuración se guarda en `localStorage`.
- Si faltan datos críticos, el sistema no inventa resultados: marca parcial, insuficiente o revisión manual.
- `historico.csv` sigue siendo la fuente mínima para productividad.
- `metricas_incentivos.csv` mejora notablemente la calidad del cálculo.

## Smoke Test v1.1.1

Se hizo una validación controlada combinando navegador y harness local.

### Validado

- la app abre sin errores visibles de consola
- siguen renderizando `Histórico`, `Ranking`, `Calculadora` y la nueva vista `Desempeño e Incentivos`
- `Desempeño e Incentivos` queda en modo preliminar cuando sólo existe `historico.csv`
- no se inventan `Calidad`, `HOLD`, `Incidencias`, `Horas productivas` ni `Evaluación mensual` si el dato no existe
- perfiles no analista quedan como `No evaluable con datos actuales`
- las alertas anti-gaming aparecen sólo si la señal es evaluable y efectivamente se dispara
- las alertas de inequidad aparecen para flujos con acceso desigual y ponderación/riesgo alto
- la config se crea si no existe, migra desde versión vieja y no pisa otras claves de `localStorage`
- el score queda acotado entre `0` y `100`
- la exportación `CSV/JSON` sigue operativa
- datos nulos, `undefined`, `NaN` o strings inesperados no rompen el cálculo

### Correcciones aplicadas

- se corrigió un bug donde requisitos mínimos cumplidos podían terminar marcando exclusión
- se dejó de degradar métricas faltantes a `0` o `false`
- `HOLD` dejó de inferirse sólo por estado de tarea
- la evaluación mensual no penaliza por ausencia total de dato
- el tope de score pasó a `100`
- la migración/creación de config ahora persiste en `localStorage`

## Diseño recomendado de CSVs

Para operación real conviene separar responsabilidades. La recomendación es usar:

1. `metricas_incentivos.csv`
2. `iniciativas_incentivos.csv`
3. `evaluaciones_mensuales.csv`
4. `roles_equipo.csv`

Si `equipo_colaboradores.csv` ya cubre bien rol, TL y equipo, `roles_equipo.csv` puede omitirse.

### 1. `metricas_incentivos.csv`

Uso:

- métricas consolidadas por `colaborador + fecha + flujo`
- complemento opcional para horas productivas, asistencia, evaluación mensual u otras señales no disponibles en las fuentes base actuales
- preparado para anti-gaming futuro sin exigir datos imposibles hoy

Granularidad recomendada:

- diaria por colaborador + flujo

Clave única recomendada:

- `metric_date + collaborator_key + flow_name`

Columnas obligatorias:

- `metric_date`
  - tipo: `YYYY-MM-DD`
  - válido: `2026-04-01`
  - inválido: `01/04/26`, `abril-2026`
- `collaborator_key`
  - tipo: string estable
  - válido: `u123456`, `meli_9988`
  - inválido: vacío, nombres libres como `Juan`
- `flow_name`
  - tipo: string
  - válido: `Demanda`, `Soporte`, `Fallos`
  - inválido: vacío

Columnas recomendadas:

- `quality_pct`
  - número `0-100`
  - válido: `97.5`
  - inválido: `110`, `alta`
- `audits_total`
  - entero `>= 0`
- `audits_ok`
  - entero `>= 0`
- `light_errors`
  - entero `>= 0`
- `severe_errors`
  - entero `>= 0`
- `critical_errors`
  - entero `>= 0`
- `reincidence_count`
  - entero `>= 0`
- `main_deviation_reason`
  - string corta y estable
- `hold_count`
  - entero `>= 0`
- `hold_pct`
  - número `0-100`
- `hold_justified_count`
  - entero `>= 0`
- `hold_unjustified_count`
  - entero `>= 0`
- `hold_avg_age_hours`
  - número `>= 0`
- `incidents_count`
  - entero `>= 0`
- `incident_type_main`
  - string corta
- `incidents_expected`
  - entero `>= 0`
- `sensitive_incident_context`
  - boolean `true/false`
- `productive_hours_expected`
  - número `>= 0`
- `productive_hours_actual`
  - número `>= 0`
- `productive_hours_pct`
  - número `0-200`
- `attendance_pct`
  - número `0-100`
- `justified_absence_hours`
  - número `>= 0`
- `partial_availability_flag`
  - boolean
- `data_trusted`
  - boolean

Columnas opcionales:

- `team_name`
- `role_name`
- `tl_key`
- `main_flow_name`
- `worked_flows`
  - lista separada por `|`
- `sla_pct`
- `card_origin`
- `priority_assigned`
- `priority_taken`
- `flow_assigned`
- `flow_chosen`
- `tasks_assigned_count`
- `tasks_taken_count`
- `notes`

Normalización:

- usar `snake_case`
- usar punto decimal `97.5`, no coma decimal
- porcentajes siempre como número simple `97.5`, no `97,5%`
- booleanos sólo `true` / `false`
- strings de catálogo con capitalización estable: `Demanda`, `Soporte`, `Fallos`, `Non Value`, `Merch`
- `collaborator_key` debe ser la clave principal; el nombre visible no debe usarse como join

Reglas de duplicados:

- si se repite la misma clave única, conservar una sola fila
- prioridad recomendada:
  - fila con `data_trusted=true`
  - luego fila con más métricas completas
  - si empatan, conservar la última del archivo y loguear conflicto

Vinculación con `historico.csv`:

- join principal por `collaborator_key` o equivalente a `Usuario`
- join temporal por `metric_date = Fecha`
- si `historico.csv` no trae `flow_name` confiable para un caso, `metricas_incentivos.csv` sigue siendo válido para calidad/HOLD/incidencias/horas, pero el flujo debe quedar en revisión

### 2. `iniciativas_incentivos.csv`

Uso:

- una fila por iniciativa o contribución validable
- evita inflar score con columnas repetidas dentro del CSV de métricas

Granularidad recomendada:

- por colaborador + iniciativa + fecha

Clave única recomendada:

- `initiative_id`

Columnas obligatorias:

- `initiative_id`
  - string única
  - válido: `INIT-2026-04-0001`
- `period_month`
  - `YYYY-MM`
- `collaborator_key`
- `initiative_type`
  - valores sugeridos:
  - `shadowing`
  - `onboarding_support`
  - `issue_detection`
  - `process_improvement`
  - `documentation`
  - `black_beast`
  - `training_support`
  - `peer_support`
- `initiative_status`
  - `pending`, `approved`, `rejected`
- `validator_key`

Columnas recomendadas:

- `initiative_title`
- `initiative_description`
- `evidence_ref`
  - link, ticket, doc id o referencia textual corta
- `suggested_impact_points`
  - número
- `approved_impact_points`
  - número
- `monthly_cap_group`
  - string para agrupar topes
- `initiative_date`
  - `YYYY-MM-DD`
- `validator_notes`

Columnas opcionales:

- `flow_name`
- `team_name`
- `source_ref`
- `created_by`

Reglas para evitar doble suma:

- nunca sumar por descripción libre
- sumar sólo iniciativas `approved`
- aplicar tope mensual por `collaborator_key + period_month`
- si hay dos filas con mismo `initiative_id`, conservar una sola

### 3. `evaluaciones_mensuales.csv`

Uso:

- una fila por colaborador y período mensual
- complemento formativo, no reemplazo de calidad/productividad

Granularidad recomendada:

- mensual por colaborador

Clave única recomendada:

- `period_month + collaborator_key`

Columnas obligatorias:

- `period_month`
  - `YYYY-MM`
- `collaborator_key`
- `evaluation_status`
  - `complete`, `incomplete`, `not_presented`

Columnas recomendadas:

- `responded_flag`
  - boolean
- `evaluation_score`
  - número `0-100`
- `response_date`
  - `YYYY-MM-DD`
- `valid_attempt_flag`
  - boolean
- `evaluation_version`
  - string
- `observations`

Columnas opcionales:

- `attempt_count`
- `reviewer_key`
- `knowledge_area`

Reglas:

- si `evaluation_status = not_presented`, `responded_flag` debería ser `false`
- si `evaluation_score` existe, `valid_attempt_flag` debería ser `true`
- una fila mensual por persona; si hay varios intentos, consolidar el intento válido final antes de exportar

### 4. `roles_equipo.csv`

Uso:

- desacoplar rol/equipo/TL del histórico si cambia con menor frecuencia

Granularidad recomendada:

- una fila por colaborador vigente por período

Clave única recomendada:

- `period_month + collaborator_key`

Columnas obligatorias:

- `period_month`
- `collaborator_key`
- `display_name`
- `role_name`
  - `analyst`, `team_leader`, `quality_coordinator`, `quality_analyst`, `project_manager`
- `team_name`

Columnas recomendadas:

- `tl_key`
- `tl_name`
- `main_flow_name`
- `worked_flows`
- `employment_status`
  - `active`, `inactive`, `leave`

Columnas opcionales:

- `qa_owner_key`
- `cp_owner_key`
- `notes`

## Reglas operativas por dimensión

### Calidad

En `metricas_incentivos.csv`:

- `quality_pct`
- `audits_total`
- `audits_ok`
- `light_errors`
- `severe_errors`
- `critical_errors`
- `reincidence_count`
- `main_deviation_reason`

### HOLD

En `metricas_incentivos.csv`:

- `hold_count`
- `hold_pct`
- `hold_justified_count`
- `hold_unjustified_count`
- `hold_avg_age_hours`
- `incident_type_main`

### Incidencias

En `metricas_incentivos.csv`:

- `incidents_count`
- `incident_type_main`
- `incidents_expected`
- `sensitive_incident_context`

Regla sugerida:

- `incidents_count = 0` no es positivo por sí solo
- si `sensitive_incident_context = true` y `incidents_expected > 0`, puede alimentar una alerta de posible subregistro

### Horas productivas

En `metricas_incentivos.csv`:

- `productive_hours_expected`
- `productive_hours_actual`
- `productive_hours_pct`
- `justified_absence_hours`
- `partial_availability_flag`

### Evaluación mensual

En `evaluaciones_mensuales.csv`:

- `responded_flag`
- `evaluation_score`
- `evaluation_status`
- `response_date`
- `valid_attempt_flag`
- `observations`

### Iniciativas

En `iniciativas_incentivos.csv`:

- `initiative_type`
- `initiative_description`
- `evidence_ref`
- `validator_key`
- `initiative_status`
- `approved_impact_points`

### Rol / equipo

En `roles_equipo.csv` o `equipo_colaboradores.csv` si ya alcanza:

- `role_name`
- `tl_key`
- `team_name`
- `main_flow_name`
- `worked_flows`

## Cómo tratar nombres inconsistentes

- usar siempre `collaborator_key` como unión principal
- `display_name` es sólo visual
- si `historico.csv` viene con nombre y no con clave estable, crear una tabla de homologación previa y no mezclar personas por similitud textual

## Cómo tratar datos faltantes y parciales

- si falta una métrica crítica, marcar `manual_review` o `insufficient`
- no imputar `0` cuando el dato no existe
- `0` sólo vale cuando la fuente lo declara explícitamente
- si el CSV trae algunas métricas del día y otras no, el día sigue siendo usable pero el resultado debe explicitar `partial`

## Anti-gaming futuro

Preparar columnas, aunque hoy queden vacías:

- `card_origin`
- `priority_assigned`
- `priority_taken`
- `flow_assigned`
- `flow_chosen`
- `tasks_assigned_count`
- `tasks_taken_count`

Con eso se puede detectar más adelante:

- concentración en flujos de alto puntaje
- cambio brusco de mix vs período anterior
- baja alineación con prioridad asignada
- diferencia entre tarea asignada y tarea tomada

## Ejemplos mínimos

### Ejemplo válido `metricas_incentivos.csv`

```csv
metric_date,collaborator_key,flow_name,quality_pct,hold_pct,incidents_count,productive_hours_pct,data_trusted
2026-04-01,u123456,Demanda,97.5,4.0,1,96.0,true
```

### Ejemplo inválido `metricas_incentivos.csv`

```csv
metric_date,collaborator_key,flow_name,quality_pct
01/04/26,,Demanda,excelente
```

### Ejemplo válido `evaluaciones_mensuales.csv`

```csv
period_month,collaborator_key,evaluation_status,responded_flag,evaluation_score,response_date,valid_attempt_flag
2026-04,u123456,complete,true,88,2026-04-29,true
```

### Ejemplo válido `iniciativas_incentivos.csv`

```csv
initiative_id,period_month,collaborator_key,initiative_type,initiative_status,validator_key,approved_impact_points
INIT-2026-04-0001,2026-04,u123456,shadowing,approved,tl_01,1.5
```

## Validación manual sugerida

1. Cargar `historico.csv` solo.
2. Confirmar que:
   - histórico
   - ranking
   - calculadora
   sigan funcionando.
3. Ir a `Incentivos` y validar que:
   - aparezca resumen
   - haya bandas preliminares
   - los casos con datos faltantes vayan a revisión manual cuando corresponda
   - no se proponga pago final
4. Cargar `metricas_incentivos.csv` y validar que cambien, sólo cuando el archivo las trae:
   - calidad
   - HOLD
   - horas
   - incidencias
   - evaluación mensual
   - iniciativas
   - explicaciones por colaborador
5. Ir a `Configuración de Incentivos` y modificar:
   - pesos
   - umbrales
   - reglas
   - bandas
   Confirmar que el simulador se actualice en vivo.

## Riesgos actuales

- Como la app sigue siendo 100% local, la auditoría persiste sólo en el navegador actual.
- Si los CSV traen filas duplicadas sin clave estable, la deduplicación siempre va a requerir una convención operativa clara.
- El motor está preparado para crecer, pero en esta iteración todavía no hay persistencia multiusuario ni versionado remoto.
- TLs y QA/CP siguen preparados a nivel de modelo, pero no evaluables hasta tener métricas agregadas específicas.
