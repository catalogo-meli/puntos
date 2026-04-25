(() => {
  const STORAGE = {
    config: 'catalogo.incentives.config.v1',
    audit: 'catalogo.incentives.audit.v1',
    baseline: 'catalogo.incentives.baseline.v1',
  };

  const METRIC_LABELS = {
    productivity_ratio: 'Productividad vs objetivo',
    quality_pct: 'Calidad auditada',
    productive_hours_pct: 'Horas productivas',
    hold_pct: 'HOLD sobre tareas',
    incidence_rate: 'Incidencias sobre tareas',
    attendance_pct: 'Asistencia / disponibilidad',
    weekly_consistency_pct: 'Consistencia / días activos',
    recurrence_count: 'Reincidencia',
    severe_errors: 'Errores graves',
    critical_incidents: 'Incidencias críticas',
    improvement_vs_previous_pct: 'Mejora vs período anterior',
    active_days: 'Días activos',
    participation_days: 'Participación',
    critical_flow_share: 'Participación en flujos críticos',
    sla_pct: 'SLA',
    productivity_quality_gap: 'Gap productividad - calidad',
    monthly_evaluation_score: 'Evaluación mensual',
  };

  const METRIC_OPTIONS = Object.entries(METRIC_LABELS).map(([value, label]) => ({ value, label }));
  const RULE_TYPE_OPTIONS = [
    { value: 'accelerator', label: 'Acelerador' },
    { value: 'penalty', label: 'Penalizador' },
    { value: 'minimum', label: 'Requisito mínimo' },
    { value: 'exclusion', label: 'Condición excluyente' },
  ];
  const OPERATOR_OPTIONS = [
    { value: 'gt', label: '>' },
    { value: 'gte', label: '>=' },
    { value: 'lt', label: '<' },
    { value: 'lte', label: '<=' },
    { value: 'eq', label: '=' },
    { value: 'neq', label: '!=' },
    { value: 'between', label: 'Entre' },
    { value: 'contains', label: 'Contiene' },
    { value: 'not_contains', label: 'No contiene' },
  ];
  const IMPACT_MODE_OPTIONS = [
    { value: 'points', label: 'Puntos' },
    { value: 'multiplier', label: 'Multiplicador' },
    { value: 'block', label: 'Bloquear' },
  ];

  const state = {
    config: null,
    audit: [],
    baseline: null,
    selectedUser: '',
    ruleDraft: null,
    evaluation: null,
    charts: {},
    filters: {
      periodType: 'month',
      periodKey: 'latest',
      team: '',
      band: '',
      search: '',
    },
  };

  const ROLE_ALIASES = {
    analyst: ['analyst', 'analista', 'catalog specialist', 'specialist'],
    team_leader: ['team_leader', 'team leader', 'tl', 'lider', 'líder', 'lead'],
    quality_coordinator: ['quality_coordinator', 'quality coordinator', 'cp', 'coordinacion pedagogica', 'coordinación pedagógica', 'pedagogic coordinator'],
    quality_analyst: ['quality_analyst', 'quality analyst', 'qa', 'quality assurance'],
    project_manager: ['project_manager', 'project manager', 'pm'],
  };

  const safeStorage = {
    get(key, fallback) {
      try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
      } catch (error) {
        console.warn('[incentives] storage.get fallback', error);
        return fallback;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, JSON.stringify(value));
      } catch (error) {
        console.warn('[incentives] storage.set failed', error);
      }
    },
  };

  function uid(prefix) {
    return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function deepClone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function round(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
    const m = 10 ** digits;
    return Math.round(Number(value) * m) / m;
  }

  function pct(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return `${round(value, digits).toFixed(digits)}%`;
  }

  function num(value, digits = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return '—';
    return round(value, digits).toFixed(digits);
  }

  function parseNumber(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'number' && !Number.isNaN(value)) return value;
    const normalized = String(value)
      .trim()
      .replace(/\.(?=\d{3}(?:\D|$))/g, '')
      .replace(',', '.')
      .replace(/[^\d.-]/g, '');
    if (!normalized) return null;
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function parsePercentish(value) {
    if (value === null || value === undefined || value === '') return null;
    const raw = String(value).trim();
    const n = parseNumber(raw);
    if (n === null) return null;
    if (raw.includes('%')) return n;
    if (n <= 1) return n * 100;
    return n;
  }

  function parseBooleanish(value) {
    if (value === null || value === undefined || value === '') return null;
    if (typeof value === 'boolean') return value;
    const raw = String(value).trim().toLowerCase();
    if (['1', 'true', 'si', 'sí', 'yes', 'ok', 'y'].includes(raw)) return true;
    if (['0', 'false', 'no', 'n'].includes(raw)) return false;
    return null;
  }

  function average(values) {
    const valid = values.filter(v => v !== null && v !== undefined && !Number.isNaN(v));
    return valid.length ? valid.reduce((sum, v) => sum + v, 0) / valid.length : null;
  }

  function sum(values) {
    const valid = values.filter(v => v !== null && v !== undefined && !Number.isNaN(v));
    return valid.length ? valid.reduce((acc, v) => acc + v, 0) : null;
  }

  function arrayMax(values) {
    const valid = values.filter(v => v !== null && v !== undefined && !Number.isNaN(v));
    return valid.length ? Math.max(...valid) : null;
  }

  function arrifyScope(value) {
    if (!value || value === 'all') return [];
    if (Array.isArray(value)) return value.filter(Boolean);
    return String(value)
      .split(',')
      .map(chunk => chunk.trim())
      .filter(Boolean);
  }

  function normalizeEntityKey(value) {
    return String(value || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');
  }

  function splitListish(value) {
    if (value === null || value === undefined) return [];
    return String(value)
      .split(/[|,;]+/)
      .map(item => item.trim())
      .filter(Boolean);
  }

  function parseIdsField(...values) {
    const items = values.flatMap(value => splitListish(value));
    const normalized = [];
    const seen = new Set();
    items.forEach(item => {
      const clean = String(item).trim();
      if (!clean) return;
      const key = normalizeEntityKey(clean);
      if (!key || seen.has(key)) return;
      seen.add(key);
      normalized.push(clean);
    });
    return normalized;
  }

  function parseIncidenceTokens(value) {
    return splitListish(value).map(item => item.replace(/\s+/g, ' ').trim()).filter(Boolean);
  }

  function topEntries(mapLike, limit = 3) {
    return Object.entries(mapLike || {})
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([key, count]) => ({ key, count }));
  }

  function pluralize(n, singular, plural) {
    return `${n} ${n === 1 ? singular : plural}`;
  }

  function formatCurrency(value, currency = 'ARS') {
    const numeric = Number(value || 0);
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(numeric);
  }

  function tenureSegmentFromDays(days) {
    if (days === null || days === undefined || Number.isNaN(days)) return 'Sin dato';
    if (days < 90) return '0-3 meses';
    if (days < 180) return '3-6 meses';
    if (days < 365) return '6-12 meses';
    if (days < 730) return '1-2 años';
    return '2+ años';
  }

  function periodKeyFromDate(date, periodType) {
    if (!date) return null;
    if (periodType === 'week') {
      const wk = isoWeekSafe(date);
      return `${wk.year}-W${String(wk.week).padStart(2, '0')}`;
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  function buildTeamDirectory() {
    const data = getData();
    const rows = data.equipo || [];
    const ctx = getCtx();
    const lookup = new Map();
    const members = new Map();
    if (!rows.length || !ctx.findCol) return { lookup, members };

    const sample = rows[0];
    const cols = {
      id: ctx.findCol(sample, ['ID_MELI', 'id_meli', 'Usuario', 'usuario', 'User', 'user']),
      name: ctx.findCol(sample, ['Nombre', 'nombre', 'Name', 'name']),
      slack: ctx.findCol(sample, ['Slack_ID', 'slack_id', 'Slack']),
      role: ctx.findCol(sample, ['Rol', 'rol', 'Role', 'role']),
      team: ctx.findCol(sample, ['Equipo', 'equipo', 'TL', 'Team', 'team']),
      location: ctx.findCol(sample, ['Ubicacion', 'ubicacion', 'Ubicación']),
      joinDate: ctx.findCol(sample, ['Fecha Ingreso', 'fecha ingreso', 'FechaIngreso', 'fecha_ingreso']),
      mailProductora: ctx.findCol(sample, ['Mail Productora', 'mail_productora']),
      mailExterno: ctx.findCol(sample, ['Mail Externo', 'mail_externo']),
      cuil: ctx.findCol(sample, ['CUIL', 'cuil']),
    };

    rows.forEach(row => {
      const rawId = String(row[cols.id] || row[cols.name] || '').trim();
      if (!rawId) return;
      const joinDate = cols.joinDate ? ctx.parseDate(String(row[cols.joinDate] || '')) : null;
      const tenureDays = joinDate ? Math.max(0, Math.floor((Date.now() - joinDate.getTime()) / 86400000)) : null;
      const member = {
        canonicalKey: rawId,
        displayName: String(row[cols.name] || rawId).trim() || rawId,
        role: String(row[cols.role] || '').trim(),
        team: String(row[cols.team] || '').trim(),
        location: String(row[cols.location] || '').trim(),
        slackId: String(row[cols.slack] || '').trim(),
        mailProductora: String(row[cols.mailProductora] || '').trim(),
        mailExterno: String(row[cols.mailExterno] || '').trim(),
        cuil: String(row[cols.cuil] || '').trim(),
        joinDate: joinDate ? joinDate.toISOString().slice(0, 10) : '',
        tenureDays,
        tenureSegment: tenureSegmentFromDays(tenureDays),
        activeInRoster: true,
      };
      members.set(normalizeEntityKey(rawId), member);
      [rawId, member.displayName, member.slackId, member.mailProductora, member.mailExterno]
        .filter(Boolean)
        .forEach(alias => lookup.set(normalizeEntityKey(alias), member));
    });
    return { lookup, members };
  }

  function resolveTeamMember(rawUser, directory) {
    const key = normalizeEntityKey(rawUser);
    if (!key) {
      return {
        canonicalKey: '',
        displayName: '',
        role: '',
        team: '',
        location: '',
        joinDate: '',
        tenureDays: null,
        tenureSegment: 'Sin padrón',
        activeInRoster: false,
      };
    }
    return directory.lookup.get(key) || {
      canonicalKey: String(rawUser || '').trim(),
      displayName: String(rawUser || '').trim(),
      role: '',
      team: '',
      location: '',
      joinDate: '',
      tenureDays: null,
      tenureSegment: 'Fuera de padrón',
      activeInRoster: false,
    };
  }

  function getCtx() {
    return window.CATALOGO_CTX || {};
  }

  function getData() {
    return getCtx().DATA || {};
  }

  function getFlowProfiles(config = state.config) {
    return config.flowWeights || config.flowProfiles || {};
  }

  function resolveRoleKey(rawRole) {
    const role = String(rawRole || '').trim().toLowerCase();
    if (!role) return 'analyst';
    for (const [key, aliases] of Object.entries(ROLE_ALIASES)) {
      if (aliases.some(alias => role.includes(alias))) return key;
    }
    return 'analyst';
  }

  function createDefaultConfig() {
    const flowWeights = {
      Demanda: { active: true, weight: 1, targetPointsPerDay: 88, minQualityPct: 95, minHoursPct: 85, maxHoldPct: 10, critical: false, roleScope: 'all', accessType: 'mixed', fairnessRisk: 'low', requiresManualCalibration: false, notes: '' },
      'Enhanced Content': { active: true, weight: 0.95, targetPointsPerDay: 86, minQualityPct: 96, minHoursPct: 85, maxHoldPct: 9, critical: false, roleScope: 'all', accessType: 'mixed', fairnessRisk: 'low', requiresManualCalibration: false, notes: '' },
      Enhancement: { active: true, weight: 1.3, targetPointsPerDay: 92, minQualityPct: 96, minHoursPct: 85, maxHoldPct: 8, critical: true, roleScope: 'all', accessType: 'mixed', fairnessRisk: 'medium', requiresManualCalibration: false, notes: '' },
      Validación: { active: true, weight: 0.95, targetPointsPerDay: 82, minQualityPct: 97, minHoursPct: 88, maxHoldPct: 7, critical: true, roleScope: 'all', accessType: 'restricted', fairnessRisk: 'medium', requiresManualCalibration: false, notes: '' },
      Soporte: { active: true, weight: 4.5, targetPointsPerDay: 72, minQualityPct: 94, minHoursPct: 82, maxHoldPct: 12, critical: true, roleScope: 'all', accessType: 'assigned', fairnessRisk: 'high', requiresManualCalibration: true, notes: 'Alta ponderación por complejidad. Revisar inequidad si no todos acceden al flujo.' },
      Fallos: { active: true, weight: 1.2, targetPointsPerDay: 84, minQualityPct: 95, minHoursPct: 85, maxHoldPct: 10, critical: true, roleScope: 'all', accessType: 'mixed', fairnessRisk: 'medium', requiresManualCalibration: true, notes: 'Pendiente revisar ponderación en mesa operativa.' },
      'Known Values': { active: true, weight: 1, targetPointsPerDay: 84, minQualityPct: 94, minHoursPct: 80, maxHoldPct: 12, critical: false, roleScope: 'all', accessType: 'mixed', fairnessRisk: 'low', requiresManualCalibration: false, notes: '' },
      'Non Value': { active: true, weight: 1, targetPointsPerDay: 84, minQualityPct: 94, minHoursPct: 80, maxHoldPct: 12, critical: false, roleScope: 'all', accessType: 'restricted', fairnessRisk: 'medium', requiresManualCalibration: true, referenceFlow: 'Merch', notes: 'Difícil de ponderar. Revisar contra Merch.' },
      Merch: { active: true, weight: 1, targetPointsPerDay: 84, minQualityPct: 94, minHoursPct: 80, maxHoldPct: 12, critical: false, roleScope: 'all', accessType: 'mixed', fairnessRisk: 'low', requiresManualCalibration: false, notes: '' },
    };

    const metricModels = {
      productivity_ratio: { label: METRIC_LABELS.productivity_ratio, direction: 'higher', weight: 0.35, floor: 0.75, target: 1.0, required: true },
      quality_pct: { label: METRIC_LABELS.quality_pct, direction: 'higher', weight: 0.30, floor: 90, target: 97, required: true },
      hold_pct: { label: METRIC_LABELS.hold_pct, direction: 'lower', weight: 0.15, target: 4, ceiling: 18, required: false },
      incidence_rate: { label: METRIC_LABELS.incidence_rate, direction: 'lower', weight: 0.10, target: 2, ceiling: 15, required: false },
      weekly_consistency_pct: { label: METRIC_LABELS.weekly_consistency_pct, direction: 'higher', weight: 0.10, floor: 45, target: 90, required: false },
      productive_hours_pct: { label: METRIC_LABELS.productive_hours_pct, direction: 'higher', weight: 0, floor: 75, target: 100, required: false },
      attendance_pct: { label: METRIC_LABELS.attendance_pct, direction: 'higher', weight: 0, floor: 80, target: 97, required: false },
      monthly_evaluation_score: { label: 'Evaluación mensual', direction: 'higher', weight: 0, floor: 60, target: 90, required: false },
    };

    return {
      version: '1.1.0',
      revision: 1,
      updatedAt: new Date().toISOString(),
      updatedBy: 'bootstrap',
      periodType: 'monthly',
      incentiveMode: 'monetary',
      period: {
        defaultType: 'month',
        minParticipationDays: 4,
        minTasks: 25,
        minAutoMetrics: 3,
        manualReviewOnPartial: true,
      },
      roles: {
        analyst: {
          active: true,
          requiresAdditionalData: false,
          baseWeights: {
            productivity_ratio: 35,
            quality_pct: 30,
            hold_pct: 10,
            incidence_rate: 10,
            productive_hours_pct: 10,
            monthly_evaluation_score: 5,
          },
        },
        team_leader: {
          active: false,
          requiresAdditionalData: true,
          baseWeights: {
            teamProductivity: 30,
            teamQuality: 30,
            holdManagement: 15,
            followUpCompliance: 15,
            operationalContribution: 10,
          },
        },
        quality_coordinator: {
          active: false,
          requiresAdditionalData: true,
          baseWeights: {
            auditCoverage: 25,
            qualityImprovement: 25,
            reincidenceReduction: 20,
            feedbackTimeliness: 15,
            processDocumentation: 15,
          },
        },
        quality_analyst: {
          active: false,
          requiresAdditionalData: true,
          baseWeights: {
            auditCoverage: 35,
            qualityImprovement: 25,
            reincidenceReduction: 20,
            feedbackTimeliness: 20,
          },
        },
        project_manager: {
          active: false,
          requiresAdditionalData: true,
          baseWeights: {
            deliveryHealth: 35,
            teamQuality: 25,
            processImprovement: 20,
            planningAccuracy: 20,
          },
        },
      },
      baseEligibility: {
        rewardBaseCompliantProfiles: true,
        minimumBandCanReceiveIncentive: true,
        requiresCriticalData: ['productivity_ratio'],
        recommendedCriticalData: ['quality_pct', 'hold_pct', 'incidence_rate'],
      },
      scoring: {
        minScore: 0,
        maxScore: 100,
        minWeightTotal: 0.99,
        maxWeightTotal: 1.01,
      },
      consistency: {
        weeklyProductivityMin: 0.95,
        weeklyQualityMin: 95,
        lookbackWeeks: 4,
      },
      metricModels,
      flowWeights,
      antiGamingRules: [
        { id: 'high_points_low_quality', name: 'Alta productividad con baja calidad', type: 'alert', active: true, severity: 'high', mode: 'alert' },
        { id: 'high_points_high_hold', name: 'Alta productividad con HOLD alto', type: 'alert', active: true, severity: 'high', mode: 'alert' },
        { id: 'zero_incidents_expected_context', name: 'Cero incidencias en contexto sensible', type: 'manual_review', active: true, severity: 'medium', mode: 'manual_review' },
        { id: 'high_weight_flow_concentration', name: 'Concentración en flujos de alto puntaje', type: 'alert', active: true, severity: 'medium', mode: 'alert' },
        { id: 'abrupt_flow_mix_change', name: 'Cambio brusco de mix de flujos', type: 'alert', active: true, severity: 'medium', mode: 'alert' },
      ],
      initiatives: {
        enabled: true,
        maxMonthlyImpact: 5,
        requiresEvidence: true,
        requiresValidator: true,
        impactMode: 'points',
      },
      monthlyEvaluation: {
        enabled: true,
        maxImpact: 3,
        missingResponsePenalty: -1,
        lowScorePenalty: -2,
        highScoreAccelerator: 1,
        lowScoreThreshold: 60,
        highScoreThreshold: 85,
      },
      economicAllocation: {
        enabled: true,
        currency: 'ARS',
        budget: 0,
        pools: {
          base: 0.50,
          performance: 0.35,
          excellence: 0.15,
        },
        includeBaseBand: true,
        includeManualReview: false,
        excellenceBand: 'Elegible sobresaliente',
        maxIndividualBudgetShare: 0.10,
        baseMinimumAmount: 0,
        roundingStep: 100,
      },
      rules: createDefaultRules(),
      bands: createDefaultBands(),
    };
  }

  function createDefaultRules() {
    return [
      {
        id: uid('rule'),
        name: 'Calidad mínima',
        description: 'Para ser elegible, la calidad no puede quedar por debajo del guardrail.',
        metric: 'quality_pct',
        type: 'minimum',
        active: true,
        severity: 'high',
        operator: 'gte',
        threshold: 95,
        thresholdMax: null,
        impactMode: 'block',
        impactValue: 0,
        priority: 100,
        stackable: false,
        maxImpact: null,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'require',
      },
      {
        id: uid('rule'),
        name: 'Horas productivas mínimas',
        description: 'Sin tracción operativa real no se habilita el incentivo.',
        metric: 'productive_hours_pct',
        type: 'minimum',
        active: true,
        severity: 'medium',
        operator: 'gte',
        threshold: 85,
        thresholdMax: null,
        impactMode: 'block',
        impactValue: 0,
        priority: 95,
        stackable: false,
        maxImpact: null,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'allow_partial',
      },
      {
        id: uid('rule'),
        name: 'Participación suficiente',
        description: 'Evita premiar muestras chicas o períodos sin volumen representativo.',
        metric: 'participation_days',
        type: 'minimum',
        active: true,
        severity: 'medium',
        operator: 'gte',
        threshold: 4,
        thresholdMax: null,
        impactMode: 'block',
        impactValue: 0,
        priority: 94,
        stackable: false,
        maxImpact: null,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'allow_partial',
      },
      {
        id: uid('rule'),
        name: 'Exclusión por errores graves',
        description: 'Los desvíos severos bloquean automáticamente la elegibilidad.',
        metric: 'severe_errors',
        type: 'exclusion',
        active: true,
        severity: 'critical',
        operator: 'gt',
        threshold: 1,
        thresholdMax: null,
        impactMode: 'block',
        impactValue: 0,
        priority: 120,
        stackable: false,
        maxImpact: null,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'allow_partial',
      },
      {
        id: uid('rule'),
        name: 'Exclusión por HOLD excesivo',
        description: 'Protege al esquema de hold innecesario o mala gestión del flujo.',
        metric: 'hold_pct',
        type: 'exclusion',
        active: true,
        severity: 'high',
        operator: 'gt',
        threshold: 18,
        thresholdMax: null,
        impactMode: 'block',
        impactValue: 0,
        priority: 118,
        stackable: false,
        maxImpact: null,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'allow_partial',
      },
      {
        id: uid('rule'),
        name: 'Calidad sobresaliente',
        description: 'Premia calidad muy por encima del mínimo operativo.',
        metric: 'quality_pct',
        type: 'accelerator',
        active: true,
        severity: 'low',
        operator: 'gte',
        threshold: 98.5,
        thresholdMax: null,
        impactMode: 'points',
        impactValue: 6,
        priority: 40,
        stackable: true,
        maxImpact: 6,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'allow_partial',
      },
      {
        id: uid('rule'),
        name: 'Productividad por encima del target',
        description: 'Acelera sólo si la persona ya está en zona sana.',
        metric: 'productivity_ratio',
        type: 'accelerator',
        active: true,
        severity: 'low',
        operator: 'gte',
        threshold: 1.08,
        thresholdMax: null,
        impactMode: 'points',
        impactValue: 5,
        priority: 35,
        stackable: true,
        maxImpact: 5,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'allow_partial',
      },
      {
        id: uid('rule'),
        name: 'Consistencia sostenida',
        description: 'Reconoce desempeño sano y repetible en varias semanas.',
        metric: 'weekly_consistency_pct',
        type: 'accelerator',
        active: true,
        severity: 'low',
        operator: 'gte',
        threshold: 80,
        thresholdMax: null,
        impactMode: 'points',
        impactValue: 4,
        priority: 32,
        stackable: true,
        maxImpact: 4,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'allow_partial',
      },
      {
        id: uid('rule'),
        name: 'Mejora vs período anterior',
        description: 'Premia mejora real, no sólo foto del período.',
        metric: 'improvement_vs_previous_pct',
        type: 'accelerator',
        active: true,
        severity: 'low',
        operator: 'gte',
        threshold: 4,
        thresholdMax: null,
        impactMode: 'points',
        impactValue: 3,
        priority: 31,
        stackable: true,
        maxImpact: 3,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'allow_partial',
      },
      {
        id: uid('rule'),
        name: 'Gap volumen/calidad riesgoso',
        description: 'Penaliza cuando la productividad aparente se despega de la calidad.',
        metric: 'productivity_quality_gap',
        type: 'penalty',
        active: true,
        severity: 'high',
        operator: 'gt',
        threshold: 12,
        thresholdMax: null,
        impactMode: 'points',
        impactValue: 6,
        priority: 80,
        stackable: false,
        maxImpact: 6,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'allow_partial',
      },
      {
        id: uid('rule'),
        name: 'Reincidencia de errores',
        description: 'Castiga repetir desvíos ya corregidos pedagógicamente.',
        metric: 'recurrence_count',
        type: 'penalty',
        active: true,
        severity: 'high',
        operator: 'gt',
        threshold: 1,
        thresholdMax: null,
        impactMode: 'points',
        impactValue: 5,
        priority: 82,
        stackable: true,
        maxImpact: 10,
        flowScope: 'all',
        roleScope: 'all',
        periodScope: 'selected',
        dataMode: 'allow_partial',
      },
    ];
  }

  function createDefaultBands() {
    return [
      { id: uid('band'), label: 'Cumple objetivo base', min: 72, max: 84, payoutPct: 40, color: '#5b7fff' },
      { id: uid('band'), label: 'Elegible base', min: 84, max: 92, payoutPct: 70, color: '#3ecf8e' },
      { id: uid('band'), label: 'Elegible destacado', min: 92, max: 97, payoutPct: 100, color: '#a78bfa' },
      { id: uid('band'), label: 'Elegible sobresaliente', min: 97, max: 101, payoutPct: 125, color: '#f6a623' },
    ];
  }

  function loadState() {
    const storedConfig = safeStorage.get(STORAGE.config, null);
    state.config = migrateConfig(storedConfig || createDefaultConfig());
    // Persist the bootstrapped or migrated config so first-run and legacy sessions stay auditable.
    if (!storedConfig || JSON.stringify(storedConfig) !== JSON.stringify(state.config)) {
      safeStorage.set(STORAGE.config, state.config);
    }
    state.audit = safeStorage.get(STORAGE.audit, []);
    state.baseline = safeStorage.get(STORAGE.baseline, null);
    state.filters.periodType = state.config.period.defaultType || 'month';
  }

  function persistConfig(reason, extra = {}) {
    state.config = migrateConfig(state.config);
    state.config.revision = (state.config.revision || 0) + 1;
    state.config.updatedAt = new Date().toISOString();
    state.config.updatedBy = getActor();
    safeStorage.set(STORAGE.config, state.config);
    const entry = {
      id: uid('audit'),
      at: state.config.updatedAt,
      by: state.config.updatedBy,
      version: state.config.version,
      revision: state.config.revision,
      reason,
      snapshot: deepClone(state.config),
      note: extra.note || '',
    };
    state.audit.unshift(entry);
    state.audit = state.audit.slice(0, 50);
    safeStorage.set(STORAGE.audit, state.audit);
    renderAll();
  }

  function migrateConfig(input) {
    const defaults = createDefaultConfig();
    const cfg = deepClone(input || defaults);
    cfg.version = defaults.version;
    cfg.revision = cfg.revision || defaults.revision;
    cfg.periodType = cfg.periodType || defaults.periodType;
    cfg.incentiveMode = cfg.incentiveMode || defaults.incentiveMode;
    cfg.period = { ...defaults.period, ...(cfg.period || {}) };
    cfg.scoring = { ...defaults.scoring, ...(cfg.scoring || {}) };
    cfg.consistency = { ...defaults.consistency, ...(cfg.consistency || {}) };
    cfg.baseEligibility = { ...defaults.baseEligibility, ...(cfg.baseEligibility || {}) };
    cfg.monthlyEvaluation = { ...defaults.monthlyEvaluation, ...(cfg.monthlyEvaluation || {}) };
    cfg.initiatives = { ...defaults.initiatives, ...(cfg.initiatives || {}) };
    cfg.economicAllocation = {
      ...defaults.economicAllocation,
      ...(cfg.economicAllocation || {}),
      pools: {
        ...defaults.economicAllocation.pools,
        ...((cfg.economicAllocation || {}).pools || {}),
      },
    };
    cfg.roles = { ...defaults.roles, ...(cfg.roles || {}) };
    Object.keys(defaults.roles).forEach(role => {
      cfg.roles[role] = {
        ...defaults.roles[role],
        ...(cfg.roles[role] || {}),
        baseWeights: {
          ...defaults.roles[role].baseWeights,
          ...((cfg.roles[role] || {}).baseWeights || {}),
        },
      };
    });
    cfg.metricModels = { ...defaults.metricModels, ...(cfg.metricModels || {}) };
    Object.keys(defaults.metricModels).forEach(metric => {
      cfg.metricModels[metric] = { ...defaults.metricModels[metric], ...(cfg.metricModels[metric] || {}) };
    });
    cfg.flowWeights = { ...(cfg.flowWeights || cfg.flowProfiles || {}) };
    Object.keys(defaults.flowWeights).forEach(flow => {
      cfg.flowWeights[flow] = { ...defaults.flowWeights[flow], ...(cfg.flowWeights[flow] || {}) };
    });
    cfg.flowProfiles = cfg.flowWeights;
    cfg.antiGamingRules = Array.isArray(cfg.antiGamingRules) && cfg.antiGamingRules.length ? cfg.antiGamingRules : defaults.antiGamingRules;
    cfg.rules = Array.isArray(cfg.rules) ? cfg.rules : defaults.rules;
    cfg.bands = Array.isArray(cfg.bands) && cfg.bands.length ? cfg.bands : defaults.bands;
    cfg.scoring.minScore = clamp(Number(cfg.scoring.minScore ?? defaults.scoring.minScore), 0, 100);
    cfg.scoring.maxScore = clamp(Number(cfg.scoring.maxScore ?? defaults.scoring.maxScore), cfg.scoring.minScore, 100);
    return cfg;
  }

  function getActor() {
    return document.getElementById('config-actor')?.value?.trim() || state.config.updatedBy || 'local-ui';
  }

  function defaultRuleDraft() {
    return {
      id: '',
      name: '',
      description: '',
      metric: 'quality_pct',
      type: 'accelerator',
      active: true,
      severity: 'medium',
      operator: 'gte',
      threshold: 0,
      thresholdMax: '',
      impactMode: 'points',
      impactValue: 3,
      priority: 50,
      stackable: true,
      maxImpact: '',
      flowScope: 'all',
      roleScope: 'all',
      periodScope: 'selected',
      dataMode: 'allow_partial',
    };
  }

  function bootstrapDom() {
    const binds = [
      ['inc-period-type', 'change', () => {
        state.filters.periodType = document.getElementById('inc-period-type').value;
        state.filters.periodKey = 'latest';
        renderAll();
      }],
      ['inc-period-key', 'change', () => {
        state.filters.periodKey = document.getElementById('inc-period-key').value;
        renderAll();
      }],
      ['inc-team-filter', 'change', () => {
        state.filters.team = document.getElementById('inc-team-filter').value;
        renderAll(false);
      }],
      ['inc-band-filter', 'change', () => {
        state.filters.band = document.getElementById('inc-band-filter').value;
        renderAll(false);
      }],
      ['inc-search', 'input', () => {
        state.filters.search = document.getElementById('inc-search').value;
        renderAll(false);
      }],
      ['inc-export-csv', 'click', exportCurrentCsv],
      ['inc-export-json', 'click', exportCurrentJson],
      ['config-save-baseline', 'click', saveBaseline],
      ['config-restore-baseline', 'click', restoreBaseline],
      ['config-reset-defaults', 'click', resetDefaults],
      ['config-add-flow', 'click', addFlowProfile],
      ['config-new-rule', 'click', () => {
        state.ruleDraft = defaultRuleDraft();
        renderRuleEditor();
      }],
    ];

    binds.forEach(([id, event, handler]) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener(event, handler);
    });

    const tbody = document.getElementById('incentive-tbody');
    if (tbody) {
      tbody.addEventListener('click', event => {
        const btn = event.target.closest('[data-user]');
        if (!btn) return;
        state.selectedUser = btn.getAttribute('data-user') || '';
        renderDetail();
      });
    }

    const flowBody = document.getElementById('config-flow-tbody');
    if (flowBody) {
      flowBody.addEventListener('change', onFlowTableInput);
      flowBody.addEventListener('click', onFlowTableAction);
    }

    const metricsWrap = document.getElementById('config-metric-models');
    if (metricsWrap) {
      metricsWrap.addEventListener('change', onMetricModelInput);
    }

    const generalWrap = document.getElementById('config-general-settings');
    if (generalWrap) {
      generalWrap.addEventListener('change', onGeneralSettingsInput);
    }

    const roleWrap = document.getElementById('config-role-settings');
    if (roleWrap) {
      roleWrap.addEventListener('change', onRoleSettingsInput);
    }

    const programWrap = document.getElementById('config-program-settings');
    if (programWrap) {
      programWrap.addEventListener('change', onProgramSettingsInput);
    }

    const economicWrap = document.getElementById('incentive-economic-controls');
    if (economicWrap) {
      economicWrap.addEventListener('change', onEconomicControlsInput);
      economicWrap.addEventListener('click', onEconomicControlsClick);
    }

    const rulesBody = document.getElementById('config-rules-tbody');
    if (rulesBody) {
      rulesBody.addEventListener('click', onRuleTableAction);
    }

    const ruleEditor = document.getElementById('config-rule-editor');
    if (ruleEditor) {
      ruleEditor.addEventListener('input', onRuleEditorInput);
      ruleEditor.addEventListener('change', onRuleEditorInput);
      ruleEditor.addEventListener('click', onRuleEditorClick);
    }

    const bandsEditor = document.getElementById('config-bands-editor');
    if (bandsEditor) {
      bandsEditor.addEventListener('change', onBandsInput);
      bandsEditor.addEventListener('click', onBandsAction);
    }

    document.addEventListener('catalogo:data-updated', renderAll);
    document.addEventListener('catalogo:page-change', () => {
      renderAll(false);
    });
  }

  function exportCurrentCsv() {
    if (!state.evaluation) return;
    const lines = [
      ['usuario', 'nombre', 'equipo', 'rol', 'banda', 'estado', 'robustez', 'score_final', 'asignacion_base', 'asignacion_performance', 'asignacion_excellence', 'asignacion_total_estimada', 'productividad_ratio', 'calidad_pct', 'hold_pct_tareas', 'hold_pct_ids', 'incidencias', 'consistencia_pct', 'datos', 'motivo_simulacion', 'alertas', 'motivos_revision', 'presupuesto', 'moneda', 'pool_base_pct', 'pool_performance_pct', 'pool_excellence_pct', 'timestamp_simulacion', 'config_version'].join(','),
      ...state.evaluation.visibleRows.map(row => [
        csv(row.user),
        csv(row.name),
        csv(row.team),
        csv(row.role),
        csv(row.bandLabel),
        csv(row.statusLabel),
        csv(row.robustness?.label || '—'),
        row.finalScore,
        row.economic?.baseAmount || 0,
        row.economic?.performanceAmount || 0,
        row.economic?.excellenceAmount || 0,
        row.economic?.totalEstimated || 0,
        row.metrics.productivity_ratio,
        row.metrics.quality_pct,
        row.metrics.hold_pct_tasks,
        row.metrics.hold_pct_ids,
        row.metrics.incidences,
        row.metrics.weekly_consistency_pct,
        row.dataStatus,
        csv(row.economic?.reason || ''),
        csv((row.economic?.alerts || []).join(' | ')),
        csv([...row.exclusionReasons, ...row.minimumFailures, ...row.manualReviewReasons].join(' | ')),
        state.evaluation.economic?.budget || 0,
        csv(state.evaluation.economic?.currency || 'ARS'),
        state.config.economicAllocation?.pools?.base ?? 0,
        state.config.economicAllocation?.pools?.performance ?? 0,
        state.config.economicAllocation?.pools?.excellence ?? 0,
        csv(new Date().toISOString()),
        csv(`${state.config.version} r${state.config.revision || 1}`),
      ].join(',')),
    ];
    downloadFile(`incentivos_${state.evaluation.periodType}_${state.evaluation.periodKey}.csv`, lines.join('\n'), 'text/csv;charset=utf-8');
  }

  function exportCurrentJson() {
    if (!state.evaluation) return;
    downloadFile(
      `incentivos_${state.evaluation.periodType}_${state.evaluation.periodKey}.json`,
      JSON.stringify({
        exportedAt: new Date().toISOString(),
        configVersion: state.config.version,
        config: state.config,
        economicSimulation: state.evaluation.economic,
        evaluation: state.evaluation,
      }, null, 2),
      'application/json;charset=utf-8',
    );
  }

  function csv(value) {
    return `"${String(value ?? '').replace(/"/g, '""')}"`;
  }

  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function saveBaseline() {
    if (!state.config) return;
    state.baseline = {
      savedAt: new Date().toISOString(),
      savedBy: getActor(),
      config: deepClone(state.config),
    };
    safeStorage.set(STORAGE.baseline, state.baseline);
    renderAll(false);
  }

  function restoreBaseline() {
    if (!state.baseline?.config) return;
    state.config = deepClone(state.baseline.config);
    persistConfig('restore-baseline', { note: 'Restaurada desde baseline guardada' });
  }

  function resetDefaults() {
    state.config = createDefaultConfig();
    state.ruleDraft = defaultRuleDraft();
    persistConfig('reset-defaults', { note: 'Vuelta a configuración base sugerida' });
  }

  function addFlowProfile() {
    let baseName = 'Nuevo Flujo';
    let suffix = 1;
    const flows = getFlowProfiles(state.config);
    while (flows[`${baseName} ${suffix}`]) suffix += 1;
    flows[`${baseName} ${suffix}`] = {
      active: true,
      weight: 1,
      targetPointsPerDay: 84,
      minQualityPct: 95,
      minHoursPct: 85,
      maxHoldPct: 10,
      critical: false,
      roleScope: 'all',
      accessType: 'mixed',
      fairnessRisk: 'low',
      requiresManualCalibration: false,
      notes: '',
    };
    state.config.flowWeights = flows;
    state.config.flowProfiles = flows;
    persistConfig('add-flow', { note: `${baseName} ${suffix}` });
  }

  function onFlowTableInput(event) {
    const target = event.target;
    const flow = target.getAttribute('data-flow');
    const field = target.getAttribute('data-field');
    if (!flow || !field) return;
    const flows = getFlowProfiles(state.config);
    const profile = flows[flow];
    if (!profile) return;
    profile[field] = target.type === 'checkbox' ? target.checked : (target.type === 'number' ? Number(target.value) : target.value);
    state.config.flowWeights = flows;
    state.config.flowProfiles = flows;
    state.config.updatedBy = getActor();
    persistConfig('edit-flow', { note: `${flow} · ${field}` });
  }

  function onFlowTableAction(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const flow = btn.getAttribute('data-flow');
    if (!flow) return;
    if (action === 'delete-flow') {
      const flows = getFlowProfiles(state.config);
      delete flows[flow];
      state.config.flowWeights = flows;
      state.config.flowProfiles = flows;
      persistConfig('delete-flow', { note: flow });
    }
  }

  function onMetricModelInput(event) {
    const input = event.target;
    const metric = input.getAttribute('data-metric');
    const field = input.getAttribute('data-field');
    if (!metric || !field) return;
    const model = state.config.metricModels[metric];
    if (!model) return;
    model[field] = input.type === 'checkbox' ? input.checked : (input.type === 'number' ? Number(input.value) : input.value);
    persistConfig('edit-metric-model', { note: `${metric} · ${field}` });
  }

  function onGeneralSettingsInput(event) {
    const input = event.target;
    const section = input.getAttribute('data-section');
    const field = input.getAttribute('data-field');
    if (!section || !field) return;
    const container = state.config[section];
    if (!container) return;
    container[field] = input.type === 'checkbox' ? input.checked : (input.type === 'number' ? Number(input.value) : input.value);
    persistConfig('edit-general-settings', { note: `${section}.${field}` });
  }

  function onRoleSettingsInput(event) {
    const input = event.target;
    const role = input.getAttribute('data-role');
    const field = input.getAttribute('data-field');
    const weightKey = input.getAttribute('data-weight-key');
    if (!role) return;
    const roleCfg = state.config.roles[role];
    if (!roleCfg) return;
    if (weightKey) {
      roleCfg.baseWeights[weightKey] = Number(input.value);
      persistConfig('edit-role-weights', { note: `${role}.${weightKey}` });
      return;
    }
    if (!field) return;
    roleCfg[field] = input.type === 'checkbox' ? input.checked : input.value;
    persistConfig('edit-role-settings', { note: `${role}.${field}` });
  }

  function onProgramSettingsInput(event) {
    const input = event.target;
    const section = input.getAttribute('data-program-section');
    const field = input.getAttribute('data-field');
    const itemId = input.getAttribute('data-item-id');
    const poolKey = input.getAttribute('data-pool-key');
    if (section === 'antiGaming' && itemId) {
      const item = state.config.antiGamingRules.find(rule => rule.id === itemId);
      if (!item) return;
      item[field] = input.type === 'checkbox' ? input.checked : input.value;
      persistConfig('edit-antigaming-rule', { note: `${item.name}.${field}` });
      return;
    }
    if (!section || !field) return;
    const target = state.config[section];
    if (!target) return;
    if (section === 'economicAllocation' && poolKey) {
      target.pools[poolKey] = input.type === 'number' ? Number(input.value) : input.value;
      persistConfig('edit-economic-pool', { note: `${poolKey}` });
      return;
    }
    target[field] = input.type === 'checkbox' ? input.checked : (input.type === 'number' ? Number(input.value) : input.value);
    persistConfig('edit-program-settings', { note: `${section}.${field}` });
  }

  function onEconomicControlsInput(event) {
    const input = event.target;
    const field = input.getAttribute('data-economic-field');
    const poolKey = input.getAttribute('data-economic-pool');
    if (poolKey) {
      state.config.economicAllocation.pools[poolKey] = Number(input.value);
      persistConfig('edit-economic-simulation', { note: `pool.${poolKey}` });
      return;
    }
    if (!field) return;
    state.config.economicAllocation[field] = input.type === 'checkbox'
      ? input.checked
      : (input.type === 'number' ? Number(input.value) : input.value);
    persistConfig('edit-economic-simulation', { note: field });
  }

  function onEconomicControlsClick(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'economic-recalc') {
      renderAll();
      return;
    }
    if (action === 'economic-reset') {
      state.config.economicAllocation = deepClone(createDefaultConfig().economicAllocation);
      persistConfig('reset-economic-simulation', { note: 'Parámetros económicos reseteados' });
    }
  }

  function onRuleTableAction(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    const rule = state.config.rules.find(item => item.id === id);
    if (!rule) return;

    if (action === 'edit-rule') {
      state.ruleDraft = deepClone(rule);
      renderRuleEditor();
      return;
    }
    if (action === 'toggle-rule') {
      rule.active = !rule.active;
      persistConfig('toggle-rule', { note: `${rule.name} -> ${rule.active ? 'activo' : 'inactivo'}` });
      return;
    }
    if (action === 'duplicate-rule') {
      const copy = deepClone(rule);
      copy.id = uid('rule');
      copy.name = `${copy.name} (copia)`;
      state.config.rules.unshift(copy);
      persistConfig('duplicate-rule', { note: copy.name });
      return;
    }
    if (action === 'delete-rule') {
      state.config.rules = state.config.rules.filter(item => item.id !== id);
      if (state.ruleDraft?.id === id) state.ruleDraft = defaultRuleDraft();
      persistConfig('delete-rule', { note: rule.name });
    }
  }

  function onRuleEditorInput(event) {
    const input = event.target;
    const field = input.getAttribute('data-field');
    if (!field) return;
    if (!state.ruleDraft) state.ruleDraft = defaultRuleDraft();
    state.ruleDraft[field] = input.type === 'checkbox' ? input.checked : (input.type === 'number' ? Number(input.value) : input.value);
  }

  function onRuleEditorClick(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    if (action === 'cancel-rule') {
      state.ruleDraft = defaultRuleDraft();
      renderRuleEditor();
      return;
    }
    if (action === 'save-rule') {
      saveRuleDraft();
    }
  }

  function saveRuleDraft() {
    if (!state.ruleDraft) return;
    const draft = deepClone(state.ruleDraft);
    draft.threshold = draft.threshold === '' ? null : Number(draft.threshold);
    draft.thresholdMax = draft.thresholdMax === '' ? null : Number(draft.thresholdMax);
    draft.impactValue = draft.impactValue === '' ? 0 : Number(draft.impactValue);
    draft.priority = draft.priority === '' ? 50 : Number(draft.priority);
    draft.maxImpact = draft.maxImpact === '' ? null : Number(draft.maxImpact);
    if (!draft.name || !draft.metric) return;

    if (draft.id) {
      const index = state.config.rules.findIndex(rule => rule.id === draft.id);
      if (index >= 0) state.config.rules[index] = draft;
    } else {
      draft.id = uid('rule');
      state.config.rules.unshift(draft);
    }
    state.ruleDraft = deepClone(draft);
    persistConfig('save-rule', { note: draft.name });
  }

  function onBandsInput(event) {
    const input = event.target;
    const id = input.getAttribute('data-id');
    const field = input.getAttribute('data-field');
    const band = state.config.bands.find(item => item.id === id);
    if (!band || !field) return;
    band[field] = input.type === 'number' ? Number(input.value) : input.value;
    persistConfig('edit-band', { note: `${band.label} · ${field}` });
  }

  function onBandsAction(event) {
    const btn = event.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.getAttribute('data-action');
    const id = btn.getAttribute('data-id');
    if (action === 'add-band') {
      state.config.bands.push({ id: uid('band'), label: 'Nueva banda', min: 0, max: 100, payoutPct: 75, color: '#2dd4bf' });
      persistConfig('add-band', { note: 'Nueva banda' });
      return;
    }
    if (action === 'delete-band') {
      state.config.bands = state.config.bands.filter(item => item.id !== id);
      persistConfig('delete-band', { note: id });
    }
  }

  function buildDailyRecords(teamDirectory = buildTeamDirectory()) {
    const ctx = getCtx();
    const data = getData();
    const rows = data.hist || [];
    if (!rows.length || !ctx.findCol || !ctx.parseDate) return [];

    const sample = rows[0];
    const histCols = {
      date: ctx.findCol(sample, ['Fecha', 'fecha', 'Date', 'date', 'FECHA']),
      status: ctx.findCol(sample, ['Status', 'status', 'Estado', 'estado', 'STATUS']),
      flow: ctx.findCol(sample, ['Flujo de Tarea', 'Flujo', 'flujo', 'FLUJO', 'flow', 'Flow']),
      user: ctx.findCol(sample, ['Usuario', 'usuario', 'User', 'user', 'USUARIO', 'Colaborador', 'colaborador', 'ID_MELI', 'id_meli']),
      quality: ctx.findCol(sample, ['Calidad', 'calidad', 'Quality', 'quality', 'quality_pct', 'Calidad %']),
      holdPct: ctx.findCol(sample, ['HOLD %', 'Hold %', 'hold_pct', 'Porcentaje HOLD', 'porcentaje_hold']),
      productiveHoursPct: ctx.findCol(sample, ['Horas Productivas %', 'productive_hours_pct', 'Cumplimiento Horas Productivas %']),
      productiveHours: ctx.findCol(sample, ['Horas Productivas', 'horas_productivas', 'productive_hours']),
      productiveHoursTarget: ctx.findCol(sample, ['Objetivo Horas Productivas', 'horas_productivas_target', 'productive_hours_target']),
      attendancePct: ctx.findCol(sample, ['Asistencia %', 'attendance_pct', 'Disponibilidad %', 'availability_pct']),
      incidences: ctx.findCol(sample, ['Incidencias', 'incidencias', 'incident_count']),
      iniciativa: ctx.findCol(sample, ['Iniciativa', 'iniciativa']),
      idsWorked: ctx.findCol(sample, ['IDs trabajados', 'IDs_Trabajados', 'ids_trabajados']),
      idLink: ctx.findCol(sample, ['ID - LINK', 'ID-LINK', 'id_link', 'idCaso', 'id_caso']),
      comments: ctx.findCol(sample, ['Comentarios', 'comentarios', 'Comentario', 'comentario']),
      criticalIncidents: ctx.findCol(sample, ['Incidencias Críticas', 'incidencias_criticas', 'critical_incidents']),
      severeErrors: ctx.findCol(sample, ['Errores Graves', 'errores_graves', 'severe_errors']),
      recurrence: ctx.findCol(sample, ['Reincidencia', 'reincidencia', 'error_recurrence_count', 'recurrent_errors']),
      slaPct: ctx.findCol(sample, ['SLA %', 'sla_pct', 'Cumplimiento SLA %']),
      trustedData: ctx.findCol(sample, ['Datos Confiables', 'trusted_data', 'data_trusted']),
    };

    const map = new Map();
    const lifecycleByUser = new Map();

    rows.forEach(row => {
      const rawUser = String(row[histCols.user] || '').trim();
      const date = ctx.parseDate(String(row[histCols.date] || ''));
      if (!rawUser || !date) return;
      const member = resolveTeamMember(rawUser, teamDirectory);
      const user = member.canonicalKey || rawUser;
      const key = `${user}__${date.toISOString().slice(0, 10)}`;
      const status = String(row[histCols.status] || '').trim().toUpperCase();
      const flow = String(row[histCols.flow] || 'Demanda').trim() || 'Demanda';
      const workedIds = parseIdsField(row[histCols.idsWorked], row[histCols.idLink]);
      const incidenceTokens = histCols.incidences ? parseIncidenceTokens(row[histCols.incidences]) : null;
      const initiative = String(row[histCols.iniciativa] || '').trim();

      if (!map.has(key)) {
        const wk = isoWeekSafe(date);
        map.set(key, {
          user,
          rawUsers: new Set(),
          date,
          dateKey: date.toISOString().slice(0, 10),
          monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
          weekKey: `${wk.year}-W${String(wk.week).padStart(2, '0')}`,
          year: date.getFullYear(),
          flowCounts: {},
          totalTasks: 0,
          doneTasks: 0,
          holdTasks: 0,
          points: 0,
          qualityValues: [],
          holdPctValues: [],
          productiveHoursPctValues: [],
          productiveHoursValues: [],
          productiveHoursTargetValues: [],
          attendancePctValues: [],
          incidenceValues: [],
          criticalIncidentValues: [],
          severeErrorValues: [],
          recurrenceValues: [],
          slaPctValues: [],
          monthlyEvalScoreValues: [],
          monthlyEvalResponseFlags: [],
          monthlyEvalStatusValues: [],
          initiativeImpactValues: [],
          initiativeApprovedCountValues: [],
          workedIdsSet: new Set(),
          holdIdsSet: new Set(),
          incidenceTypes: {},
          incidenceRecords: 0,
          incidentsOnHold: 0,
          holdByFlow: {},
          holdByIncidence: {},
          initiatives: {},
          trustedFlags: [],
        });
      }

      const bucket = map.get(key);
      bucket.rawUsers.add(rawUser);
      bucket.totalTasks += 1;
      bucket.flowCounts[flow] = (bucket.flowCounts[flow] || 0) + 1;
      if (status === 'DONE') {
        bucket.doneTasks += 1;
        bucket.points += getWeightForFlow(flow, status);
      }
      workedIds.forEach(id => bucket.workedIdsSet.add(id));
      if (status.includes('HOLD')) {
        bucket.holdTasks += 1;
        bucket.holdByFlow[flow] = (bucket.holdByFlow[flow] || 0) + 1;
        workedIds.forEach(id => bucket.holdIdsSet.add(id));
      }
      if (initiative) bucket.initiatives[initiative] = (bucket.initiatives[initiative] || 0) + 1;
      if (incidenceTokens !== null) {
        if (incidenceTokens.length) bucket.incidenceRecords += incidenceTokens.length;
        incidenceTokens.forEach(token => {
          bucket.incidenceTypes[token] = (bucket.incidenceTypes[token] || 0) + 1;
          if (status.includes('HOLD')) bucket.holdByIncidence[token] = (bucket.holdByIncidence[token] || 0) + 1;
        });
        if (status.includes('HOLD')) bucket.incidentsOnHold += incidenceTokens.length;
      }

      if (workedIds.length) {
        const lifecycle = lifecycleByUser.get(user) || {};
        workedIds.forEach(id => {
          const item = lifecycle[id] || { firstHold: null, firstDoneAfterHold: null };
          if (status.includes('HOLD') && !item.firstHold) item.firstHold = new Date(date.getTime());
          if (status === 'DONE' && item.firstHold && !item.firstDoneAfterHold && date >= item.firstHold) item.firstDoneAfterHold = new Date(date.getTime());
          lifecycle[id] = item;
        });
        lifecycleByUser.set(user, lifecycle);
      }

      collectMetric(bucket.qualityValues, parsePercentish(row[histCols.quality]));
      collectMetric(bucket.holdPctValues, parsePercentish(row[histCols.holdPct]));
      collectMetric(bucket.productiveHoursPctValues, parsePercentish(row[histCols.productiveHoursPct]));
      collectMetric(bucket.productiveHoursValues, parseNumber(row[histCols.productiveHours]));
      collectMetric(bucket.productiveHoursTargetValues, parseNumber(row[histCols.productiveHoursTarget]));
      collectMetric(bucket.attendancePctValues, parsePercentish(row[histCols.attendancePct]));
      collectMetric(bucket.incidenceValues, parseNumber(row[histCols.incidences]));
      collectMetric(bucket.criticalIncidentValues, parseNumber(row[histCols.criticalIncidents]));
      collectMetric(bucket.severeErrorValues, parseNumber(row[histCols.severeErrors]));
      collectMetric(bucket.recurrenceValues, parseNumber(row[histCols.recurrence]));
      collectMetric(bucket.slaPctValues, parsePercentish(row[histCols.slaPct]));
      const trusted = parseBooleanish(row[histCols.trustedData]);
      if (trusted !== null) bucket.trustedFlags.push(trusted);
    });

    enrichWithMetricsCsv(map, data.metricas || []);

    const holdLifecycleByUser = {};
    lifecycleByUser.forEach((entries, user) => {
      let totalDays = 0;
      let count = 0;
      Object.values(entries).forEach(item => {
        if (item.firstHold && item.firstDoneAfterHold) {
          totalDays += Math.max(0, Math.round((item.firstDoneAfterHold - item.firstHold) / 86400000));
          count += 1;
        }
      });
      holdLifecycleByUser[user] = count ? round(totalDays / count, 1) : null;
    });

    return [...map.values()].map(item => {
      const qualityPct = average(item.qualityValues);
      const explicitHoldPct = average(item.holdPctValues);
      const productiveHours = arrayMax(item.productiveHoursValues);
      const productiveHoursTarget = arrayMax(item.productiveHoursTargetValues);
      const productiveHoursPct = average(item.productiveHoursPctValues) ?? (
        productiveHours !== null && productiveHoursTarget
          ? (productiveHours / productiveHoursTarget) * 100
          : null
      );

      return {
        user: item.user,
        date: item.date,
        dateKey: item.dateKey,
        monthKey: item.monthKey,
        weekKey: item.weekKey,
        year: item.year,
        flowCounts: item.flowCounts,
        totalTasks: item.totalTasks,
        doneTasks: item.doneTasks,
        holdTasks: item.holdTasks,
        points: item.points,
        activeTaskDays: item.totalTasks > 0 ? 1 : 0,
        workedIds: [...item.workedIdsSet],
        holdIds: [...item.holdIdsSet],
        uniqueWorkedIds: item.workedIdsSet.size,
        uniqueHoldIds: item.holdIdsSet.size,
        tasksPerActiveDay: item.totalTasks,
        idsPerActiveDay: item.workedIdsSet.size,
        qualityPct,
        // Compatibility: keep the main hold_pct on task denominator, and expose IDs separately.
        holdPct: explicitHoldPct ?? (item.totalTasks ? (item.holdTasks / item.totalTasks) * 100 : null),
        holdPctTasks: item.totalTasks ? (item.holdTasks / item.totalTasks) * 100 : null,
        holdPctIds: item.workedIdsSet.size ? (item.holdIdsSet.size / item.workedIdsSet.size) * 100 : null,
        holdLeadTimeDays: holdLifecycleByUser[item.user] ?? null,
        holdByFlow: item.holdByFlow,
        holdByIncidence: item.holdByIncidence,
        productiveHoursPct,
        productiveHours,
        productiveHoursTarget,
        attendancePct: average(item.attendancePctValues),
        incidences: arrayMax(item.incidenceValues),
        incidenceRecords: item.incidenceRecords,
        incidenceTypes: item.incidenceTypes,
        incidenceMain: topEntries(item.incidenceTypes, 1)[0]?.key || '',
        incidenceRateTasksPct: item.totalTasks ? (item.incidenceRecords / item.totalTasks) * 100 : null,
        incidenceRateHoldPct: item.holdTasks ? (item.incidentsOnHold / item.holdTasks) * 100 : null,
        criticalIncidents: arrayMax(item.criticalIncidentValues),
        severeErrors: arrayMax(item.severeErrorValues),
        recurrenceCount: arrayMax(item.recurrenceValues),
        slaPct: average(item.slaPctValues),
        monthlyEvaluationScore: average(item.monthlyEvalScoreValues),
        monthlyEvaluationResponded: item.monthlyEvalResponseFlags.length ? item.monthlyEvalResponseFlags.some(Boolean) : null,
        monthlyEvaluationStatus: item.monthlyEvalStatusValues[item.monthlyEvalStatusValues.length - 1] || null,
        initiativeImpact: sum(item.initiativeImpactValues) ?? 0,
        initiativeApprovedCount: sum(item.initiativeApprovedCountValues) ?? 0,
        historicalInitiatives: item.initiatives,
        trustedData: item.trustedFlags.length ? item.trustedFlags.every(Boolean) : null,
      };
    });
  }

  function collectMetric(array, value) {
    if (value === null || value === undefined || Number.isNaN(value)) return;
    array.push(value);
  }

  function parseAuditBoolean(value) {
    if (value === null || value === undefined || value === '') return null;
    const raw = String(value).trim().toLowerCase();
    if (['ok', 'correcto', 'si', 'sí', 'true', '1'].includes(raw)) return true;
    if (['not ok', 'incorrecto', 'no', 'false', '0'].includes(raw)) return false;
    return null;
  }

  function classifyAuditDecision(finalFlag, rejectionFlag) {
    if (finalFlag === true && rejectionFlag === true) return 'correct';
    if (finalFlag === true && rejectionFlag === false) return 'light';
    if (finalFlag === false && rejectionFlag === false) return 'severe';
    return 'unclassified';
  }

  function createAuditStats() {
    return {
      totalAudits: 0,
      classifiedAudits: 0,
      correct: 0,
      light: 0,
      severe: 0,
      unclassified: 0,
      critical: null,
      cases: {},
      reasons: {},
      domains: {},
      auditors: {},
      sources: {
        sdc: { totalAudits: 0, classifiedAudits: 0, correct: 0, light: 0, severe: 0, unclassified: 0 },
        mao: { totalAudits: 0, classifiedAudits: 0, correct: 0, light: 0, severe: 0, unclassified: 0 },
      },
      recurrenceProxy: 0,
    };
  }

  function finalizeAuditStats(stats) {
    const caseEntries = Object.values(stats.cases);
    const casesAudited = caseEntries.length || null;
    const casesCorrect = caseEntries.filter(item => item.classified > 0 && item.classified === item.correct).length || 0;
    const qualityCasePct = casesAudited ? (casesCorrect / casesAudited) * 100 : null;
    const qualityPct = stats.classifiedAudits ? (stats.correct / stats.classifiedAudits) * 100 : null;
    const sourceSummary = Object.fromEntries(Object.entries(stats.sources).map(([key, item]) => [key, {
      totalAudits: item.totalAudits,
      qualityPct: item.classifiedAudits ? round((item.correct / item.classifiedAudits) * 100, 1) : null,
      light: item.light,
      severe: item.severe,
      unclassified: item.unclassified,
    }]));
    const recurrenceProxy = Object.values(stats.reasons).reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    return {
      totalAudits: stats.totalAudits,
      classifiedAudits: stats.classifiedAudits,
      suggestionsAudited: stats.totalAudits,
      suggestionsCorrect: stats.correct,
      qualityPct: round(qualityPct, 1),
      casesAudited,
      casesCorrect,
      qualityCasePct: round(qualityCasePct, 1),
      lightErrors: stats.light,
      severeErrors: stats.severe,
      criticalErrors: stats.critical,
      unclassifiedAudits: stats.unclassified,
      primaryDeviation: topEntries(stats.reasons, 1)[0]?.key || '',
      errorDomains: topEntries(stats.domains, 3),
      topAuditors: topEntries(stats.auditors, 3),
      qualityBySource: sourceSummary,
      recurrenceProxy,
    };
  }

  function buildAuditIndexes(periodType, teamDirectory = buildTeamDirectory()) {
    const ctx = getCtx();
    const data = getData();
    if (!ctx.findCol || !ctx.parseDate) return new Map();
    const index = new Map();
    const seen = new Set();

    function normalizeRows(rows, source) {
      if (!rows.length) return;
      const sample = rows[0];
      const cols = source === 'sdc'
        ? {
          date: ctx.findCol(sample, ['ultimaActualizacion', 'UltimaActualizacion', 'fecha', 'Fecha']),
          user: ctx.findCol(sample, ['usuario', 'Usuario', 'user', 'User']),
          auditor: ctx.findCol(sample, ['Auditor', 'auditor']),
          final: ctx.findCol(sample, ['EstadoFinal_esCorrecto']),
          rejection: ctx.findCol(sample, ['Motivo_de_Rechazo_esCorrecto']),
          deleted: ctx.findCol(sample, ['Borrado', 'borrado']),
          caseId: ctx.findCol(sample, ['id_caso', 'casoId', 'idCaso']),
          suggestionId: ctx.findCol(sample, ['sugerencia_id', 'suggestion_id']),
          domain: ctx.findCol(sample, ['Dominio', 'dominio']),
          reason: ctx.findCol(sample, ['Casuisticas agrupadas', 'Casuisticas', 'suggestion_reason', 'Tipo_de_BTC', 'Accion_Correcta']),
        }
        : {
          date: ctx.findCol(sample, ['FECHA_ACCIONAMIENTO', 'fecha_accionamiento', 'Fecha']),
          user: ctx.findCol(sample, ['COLABORADOR', 'productora', 'Usuario', 'usuario']),
          auditor: ctx.findCol(sample, ['Auditor', 'auditor']),
          final: ctx.findCol(sample, ['EstadoFinal_esCorrecto']),
          rejection: ctx.findCol(sample, ['Motivo_de_Rechazo_esCorrecto']),
          caseId: ctx.findCol(sample, ['ID_CDM', 'PDP_ID', 'ITEM_ID', 'VARIATION_ID']),
          suggestionId: ctx.findCol(sample, ['VARIATION_ID', 'INFO_CHILD', 'ID_CDM']),
          domain: ctx.findCol(sample, ['DOMINIO', 'Dominio', 'dominio']),
          reason: ctx.findCol(sample, ['Casuisticas', 'RESOLUCION', 'COMENTARIO', 'Comentario']),
        };

      rows.forEach(row => {
        const rawUser = String(row[cols.user] || '').trim();
        const date = ctx.parseDate(String(row[cols.date] || ''));
        if (!rawUser || !date) return;
        if (cols.deleted && parseBooleanish(row[cols.deleted]) === true) return;
        const member = resolveTeamMember(rawUser, teamDirectory);
        const user = member.canonicalKey || rawUser;
        const finalFlag = parseAuditBoolean(row[cols.final]);
        const rejectionFlag = parseAuditBoolean(row[cols.rejection]);
        const classification = classifyAuditDecision(finalFlag, rejectionFlag);
        const caseKey = String(row[cols.caseId] || '').trim();
        const suggestionKey = String(row[cols.suggestionId] || caseKey || '').trim();
        const domain = String(row[cols.domain] || '').trim();
        const reason = String(row[cols.reason] || '').trim();
        const auditor = String(row[cols.auditor] || '').trim();
        const signature = [
          source,
          user,
          date.toISOString().slice(0, 10),
          caseKey,
          suggestionKey,
          classification,
          domain,
          reason,
          auditor,
        ].join('|');
        if (seen.has(signature)) return;
        seen.add(signature);
        const periodKey = periodKeyFromDate(date, periodType);
        const indexKey = `${periodKey}__${normalizeEntityKey(user)}`;
        if (!index.has(indexKey)) index.set(indexKey, createAuditStats());
        const stats = index.get(indexKey);
        stats.totalAudits += 1;
        stats.sources[source].totalAudits += 1;
        if (classification !== 'unclassified') {
          stats.classifiedAudits += 1;
          stats.sources[source].classifiedAudits += 1;
        } else {
          stats.unclassified += 1;
          stats.sources[source].unclassified += 1;
        }
        if (classification === 'correct') {
          stats.correct += 1;
          stats.sources[source].correct += 1;
        } else if (classification === 'light') {
          stats.light += 1;
          stats.sources[source].light += 1;
        } else if (classification === 'severe') {
          stats.severe += 1;
          stats.sources[source].severe += 1;
        }
        if (caseKey) {
          const caseItem = stats.cases[caseKey] || { classified: 0, correct: 0 };
          if (classification !== 'unclassified') caseItem.classified += 1;
          if (classification === 'correct') caseItem.correct += 1;
          stats.cases[caseKey] = caseItem;
        }
        if (classification !== 'correct' && classification !== 'unclassified') {
          if (reason) stats.reasons[reason] = (stats.reasons[reason] || 0) + 1;
          if (domain) stats.domains[domain] = (stats.domains[domain] || 0) + 1;
        }
        if (auditor) stats.auditors[auditor] = (stats.auditors[auditor] || 0) + 1;
      });
    }

    normalizeRows(data.auditados || [], 'sdc');
    normalizeRows(data.auditados_mao || [], 'mao');
    const finalized = new Map();
    index.forEach((stats, key) => finalized.set(key, finalizeAuditStats(stats)));
    return finalized;
  }

  function enrichWithMetricsCsv(map, rows) {
    const ctx = getCtx();
    if (!rows.length || !ctx.findCol || !ctx.parseDate) return;
    const sample = rows[0];
    const cols = {
      user: ctx.findCol(sample, ['Usuario', 'usuario', 'User', 'user', 'Colaborador', 'colaborador', 'ID_MELI', 'id_meli']),
      date: ctx.findCol(sample, ['Fecha', 'fecha', 'Date', 'date']),
      quality: ctx.findCol(sample, ['Calidad', 'calidad', 'Quality', 'quality_pct', 'Calidad %']),
      holdPct: ctx.findCol(sample, ['HOLD %', 'Hold %', 'hold_pct', 'Porcentaje HOLD']),
      productiveHoursPct: ctx.findCol(sample, ['Horas Productivas %', 'productive_hours_pct', 'Cumplimiento Horas Productivas %']),
      productiveHours: ctx.findCol(sample, ['Horas Productivas', 'horas_productivas', 'productive_hours']),
      productiveHoursTarget: ctx.findCol(sample, ['Objetivo Horas Productivas', 'productive_hours_target', 'horas_productivas_target']),
      attendancePct: ctx.findCol(sample, ['Asistencia %', 'attendance_pct', 'Disponibilidad %', 'availability_pct']),
      incidences: ctx.findCol(sample, ['Incidencias', 'incidencias', 'incident_count']),
      criticalIncidents: ctx.findCol(sample, ['Incidencias Críticas', 'critical_incidents', 'incidencias_criticas']),
      severeErrors: ctx.findCol(sample, ['Errores Graves', 'severe_errors', 'errores_graves']),
      recurrence: ctx.findCol(sample, ['Reincidencia', 'recurrent_errors', 'error_recurrence_count']),
      slaPct: ctx.findCol(sample, ['SLA %', 'sla_pct', 'Cumplimiento SLA %']),
      monthlyEvalScore: ctx.findCol(sample, ['Monthly Evaluation Score', 'monthly_evaluation_score', 'Puntaje Evaluacion Mensual', 'Puntaje Evaluación Mensual']),
      monthlyEvalResponded: ctx.findCol(sample, ['Monthly Evaluation Responded', 'monthly_evaluation_responded', 'Respondio Formulario', 'Respondió Formulario']),
      monthlyEvalStatus: ctx.findCol(sample, ['Monthly Evaluation Status', 'monthly_evaluation_status', 'Estado Formulario Mensual']),
      initiativeImpact: ctx.findCol(sample, ['Initiative Impact', 'initiative_impact', 'Impacto Iniciativas']),
      initiativeApprovedCount: ctx.findCol(sample, ['Initiatives Approved', 'initiatives_approved', 'Iniciativas Aprobadas']),
      trustedData: ctx.findCol(sample, ['Datos Confiables', 'trusted_data', 'data_trusted']),
    };

    rows.forEach(row => {
      const user = String(row[cols.user] || '').trim();
      const date = ctx.parseDate(String(row[cols.date] || ''));
      if (!user || !date) return;
      const key = `${user}__${date.toISOString().slice(0, 10)}`;
      if (!map.has(key)) {
        const wk = isoWeekSafe(date);
        map.set(key, {
          user,
          date,
          dateKey: date.toISOString().slice(0, 10),
          monthKey: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`,
          weekKey: `${wk.year}-W${String(wk.week).padStart(2, '0')}`,
          year: date.getFullYear(),
          flowCounts: {},
          totalTasks: 0,
          doneTasks: 0,
          holdTasks: 0,
          points: 0,
          qualityValues: [],
          holdPctValues: [],
          productiveHoursPctValues: [],
          productiveHoursValues: [],
          productiveHoursTargetValues: [],
          attendancePctValues: [],
          incidenceValues: [],
          criticalIncidentValues: [],
          severeErrorValues: [],
          recurrenceValues: [],
          slaPctValues: [],
          monthlyEvalScoreValues: [],
          monthlyEvalResponseFlags: [],
          monthlyEvalStatusValues: [],
          initiativeImpactValues: [],
          initiativeApprovedCountValues: [],
          trustedFlags: [],
        });
      }
      const bucket = map.get(key);
      collectMetric(bucket.qualityValues, parsePercentish(row[cols.quality]));
      collectMetric(bucket.holdPctValues, parsePercentish(row[cols.holdPct]));
      collectMetric(bucket.productiveHoursPctValues, parsePercentish(row[cols.productiveHoursPct]));
      collectMetric(bucket.productiveHoursValues, parseNumber(row[cols.productiveHours]));
      collectMetric(bucket.productiveHoursTargetValues, parseNumber(row[cols.productiveHoursTarget]));
      collectMetric(bucket.attendancePctValues, parsePercentish(row[cols.attendancePct]));
      collectMetric(bucket.incidenceValues, parseNumber(row[cols.incidences]));
      collectMetric(bucket.criticalIncidentValues, parseNumber(row[cols.criticalIncidents]));
      collectMetric(bucket.severeErrorValues, parseNumber(row[cols.severeErrors]));
      collectMetric(bucket.recurrenceValues, parseNumber(row[cols.recurrence]));
      collectMetric(bucket.slaPctValues, parsePercentish(row[cols.slaPct]));
      collectMetric(bucket.monthlyEvalScoreValues, parseNumber(row[cols.monthlyEvalScore]));
      const responded = parseBooleanish(row[cols.monthlyEvalResponded]);
      if (responded !== null) bucket.monthlyEvalResponseFlags.push(responded);
      const evalStatus = row[cols.monthlyEvalStatus];
      if (evalStatus) bucket.monthlyEvalStatusValues.push(String(evalStatus).trim());
      collectMetric(bucket.initiativeImpactValues, parseNumber(row[cols.initiativeImpact]));
      collectMetric(bucket.initiativeApprovedCountValues, parseNumber(row[cols.initiativeApprovedCount]));
      const trusted = parseBooleanish(row[cols.trustedData]);
      if (trusted !== null) bucket.trustedFlags.push(trusted);
    });
  }

  function isoWeekSafe(date) {
    const t = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const day = t.getUTCDay() || 7;
    t.setUTCDate(t.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    return { year: t.getUTCFullYear(), week: Math.ceil((((t - yearStart) / 86400000) + 1) / 7) };
  }

  function getWeightForFlow(flow, status) {
    const weights = getCtx().WEIGHTS || {};
    if (flow === 'Soporte' && status !== 'DONE') return 0;
    return weights[flow] !== undefined ? weights[flow] : 1;
  }

  function buildEvaluation(periodType = state.filters.periodType, periodKey = state.filters.periodKey) {
    const teamDirectory = buildTeamDirectory();
    const daily = buildDailyRecords(teamDirectory);
    if (!daily.length) return null;
    const auditIndex = buildAuditIndexes(periodType, teamDirectory);

    const periodKeys = [...new Set(daily.map(item => item[periodType === 'week' ? 'weekKey' : 'monthKey']))].sort();
    const resolvedKey = periodKey === 'latest' || !periodKeys.includes(periodKey) ? periodKeys[periodKeys.length - 1] : periodKey;
    const orderedKeys = [...periodKeys];
    const grouped = new Map();
    const periodDayCounts = {};

    daily.forEach(record => {
      const key = record[periodType === 'week' ? 'weekKey' : 'monthKey'];
      if (!grouped.has(key)) grouped.set(key, new Map());
      const periodMap = grouped.get(key);
      if (!periodMap.has(record.user)) periodMap.set(record.user, []);
      periodMap.get(record.user).push(record);
      periodDayCounts[key] = periodDayCounts[key] || new Set();
      periodDayCounts[key].add(record.dateKey);
    });

    const snapshotsByPeriod = {};
    orderedKeys.forEach((key, index) => {
      snapshotsByPeriod[key] = {};
      const userMap = grouped.get(key) || new Map();
      userMap.forEach((records, user) => {
        const previous = index > 0 ? snapshotsByPeriod[orderedKeys[index - 1]][user] : null;
        snapshotsByPeriod[key][user] = computeUserSnapshot(records, periodType, key, previous, daily, {
          teamDirectory,
          auditIndex,
          periodDayCount: periodDayCounts[key]?.size || records.length || 1,
        });
      });
    });

    const selectedRows = Object.values(snapshotsByPeriod[resolvedKey] || {}).sort((a, b) => b.finalScore - a.finalScore);
    const economic = computeEconomicSimulation(selectedRows, state.config);
    selectedRows.forEach(row => {
      const allocation = economic.rowsByUser[row.user] || createEmptyEconomicRow(row);
      row.economic = allocation;
      row.estimatedAllocation = allocation.totalEstimated;
      row.allocationReason = allocation.reason;
      row.allocationAlerts = allocation.alerts;
    });
    const visibleRows = applyEvaluationFilters(selectedRows);
    return {
      periodType,
      periodKey: resolvedKey,
      periodKeys: orderedKeys,
      allRows: selectedRows,
      visibleRows,
      summary: buildSummary(selectedRows, visibleRows, economic),
      hotspots: buildRuleHotspots(selectedRows),
      outliers: buildOutliers(selectedRows),
      risks: buildRiskCards(selectedRows),
      economic,
    };
  }

  function computeUserSnapshot(records, periodType, periodKey, previousSnapshot, allDailyRecords, aux = {}) {
    const config = state.config;
    const first = records[0];
    const teamDirectory = aux.teamDirectory || buildTeamDirectory();
    const member = resolveTeamMember(first.user, teamDirectory);
    const info = {
      nombre: member.displayName || first.user,
      equipo: member.team || '',
      rol: member.role || '',
      ubicacion: member.location || '',
      tenureDays: member.tenureDays,
      tenureSegment: member.tenureSegment,
      activeInRoster: member.activeInRoster,
    };
    const roleKey = resolveRoleKey(info.rol);
    const roleConfig = config.roles[roleKey] || config.roles.analyst;
    const flowMix = {};
    let totalPoints = 0;
    let totalDoneTasks = 0;
    let totalTasks = 0;
    let totalHoldTasks = 0;
    const uniqueWorkedIds = new Set();
    const uniqueHoldIds = new Set();
    const incidenceTypes = {};
    const historicalInitiatives = {};

    records.forEach(day => {
      totalPoints += day.points;
      totalDoneTasks += day.doneTasks;
      totalTasks += day.totalTasks;
      totalHoldTasks += day.holdTasks;
      (day.workedIds || []).forEach(id => uniqueWorkedIds.add(id));
      (day.holdIds || []).forEach(id => uniqueHoldIds.add(id));
      Object.entries(day.incidenceTypes || {}).forEach(([type, count]) => {
        incidenceTypes[type] = (incidenceTypes[type] || 0) + count;
      });
      Object.entries(day.historicalInitiatives || {}).forEach(([name, count]) => {
        historicalInitiatives[name] = (historicalInitiatives[name] || 0) + count;
      });
      Object.entries(day.flowCounts).forEach(([flow, count]) => {
        flowMix[flow] = (flowMix[flow] || 0) + count;
      });
    });

    const activeDays = records.filter(day => day.doneTasks > 0 || day.totalTasks > 0).length;
    const participationDays = records.filter(day => day.totalTasks > 0).length;
    const flowProfiles = getFlowProfiles(config);
    const dailyTargets = records.map(day => computeDailyTarget(day, flowProfiles)).filter(value => value !== null);
    const targetProductivity = average(dailyTargets);
    const actualProductivity = activeDays ? totalPoints / activeDays : null;
    const productivityRatio = actualProductivity !== null && targetProductivity ? actualProductivity / targetProductivity : null;
    const dominantFlow = Object.entries(flowMix).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Demanda';
    const criticalShare = totalTasks
      ? Object.entries(flowMix).reduce((acc, [flow, count]) => acc + (flowProfiles[flow]?.critical ? count : 0), 0) / totalTasks * 100
      : null;
    const periodDayCount = aux.periodDayCount || activeDays || 1;
    const consistencyScore = computeConsistencyScore(records, periodDayCount);
    const monthlyEvaluationFlags = records
      .map(day => day.monthlyEvaluationResponded)
      .filter(value => value !== null && value !== undefined);
    const monthlyEvaluationResponded = monthlyEvaluationFlags.length ? monthlyEvaluationFlags.some(Boolean) : null;
    const monthlyEvaluationScore = average(records.map(day => day.monthlyEvaluationScore));
    const monthlyEvaluationStatus = records.map(day => day.monthlyEvaluationStatus).filter(Boolean).slice(-1)[0] || null;
    const initiativeImpactRaw = sum(records.map(day => day.initiativeImpact)) ?? 0;
    const initiativeImpact = clamp(initiativeImpactRaw, 0, config.initiatives.maxMonthlyImpact || 0);
    const initiativeApprovedCount = sum(records.map(day => day.initiativeApprovedCount)) ?? 0;
    const auditMetrics = aux.auditIndex?.get(`${periodKey}__${normalizeEntityKey(first.user)}`) || null;
    const incidentsTotal = sum(records.map(day => day.incidenceRecords));
    const holdPctTasks = totalTasks ? (totalHoldTasks / totalTasks) * 100 : null;
    const holdPctIds = uniqueWorkedIds.size ? (uniqueHoldIds.size / uniqueWorkedIds.size) * 100 : null;
    const incidenceRateTasksPct = totalTasks && incidentsTotal !== null ? (incidentsTotal / totalTasks) * 100 : null;
    const incidenceRateHoldPct = totalHoldTasks && incidentsTotal !== null ? (incidentsTotal / totalHoldTasks) * 100 : null;
    const metrics = {
      productivity_ratio: productivityRatio !== null ? productivityRatio : null,
      actual_productivity_pts: actualProductivity,
      target_productivity_pts: targetProductivity,
      weighted_points: totalPoints,
      quality_pct: auditMetrics?.qualityPct ?? null,
      quality_pct_sdc: auditMetrics?.qualityBySource?.sdc?.qualityPct ?? null,
      quality_pct_mao: auditMetrics?.qualityBySource?.mao?.qualityPct ?? null,
      quality_case_pct: auditMetrics?.qualityCasePct ?? null,
      hold_pct: holdPctTasks,
      hold_pct_tasks: holdPctTasks,
      hold_pct_ids: holdPctIds,
      productive_hours_pct: average(records.map(day => day.productiveHoursPct)),
      attendance_pct: average(records.map(day => day.attendancePct)),
      incidences: incidentsTotal,
      incidence_rate: incidenceRateTasksPct,
      incidence_rate_hold: incidenceRateHoldPct,
      incidence_main: topEntries(incidenceTypes, 1)[0]?.key || '',
      critical_incidents: auditMetrics?.criticalErrors ?? null,
      severe_errors: auditMetrics?.severeErrors ?? null,
      light_errors: auditMetrics?.lightErrors ?? null,
      recurrence_count: auditMetrics?.recurrenceProxy ?? null,
      weekly_consistency_pct: consistencyScore,
      active_days: activeDays,
      active_day_coverage_pct: periodDayCount ? (activeDays / periodDayCount) * 100 : null,
      participation_days: participationDays,
      total_points: totalPoints,
      total_done_tasks: totalDoneTasks,
      total_tasks: totalTasks,
      unique_worked_ids: uniqueWorkedIds.size || null,
      unique_hold_ids: uniqueHoldIds.size || null,
      tasks_per_active_day: activeDays ? totalTasks / activeDays : null,
      ids_per_active_day: activeDays ? uniqueWorkedIds.size / activeDays : null,
      critical_flow_share: criticalShare,
      sla_pct: average(records.map(day => day.slaPct)),
      monthly_evaluation_score: monthlyEvaluationScore,
      monthly_evaluation_responded: monthlyEvaluationResponded,
      monthly_evaluation_status: monthlyEvaluationStatus,
      initiative_impact: initiativeImpact,
      initiative_approved_count: initiativeApprovedCount,
      quality_audits_total: auditMetrics?.totalAudits ?? null,
      quality_suggestions_total: auditMetrics?.suggestionsAudited ?? null,
      quality_suggestions_correct: auditMetrics?.suggestionsCorrect ?? null,
      quality_cases_total: auditMetrics?.casesAudited ?? null,
      quality_cases_correct: auditMetrics?.casesCorrect ?? null,
      quality_unclassified_total: auditMetrics?.unclassifiedAudits ?? null,
      quality_primary_deviation: auditMetrics?.primaryDeviation || '',
      quality_error_domains: (auditMetrics?.errorDomains || []).map(item => item.key).join(' | '),
      top_auditors: (auditMetrics?.topAuditors || []).map(item => item.key).join(' | '),
      hold_lead_time_days: average(records.map(day => day.holdLeadTimeDays)),
      historical_initiatives_count: Object.values(historicalInitiatives).reduce((sum, value) => sum + value, 0) || 0,
      improvement_vs_previous_pct: previousSnapshot && previousSnapshot.baseScore !== null ? round(((computeBaseScoreOnly(rawMetricMap(records, auditMetrics), config).score - previousSnapshot.baseScore) / Math.max(previousSnapshot.baseScore, 1)) * 100, 1) : null,
      productivity_quality_gap: productivityRatio !== null && (auditMetrics?.qualityPct ?? null) !== null
        ? productivityRatio * 100 - auditMetrics.qualityPct
        : null,
    };

    const robustness = resolveScoreRobustness(metrics, info);
    const dataStatus = robustness.dataStatus;

    if (roleConfig?.requiresAdditionalData || roleKey !== 'analyst') {
      const nonEvaluableReasons = [
        `Rol ${roleKey} preparado, pero no evaluable con los datos actuales.`,
        'Se requieren métricas agregadas o específicas de liderazgo/calidad para una decisión preliminar consistente.',
      ];
      const placeholderBand = { label: 'No evaluable con datos actuales', payoutPct: 0, color: '#8b91a8' };
      return {
        user: first.user,
        name: info.nombre || first.user,
        team: info.equipo || '—',
        role: info.rol || '—',
        roleKey,
        location: info.ubicacion || '—',
        tenureSegment: info.tenureSegment || '—',
        inRoster: !!info.activeInRoster,
        dominantFlow,
        flowMix,
        metrics,
        robustness,
        dataStatus: 'insufficient',
        baseScore: null,
        baseBreakdown: [],
        finalScore: 0,
        status: 'not_evaluable',
        statusLabel: statusLabel('not_evaluable'),
        bandLabel: placeholderBand.label,
        bandColor: placeholderBand.color,
        bandPayout: 0,
        estimatedPayoutPct: 0,
        exclusionReasons: [],
        minimumFailures: [],
        manualReviewReasons: nonEvaluableReasons,
        appliedRules: [],
        notAppliedRules: [],
        ruleScoreDelta: 0,
        ruleMultiplier: 1,
        antiGamingAlerts: [],
        fairnessAlerts: buildFairnessAlerts(flowMix, config),
        periodType,
        periodKey,
        auditTrail: {
          user: first.user,
          periodKey,
          configVersion: `${config.version} r${config.revision || 1}`,
          calculatedAt: new Date().toISOString(),
          dataStatus: 'insufficient',
          metrics,
          baseBreakdown: [],
          appliedRules: [],
          skippedRules: [],
          antiGaming: [],
          fairness: buildFairnessAlerts(flowMix, config),
          robustness,
          final: { status: 'not_evaluable', finalScore: 0 },
        },
        recommendations: ['No usar este resultado para incentivos del rol todavía. Hace falta data agregada específica de liderazgo/calidad.'],
      };
    }

    if (metrics.productivity_ratio === null) {
      const placeholderBand = { label: 'No evaluable con datos actuales', payoutPct: 0, color: '#8b91a8' };
      return {
        user: first.user,
        name: info.nombre || first.user,
        team: info.equipo || '—',
        role: info.rol || '—',
        roleKey,
        location: info.ubicacion || '—',
        tenureSegment: info.tenureSegment || '—',
        inRoster: !!info.activeInRoster,
        dominantFlow,
        flowMix,
        metrics,
        robustness,
        dataStatus: 'insufficient',
        baseScore: null,
        baseBreakdown: [],
        finalScore: 0,
        status: 'not_evaluable',
        statusLabel: statusLabel('not_evaluable'),
        bandLabel: placeholderBand.label,
        bandColor: placeholderBand.color,
        bandPayout: 0,
        estimatedPayoutPct: 0,
        exclusionReasons: [],
        minimumFailures: [],
        manualReviewReasons: ['Sin productividad suficiente para construir el resultado preliminar.'],
        appliedRules: [],
        notAppliedRules: [],
        ruleScoreDelta: 0,
        ruleMultiplier: 1,
        antiGamingAlerts: [],
        fairnessAlerts: buildFairnessAlerts(flowMix, config),
        periodType,
        periodKey,
        auditTrail: {
          user: first.user,
          periodKey,
          configVersion: `${config.version} r${config.revision || 1}`,
          calculatedAt: new Date().toISOString(),
          dataStatus: 'insufficient',
          metrics,
          baseBreakdown: [],
          appliedRules: [],
          skippedRules: [],
          antiGaming: [],
          fairness: buildFairnessAlerts(flowMix, config),
          robustness,
          final: { status: 'not_evaluable', finalScore: 0 },
        },
        recommendations: ['Sin productividad no hay base operativa suficiente para evaluar desempeño ni simulación económica.'],
      };
    }

    const base = computeBaseScore(metrics, config);
    metrics.improvement_vs_previous_pct = previousSnapshot && previousSnapshot.baseScore !== null
      ? round(((base.score - previousSnapshot.baseScore) / Math.max(previousSnapshot.baseScore, 1)) * 100, 1)
      : metrics.improvement_vs_previous_pct;

    const ruleEffects = applyRules(metrics, {
      user: first.user,
      role: info.rol || '',
      team: info.equipo || '',
      dominantFlow,
      flowMix,
      dataStatus,
    });

    const antiGaming = evaluateAntiGaming(metrics, {
      user: first.user,
      dominantFlow,
      flowMix,
      previousSnapshot,
    }, config);
    const fairnessAlerts = buildFairnessAlerts(flowMix, config);
    const programAdjustments = computeProgramAdjustments(metrics, config);
    const final = finalizeEvaluation(base, ruleEffects, programAdjustments, antiGaming, dataStatus, config);
    const band = resolveBand(final.status, final.finalScore, config.bands);
    const appliedRules = ruleEffects.applied.concat(programAdjustments.items.map(item => ({
      rule: { name: item.name, type: item.kind, impactMode: 'points', impactValue: item.points },
      explanation: item.explanation,
    })));

    return {
      user: first.user,
      name: info.nombre || first.user,
      team: info.equipo || '—',
      role: info.rol || '—',
      roleKey,
      location: info.ubicacion || '—',
      tenureSegment: info.tenureSegment || '—',
      inRoster: !!info.activeInRoster,
      dominantFlow,
      flowMix,
      metrics,
      robustness,
      dataStatus,
      baseScore: base.score,
      baseBreakdown: base.breakdown,
      finalScore: final.finalScore,
      status: final.status,
      statusLabel: statusLabel(final.status),
      bandLabel: band.label,
      bandColor: band.color,
      bandPayout: band.payoutPct,
      estimatedPayoutPct: band.payoutPct,
      exclusionReasons: final.exclusionReasons,
      minimumFailures: final.minimumFailures,
      manualReviewReasons: final.manualReviewReasons,
      appliedRules,
      notAppliedRules: ruleEffects.notApplied,
      ruleScoreDelta: final.pointsDelta,
      ruleMultiplier: final.multiplier,
      antiGamingAlerts: antiGaming,
      fairnessAlerts,
      periodType,
      periodKey,
      auditTrail: buildAuditTrail(first.user, periodKey, metrics, final, base, ruleEffects, antiGaming, fairnessAlerts, programAdjustments, dataStatus, `${config.version} r${config.revision || 1}`),
      recommendations: buildRecommendations(metrics, final, dominantFlow),
    };
  }

  function rawMetricMap(records, auditMetrics = null) {
    return {
      productivity_ratio: null,
      quality_pct: auditMetrics?.qualityPct ?? null,
      productive_hours_pct: average(records.map(day => day.productiveHoursPct)),
      hold_pct: average(records.map(day => day.holdPctTasks ?? day.holdPct)),
      incidence_rate: average(records.map(day => day.incidenceRateTasksPct)),
      attendance_pct: average(records.map(day => day.attendancePct)),
      weekly_consistency_pct: null,
    };
  }

  function computeDailyTarget(day, flowProfiles) {
    const entries = Object.entries(day.flowCounts);
    if (!entries.length) return null;
    const total = entries.reduce((sum, [, count]) => sum + count, 0);
    if (!total) return null;
    return entries.reduce((sum, [flow, count]) => {
      const profile = flowProfiles[flow];
      const target = profile?.targetPointsPerDay ?? flowProfiles.Demanda?.targetPointsPerDay ?? 88;
      return sum + (count / total) * target;
    }, 0);
  }

  function computeConsistencyScore(records, periodDayCount) {
    if (!records.length) return null;
    const activeDays = records.filter(day => day.totalTasks > 0).length;
    const coverage = periodDayCount ? clamp((activeDays / periodDayCount) * 100, 0, 100) : null;
    const volumes = records.filter(day => day.totalTasks > 0).map(day => day.totalTasks);
    if (!volumes.length) return coverage;
    const avg = average(volumes);
    if (!avg) return coverage;
    const variance = average(volumes.map(value => (value - avg) ** 2)) || 0;
    const stdDev = Math.sqrt(variance);
    const volatility = clamp((stdDev / Math.max(avg, 1)) * 100, 0, 100);
    const stability = 100 - volatility;
    if (coverage === null) return round(stability, 1);
    return round((coverage * 0.6) + (stability * 0.4), 1);
  }

  function resolveScoreRobustness(metrics, info) {
    const hasProductivity = metrics.productivity_ratio !== null && metrics.productivity_ratio !== undefined;
    const hasQuality = metrics.quality_pct !== null && metrics.quality_pct !== undefined;
    const hasHold = metrics.hold_pct !== null && metrics.hold_pct !== undefined;
    const hasIncidences = metrics.incidences !== null && metrics.incidences !== undefined;
    const hasRoster = !!info.activeInRoster;
    const available = [hasProductivity, hasQuality, hasHold, hasIncidences].filter(Boolean).length;
    let level = 'low';
    let label = 'Baja robustez';
    let dataStatus = 'partial';
    const warnings = [];
    if (!hasProductivity) {
      level = 'none';
      label = 'No evaluable';
      dataStatus = 'insufficient';
      warnings.push('No hay productividad suficiente para construir score.');
    } else if (!hasQuality) {
      level = available >= 2 ? 'low' : 'none';
      label = 'Baja robustez';
      dataStatus = 'manual_review';
      warnings.push('Falta calidad auditada para validar el resultado preliminar.');
    } else if (hasHold && hasIncidences) {
      level = 'high';
      label = 'Alta robustez';
      dataStatus = 'complete';
    } else {
      level = 'medium';
      label = 'Robustez media';
      dataStatus = 'partial';
      warnings.push('HOLD o incidencias están parciales; el score usa lo disponible.');
    }
    if (!hasRoster) warnings.push('El colaborador no aparece en el padrón actual.');
    return {
      level,
      label,
      availableDimensions: available,
      dataStatus,
      warnings,
    };
  }

  function evaluateAntiGaming(metrics, context, config) {
    const alerts = [];
    const totalTasks = Object.values(context.flowMix || {}).reduce((sum, value) => sum + value, 0) || 0;
    const flowProfiles = getFlowProfiles(config);

    config.antiGamingRules.filter(rule => rule.active).forEach(rule => {
      let triggered = false;
      let evaluable = true;
      let message = '';

      if (rule.id === 'high_points_low_quality') {
        evaluable = metrics.productivity_ratio !== null && metrics.productivity_ratio !== undefined && metrics.quality_pct !== null && metrics.quality_pct !== undefined;
        triggered = evaluable && metrics.productivity_ratio >= 1.08 && metrics.quality_pct < 95;
        message = 'Productividad alta con calidad debajo del estándar sano.';
      } else if (rule.id === 'high_points_high_hold') {
        evaluable = metrics.productivity_ratio !== null && metrics.productivity_ratio !== undefined && metrics.hold_pct !== null && metrics.hold_pct !== undefined;
        triggered = evaluable && metrics.productivity_ratio >= 1.05 && metrics.hold_pct > 10;
        message = 'Productividad alta acompañada de HOLD elevado.';
      } else if (rule.id === 'zero_incidents_expected_context') {
        const sensitiveFlows = Object.keys(context.flowMix || {}).filter(flow => flowProfiles[flow]?.critical);
        evaluable = sensitiveFlows.length > 0 && metrics.incidences !== null && metrics.incidences !== undefined;
        triggered = evaluable && metrics.incidences === 0 && ((metrics.hold_pct || 0) > 0 || metrics.critical_flow_share > 25);
        message = 'Cero incidencias en contexto donde normalmente se espera registro operativo. Requiere validación contextual.';
      } else if (rule.id === 'high_weight_flow_concentration') {
        const highWeightTasks = Object.entries(context.flowMix || {}).reduce((sum, [flow, count]) => sum + ((flowProfiles[flow]?.weight || 1) >= 1.3 ? count : 0), 0);
        evaluable = totalTasks > 0;
        triggered = evaluable && ((highWeightTasks / Math.max(totalTasks, 1)) * 100) >= 70;
        message = 'Concentración excesiva en flujos de mayor puntaje.';
      } else if (rule.id === 'abrupt_flow_mix_change') {
        evaluable = !!context.previousSnapshot?.flowMix;
        if (evaluable) {
          const currentDominantShare = totalTasks ? ((context.flowMix[context.dominantFlow] || 0) / totalTasks) * 100 : 0;
          const prevTotal = Object.values(context.previousSnapshot.flowMix || {}).reduce((sum, value) => sum + value, 0) || 0;
          const prevShare = prevTotal ? (((context.previousSnapshot.flowMix || {})[context.dominantFlow] || 0) / prevTotal) * 100 : 0;
          triggered = Math.abs(currentDominantShare - prevShare) >= 35;
        }
        message = 'Cambio brusco del mix de flujos respecto al período anterior.';
      } else {
        evaluable = false;
      }

      alerts.push({
        id: rule.id,
        name: rule.name,
        type: rule.type,
        mode: rule.mode,
        severity: rule.severity,
        triggered,
        evaluable,
        message: evaluable ? message : 'No evaluable con datos actuales.',
      });
    });

    return alerts;
  }

  function buildFairnessAlerts(flowMix, config) {
    const flowProfiles = getFlowProfiles(config);
    return Object.entries(flowMix || {}).flatMap(([flow, count]) => {
      const profile = flowProfiles[flow];
      if (!profile) return [];
      const alerts = [];
      if ((profile.fairnessRisk === 'high' || profile.requiresManualCalibration) && (profile.accessType === 'assigned' || profile.accessType === 'restricted')) {
        alerts.push({
          flow,
          count,
          title: `${flow}: riesgo de inequidad`,
          body: 'Este flujo tiene ponderación alta o calibración pendiente y no todos los colaboradores tendrían el mismo acceso.',
        });
      }
      return alerts;
    });
  }

  function computeProgramAdjustments(metrics, config) {
    const items = [];
    if (config.monthlyEvaluation.enabled) {
      if (metrics.monthly_evaluation_responded === false || metrics.monthly_evaluation_status === 'no_presentado') {
        items.push({
          name: 'Formulario mensual no presentado',
          points: config.monthlyEvaluation.missingResponsePenalty,
          explanation: 'No respondió el formulario evaluativo mensual.',
          kind: 'monthly_evaluation',
        });
      } else if (metrics.monthly_evaluation_score !== null && metrics.monthly_evaluation_score !== undefined) {
        if (metrics.monthly_evaluation_score < config.monthlyEvaluation.lowScoreThreshold) {
          items.push({
            name: 'Formulario mensual con resultado bajo',
            points: config.monthlyEvaluation.lowScorePenalty,
            explanation: `Resultado mensual ${num(metrics.monthly_evaluation_score)} por debajo del umbral.`,
            kind: 'monthly_evaluation',
          });
        } else if (metrics.monthly_evaluation_score >= config.monthlyEvaluation.highScoreThreshold) {
          items.push({
            name: 'Buen resultado en evaluación mensual',
            points: config.monthlyEvaluation.highScoreAccelerator,
            explanation: `Resultado mensual ${num(metrics.monthly_evaluation_score)} en zona alta.`,
            kind: 'monthly_evaluation',
          });
        }
      }
    }

    if (config.initiatives.enabled && metrics.initiative_impact) {
      const capped = clamp(metrics.initiative_impact, 0, config.initiatives.maxMonthlyImpact);
      if (capped > 0) {
        items.push({
          name: 'Contribución operativa validada',
          points: capped,
          explanation: `${num(capped)} pts por iniciativas positivas con tope mensual.`,
          kind: 'initiative',
        });
      }
    }

    return { items, totalPoints: items.reduce((sum, item) => sum + Number(item.points || 0), 0) };
  }

  function resolveDataStatus(metrics, records, config) {
    const required = config.baseEligibility.requiresCriticalData || ['productivity_ratio'];
    const recommended = config.baseEligibility.recommendedCriticalData || [];
    const availableRequired = required.filter(metric => metrics[metric] !== null && metrics[metric] !== undefined);
    const availableRecommended = recommended.filter(metric => metrics[metric] !== null && metrics[metric] !== undefined);
    const trustedData = records.every(record => record.trustedData !== false);
    if (!trustedData) return 'manual_review';
    if (availableRequired.length < required.length) return 'insufficient';
    if (!availableRecommended.length) return 'manual_review';
    if (availableRecommended.length < recommended.length) return 'partial';
    return 'complete';
  }

  function computeBaseScore(metrics, config) {
    const breakdown = [];
    let weighted = 0;
    let weightSum = 0;
    Object.entries(config.metricModels).forEach(([metric, model]) => {
      if (!model.weight) return;
      const normalized = normalizeMetric(metrics[metric], model);
      breakdown.push({
        metric,
        label: model.label,
        weight: model.weight,
        rawValue: metrics[metric],
        normalized,
        contribution: normalized === null ? null : normalized * model.weight,
      });
      if (normalized !== null) {
        weighted += normalized * model.weight;
        weightSum += model.weight;
      }
    });
    return {
      score: weightSum ? round(weighted / weightSum, 1) : 0,
      breakdown,
    };
  }

  function computeBaseScoreOnly(metrics, config) {
    return computeBaseScore(metrics, config);
  }

  function normalizeMetric(value, model) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
    const numeric = Number(value);
    if (model.direction === 'higher') {
      const floor = Number(model.floor ?? 0);
      const target = Number(model.target ?? floor);
      if (numeric <= floor) return 0;
      if (numeric >= target) return 100;
      return clamp(((numeric - floor) / Math.max(target - floor, 0.0001)) * 100, 0, 100);
    }
    const target = Number(model.target ?? 0);
    const ceiling = Number(model.ceiling ?? target);
    if (numeric <= target) return 100;
    if (numeric >= ceiling) return 0;
    return clamp((1 - ((numeric - target) / Math.max(ceiling - target, 0.0001))) * 100, 0, 100);
  }

  function applyRules(metrics, context) {
    const applied = [];
    const notApplied = [];
    const stackedKeys = new Set();
    const rules = [...state.config.rules].sort((a, b) => (b.priority || 0) - (a.priority || 0));

    rules.forEach(rule => {
      if (!rule.active) {
        notApplied.push({ rule, reason: 'Regla inactiva' });
        return;
      }
      if (!scopeMatches(rule, context)) {
        notApplied.push({ rule, reason: 'Fuera de scope' });
        return;
      }

      const value = metrics[rule.metric];
      if (value === null || value === undefined) {
        notApplied.push({ rule, reason: 'Dato faltante' });
        return;
      }

      const matched = evaluateOperator(value, rule.operator, rule.threshold, rule.thresholdMax);
      const stackKey = `${rule.type}:${rule.metric}`;
      if (matched) {
        if (!rule.stackable && stackedKeys.has(stackKey)) {
          notApplied.push({ rule, reason: 'No acumula con otra regla del mismo tipo' });
          return;
        }
        stackedKeys.add(stackKey);
        applied.push({
          rule,
          value,
          impact: resolveImpact(rule),
          explanation: explainRule(rule, value),
        });
      } else {
        notApplied.push({ rule, reason: 'Umbral no alcanzado' });
      }
    });

    return { applied, notApplied };
  }

  function scopeMatches(rule, context) {
    const roleScope = arrifyScope(rule.roleScope);
    const flowScope = arrifyScope(rule.flowScope);
    const roleOk = !roleScope.length || roleScope.includes(context.role);
    const flowOk = !flowScope.length || flowScope.some(flow => Object.prototype.hasOwnProperty.call(context.flowMix, flow));
    return roleOk && flowOk;
  }

  function evaluateOperator(value, operator, threshold, thresholdMax) {
    if (value === null || value === undefined) return false;
    if (operator === 'gt') return Number(value) > Number(threshold);
    if (operator === 'gte') return Number(value) >= Number(threshold);
    if (operator === 'lt') return Number(value) < Number(threshold);
    if (operator === 'lte') return Number(value) <= Number(threshold);
    if (operator === 'eq') return String(value) === String(threshold);
    if (operator === 'neq') return String(value) !== String(threshold);
    if (operator === 'between') return Number(value) >= Number(threshold) && Number(value) <= Number(thresholdMax);
    if (operator === 'contains') return String(value).toLowerCase().includes(String(threshold).toLowerCase());
    if (operator === 'not_contains') return !String(value).toLowerCase().includes(String(threshold).toLowerCase());
    return false;
  }

  function resolveImpact(rule) {
    if (rule.impactMode === 'multiplier') {
      return { points: 0, multiplier: rule.type === 'penalty' ? 1 - Number(rule.impactValue) : 1 + Number(rule.impactValue) };
    }
    if (rule.impactMode === 'block') {
      return { points: 0, multiplier: 1 };
    }
    return { points: rule.type === 'penalty' ? -Math.abs(Number(rule.impactValue || 0)) : Math.abs(Number(rule.impactValue || 0)), multiplier: 1 };
  }

  function explainRule(rule, value) {
    const operatorLabel = OPERATOR_OPTIONS.find(option => option.value === rule.operator)?.label || rule.operator;
    if (rule.operator === 'between') return `${METRIC_LABELS[rule.metric] || rule.metric}: ${num(value)} dentro de ${rule.threshold}–${rule.thresholdMax}`;
    return `${METRIC_LABELS[rule.metric] || rule.metric}: ${num(value)} ${operatorLabel} ${rule.threshold}`;
  }

  function finalizeEvaluation(base, ruleEffects, programAdjustments, antiGaming, dataStatus, config) {
    const pointsDelta = ruleEffects.applied.reduce((sum, item) => sum + item.impact.points, 0) + (programAdjustments?.totalPoints || 0);
    const multiplier = ruleEffects.applied.reduce((acc, item) => acc * item.impact.multiplier, 1);
    const exclusionReasons = ruleEffects.applied
      .filter(item => item.rule.type === 'exclusion')
      .map(item => item.rule.name);
    const minimumFailures = ruleEffects.notApplied
      .filter(item => item.rule.type === 'minimum' && item.reason === 'Umbral no alcanzado')
      .map(item => item.rule.name);
    const manualReviewReasons = [];
    if (dataStatus === 'insufficient') manualReviewReasons.push('Datos insuficientes para decisión automática');
    if (dataStatus === 'manual_review') manualReviewReasons.push('Datos parciales o contextuales requieren revisión manual');
    if (dataStatus === 'partial' && config.period.manualReviewOnPartial) manualReviewReasons.push('Datos parciales: conviene revisión manual');

    antiGaming.filter(item => item.triggered && item.mode === 'manual_review').forEach(item => {
      manualReviewReasons.push(`Anti-gaming: ${item.name}`);
    });

    let status = 'eligible';
    if (exclusionReasons.length) status = 'excluded';
    else if (minimumFailures.length) status = 'not_eligible';
    else if (manualReviewReasons.length) status = 'manual_review';

    const unclamped = (base.score + pointsDelta) * multiplier;
    const finalScore = clamp(unclamped, config.scoring.minScore, config.scoring.maxScore);
    const baseCompliance = !minimumFailures.length && !exclusionReasons.length && finalScore >= 72;
    return {
      finalScore: round(finalScore, 1),
      status,
      baseCompliance,
      exclusionReasons,
      minimumFailures,
      manualReviewReasons,
      pointsDelta,
      multiplier: round(multiplier, 3),
    };
  }

  function resolveBand(status, score, bands) {
    if (status === 'excluded') return { label: 'No elegible', payoutPct: 0, color: '#ff5f57' };
    if (status === 'not_eligible') return { label: 'No elegible', payoutPct: 0, color: '#ff5f57' };
    if (status === 'manual_review') return { label: 'Revisión manual requerida', payoutPct: 0, color: '#f6a623' };
    if (status === 'not_evaluable') return { label: 'No evaluable con datos actuales', payoutPct: 0, color: '#8b91a8' };
    const normalizedBands = [...bands]
      .map(band => ({
        ...band,
        min: band.min ?? band.minScore ?? 0,
        max: band.max ?? band.maxScore ?? 101,
      }))
      .sort((a, b) => a.min - b.min);
    const hit = normalizedBands.find(band => score >= band.min && score < band.max);
    return hit || { label: 'Sin banda', payoutPct: 0, color: '#8b91a8' };
  }

  function statusLabel(status) {
    const map = {
      eligible: 'Elegible',
      not_eligible: 'No elegible',
      excluded: 'Excluido',
      manual_review: 'Revisión manual',
      not_evaluable: 'No evaluable',
    };
    return map[status] || status;
  }

  function buildAuditTrail(user, periodKey, metrics, final, base, ruleEffects, antiGaming, fairnessAlerts, programAdjustments, dataStatus, version) {
    return {
      user,
      periodKey,
      configVersion: version,
      calculatedAt: new Date().toISOString(),
      dataStatus,
      metrics,
      baseBreakdown: base.breakdown,
      appliedRules: ruleEffects.applied.map(item => ({
        id: item.rule.id,
        name: item.rule.name,
        type: item.rule.type,
        impactMode: item.rule.impactMode,
        impactValue: item.rule.impactValue,
        explanation: item.explanation,
      })),
      skippedRules: ruleEffects.notApplied.map(item => ({
        id: item.rule.id,
        name: item.rule.name,
        reason: item.reason,
      })),
      antiGaming,
      fairnessAlerts,
      programAdjustments,
      final,
    };
  }

  function buildRecommendations(metrics, final, dominantFlow) {
    const list = [];
    if (final.status === 'excluded') list.push('Hay un desvío crítico activo. Priorizá corregir ese bloqueo antes de mirar aceleradores.');
    if (metrics.quality_pct === null) list.push('Falta calidad auditada en el período. El resultado queda preliminar y requiere revisión manual.');
    if (metrics.quality_pct !== null && metrics.quality_pct < 97) list.push('Subí calidad estable por encima del objetivo. El esquema protege calidad antes que volumen.');
    if (metrics.productivity_ratio !== null && metrics.productivity_ratio < 1) list.push(`Ajustá productividad del flujo ${dominantFlow} hasta el objetivo sin resignar calidad.`);
    if (metrics.hold_pct !== null && metrics.hold_pct > 8) list.push('Revisá uso de HOLD y causas raíz. Mucho HOLD erosiona elegibilidad aunque haya volumen.');
    if (metrics.hold_pct === null || metrics.incidences === null) list.push('Completá trazabilidad de HOLD e incidencias para subir robustez del score y evitar revisión contextual.');
    if (metrics.productive_hours_pct !== null && metrics.productive_hours_pct < 100) list.push('Recuperá horas productivas efectivas para evitar que el resultado dependa sólo de picos de output.');
    if (metrics.recurrence_count !== null && metrics.recurrence_count > 0) list.push('Trabajá reincidencias ya conocidas. El sistema las toma como fricción evitable.');
    if (metrics.weekly_consistency_pct !== null && metrics.weekly_consistency_pct < 75) list.push('Buscá consistencia semanal. Una buena semana aislada no debería sostener el incentivo.');
    if (metrics.quality_primary_deviation) list.push(`El principal desvío observado en auditoría fue "${metrics.quality_primary_deviation}". Atacarlo debería mover calidad y robustez a la vez.`);
    if (!list.length) list.push('El perfil está sano. El siguiente paso es sostener consistencia y evitar desvíos críticos.');
    return list;
  }

  function applyEvaluationFilters(rows) {
    const search = (state.filters.search || '').trim().toLowerCase();
    return rows.filter(row => {
      if (state.filters.team && row.team !== state.filters.team) return false;
      if (state.filters.band && row.bandLabel !== state.filters.band) return false;
      if (search) {
        const haystack = `${row.name} ${row.user} ${row.team} ${row.role}`.toLowerCase();
        if (!haystack.includes(search)) return false;
      }
      return true;
    });
  }

  function createEmptyEconomicRow(row = {}) {
    const alerts = [];
    if (row.status === 'manual_review') alerts.push('Pendiente de validación');
    if (row.status === 'not_evaluable') alerts.push('Sin base suficiente para simulación');
    return {
      included: false,
      pendingValidation: row.status === 'manual_review',
      baseAmount: 0,
      performanceAmount: 0,
      excellenceAmount: 0,
      totalEstimated: 0,
      pools: [],
      reason: row.status === 'manual_review'
        ? 'Pendiente de validación manual'
        : row.status === 'not_evaluable'
          ? 'No evaluable con datos actuales'
          : 'Sin asignación estimada',
      alerts,
    };
  }

  function distributePool(poolAmount, candidates, weightFn, componentKey, capAmount, rowMap) {
    let remaining = Math.max(0, Number(poolAmount || 0));
    if (!remaining || !candidates.length) return 0;
    let active = candidates
      .map(row => ({ row, weight: Math.max(0, Number(weightFn(row) || 0)) }))
      .filter(item => item.weight > 0);
    if (!active.length) return remaining;

    while (remaining > 0.0001 && active.length) {
      const totalWeight = active.reduce((sum, item) => sum + item.weight, 0);
      if (!totalWeight) break;
      let consumed = 0;
      const next = [];
      active.forEach(item => {
        const record = rowMap[item.row.user];
        const currentTotal = record.baseAmount + record.performanceAmount + record.excellenceAmount;
        const headroom = capAmount === null ? Infinity : Math.max(0, capAmount - currentTotal);
        if (headroom <= 0.0001) return;
        const proposed = remaining * (item.weight / totalWeight);
        const granted = Math.min(headroom, proposed);
        if (granted > 0) {
          record[componentKey] += granted;
          consumed += granted;
        }
        if (headroom - granted > 0.0001) next.push(item);
      });
      if (consumed <= 0.0001) break;
      remaining -= consumed;
      active = next;
    }
    return Math.max(0, remaining);
  }

  function applyRounding(rowMap, budget, step, capAmount) {
    const increments = [];
    const rounded = {};
    Object.values(rowMap).forEach(row => {
      ['baseAmount', 'performanceAmount', 'excellenceAmount'].forEach(key => {
        const raw = Number(row[key] || 0);
        const floored = step > 1 ? Math.floor(raw / step) * step : raw;
        rounded[`${row.user}:${key}`] = floored;
        increments.push({
          user: row.user,
          key,
          remainder: raw - floored,
        });
      });
    });

    Object.values(rowMap).forEach(row => {
      row.baseAmount = rounded[`${row.user}:baseAmount`] || 0;
      row.performanceAmount = rounded[`${row.user}:performanceAmount`] || 0;
      row.excellenceAmount = rounded[`${row.user}:excellenceAmount`] || 0;
      row.totalEstimated = row.baseAmount + row.performanceAmount + row.excellenceAmount;
    });

    let assigned = Object.values(rowMap).reduce((sum, row) => sum + row.totalEstimated, 0);
    let remaining = Math.max(0, budget - assigned);
    if (step <= 1) return remaining;

    increments.sort((a, b) => b.remainder - a.remainder);
    increments.forEach(item => {
      if (remaining < step) return;
      const row = rowMap[item.user];
      const currentTotal = row.baseAmount + row.performanceAmount + row.excellenceAmount;
      if (item.remainder <= 0 || (capAmount !== null && currentTotal + step > capAmount + 0.0001)) return;
      row[item.key] += step;
      row.totalEstimated += step;
      remaining -= step;
    });
    return remaining;
  }

  function computeEconomicSimulation(rows, config) {
    const econ = config.economicAllocation || {};
    const budget = Math.max(0, Number(econ.budget || 0));
    const currency = econ.currency || 'ARS';
    const rowMap = Object.fromEntries(rows.map(row => [row.user, { user: row.user, ...createEmptyEconomicRow(row) }]));
    const alerts = [];
    const capAmount = Number(econ.maxIndividualBudgetShare || 0) > 0 ? budget * Number(econ.maxIndividualBudgetShare) : null;
    const eligible = rows.filter(row => row.status === 'eligible');
    const baseCandidates = eligible.filter(row => econ.includeBaseBand !== false || row.bandLabel !== 'Cumple objetivo base');
    const performanceCandidates = eligible.filter(row => ['Elegible destacado', 'Elegible sobresaliente'].includes(row.bandLabel));
    const excellenceCandidates = eligible.filter(row => row.bandLabel === (econ.excellenceBand || 'Elegible sobresaliente'));
    const manualReview = rows.filter(row => row.status === 'manual_review');
    const excludedFromBudget = rows.filter(row => row.status !== 'eligible');

    if (!econ.enabled) alerts.push({ title: 'Simulación económica desactivada', body: 'La asignación estimada está apagada en configuración.' });
    if (!budget) alerts.push({ title: 'Presupuesto en cero', body: 'Cargá un presupuesto mensual para simular asignaciones.' });
    if (!eligible.length) alerts.push({ title: 'No hay perfiles elegibles', body: 'Con el estado actual no hay personas habilitadas para reparto estimado.' });
    if (manualReview.length > rows.length * 0.25) alerts.push({ title: 'Muchas revisiones manuales', body: `${manualReview.length} perfiles siguen pendientes de validación antes de usar una simulación económica con confianza.` });
    if (rows.filter(row => row.robustness?.level === 'low').length > rows.length * 0.35) alerts.push({ title: 'Robustez baja extendida', body: 'Una parte relevante del equipo tiene evidencia parcial. La asignación estimada debe leerse con cautela.' });
    if (rows.filter(row => row.metrics.quality_pct === null).length > rows.length * 0.25) alerts.push({ title: 'Falta calidad auditada', body: 'Hay muchos perfiles sin calidad auditada suficiente para sostener una simulación robusta.' });
    if (rows.filter(row => row.fairnessAlerts?.length).length) alerts.push({ title: 'Riesgo de inequidad por flujos', body: 'Existen personas expuestas a flujos con acceso desigual o calibración pendiente.' });

    if (!econ.enabled || !budget || !eligible.length) {
      rows.forEach(row => {
        rowMap[row.user].reason = row.status === 'eligible'
          ? 'Sin simulación económica activa o sin presupuesto configurado'
          : rowMap[row.user].reason;
      });
      return {
        enabled: !!econ.enabled,
        currency,
        budget,
        assigned: 0,
        unassigned: budget,
        roundedDifference: 0,
        eligibleBaseCount: baseCandidates.length,
        performanceCount: performanceCandidates.length,
        excellenceCount: excellenceCandidates.length,
        excludedCount: excludedFromBudget.length,
        manualReviewCount: manualReview.length,
        avgAssigned: 0,
        maxAssigned: 0,
        minAssigned: 0,
        rowsByUser: rowMap,
        alerts,
      };
    }

    const pools = {
      base: budget * Number(econ.pools?.base || 0),
      performance: budget * Number(econ.pools?.performance || 0),
      excellence: budget * Number(econ.pools?.excellence || 0),
    };

    if (!baseCandidates.length && pools.base > 0) alerts.push({ title: 'Pool base sin beneficiarios', body: 'No hay perfiles elegibles para el pool de cumplimiento base.' });
    if (!performanceCandidates.length && pools.performance > 0) alerts.push({ title: 'Pool performance sin beneficiarios', body: 'No hay perfiles destacados/sobresalientes para el pool de performance.' });
    if (!excellenceCandidates.length && pools.excellence > 0) alerts.push({ title: 'Pool excellence sin beneficiarios', body: 'No hay perfiles en la banda de excelencia para ese pool.' });

    const baseMinimum = Math.max(0, Number(econ.baseMinimumAmount || 0));
    if (baseMinimum > 0 && baseCandidates.length * baseMinimum > pools.base) {
      alerts.push({ title: 'Presupuesto insuficiente para piso base', body: 'El presupuesto del pool base no alcanza para aplicar el piso configurado; se ignora el piso en esta simulación.' });
    } else if (baseMinimum > 0 && baseCandidates.length) {
      baseCandidates.forEach(row => {
        const record = rowMap[row.user];
        const headroom = capAmount === null ? Infinity : Math.max(0, capAmount - record.totalEstimated);
        const granted = Math.min(baseMinimum, headroom);
        record.baseAmount += granted;
        record.totalEstimated += granted;
      });
      pools.base -= baseCandidates.length * baseMinimum;
    }

    distributePool(pools.base, baseCandidates, () => 1, 'baseAmount', capAmount, rowMap);
    const performanceThreshold = state.config.bands.find(band => band.label === 'Elegible base')?.min || 84;
    distributePool(pools.performance, performanceCandidates, row => Math.max(0, row.finalScore - performanceThreshold), 'performanceAmount', capAmount, rowMap);
    const excellenceThreshold = state.config.bands.find(band => band.label === (econ.excellenceBand || 'Elegible sobresaliente'))?.min || 97;
    distributePool(pools.excellence, excellenceCandidates, row => Math.max(1, row.finalScore - excellenceThreshold), 'excellenceAmount', capAmount, rowMap);

    const roundingStep = Math.max(1, Number(econ.roundingStep || 1));
    const unassignedAfterRounding = applyRounding(rowMap, budget, roundingStep, capAmount);

    Object.values(rowMap).forEach(record => {
      const total = record.baseAmount + record.performanceAmount + record.excellenceAmount;
      record.totalEstimated = total;
      const row = rows.find(item => item.user === record.user);
      if (total > 0) {
        record.included = true;
        record.pools = [
          record.baseAmount > 0 ? 'base' : null,
          record.performanceAmount > 0 ? 'performance' : null,
          record.excellenceAmount > 0 ? 'excellence' : null,
        ].filter(Boolean);
        record.reason = `Participa en ${record.pools.join(' + ')} con asignación estimada sujeta a validación.`;
      } else if (row?.status === 'manual_review' && econ.includeManualReview !== true) {
        record.reason = 'Pendiente de validación: no entra al reparto automático por revisión manual.';
      } else if (row?.status !== 'eligible') {
        record.reason = `Excluido de la simulación por estado ${row?.statusLabel || row?.status || 'no elegible'}.`;
      } else {
        record.reason = 'Elegible sin asignación en esta corrida por pools, topes o presupuesto.';
      }
      if (row?.robustness?.level === 'low') record.alerts.push('Score con robustez baja');
      if (row?.fairnessAlerts?.length) record.alerts.push('Riesgo de inequidad por flujo');
      if (row?.antiGamingAlerts?.some(item => item.triggered)) record.alerts.push('Alertas anti-gaming activas');
      if (capAmount !== null && total >= capAmount - 0.0001 && total > 0) record.alerts.push('Alcanzó el tope individual');
    });

    const assignedRows = Object.values(rowMap).filter(row => row.totalEstimated > 0);
    const assigned = assignedRows.reduce((sum, row) => sum + row.totalEstimated, 0);
    const maxAssigned = assignedRows.length ? Math.max(...assignedRows.map(row => row.totalEstimated)) : 0;
    const minAssigned = assignedRows.length ? Math.min(...assignedRows.map(row => row.totalEstimated)) : 0;
    const avgAssigned = assignedRows.length ? assigned / assignedRows.length : 0;
    if (assignedRows.some(row => budget && (row.totalEstimated / budget) > Math.max(Number(econ.maxIndividualBudgetShare || 0), 0.10) + 0.0001)) {
      alerts.push({ title: 'Concentración alta', body: 'Una persona supera la concentración máxima esperada del presupuesto.' });
    }
    if (unassignedAfterRounding > 0) {
      alerts.push({ title: 'Diferencia por redondeo', body: `Quedan ${formatCurrency(unassignedAfterRounding, currency)} sin asignar por redondeo o topes.` });
    }

    return {
      enabled: !!econ.enabled,
      currency,
      budget,
      assigned,
      unassigned: Math.max(0, budget - assigned),
      roundedDifference: unassignedAfterRounding,
      eligibleBaseCount: baseCandidates.length,
      performanceCount: performanceCandidates.length,
      excellenceCount: excellenceCandidates.length,
      excludedCount: excludedFromBudget.length,
      manualReviewCount: manualReview.length,
      avgAssigned,
      maxAssigned,
      minAssigned,
      rowsByUser: rowMap,
      alerts,
    };
  }

  function buildSummary(rows, visibleRows, economic = null) {
    const avgScore = visibleRows.length ? visibleRows.reduce((sum, row) => sum + row.finalScore, 0) / visibleRows.length : 0;
    const eligible = rows.filter(row => row.status === 'eligible');
    const baseCompliant = rows.filter(row => row.bandLabel === 'Cumple objetivo base');
    const highlighted = rows.filter(row => ['Elegible destacado', 'Elegible sobresaliente'].includes(row.bandLabel));
    const excluded = rows.filter(row => row.status === 'excluded');
    const manual = rows.filter(row => row.status === 'manual_review');
    const noEligible = rows.filter(row => row.status === 'not_eligible');
    const notEvaluable = rows.filter(row => row.status === 'not_evaluable');
    const antiGaming = rows.filter(row => row.antiGamingAlerts?.some(item => item.triggered));
    const fairness = rows.filter(row => row.fairnessAlerts?.length);
    const lowRobustness = rows.filter(row => row.robustness?.level === 'low' || row.robustness?.level === 'none');
    const affectedByOpsRules = rows.filter(row => row.metrics.quality_pct !== null || row.metrics.hold_pct !== null || row.metrics.incidences !== null);
    const bandCounts = {};
    rows.forEach(row => {
      bandCounts[row.bandLabel] = (bandCounts[row.bandLabel] || 0) + 1;
    });
    return {
      total: rows.length,
      visible: visibleRows.length,
      eligible: eligible.length,
      baseCompliant: baseCompliant.length,
      highlighted: highlighted.length,
      excluded: excluded.length,
      manual: manual.length,
      noEligible: noEligible.length,
      notEvaluable: notEvaluable.length,
      antiGaming: antiGaming.length,
      fairness: fairness.length,
      lowRobustness: lowRobustness.length,
      affectedByOpsRules: affectedByOpsRules.length,
      avgScore: round(avgScore, 1),
      bandCounts,
      economic,
    };
  }

  function buildRuleHotspots(rows) {
    const counts = {};
    rows.forEach(row => {
      row.appliedRules.forEach(rule => {
        counts[rule.rule.name] = counts[rule.rule.name] || { name: rule.rule.name, count: 0, type: rule.rule.type };
        counts[rule.rule.name].count += 1;
      });
    });
    return Object.values(counts).sort((a, b) => b.count - a.count).slice(0, 6);
  }

  function buildRiskCards(rows) {
    const risks = [];
    if (!rows.length) return risks;
    const eligibleRate = rows.filter(row => row.status === 'eligible').length / rows.length;
    if (eligibleRate > 0.82) risks.push({ title: 'Esquema posiblemente laxo', body: `El ${pct(eligibleRate * 100)} del equipo queda elegible. Revisá mínimos y aceleradores.` });
    if (eligibleRate < 0.3) risks.push({ title: 'Esquema posiblemente restrictivo', body: `Sólo ${pct(eligibleRate * 100)} del equipo queda elegible. Puede estar castigando demasiado.` });
    const manualRate = rows.filter(row => row.status === 'manual_review').length / rows.length;
    if (manualRate > 0.18) risks.push({ title: 'Muchos casos en revisión manual', body: `Hay ${pct(manualRate * 100)} del equipo sin calidad auditada suficiente o con validación pendiente.` });
    const unhealthyEligible = rows.filter(row => row.status === 'eligible' && row.metrics.quality_pct !== null && row.metrics.quality_pct < 95);
    if (unhealthyEligible.length) risks.push({ title: 'Volumen sano en duda', body: `${unhealthyEligible.length} elegibles tienen calidad por debajo del mínimo sugerido.` });
    const volumeBias = rows.filter(row => row.metrics.productivity_quality_gap !== null && row.metrics.productivity_quality_gap > 12).length;
    if (volumeBias > 0) risks.push({ title: 'Riesgo de premiar velocidad sobre calidad', body: `${volumeBias} colaboradores muestran gap fuerte entre productividad y calidad.` });
    const fairnessRisk = rows.filter(row => row.fairnessAlerts?.length).length;
    if (fairnessRisk > 0) risks.push({ title: 'Riesgo de inequidad por flujo', body: `${fairnessRisk} colaboradores están expuestos a flujos con acceso desigual o calibración pendiente.` });
    const notEvaluable = rows.filter(row => row.status === 'not_evaluable').length;
    if (notEvaluable > 0) risks.push({ title: 'Roles no evaluables con datos actuales', body: `${notEvaluable} perfiles de liderazgo/calidad requieren datos agregados específicos antes de usar el resultado.` });
    const lowRobustness = rows.filter(row => ['low', 'none'].includes(row.robustness?.level)).length;
    if (lowRobustness > rows.length * 0.35) risks.push({ title: 'Robustez baja en demasiados perfiles', body: `${lowRobustness} colaboradores tienen evidencia insuficiente o parcial para una lectura fuerte.` });
    if (!risks.length) risks.push({ title: 'Esquema balanceado', body: 'No aparecen señales gruesas de laxitud o sesgo hacia volumen en el período seleccionado.' });
    return risks;
  }

  function buildOutliers(rows) {
    const candidates = [];
    rows.forEach(row => {
      if (row.metrics.productivity_ratio !== null && row.metrics.quality_pct !== null) {
        if (row.metrics.productivity_ratio > 1.1 && row.metrics.quality_pct < 95) candidates.push({ title: `${row.name}: volumen alto con calidad frágil`, body: `Prod ${pct(row.metrics.productivity_ratio * 100)} · Calidad ${pct(row.metrics.quality_pct)}` });
        if (row.metrics.productivity_ratio < 0.92 && row.metrics.quality_pct >= 98) candidates.push({ title: `${row.name}: calidad alta con productividad baja`, body: `Prod ${pct(row.metrics.productivity_ratio * 100)} · Calidad ${pct(row.metrics.quality_pct)}` });
      }
      if (row.metrics.hold_pct !== null && row.metrics.hold_pct > 12) candidates.push({ title: `${row.name}: fricción operativa alta`, body: `HOLD ${pct(row.metrics.hold_pct)} · Score ${num(row.finalScore)}` });
    });
    return candidates.slice(0, 6);
  }

  function renderAll(recompute = true) {
    if (recompute) state.evaluation = buildEvaluation(state.filters.periodType, state.filters.periodKey);
    else if (state.evaluation) {
      state.evaluation.visibleRows = applyEvaluationFilters(state.evaluation.allRows);
      state.evaluation.summary = buildSummary(state.evaluation.allRows, state.evaluation.visibleRows, state.evaluation.economic);
    }
    const hasData = !!state.evaluation;
    setVisibility(hasData);
    renderIncentiveFilters();
    renderSummary();
    renderChart();
    renderRiskCards();
    renderHotspots();
    renderAntiGaming();
    renderFairness();
    renderOutliers();
    renderTable();
    renderDetail();
    renderConfigSummary();
    renderMetricModels();
    renderGeneralSettings();
    renderRoleSettings();
    renderProgramSettings();
    renderFlowProfiles();
    renderRulesTable();
    renderRuleEditor();
    renderBandsEditor();
    renderAuditLog();
    renderEconomicControls();
    renderEconomicSummary();
    renderEconomicAlerts();
  }

  function setVisibility(hasData) {
    const empty = document.getElementById('incentive-empty');
    const content = document.getElementById('incentive-content');
    if (empty) empty.style.display = hasData ? 'none' : 'block';
    if (content) content.style.display = hasData ? 'block' : 'none';
  }

  function renderIncentiveFilters() {
    const periodTypeEl = document.getElementById('inc-period-type');
    const periodKeyEl = document.getElementById('inc-period-key');
    const teamEl = document.getElementById('inc-team-filter');
    const bandEl = document.getElementById('inc-band-filter');
    const searchEl = document.getElementById('inc-search');
    if (!periodTypeEl || !periodKeyEl || !teamEl || !bandEl || !searchEl) return;

    periodTypeEl.innerHTML = `
      <option value="month">Mensual</option>
      <option value="week">Semanal</option>`;
    periodTypeEl.value = state.filters.periodType;

    const evaluation = state.evaluation;
    if (!evaluation) {
      periodKeyEl.innerHTML = '<option value="latest">Último</option>';
      teamEl.innerHTML = '<option value="">Todos</option>';
      bandEl.innerHTML = '<option value="">Todas</option>';
      return;
    }

    periodKeyEl.innerHTML = ['<option value="latest">Último disponible</option>']
      .concat(evaluation.periodKeys.map(key => `<option value="${key}">${key}</option>`))
      .join('');
    periodKeyEl.value = state.filters.periodKey;

    const teams = [...new Set(evaluation.allRows.map(row => row.team).filter(Boolean))].sort();
    teamEl.innerHTML = ['<option value="">Todos</option>']
      .concat(teams.map(team => `<option value="${team}">${team}</option>`))
      .join('');
    teamEl.value = state.filters.team;

    const bands = [...new Set(evaluation.allRows.map(row => row.bandLabel))];
    bandEl.innerHTML = ['<option value="">Todas</option>']
      .concat(bands.map(band => `<option value="${band}">${band}</option>`))
      .join('');
    bandEl.value = state.filters.band;
    searchEl.value = state.filters.search;
  }

  function renderSummary() {
    const container = document.getElementById('incentive-summary');
    const alert = document.getElementById('incentive-data-alert');
    if (!container || !alert) return;
    if (!state.evaluation) {
      container.innerHTML = '';
      alert.style.display = 'none';
      return;
    }
    const s = state.evaluation.summary;
    container.innerHTML = `
      <div class="stat-card acc"><div class="stat-label">Evaluados</div><div class="stat-value">${s.total}</div><div class="stat-sub">${state.evaluation.periodKey}</div></div>
      <div class="stat-card bb"><div class="stat-label">Cumplen base</div><div class="stat-value">${s.baseCompliant}</div><div class="stat-sub">pueden entrar a la simulación base</div></div>
      <div class="stat-card grn"><div class="stat-label">Destacados / sobresalientes</div><div class="stat-value">${s.highlighted}</div><div class="stat-sub">desempeño superior</div></div>
      <div class="stat-card amb"><div class="stat-label">Revisión manual</div><div class="stat-value">${s.manual}</div><div class="stat-sub">datos parciales / alertas / interpretación</div></div>
      <div class="stat-card redd"><div class="stat-label">No elegibles / excluidos</div><div class="stat-value">${s.noEligible + s.excluded}</div><div class="stat-sub">mínimos + exclusiones</div></div>
      <div class="stat-card"><div class="stat-label">No evaluables</div><div class="stat-value">${s.notEvaluable}</div><div class="stat-sub">roles sin datos suficientes</div></div>
      <div class="stat-card"><div class="stat-label">Alertas anti-gaming</div><div class="stat-value">${s.antiGaming}</div><div class="stat-sub">requieren lectura contextual</div></div>
      <div class="stat-card"><div class="stat-label">Riesgo de inequidad</div><div class="stat-value">${s.fairness}</div><div class="stat-sub">por flujo / acceso</div></div>
      <div class="stat-card"><div class="stat-label">Robustez baja</div><div class="stat-value">${s.lowRobustness}</div><div class="stat-sub">requieren lectura prudente</div></div>`;

    const partialCount = state.evaluation.allRows.filter(row => row.dataStatus !== 'complete').length;
    if (partialCount) {
      alert.style.display = 'flex';
      alert.innerHTML = `⚠ ${partialCount} colaboradores tienen datos parciales, insuficientes o no evaluables. El módulo sólo muestra elegibilidad estimada y resultado preliminar; no alcanza para liquidación final automática.`;
    } else {
      alert.style.display = 'none';
    }
  }

  function renderChart() {
    const canvas = document.getElementById('chart-incentive-bands');
    if (!canvas || !state.evaluation || typeof Chart === 'undefined') return;
    const counts = state.evaluation.summary.bandCounts;
    const labels = Object.keys(counts);
    const values = Object.values(counts);
    const colors = labels.map(label => {
      const row = state.evaluation.allRows.find(item => item.bandLabel === label);
      return row?.bandColor || '#5b7fff';
    });
    const ctx = canvas.getContext('2d');
    if (state.charts.bands) state.charts.bands.destroy();
    state.charts.bands = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [{ data: values, backgroundColor: colors.map(color => `${color}AA`), borderColor: colors, borderWidth: 1.5, borderRadius: 6 }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { grid: { color: '#252a3a' }, ticks: { color: '#8b91a8', precision: 0 } },
          y: { grid: { display: false }, ticks: { color: '#8b91a8', precision: 0 } },
        },
      },
    });
  }

  function renderRiskCards() {
    const container = document.getElementById('incentive-risk-cards');
    if (!container) return;
    const items = state.evaluation?.risks || [];
    container.innerHTML = `<div class="risk-list">${items.map(item => `
      <div class="risk-card">
        <h4>${item.title}</h4>
        <p>${item.body}</p>
      </div>`).join('')}</div>`;
  }

  function renderHotspots() {
    const container = document.getElementById('incentive-rule-hotspots');
    if (!container) return;
    const hotspots = state.evaluation?.hotspots || [];
    if (!hotspots.length) {
      container.innerHTML = '<div class="config-empty">Todavía no hay reglas aplicadas en el período seleccionado.</div>';
      return;
    }
    container.innerHTML = `
      <div class="detail-section-title">Reglas con más impacto</div>
      <div class="hotspot-list">${hotspots.map(item => `
        <div class="hotspot-card">
          <div class="tag-row"><span class="tag type-${item.type}">${item.type}</span></div>
          <h4>${item.name}</h4>
          <p>Se activó en ${item.count} colaboradores del período visible.</p>
        </div>`).join('')}</div>`;
  }

  function renderAntiGaming() {
    const container = document.getElementById('incentive-antigaming');
    if (!container) return;
    const rows = state.evaluation?.allRows || [];
    const alerts = rows.flatMap(row => (row.antiGamingAlerts || []).filter(item => item.triggered).map(item => ({
      title: `${row.name}: ${item.name}`,
      body: item.message,
    }))).slice(0, 8);
    container.innerHTML = alerts.length
      ? `<div class="risk-list">${alerts.map(item => `<div class="risk-card"><h4>${item.title}</h4><p>${item.body}</p></div>`).join('')}</div>`
      : '<div class="config-empty">No hay alertas anti-gaming activas en el período visible.</div>';
  }

  function renderFairness() {
    const container = document.getElementById('incentive-fairness');
    if (!container) return;
    const rows = state.evaluation?.allRows || [];
    const alerts = rows.flatMap(row => row.fairnessAlerts || []).slice(0, 8);
    container.innerHTML = alerts.length
      ? `<div class="risk-list">${alerts.map(item => `<div class="risk-card"><h4>${item.title}</h4><p>${item.body}</p></div>`).join('')}</div>`
      : '<div class="config-empty">No se detectan riesgos de inequidad por flujo en el período visible.</div>';
  }

  function renderOutliers() {
    const container = document.getElementById('incentive-outliers');
    if (!container) return;
    const items = state.evaluation?.outliers || [];
    container.innerHTML = items.length
      ? `<div class="outlier-list">${items.map(item => `<div class="outlier-card"><h4>${item.title}</h4><p>${item.body}</p></div>`).join('')}</div>`
      : '<div class="config-empty">Sin outliers relevantes para la combinación actual de reglas.</div>';
  }

  function renderEconomicControls() {
    const container = document.getElementById('incentive-economic-controls');
    if (!container) return;
    const econ = state.config.economicAllocation;
    container.innerHTML = `
      <div class="config-stack">
        <div class="config-row">
          <div class="config-field"><label>Presupuesto mensual disponible</label><input data-economic-field="budget" type="number" step="100" min="0" value="${econ.budget || 0}" placeholder="500000"></div>
          <div class="config-field"><label>Moneda</label><input data-economic-field="currency" type="text" value="${econ.currency || 'ARS'}"></div>
          <div class="config-field"><label>Tope individual %</label><input data-economic-field="maxIndividualBudgetShare" type="number" step="0.01" min="0" max="1" value="${econ.maxIndividualBudgetShare}"></div>
          <div class="config-field"><label>Piso base</label><input data-economic-field="baseMinimumAmount" type="number" step="100" min="0" value="${econ.baseMinimumAmount || 0}"></div>
        </div>
        <div class="config-row">
          <div class="config-field"><label>Pool base %</label><input data-economic-pool="base" type="number" step="0.01" min="0" max="1" value="${econ.pools.base}"></div>
          <div class="config-field"><label>Pool performance %</label><input data-economic-pool="performance" type="number" step="0.01" min="0" max="1" value="${econ.pools.performance}"></div>
          <div class="config-field"><label>Pool excellence %</label><input data-economic-pool="excellence" type="number" step="0.01" min="0" max="1" value="${econ.pools.excellence}"></div>
          <div class="config-field"><label>Redondeo</label><input data-economic-field="roundingStep" type="number" step="100" min="1" value="${econ.roundingStep || 100}"></div>
        </div>
        <div class="config-inline-actions">
          <label class="pill"><input data-economic-field="includeManualReview" type="checkbox" ${econ.includeManualReview ? 'checked' : ''}> Permitir revisión manual en simulación</label>
          <label class="pill"><input data-economic-field="includeBaseBand" type="checkbox" ${econ.includeBaseBand !== false ? 'checked' : ''}> Incluir banda base</label>
        </div>
        <div class="detail-box"><p>Este presupuesto se usa solo para simulación de asignación económica. No representa liquidación final.</p></div>
        <div class="config-inline-actions">
          <button class="filter-btn" data-action="economic-recalc">Recalcular simulación</button>
          <button class="filter-btn" data-action="economic-reset">Resetear configuración económica</button>
        </div>
      </div>`;
  }

  function renderEconomicSummary() {
    const container = document.getElementById('incentive-economic-summary');
    if (!container) return;
    const economic = state.evaluation?.economic;
    if (!economic) {
      container.innerHTML = '<div class="config-empty">No hay simulación económica disponible todavía.</div>';
      return;
    }
    container.innerHTML = `
      <div class="stat-grid">
        <div class="stat-card acc"><div class="stat-label">Presupuesto total</div><div class="stat-value">${formatCurrency(economic.budget, economic.currency)}</div><div class="stat-sub">simulación económica</div></div>
        <div class="stat-card grn"><div class="stat-label">Asignado</div><div class="stat-value">${formatCurrency(economic.assigned, economic.currency)}</div><div class="stat-sub">estimado y sujeto a validación</div></div>
        <div class="stat-card"><div class="stat-label">No asignado</div><div class="stat-value">${formatCurrency(economic.unassigned, economic.currency)}</div><div class="stat-sub">remanente / redondeo / topes</div></div>
        <div class="stat-card bb"><div class="stat-label">Elegibles base</div><div class="stat-value">${economic.eligibleBaseCount}</div><div class="stat-sub">candidatos al pool base</div></div>
        <div class="stat-card"><div class="stat-label">Destacados</div><div class="stat-value">${economic.performanceCount}</div><div class="stat-sub">pool performance</div></div>
        <div class="stat-card"><div class="stat-label">Sobresalientes</div><div class="stat-value">${economic.excellenceCount}</div><div class="stat-sub">pool excellence</div></div>
        <div class="stat-card"><div class="stat-label">Asignación promedio</div><div class="stat-value">${formatCurrency(economic.avgAssigned, economic.currency)}</div><div class="stat-sub">entre asignados</div></div>
        <div class="stat-card"><div class="stat-label">Máxima / mínima</div><div class="stat-value">${formatCurrency(economic.maxAssigned, economic.currency)}</div><div class="stat-sub">mín ${formatCurrency(economic.minAssigned, economic.currency)}</div></div>
        <div class="stat-card redd"><div class="stat-label">Excluidos del reparto</div><div class="stat-value">${economic.excludedCount}</div><div class="stat-sub">no elegibles / no evaluables</div></div>
        <div class="stat-card amb"><div class="stat-label">Pendientes de validación</div><div class="stat-value">${economic.manualReviewCount}</div><div class="stat-sub">revisión manual</div></div>
      </div>`;
  }

  function renderEconomicAlerts() {
    const container = document.getElementById('incentive-economic-alerts');
    if (!container) return;
    const alerts = state.evaluation?.economic?.alerts || [];
    container.innerHTML = alerts.length
      ? `<div class="risk-list">${alerts.map(item => `<div class="risk-card"><h4>${item.title}</h4><p>${item.body}</p></div>`).join('')}</div>`
      : '<div class="config-empty">No hay alertas económicas globales para esta simulación.</div>';
  }

  function formatSigned(value) {
    const n = Number(value || 0);
    if (!n) return '0';
    return `${n > 0 ? '+' : ''}${num(n)}`;
  }

  function renderTable() {
    const thead = document.getElementById('incentive-thead');
    const tbody = document.getElementById('incentive-tbody');
    const meta = document.getElementById('incentive-table-meta');
    if (!thead || !tbody || !meta) return;
    if (!state.evaluation) {
      thead.innerHTML = '';
      tbody.innerHTML = '';
      meta.textContent = '';
      return;
    }

    const rows = state.evaluation.visibleRows;
    meta.textContent = `${rows.length} visibles / ${state.evaluation.allRows.length} evaluados`;
    thead.innerHTML = `<tr>
      <th>Colaborador</th>
      <th>Rol</th>
      <th>Equipo</th>
      <th>Resultado preliminar</th>
      <th>Robustez</th>
      <th>Banda</th>
      <th>Estado</th>
      <th>Prod.</th>
      <th>Calidad</th>
      <th>HOLD</th>
      <th>Incid.</th>
      <th>Datos</th>
      <th>Base</th>
      <th>Perf.</th>
      <th>Exc.</th>
      <th>Total estimado</th>
      <th>Motivo</th>
      <th></th>
    </tr>`;
    tbody.innerHTML = rows.map(row => `
      <tr>
        <td class="name-cell">${row.name}<div class="mono-soft">${row.user}</div></td>
        <td>${row.role}</td>
        <td>${row.team}</td>
        <td class="mono-cell" style="color:${row.bandColor};font-weight:600">${num(row.finalScore)}</td>
        <td>${row.robustness?.label || '—'}</td>
        <td><span class="badge" style="background:${row.bandColor}22;color:${row.bandColor};border:1px solid ${row.bandColor}44">${row.bandLabel}</span></td>
        <td>${row.statusLabel}</td>
        <td class="mono-cell">${row.metrics.productivity_ratio !== null ? pct(row.metrics.productivity_ratio * 100) : '—'}</td>
        <td class="mono-cell">${pct(row.metrics.quality_pct)}</td>
        <td class="mono-cell">${pct(row.metrics.hold_pct)}</td>
        <td class="mono-cell">${num(row.metrics.incidences, 0)}</td>
        <td>${renderDataStatusBadge(row.dataStatus)}</td>
        <td class="mono-cell">${formatCurrency(row.economic?.baseAmount || 0, state.evaluation.economic?.currency || 'ARS')}</td>
        <td class="mono-cell">${formatCurrency(row.economic?.performanceAmount || 0, state.evaluation.economic?.currency || 'ARS')}</td>
        <td class="mono-cell">${formatCurrency(row.economic?.excellenceAmount || 0, state.evaluation.economic?.currency || 'ARS')}</td>
        <td class="mono-cell" style="font-weight:600">${formatCurrency(row.economic?.totalEstimated || 0, state.evaluation.economic?.currency || 'ARS')}</td>
        <td>${row.economic?.reason || '—'}</td>
        <td><button class="filter-btn" data-user="${row.user}">Ver</button></td>
      </tr>`).join('');

    if (!state.selectedUser && rows[0]) state.selectedUser = rows[0].user;
  }

  function renderDataStatusBadge(status) {
    const map = {
      complete: ['Completo', 'good'],
      partial: ['Parcial', 'warn'],
      insufficient: ['Insuficiente', 'bad'],
      manual_review: ['Revisión', 'warn'],
      not_evaluable: ['No evaluable', 'neutral'],
    };
    const [label, css] = map[status] || [status, 'neutral'];
    return `<span class="score-badge ${css}">${label}</span>`;
  }

  function renderDetail() {
    const container = document.getElementById('incentive-detail-body');
    if (!container) return;
    if (!state.evaluation || !state.evaluation.visibleRows.length) {
      container.innerHTML = '<div class="config-empty">No hay colaboradores para mostrar.</div>';
      return;
    }
    const row = state.evaluation.allRows.find(item => item.user === state.selectedUser) || state.evaluation.visibleRows[0];
    if (!row) {
      container.innerHTML = '<div class="config-empty">Seleccioná un colaborador.</div>';
      return;
    }
    state.selectedUser = row.user;

    container.innerHTML = `
      <div class="tag-row">
        <span class="score-badge neutral">Resultado preliminar ${num(row.finalScore)}</span>
        <span class="score-badge ${row.status === 'eligible' ? 'good' : row.status === 'manual_review' ? 'warn' : row.status === 'not_evaluable' ? 'neutral' : 'bad'}">${row.bandLabel}</span>
        <span class="score-badge neutral">Elegibilidad estimada ${pct(row.estimatedPayoutPct)}</span>
        <span class="score-badge neutral">${row.robustness?.label || 'Sin robustez'}</span>
      </div>
      <div class="metric-breakdown">
        ${renderMetricChip('Productividad', row.metrics.productivity_ratio !== null ? pct(row.metrics.productivity_ratio * 100) : '—')}
        ${renderMetricChip('Calidad', pct(row.metrics.quality_pct))}
        ${renderMetricChip('HOLD tareas', pct(row.metrics.hold_pct_tasks))}
        ${renderMetricChip('HOLD IDs', pct(row.metrics.hold_pct_ids))}
        ${renderMetricChip('Incidencias', num(row.metrics.incidences, 0))}
        ${renderMetricChip('Consistencia', pct(row.metrics.weekly_consistency_pct))}
      </div>
      <div class="detail-columns">
        <div>
          <div class="detail-section-title">Cumplimiento base y cálculo</div>
          <div class="calc-formula">
            ${row.baseBreakdown.map(item => `<div class="calc-formula-row"><span>${item.label} · peso ${pct(item.weight * 100)}</span><strong>${item.normalized === null ? 'sin dato' : `${num(item.normalized)} pts`}</strong></div>`).join('') || '<div class="calc-formula-row"><span>Sin cálculo automático completo para este rol</span><strong>—</strong></div>'}
            <div class="calc-formula-row"><span>Aceleradores y penalizadores</span><strong>${formatSigned(row.ruleScoreDelta)}</strong></div>
            <div class="calc-formula-row"><span>Multiplicador final</span><strong>×${num(row.ruleMultiplier, 3)}</strong></div>
          </div>
          <div class="sep" style="margin:14px 0"></div>
          <div class="detail-section-title">Aceleradores y detractores</div>
          <table class="mini-table">
            <tbody>
              ${row.appliedRules.length ? row.appliedRules.map(item => `<tr><td>${item.rule.name}</td><td class="mono-cell">${item.explanation}</td></tr>`).join('') : '<tr><td colspan="2">Sin reglas adicionales activadas.</td></tr>'}
            </tbody>
          </table>
          <div class="sep" style="margin:14px 0"></div>
          <div class="detail-section-title">Simulación económica</div>
          <div class="detail-box">
            <p><strong>Asignación estimada total:</strong> ${formatCurrency(row.economic?.totalEstimated || 0, state.evaluation.economic?.currency || 'ARS')}</p>
            <p><strong>Pool base:</strong> ${formatCurrency(row.economic?.baseAmount || 0, state.evaluation.economic?.currency || 'ARS')} · <strong>Performance:</strong> ${formatCurrency(row.economic?.performanceAmount || 0, state.evaluation.economic?.currency || 'ARS')} · <strong>Excellence:</strong> ${formatCurrency(row.economic?.excellenceAmount || 0, state.evaluation.economic?.currency || 'ARS')}</p>
            <p><strong>Motivo de inclusión/exclusión:</strong> ${row.economic?.reason || 'Sin simulación económica.'}</p>
            <p><strong>Aclaración:</strong> no representa liquidación final y queda sujeto a validación de dirección.</p>
          </div>
          <div class="sep" style="margin:14px 0"></div>
          <div class="detail-section-title">Explicación operativa</div>
          <div class="detail-box">
            <p><strong>Perfil:</strong> ${row.role || '—'} · ${row.team || '—'} · ${row.location || 'Sin ubicación'} · ${row.tenureSegment || 'Sin antigüedad'}</p>
            <p><strong>Estado:</strong> ${row.statusLabel}. <strong>Motivos:</strong> ${[...row.exclusionReasons, ...row.minimumFailures, ...row.manualReviewReasons].join(' · ') || 'Sin bloqueos críticos ni fallas de mínimos.'}</p>
            <p><strong>Riesgos de interpretación:</strong> ${row.antiGamingAlerts.filter(item => item.triggered).map(item => item.name).join(' · ') || 'Sin alertas fuertes de especulación.'}</p>
            <p><strong>Versión de configuración:</strong> v${row.auditTrail.configVersion}. <strong>Período:</strong> ${row.auditTrail.periodKey}. <strong>Calculado:</strong> ${new Date(row.auditTrail.calculatedAt).toLocaleString('es-AR')}</p>
          </div>
        </div>
        <div>
          <div class="detail-section-title">Recomendaciones</div>
          <div class="recommendation-list">${row.recommendations.map(item => `<div class="detail-box"><p>${item}</p></div>`).join('')}</div>
          <div class="sep" style="margin:14px 0"></div>
          <div class="detail-section-title">Alertas y datos faltantes</div>
          <div class="detail-box">
            <p><strong>Alertas anti-gaming:</strong> ${row.antiGamingAlerts.map(item => item.triggered ? item.name : `${item.name} (no activada)`).slice(0, 5).join(' · ') || 'Sin alertas.'}</p>
            <p><strong>Riesgo de inequidad:</strong> ${row.fairnessAlerts.map(item => item.flow).join(' · ') || 'No detectado.'}</p>
            <p><strong>Robustez del score:</strong> ${row.robustness?.label || '—'}${row.robustness?.warnings?.length ? ` · ${row.robustness.warnings.join(' · ')}` : ''}</p>
            <p><strong>Datos faltantes:</strong> ${row.dataStatus === 'complete' ? 'No hay faltantes críticos para esta lectura preliminar.' : 'Hay faltantes o límites de evaluabilidad; no usar para liquidación final.'}</p>
            <p><strong>Alertas de simulación:</strong> ${(row.economic?.alerts || []).join(' · ') || 'Sin alertas adicionales.'}</p>
          </div>
          <div class="sep" style="margin:14px 0"></div>
          <div class="detail-section-title">Trazabilidad</div>
          <div class="detail-box">
            <p><strong>Datos tomados:</strong> productividad ${row.metrics.actual_productivity_pts !== null ? `${num(row.metrics.actual_productivity_pts)} pts/día` : 'sin dato'}, target ${row.metrics.target_productivity_pts !== null ? `${num(row.metrics.target_productivity_pts)} pts/día` : 'sin target'}, calidad auditada ${pct(row.metrics.quality_pct)}, HOLD tareas ${pct(row.metrics.hold_pct_tasks)}, incidencias ${num(row.metrics.incidences, 0)}.</p>
            <p><strong>Calidad por fuente:</strong> SdC ${pct(row.metrics.quality_pct_sdc)} · MAO ${pct(row.metrics.quality_pct_mao)} · combinado ${pct(row.metrics.quality_pct)}.</p>
            <p><strong>Desvío principal:</strong> ${row.metrics.quality_primary_deviation || 'Sin desvío dominante'} · <strong>Dominios con error:</strong> ${row.metrics.quality_error_domains || 'Sin concentración clara'}.</p>
            <p><strong>Qué no aplicó:</strong> ${row.auditTrail.skippedRules.slice(0, 5).map(item => `${item.name} (${item.reason})`).join(' · ') || 'Sin reglas omitidas relevantes.'}</p>
          </div>
        </div>
      </div>`;
  }

  function renderMetricChip(label, value) {
    return `<div class="metric-chip"><div class="label">${label}</div><div class="value">${value}</div></div>`;
  }

  function renderConfigSummary() {
    const container = document.getElementById('config-summary-cards');
    if (!container) return;
    const weightTotal = Object.values(state.config.metricModels).reduce((sum, model) => sum + Number(model.weight || 0), 0);
    container.innerHTML = `
      <div class="stat-card acc"><div class="stat-label">Versión</div><div class="stat-value">${state.config.version}</div><div class="stat-sub">rev ${state.config.revision || 1} · ${state.config.updatedBy || '—'}</div></div>
      <div class="stat-card grn"><div class="stat-label">Reglas activas</div><div class="stat-value">${state.config.rules.filter(rule => rule.active).length}</div><div class="stat-sub">de ${state.config.rules.length}</div></div>
      <div class="stat-card amb"><div class="stat-label">Pesos totales</div><div class="stat-value">${pct(weightTotal * 100)}</div><div class="stat-sub">${weightTotal >= state.config.scoring.minWeightTotal && weightTotal <= state.config.scoring.maxWeightTotal ? 'balanceado' : 'revisar suma'}</div></div>
      <div class="stat-card"><div class="stat-label">Modo</div><div class="stat-value">${state.config.incentiveMode === 'monetary' ? 'Monetario' : state.config.incentiveMode}</div><div class="stat-sub">sin liquidación automática</div></div>
      <div class="stat-card"><div class="stat-label">Presupuesto</div><div class="stat-value">${formatCurrency(state.config.economicAllocation?.budget || 0, state.config.economicAllocation?.currency || 'ARS')}</div><div class="stat-sub">solo simulación</div></div>`;
  }

  function renderMetricModels() {
    const container = document.getElementById('config-metric-models');
    if (!container) return;
    const rows = Object.entries(state.config.metricModels).map(([metric, model]) => `
      <div class="config-row">
        <div class="config-field"><label>${model.label}</label><input data-metric="${metric}" data-field="label" type="text" value="${model.label}"></div>
        <div class="config-field"><label>Peso</label><input data-metric="${metric}" data-field="weight" type="number" step="0.01" value="${model.weight}"></div>
        <div class="config-field"><label>${model.direction === 'higher' ? 'Piso' : 'Target sano'}</label><input data-metric="${metric}" data-field="${model.direction === 'higher' ? 'floor' : 'target'}" type="number" step="0.1" value="${model.direction === 'higher' ? model.floor : model.target}"></div>
        <div class="config-field"><label>${model.direction === 'higher' ? 'Objetivo' : 'Techo de riesgo'}</label><input data-metric="${metric}" data-field="${model.direction === 'higher' ? 'target' : 'ceiling'}" type="number" step="0.1" value="${model.direction === 'higher' ? model.target : model.ceiling}"></div>
      </div>
      <div class="config-inline-actions" style="margin-bottom:8px">
        <label class="pill"><input data-metric="${metric}" data-field="required" type="checkbox" ${model.required ? 'checked' : ''}> Métrica requerida</label>
        <label class="pill"><input data-metric="${metric}" data-field="direction" type="text" value="${model.direction}" readonly> ${model.direction === 'higher' ? 'Mayor es mejor' : 'Menor es mejor'}</label>
      </div>`);
    container.innerHTML = `<div class="config-stack">${rows.join('')}</div>`;
  }

  function renderGeneralSettings() {
    const container = document.getElementById('config-general-settings');
    if (!container) return;
    container.innerHTML = `
      <div class="config-stack">
        <div class="config-row">
          <div class="config-field"><label>Vista por defecto</label><select data-section="period" data-field="defaultType"><option value="month" ${state.config.period.defaultType === 'month' ? 'selected' : ''}>Mensual</option><option value="week" ${state.config.period.defaultType === 'week' ? 'selected' : ''}>Semanal</option></select></div>
          <div class="config-field"><label>Modo incentivo</label><input type="text" value="${state.config.incentiveMode}" readonly></div>
          <div class="config-field"><label>Días mínimos</label><input data-section="period" data-field="minParticipationDays" type="number" value="${state.config.period.minParticipationDays}"></div>
          <div class="config-field"><label>Tareas mínimas</label><input data-section="period" data-field="minTasks" type="number" value="${state.config.period.minTasks}"></div>
        </div>
        <div class="config-row">
          <div class="config-field"><label>Métricas mínimas automáticas</label><input data-section="period" data-field="minAutoMetrics" type="number" value="${state.config.period.minAutoMetrics}"></div>
          <div class="config-field"><label>Score mínimo</label><input data-section="scoring" data-field="minScore" type="number" step="0.1" value="${state.config.scoring.minScore}"></div>
          <div class="config-field"><label>Score máximo</label><input data-section="scoring" data-field="maxScore" type="number" step="0.1" value="${state.config.scoring.maxScore}"></div>
          <div class="config-field"><label>Prod. semanal mínima</label><input data-section="consistency" data-field="weeklyProductivityMin" type="number" step="0.01" value="${state.config.consistency.weeklyProductivityMin}"></div>
        </div>
        <div class="config-row">
          <div class="config-field"><label>Calidad semanal mínima</label><input data-section="consistency" data-field="weeklyQualityMin" type="number" step="0.1" value="${state.config.consistency.weeklyQualityMin}"></div>
          <div class="config-field"><label>Datos críticos</label><input type="text" value="${(state.config.baseEligibility.requiresCriticalData || []).join(', ')}" readonly></div>
          <div class="config-field"><label>Datos recomendados</label><input type="text" value="${(state.config.baseEligibility.recommendedCriticalData || []).join(', ')}" readonly></div>
          <div class="config-field"><label>Base compliant cobra</label><input type="text" value="${state.config.baseEligibility.rewardBaseCompliantProfiles ? 'sí' : 'no'}" readonly></div>
        </div>
        <div class="config-inline-actions">
          <label class="pill"><input data-section="period" data-field="manualReviewOnPartial" type="checkbox" ${state.config.period.manualReviewOnPartial ? 'checked' : ''}> Revisión manual si faltan datos</label>
        </div>
      </div>`;
  }

  function renderRoleSettings() {
    const container = document.getElementById('config-role-settings');
    if (!container) return;
    container.innerHTML = `<div class="config-stack">${Object.entries(state.config.roles).map(([role, cfg]) => `
      <div class="detail-box">
        <div class="config-row">
          <div class="config-field"><label>Rol</label><input type="text" value="${role}" readonly></div>
          <div class="config-field"><label>Activo</label><input data-role="${role}" data-field="active" type="checkbox" ${cfg.active ? 'checked' : ''}></div>
          <div class="config-field"><label>Requiere data extra</label><input data-role="${role}" data-field="requiresAdditionalData" type="checkbox" ${cfg.requiresAdditionalData ? 'checked' : ''}></div>
          <div class="config-field"><label>Evaluabilidad</label><input type="text" value="${cfg.requiresAdditionalData ? 'No evaluable con datos actuales' : 'Evaluable'}" readonly></div>
        </div>
        <div class="config-pill-row">${Object.entries(cfg.baseWeights || {}).map(([key, value]) => `<label class="pill">${key}: <input data-role="${role}" data-weight-key="${key}" type="number" step="1" value="${value}" style="width:56px;background:none;border:none;color:inherit"></label>`).join('')}</div>
      </div>`).join('')}</div>`;
  }

  function renderProgramSettings() {
    const container = document.getElementById('config-program-settings');
    if (!container) return;
    container.innerHTML = `
      <div class="config-stack">
        <div class="detail-box">
          <div class="config-card-title">Iniciativas positivas</div>
          <div class="config-row">
            <div class="config-field"><label>Habilitadas</label><input data-program-section="initiatives" data-field="enabled" type="checkbox" ${state.config.initiatives.enabled ? 'checked' : ''}></div>
            <div class="config-field"><label>Tope mensual</label><input data-program-section="initiatives" data-field="maxMonthlyImpact" type="number" step="0.1" value="${state.config.initiatives.maxMonthlyImpact}"></div>
            <div class="config-field"><label>Requiere evidencia</label><input data-program-section="initiatives" data-field="requiresEvidence" type="checkbox" ${state.config.initiatives.requiresEvidence ? 'checked' : ''}></div>
            <div class="config-field"><label>Requiere validador</label><input data-program-section="initiatives" data-field="requiresValidator" type="checkbox" ${state.config.initiatives.requiresValidator ? 'checked' : ''}></div>
          </div>
        </div>
        <div class="detail-box">
          <div class="config-card-title">Evaluación mensual</div>
          <div class="config-row">
            <div class="config-field"><label>Habilitada</label><input data-program-section="monthlyEvaluation" data-field="enabled" type="checkbox" ${state.config.monthlyEvaluation.enabled ? 'checked' : ''}></div>
            <div class="config-field"><label>Tope impacto</label><input data-program-section="monthlyEvaluation" data-field="maxImpact" type="number" step="0.1" value="${state.config.monthlyEvaluation.maxImpact}"></div>
            <div class="config-field"><label>Penalty sin respuesta</label><input data-program-section="monthlyEvaluation" data-field="missingResponsePenalty" type="number" step="0.1" value="${state.config.monthlyEvaluation.missingResponsePenalty}"></div>
            <div class="config-field"><label>Acelerador score alto</label><input data-program-section="monthlyEvaluation" data-field="highScoreAccelerator" type="number" step="0.1" value="${state.config.monthlyEvaluation.highScoreAccelerator}"></div>
          </div>
        </div>
        <div class="detail-box">
          <div class="config-card-title">Reglas anti-gaming</div>
          <div class="config-stack">${state.config.antiGamingRules.map(rule => `
            <div class="config-row">
              <div class="config-field"><label>Nombre</label><input type="text" value="${rule.name}" readonly></div>
              <div class="config-field"><label>Activo</label><input data-program-section="antiGaming" data-item-id="${rule.id}" data-field="active" type="checkbox" ${rule.active ? 'checked' : ''}></div>
              <div class="config-field"><label>Tipo</label><input data-program-section="antiGaming" data-item-id="${rule.id}" data-field="type" type="text" value="${rule.type}"></div>
              <div class="config-field"><label>Modo</label><input data-program-section="antiGaming" data-item-id="${rule.id}" data-field="mode" type="text" value="${rule.mode}"></div>
            </div>`).join('')}</div>
        </div>
        <div class="detail-box">
          <div class="config-card-title">Simulación económica</div>
          <div class="config-row">
            <div class="config-field"><label>Presupuesto</label><input data-program-section="economicAllocation" data-field="budget" type="number" step="100" value="${state.config.economicAllocation.budget || 0}"></div>
            <div class="config-field"><label>Moneda</label><input data-program-section="economicAllocation" data-field="currency" type="text" value="${state.config.economicAllocation.currency || 'ARS'}"></div>
            <div class="config-field"><label>Tope individual %</label><input data-program-section="economicAllocation" data-field="maxIndividualBudgetShare" type="number" step="0.01" value="${state.config.economicAllocation.maxIndividualBudgetShare}"></div>
            <div class="config-field"><label>Redondeo</label><input data-program-section="economicAllocation" data-field="roundingStep" type="number" step="100" value="${state.config.economicAllocation.roundingStep || 100}"></div>
          </div>
          <div class="config-row">
            <div class="config-field"><label>Pool base</label><input data-program-section="economicAllocation" data-pool-key="base" data-field="pools" type="number" step="0.01" value="${state.config.economicAllocation.pools.base}"></div>
            <div class="config-field"><label>Pool performance</label><input data-program-section="economicAllocation" data-pool-key="performance" data-field="pools" type="number" step="0.01" value="${state.config.economicAllocation.pools.performance}"></div>
            <div class="config-field"><label>Pool excellence</label><input data-program-section="economicAllocation" data-pool-key="excellence" data-field="pools" type="number" step="0.01" value="${state.config.economicAllocation.pools.excellence}"></div>
            <div class="config-field"><label>Piso base</label><input data-program-section="economicAllocation" data-field="baseMinimumAmount" type="number" step="100" value="${state.config.economicAllocation.baseMinimumAmount || 0}"></div>
          </div>
          <div class="config-inline-actions">
            <label class="pill"><input data-program-section="economicAllocation" data-field="includeBaseBand" type="checkbox" ${state.config.economicAllocation.includeBaseBand !== false ? 'checked' : ''}> Incluir base</label>
            <label class="pill"><input data-program-section="economicAllocation" data-field="includeManualReview" type="checkbox" ${state.config.economicAllocation.includeManualReview ? 'checked' : ''}> Incluir revisión manual</label>
          </div>
        </div>
      </div>`;
  }

  function renderFlowProfiles() {
    const thead = document.getElementById('config-flow-thead');
    const tbody = document.getElementById('config-flow-tbody');
    if (!thead || !tbody) return;
    thead.innerHTML = `<tr>
      <th>Flujo</th>
      <th>Peso</th>
      <th>Objetivo pts/día</th>
      <th>Acceso</th>
      <th>Riesgo inequidad</th>
      <th>Calidad mínima</th>
      <th>Calibración manual</th>
      <th></th>
    </tr>`;
    tbody.innerHTML = Object.entries(getFlowProfiles(state.config)).map(([flow, profile]) => `
      <tr>
        <td class="name-cell">${flow}</td>
        <td><input data-flow="${flow}" data-field="weight" type="number" step="0.1" value="${profile.weight}" class="sel"></td>
        <td><input data-flow="${flow}" data-field="targetPointsPerDay" type="number" step="0.1" value="${profile.targetPointsPerDay}" class="sel"></td>
        <td><input data-flow="${flow}" data-field="accessType" type="text" value="${profile.accessType || 'mixed'}" class="sel"></td>
        <td><input data-flow="${flow}" data-field="fairnessRisk" type="text" value="${profile.fairnessRisk || 'low'}" class="sel"></td>
        <td><input data-flow="${flow}" data-field="minQualityPct" type="number" step="0.1" value="${profile.minQualityPct}" class="sel"></td>
        <td><input data-flow="${flow}" data-field="requiresManualCalibration" type="checkbox" ${profile.requiresManualCalibration ? 'checked' : ''}></td>
        <td><button class="filter-btn" data-action="delete-flow" data-flow="${flow}">Eliminar</button></td>
      </tr>`).join('');
  }

  function renderRulesTable() {
    const thead = document.getElementById('config-rules-thead');
    const tbody = document.getElementById('config-rules-tbody');
    if (!thead || !tbody) return;
    thead.innerHTML = `<tr>
      <th>Activo</th>
      <th>Tipo</th>
      <th>Nombre</th>
      <th>Métrica</th>
      <th>Operador</th>
      <th>Impacto</th>
      <th>Scope</th>
      <th>Prioridad</th>
      <th></th>
    </tr>`;
    tbody.innerHTML = state.config.rules.map(rule => `
      <tr>
        <td>${rule.active ? 'Sí' : 'No'}</td>
        <td><span class="tag type-${rule.type}">${rule.type}</span></td>
        <td class="name-cell">${rule.name}<div class="mono-soft">${rule.description || '—'}</div></td>
        <td>${METRIC_LABELS[rule.metric] || rule.metric}</td>
        <td>${rule.operator}${rule.threshold !== null ? ` ${rule.threshold}` : ''}${rule.thresholdMax !== null && rule.thresholdMax !== '' ? ` / ${rule.thresholdMax}` : ''}</td>
        <td>${rule.impactMode === 'points' ? formatSigned(rule.type === 'penalty' ? -Math.abs(rule.impactValue) : Math.abs(rule.impactValue)) : rule.impactMode}</td>
        <td>${rule.flowScope === 'all' ? 'Todos los flujos' : rule.flowScope}</td>
        <td>${rule.priority}</td>
        <td>
          <div class="config-inline-actions">
            <button class="filter-btn" data-action="edit-rule" data-id="${rule.id}">Editar</button>
            <button class="filter-btn" data-action="toggle-rule" data-id="${rule.id}">${rule.active ? 'Pausar' : 'Activar'}</button>
            <button class="filter-btn" data-action="duplicate-rule" data-id="${rule.id}">Duplicar</button>
            <button class="filter-btn" data-action="delete-rule" data-id="${rule.id}">Eliminar</button>
          </div>
        </td>
      </tr>`).join('');
  }

  function renderRuleEditor() {
    const container = document.getElementById('config-rule-editor');
    if (!container) return;
    const draft = state.ruleDraft || defaultRuleDraft();
    state.ruleDraft = draft;
    container.innerHTML = `
      <div class="config-stack">
        <div class="config-row">
          <div class="config-field"><label>Nombre</label><input data-field="name" type="text" value="${draft.name || ''}"></div>
          <div class="config-field"><label>Tipo</label><select data-field="type">${RULE_TYPE_OPTIONS.map(option => `<option value="${option.value}" ${draft.type === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></div>
          <div class="config-field"><label>Métrica</label><select data-field="metric">${METRIC_OPTIONS.map(option => `<option value="${option.value}" ${draft.metric === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></div>
          <div class="config-field"><label>Severidad</label><select data-field="severity"><option value="low" ${draft.severity === 'low' ? 'selected' : ''}>Baja</option><option value="medium" ${draft.severity === 'medium' ? 'selected' : ''}>Media</option><option value="high" ${draft.severity === 'high' ? 'selected' : ''}>Alta</option><option value="critical" ${draft.severity === 'critical' ? 'selected' : ''}>Crítica</option></select></div>
        </div>
        <div class="config-field"><label>Descripción</label><textarea data-field="description">${draft.description || ''}</textarea></div>
        <div class="config-row">
          <div class="config-field"><label>Operador</label><select data-field="operator">${OPERATOR_OPTIONS.map(option => `<option value="${option.value}" ${draft.operator === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></div>
          <div class="config-field"><label>Umbral</label><input data-field="threshold" type="number" step="0.1" value="${draft.threshold ?? 0}"></div>
          <div class="config-field"><label>Umbral max</label><input data-field="thresholdMax" type="number" step="0.1" value="${draft.thresholdMax ?? ''}"></div>
          <div class="config-field"><label>Prioridad</label><input data-field="priority" type="number" step="1" value="${draft.priority ?? 50}"></div>
        </div>
        <div class="config-row">
          <div class="config-field"><label>Impacto</label><select data-field="impactMode">${IMPACT_MODE_OPTIONS.map(option => `<option value="${option.value}" ${draft.impactMode === option.value ? 'selected' : ''}>${option.label}</option>`).join('')}</select></div>
          <div class="config-field"><label>Valor impacto</label><input data-field="impactValue" type="number" step="0.1" value="${draft.impactValue ?? 0}"></div>
          <div class="config-field"><label>Tope</label><input data-field="maxImpact" type="number" step="0.1" value="${draft.maxImpact ?? ''}"></div>
          <div class="config-field"><label>Scope flujo</label><input data-field="flowScope" type="text" value="${draft.flowScope ?? 'all'}" placeholder="all o Demanda,Enhancement"></div>
        </div>
        <div class="config-row">
          <div class="config-field"><label>Scope rol</label><input data-field="roleScope" type="text" value="${draft.roleScope ?? 'all'}" placeholder="all o QA,Analyst"></div>
          <div class="config-field"><label>Datos faltantes</label><select data-field="dataMode"><option value="allow_partial" ${draft.dataMode === 'allow_partial' ? 'selected' : ''}>Permitir parcial</option><option value="require" ${draft.dataMode === 'require' ? 'selected' : ''}>Requerir dato</option></select></div>
          <div class="config-field"><label>Período</label><input data-field="periodScope" type="text" value="${draft.periodScope ?? 'selected'}" readonly></div>
          <div class="config-field"><label>Activo</label><input data-field="active" type="checkbox" ${draft.active ? 'checked' : ''}></div>
        </div>
        <div class="config-inline-actions">
          <label class="pill"><input data-field="stackable" type="checkbox" ${draft.stackable ? 'checked' : ''}> Acumula</label>
        </div>
        <div class="config-inline-actions">
          <button class="filter-btn" data-action="save-rule">Guardar criterio</button>
          <button class="filter-btn" data-action="cancel-rule">Cancelar</button>
        </div>
      </div>`;
  }

  function renderBandsEditor() {
    const container = document.getElementById('config-bands-editor');
    if (!container) return;
    container.innerHTML = `
      <div class="config-stack">
        ${state.config.bands.map(band => `
          <div class="config-row">
            <div class="config-field"><label>Nombre</label><input data-id="${band.id}" data-field="label" type="text" value="${band.label}"></div>
            <div class="config-field"><label>Min</label><input data-id="${band.id}" data-field="min" type="number" step="0.1" value="${band.min}"></div>
            <div class="config-field"><label>Max</label><input data-id="${band.id}" data-field="max" type="number" step="0.1" value="${band.max}"></div>
            <div class="config-field"><label>Payout %</label><input data-id="${band.id}" data-field="payoutPct" type="number" step="0.1" value="${band.payoutPct}"></div>
          </div>
          <div class="config-inline-actions">
            <div class="config-field" style="max-width:160px"><label>Color</label><input data-id="${band.id}" data-field="color" type="text" value="${band.color}"></div>
            <button class="filter-btn" data-action="delete-band" data-id="${band.id}">Eliminar banda</button>
          </div>`).join('')}
        <div class="config-inline-actions"><button class="filter-btn" data-action="add-band">Agregar banda</button></div>
      </div>`;
  }

  function renderAuditLog() {
    const container = document.getElementById('config-audit-log');
    if (!container) return;
    if (!state.audit.length) {
      container.innerHTML = '<div class="config-empty">Todavía no hay cambios auditados en esta sesión.</div>';
      return;
    }
    container.innerHTML = `<div class="audit-entry-list">${state.audit.slice(0, 12).map(entry => `
      <div class="audit-entry">
        <p><strong>${entry.version} · rev ${entry.revision || '—'}</strong> · ${entry.reason} · ${entry.by || 'local-ui'}</p>
        <p>${new Date(entry.at).toLocaleString('es-AR')} ${entry.note ? `· ${entry.note}` : ''}</p>
      </div>`).join('')}</div>`;
  }

  loadState();
  bootstrapDom();
  state.ruleDraft = defaultRuleDraft();
  renderAll();
})();
