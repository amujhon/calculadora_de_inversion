(() => {
  const SCENARIOS = [
    { key: "worst", label: "Peor caso" },
    { key: "expected", label: "Caso esperado" },
    { key: "best", label: "Mejor caso" }
  ];

  const DISTRIBUTION_MODES = {
    equal: "Igualitario",
    proportional: "Equitativo por monto invertido",
    manual: "Manual por porcentajes"
  };

  const PERIOD_UNITS = {
    days: { label: "Días", monthsFactor: 1 / 30 },
    months: { label: "Meses", monthsFactor: 1 },
    years: { label: "Años", monthsFactor: 12 }
  };

  const STORAGE_KEY = "investment-simulator-v2";
  const LEGACY_STORAGE_KEY = "investment-simulator-v1";

  const uiState = {
    saveStatus: ""
  };

  let state = createSeedState();

  const helpPopover = document.getElementById("helpPopover");
  let activeHelpTrigger = null;

  function uid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function toNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function positiveNumber(value) {
    return Math.max(0, toNumber(value));
  }

  function clampPercent(value) {
    return Math.max(0, Math.min(100, toNumber(value)));
  }

  function money(value) {
    const symbol = state.settings.currencySymbol || "$";
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    return `${symbol}${amount.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  function percentage(value) {
    const amount = Number.isFinite(Number(value)) ? Number(value) : 0;
    return `${amount.toLocaleString("es-EC", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
  }

  function formatMonths(value) {
    if (!Number.isFinite(value)) return "No recupera con flujo neto actual";
    if (value <= 0) return "Inmediato";
    const rounded = Math.ceil(value * 10) / 10;
    const years = rounded / 12;
    if (rounded >= 18) return `${rounded.toFixed(1)} meses (${years.toFixed(1)} años)`;
    return `${rounded.toFixed(1)} meses`;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function durationToMonths(value, unit) {
    const amount = Math.max(0, toNumber(value));
    const config = PERIOD_UNITS[unit] || PERIOD_UNITS.months;
    return amount * config.monthsFactor;
  }

  function formatPeriod(value, unit) {
    const amount = Math.max(0, toNumber(value));
    const config = PERIOD_UNITS[unit] || PERIOD_UNITS.months;
    return `${amount.toLocaleString("es-EC", { maximumFractionDigits: 2 })} ${config.label.toLowerCase()}`;
  }

  function helpIcon(text) {
    const safeText = escapeHtml(text);
    return `<span class="help-icon" role="button" tabindex="0" data-help="${safeText}" aria-label="${safeText}" aria-expanded="false" title="${safeText}">?</span>`;
  }

  function labelWithHelp(text, help, forId = "") {
    const forAttribute = forId ? ` for="${escapeHtml(forId)}"` : "";
    if (!help) return `<label${forAttribute}>${escapeHtml(text)}</label>`;
    return `<label${forAttribute} class="hinted-label"><span>${escapeHtml(text)}</span>${helpIcon(help)}</label>`;
  }

  function createSeedState() {
    return {
      selectedScenario: "expected",
      settings: {
        analysisMonths: 24,
        currencySymbol: "$",
        globalCostAllocation: "equal",
        roiMode: "netAfterInvestment"
      },
      globalCosts: [
        { id: uid(), name: "ChatGPT / Codex / herramientas IA", amount: 40 },
        { id: uid(), name: "Servidor / hosting compartido", amount: 25 }
      ],
      projects: [
        createProject("NapoFarma", 1200, {
          worst: 80,
          expected: 250,
          best: 600
        })
      ],
      investors: [],
      distributions: [],
      notes: ""
    };
  }

  function createBlankState() {
    return {
      selectedScenario: "expected",
      settings: {
        analysisMonths: 24,
        currencySymbol: "$",
        globalCostAllocation: "equal",
        roiMode: "netAfterInvestment"
      },
      globalCosts: [],
      projects: [],
      investors: [],
      distributions: [],
      notes: ""
    };
  }

  function createProject(name = "Nuevo proyecto", investment = 0, manualRevenue = {}) {
    return {
      id: uid(),
      name,
      investment,
      costs: [
        { id: uid(), name: "Costo individual del proyecto", amount: 0 }
      ],
      incomeMode: "manual",
      manualScenarios: {
        worst: { monthlyRevenue: positiveNumber(manualRevenue.worst) },
        expected: { monthlyRevenue: positiveNumber(manualRevenue.expected) },
        best: { monthlyRevenue: positiveNumber(manualRevenue.best) }
      },
      subscription: {
        baseMonthlyPrice: 0,
        scenarioClients: {
          worst: 0,
          expected: 0,
          best: 0
        },
        rules: []
      }
    };
  }

  function createSubscriptionRule(label = "Nueva regla") {
    return {
      id: uid(),
      label,
      enabled: true,
      discountPercent: 15,
      quantity: 1,
      durationValue: 1,
      durationUnit: "years",
      affectedClients: {
        worst: 0,
        expected: 0,
        best: 0
      }
    };
  }

  function createInvestor(name = "Nuevo inversor") {
    return {
      id: uid(),
      name,
      amountInvested: 0,
      notes: ""
    };
  }

  function createDistribution(label = "Nueva repartición", investorIds = []) {
    return {
      id: uid(),
      label,
      periodValue: 1,
      periodUnit: "months",
      investorSharePercent: 0,
      mode: "equal",
      investorIds: [...investorIds],
      manualShares: {}
    };
  }

  function normalizeState(raw) {
    const base = createBlankState();
    const projects = Array.isArray(raw.projects)
      ? raw.projects.map(project => {
          const legacyScenarios = project.scenarios || project.manualScenarios || {};
          const subscription = project.subscription || {};
          return {
            id: project.id || uid(),
            name: project.name || "Proyecto",
            investment: positiveNumber(project.investment),
            costs: Array.isArray(project.costs)
              ? project.costs.map(cost => ({
                  id: cost.id || uid(),
                  name: cost.name || "Costo",
                  amount: positiveNumber(cost.amount)
                }))
              : [],
            incomeMode: project.incomeMode === "subscription" ? "subscription" : "manual",
            manualScenarios: {
              worst: { monthlyRevenue: positiveNumber(legacyScenarios.worst?.monthlyRevenue) },
              expected: { monthlyRevenue: positiveNumber(legacyScenarios.expected?.monthlyRevenue) },
              best: { monthlyRevenue: positiveNumber(legacyScenarios.best?.monthlyRevenue) }
            },
            subscription: {
              baseMonthlyPrice: positiveNumber(subscription.baseMonthlyPrice),
              scenarioClients: {
                worst: positiveNumber(subscription.scenarioClients?.worst),
                expected: positiveNumber(subscription.scenarioClients?.expected),
                best: positiveNumber(subscription.scenarioClients?.best)
              },
              rules: Array.isArray(subscription.rules)
                ? subscription.rules.map(rule => ({
                    id: rule.id || uid(),
                    label: rule.label || "Regla",
                    enabled: rule.enabled !== false,
                    discountPercent: clampPercent(rule.discountPercent),
                    quantity: positiveNumber(rule.quantity) || 1,
                    durationValue: positiveNumber(rule.durationValue) || 1,
                    durationUnit: PERIOD_UNITS[rule.durationUnit] ? rule.durationUnit : "years",
                    affectedClients: {
                      worst: positiveNumber(rule.affectedClients?.worst),
                      expected: positiveNumber(rule.affectedClients?.expected),
                      best: positiveNumber(rule.affectedClients?.best)
                    }
                  }))
                : []
            }
          };
        })
      : base.projects;

    const investors = Array.isArray(raw.investors)
      ? raw.investors.map(investor => ({
          id: investor.id || uid(),
          name: investor.name || "Inversor",
          amountInvested: positiveNumber(investor.amountInvested),
          notes: investor.notes || ""
        }))
      : [];

    const distributions = Array.isArray(raw.distributions)
      ? raw.distributions.map(distribution => ({
          id: distribution.id || uid(),
          label: distribution.label || "Repartición",
          periodValue: positiveNumber(distribution.periodValue) || 1,
          periodUnit: PERIOD_UNITS[distribution.periodUnit] ? distribution.periodUnit : "months",
          investorSharePercent: clampPercent(distribution.investorSharePercent),
          mode: DISTRIBUTION_MODES[distribution.mode] ? distribution.mode : "equal",
          investorIds: Array.isArray(distribution.investorIds) ? [...distribution.investorIds] : [],
          manualShares: typeof distribution.manualShares === "object" && distribution.manualShares
            ? Object.fromEntries(
                Object.entries(distribution.manualShares).map(([investorId, share]) => [investorId, clampPercent(share)])
              )
            : {}
        }))
      : [];

    return {
      selectedScenario: SCENARIOS.some(item => item.key === raw.selectedScenario) ? raw.selectedScenario : base.selectedScenario,
      settings: {
        analysisMonths: positiveNumber(raw.settings?.analysisMonths) || base.settings.analysisMonths,
        currencySymbol: raw.settings?.currencySymbol || base.settings.currencySymbol,
        globalCostAllocation: raw.settings?.globalCostAllocation === "none" ? "none" : "equal",
        roiMode: raw.settings?.roiMode === "cashGenerated" ? "cashGenerated" : "netAfterInvestment"
      },
      globalCosts: Array.isArray(raw.globalCosts)
        ? raw.globalCosts.map(cost => ({
            id: cost.id || uid(),
            name: cost.name || "Costo general",
            amount: positiveNumber(cost.amount)
          }))
        : base.globalCosts,
      projects,
      investors,
      distributions,
      notes: raw.notes || ""
    };
  }

  function cleanDistributions() {
    const validInvestorIds = new Set(state.investors.map(investor => investor.id));
    state.distributions = state.distributions.map(distribution => {
      const cleanedIds = distribution.investorIds.filter(investorId => validInvestorIds.has(investorId));
      const manualShares = {};
      cleanedIds.forEach(investorId => {
        if (distribution.manualShares && distribution.manualShares[investorId] !== undefined) {
          manualShares[investorId] = clampPercent(distribution.manualShares[investorId]);
        }
      });
      return {
        ...distribution,
        investorIds: cleanedIds,
        manualShares
      };
    });
  }

  function ensureRequiredDistribution() {
    if (!state.investors.length || state.distributions.length) return;
    state.distributions.push(createDistribution("Repartición 1", state.investors.map(investor => investor.id)));
  }

  function loadFromLocalStorage() {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return false;

    try {
      state = normalizeState(JSON.parse(saved));
      cleanDistributions();
      ensureRequiredDistribution();
      return true;
    } catch (error) {
      console.error(error);
      return false;
    }
  }

  function saveToLocalStorage() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    uiState.saveStatus = `Guardado localmente: ${new Date().toLocaleString("es-EC")}`;
    renderSaveStatus();
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "simulador-inversion.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function globalCostsTotal() {
    return state.globalCosts.reduce((sum, item) => sum + positiveNumber(item.amount), 0);
  }

  function activeProjectCount() {
    return Math.max(1, state.projects.length);
  }

  function allocatedGlobalCost() {
    if (state.settings.globalCostAllocation === "none") return 0;
    return globalCostsTotal() / activeProjectCount();
  }

  function totalInvestment() {
    return state.projects.reduce((sum, project) => sum + positiveNumber(project.investment), 0);
  }

  function projectCosts(project) {
    return project.costs.reduce((sum, item) => sum + positiveNumber(item.amount), 0);
  }

  function ruleScenarioClients(rule, scenarioKey) {
    return positiveNumber(rule.affectedClients?.[scenarioKey]);
  }

  function subscriptionRuleMetrics(project, rule) {
    const basePrice = positiveNumber(project.subscription.baseMonthlyPrice);
    const durationMonths = Math.max(durationToMonths(rule.durationValue, rule.durationUnit), 1 / 30);
    const quantity = Math.max(positiveNumber(rule.quantity), 1);
    const discountMultiplier = 1 - (clampPercent(rule.discountPercent) / 100);
    const effectiveMonthlyValue = basePrice * quantity * discountMultiplier;
    const contractValue = effectiveMonthlyValue * durationMonths;

    return {
      durationMonths,
      quantity,
      effectiveMonthlyValue,
      contractValue
    };
  }

  function projectRevenueBreakdown(project, scenarioKey) {
    if (project.incomeMode !== "subscription") {
      const monthlyRevenue = positiveNumber(project.manualScenarios?.[scenarioKey]?.monthlyRevenue);
      return {
        mode: "manual",
        monthlyRevenue,
        annualRevenue: monthlyRevenue * 12,
        totalClients: 0,
        discountedClients: 0,
        fullPriceClients: 0,
        ignoredDiscountClients: 0,
        averageMonthlyPrice: 0,
        activeRules: []
      };
    }

    const basePrice = positiveNumber(project.subscription.baseMonthlyPrice);
    const totalClients = positiveNumber(project.subscription.scenarioClients?.[scenarioKey]);
    let remainingClients = totalClients;
    let discountedMonthlyRevenue = 0;
    let discountedClients = 0;
    let ignoredDiscountClients = 0;

    const activeRules = project.subscription.rules
      .filter(rule => rule.enabled !== false)
      .map(rule => {
        const ruleMetrics = subscriptionRuleMetrics(project, rule);
        const requestedClients = ruleScenarioClients(rule, scenarioKey);
        const appliedClients = Math.min(remainingClients, requestedClients);
        const ignoredClients = Math.max(0, requestedClients - appliedClients);

        remainingClients -= appliedClients;
        discountedClients += appliedClients;
        ignoredDiscountClients += ignoredClients;

        const monthlyRevenue = appliedClients * ruleMetrics.effectiveMonthlyValue;
        discountedMonthlyRevenue += monthlyRevenue;

        return {
          id: rule.id,
          label: rule.label,
          appliedClients,
          requestedClients,
          ignoredClients,
          monthlyRevenue,
          effectiveMonthlyValue: ruleMetrics.effectiveMonthlyValue,
          contractValue: ruleMetrics.contractValue,
          durationMonths: ruleMetrics.durationMonths,
          quantity: ruleMetrics.quantity,
          discountPercent: clampPercent(rule.discountPercent)
        };
      });

    const fullPriceClients = Math.max(0, remainingClients);
    const fullPriceMonthlyRevenue = fullPriceClients * basePrice;
    const monthlyRevenue = fullPriceMonthlyRevenue + discountedMonthlyRevenue;

    return {
      mode: "subscription",
      monthlyRevenue,
      annualRevenue: monthlyRevenue * 12,
      totalClients,
      discountedClients,
      fullPriceClients,
      ignoredDiscountClients,
      averageMonthlyPrice: totalClients > 0 ? monthlyRevenue / totalClients : 0,
      activeRules,
      fullPriceMonthlyRevenue,
      discountedMonthlyRevenue
    };
  }

  function monthlyRevenueByScenario(scenarioKey) {
    return state.projects.reduce((sum, project) => sum + projectRevenueBreakdown(project, scenarioKey).monthlyRevenue, 0);
  }

  function individualMonthlyCosts() {
    return state.projects.reduce((sum, project) => sum + projectCosts(project), 0);
  }

  function portfolioMetrics(scenarioKey) {
    const grossRevenue = monthlyRevenueByScenario(scenarioKey);
    const individualCosts = individualMonthlyCosts();
    const sharedCosts = globalCostsTotal();
    const totalCosts = individualCosts + sharedCosts;
    const monthlyNet = grossRevenue - totalCosts;
    const investment = totalInvestment();
    const months = Math.max(1, positiveNumber(state.settings.analysisMonths));
    const accumulatedNet = monthlyNet * months;
    const profitAfterInvestment = accumulatedNet - investment;
    const roi = investment > 0
      ? (state.settings.roiMode === "cashGenerated"
        ? (accumulatedNet / investment) * 100
        : (profitAfterInvestment / investment) * 100)
      : 0;
    const paybackMonths = monthlyNet > 0 && investment > 0 ? investment / monthlyNet : Infinity;
    const monthlyMargin = grossRevenue > 0 ? (monthlyNet / grossRevenue) * 100 : 0;
    const costCoverageRatio = totalCosts > 0 ? grossRevenue / totalCosts : Infinity;

    return {
      grossRevenue,
      individualCosts,
      sharedCosts,
      totalCosts,
      monthlyNet,
      investment,
      months,
      accumulatedNet,
      profitAfterInvestment,
      roi,
      paybackMonths,
      monthlyMargin,
      costCoverageRatio
    };
  }

  function projectMetrics(project, scenarioKey) {
    const revenue = projectRevenueBreakdown(project, scenarioKey);
    const ownCosts = projectCosts(project);
    const sharedCost = allocatedGlobalCost();
    const totalMonthlyCost = ownCosts + sharedCost;
    const monthlyNet = revenue.monthlyRevenue - totalMonthlyCost;
    const investment = positiveNumber(project.investment);
    const months = Math.max(1, positiveNumber(state.settings.analysisMonths));
    const accumulatedNet = monthlyNet * months;
    const profitAfterInvestment = accumulatedNet - investment;
    const roi = investment > 0
      ? (state.settings.roiMode === "cashGenerated"
        ? (accumulatedNet / investment) * 100
        : (profitAfterInvestment / investment) * 100)
      : 0;
    const paybackMonths = monthlyNet > 0 && investment > 0 ? investment / monthlyNet : Infinity;

    return {
      revenue,
      ownCosts,
      sharedCost,
      totalMonthlyCost,
      monthlyNet,
      investment,
      accumulatedNet,
      profitAfterInvestment,
      roi,
      paybackMonths
    };
  }

  function coverageMessage(metrics) {
    if (!Number.isFinite(metrics.costCoverageRatio)) {
      return "No existen costos mensuales registrados; revisa si falta ingresar infraestructura, herramientas, soporte o administración.";
    }

    if (metrics.costCoverageRatio < 1) {
      return `No. La cobertura actual es ${metrics.costCoverageRatio.toFixed(2)}x y el portafolio opera con pérdida mensual de ${money(Math.abs(metrics.monthlyNet))}.`;
    }

    if (metrics.costCoverageRatio < 1.15) {
      return `Sí, pero con muy poco colchón. La cobertura actual es ${metrics.costCoverageRatio.toFixed(2)}x y el flujo neto mensual es ${money(metrics.monthlyNet)}.`;
    }

    return `Sí. La cobertura actual es ${metrics.costCoverageRatio.toFixed(2)}x y el flujo neto mensual positivo es ${money(metrics.monthlyNet)}.`;
  }

  function distributionMetrics(distribution, scenarioKey) {
    const selectedInvestors = state.investors.filter(investor => distribution.investorIds.includes(investor.id));
    const portfolio = portfolioMetrics(scenarioKey);
    const periodMonths = durationToMonths(distribution.periodValue, distribution.periodUnit);
    const periodNet = Math.max(0, portfolio.monthlyNet) * periodMonths;
    const investorPool = periodNet * (clampPercent(distribution.investorSharePercent) / 100);
    const messages = [];
    const payouts = [];

    if (!selectedInvestors.length) {
      messages.push({ type: "danger-box", text: "Selecciona al menos un inversor para esta repartición." });
    }

    if (periodMonths <= 0) {
      messages.push({ type: "danger-box", text: "El periodo debe ser mayor que cero." });
    }

    if (portfolio.monthlyNet <= 0) {
      messages.push({ type: "warning-box", text: "El escenario seleccionado no deja ganancias netas positivas. La bolsa para inversores queda en 0 hasta que el flujo mensual sea positivo." });
    }

    if (distribution.mode === "manual") {
      const manualTotal = selectedInvestors.reduce((sum, investor) => sum + clampPercent(distribution.manualShares?.[investor.id]), 0);
      if (selectedInvestors.length && Math.abs(manualTotal - 100) > 0.01) {
        messages.push({ type: "danger-box", text: `La repartición manual debe sumar 100% del valor destinado a inversores. Actualmente suma ${manualTotal.toFixed(2)}%.` });
      }

      selectedInvestors.forEach(investor => {
        const sharePercent = clampPercent(distribution.manualShares?.[investor.id]);
        payouts.push({
          investorId: investor.id,
          name: investor.name,
          sharePercent,
          amount: investorPool * (sharePercent / 100)
        });
      });
    }

    if (distribution.mode === "equal") {
      const sharePercent = selectedInvestors.length ? 100 / selectedInvestors.length : 0;
      selectedInvestors.forEach(investor => {
        payouts.push({
          investorId: investor.id,
          name: investor.name,
          sharePercent,
          amount: investorPool * (sharePercent / 100)
        });
      });
    }

    if (distribution.mode === "proportional") {
      const totalInvested = selectedInvestors.reduce((sum, investor) => sum + positiveNumber(investor.amountInvested), 0);
      if (selectedInvestors.length && totalInvested <= 0) {
        messages.push({ type: "danger-box", text: "La repartición equitativa necesita montos invertidos mayores a 0 en los inversores seleccionados." });
      }

      selectedInvestors.forEach(investor => {
        const sharePercent = totalInvested > 0 ? (positiveNumber(investor.amountInvested) / totalInvested) * 100 : 0;
        payouts.push({
          investorId: investor.id,
          name: investor.name,
          sharePercent,
          amount: investorPool * (sharePercent / 100)
        });
      });
    }

    const manualTotal = selectedInvestors.reduce((sum, investor) => sum + clampPercent(distribution.manualShares?.[investor.id]), 0);

    return {
      portfolio,
      periodMonths,
      periodLabel: formatPeriod(distribution.periodValue, distribution.periodUnit),
      periodNet,
      investorPool,
      retainedByOperation: Math.max(0, periodNet - investorPool),
      selectedInvestors,
      payouts,
      manualTotal,
      messages
    };
  }

  function render() {
    hideHelpPopover();
    syncSettingsFromState();
    renderGlobalCosts();
    renderProjects();
    renderScenarioTabs();
    renderPortfolioSummary();
    renderInvestorQuestions();
    renderInvestors();
    renderDistributions();
    renderInvestorRequirement();
    renderSaveStatus();
    document.getElementById("notes").value = state.notes || "";
  }

  function syncSettingsFromState() {
    document.getElementById("analysisMonths").value = state.settings.analysisMonths;
    document.getElementById("currencySymbol").value = state.settings.currencySymbol;
    document.getElementById("globalCostAllocation").value = state.settings.globalCostAllocation;
    document.getElementById("roiMode").value = state.settings.roiMode;
  }

  function renderSaveStatus() {
    document.getElementById("saveStatus").textContent = uiState.saveStatus;
  }

  function renderGlobalCosts() {
    const container = document.getElementById("globalCostsContainer");

    if (!state.globalCosts.length) {
      container.innerHTML = `<div class="empty-state">No hay costos generales. Añade herramientas, servidores, dominios o costos administrativos compartidos.</div>`;
      return;
    }

    container.innerHTML = `${state.globalCosts.map(item => `
      <div class="field-row" data-global-cost-id="${item.id}">
        <div>
          ${labelWithHelp("Concepto", "Nombre del costo compartido que afecta al portafolio completo.")}
          <input type="text" value="${escapeHtml(item.name)}" data-action="update-global-cost-name" data-global-cost-id="${item.id}" data-focus-key="global-cost-name-${item.id}" />
        </div>
        <div>
          ${labelWithHelp("Valor mensual", "Monto mensual de este costo general.")}
          <input type="number" min="0" step="0.01" value="${item.amount}" data-action="update-global-cost-amount" data-global-cost-id="${item.id}" data-focus-key="global-cost-amount-${item.id}" />
        </div>
        <button class="btn danger small" type="button" data-action="remove-global-cost" data-global-cost-id="${item.id}">Eliminar</button>
      </div>
    `).join("")}
    <div class="notice success-box" style="margin-bottom:0;margin-top:10px;">
      <strong>Total general mensual:</strong> ${money(globalCostsTotal())}
    </div>`;
  }

  function renderProjects() {
    const container = document.getElementById("projectsContainer");

    if (!state.projects.length) {
      container.innerHTML = `<div class="empty-state">No hay proyectos. Añade al menos uno para simular inversión, costos e ingresos.</div>`;
      return;
    }

    container.innerHTML = state.projects.map(renderProject).join("");
  }

  function renderProject(project) {
    const selectedScenarioRevenue = projectRevenueBreakdown(project, state.selectedScenario);

    return `
      <article class="card soft project-card" data-project-id="${project.id}">
        <div class="project-header">
          <div class="grid grid-2">
            <div>
              <label>Nombre del proyecto</label>
              <input type="text" value="${escapeHtml(project.name)}" data-action="update-project-name" data-project-id="${project.id}" data-focus-key="project-name-${project.id}" />
            </div>
            <div>
              ${labelWithHelp("Valor invertido", "Capital inicial destinado al proyecto.")}
              <input type="number" min="0" step="0.01" value="${project.investment}" data-action="update-project-investment" data-project-id="${project.id}" data-focus-key="project-investment-${project.id}" />
            </div>
          </div>
          <button class="btn danger small" type="button" data-action="remove-project" data-project-id="${project.id}">Eliminar proyecto</button>
        </div>

        <div class="notice" style="margin-bottom:14px;">
          <div class="summary-tags">
            <span class="pill">Costos individuales mensuales: ${money(projectCosts(project))}</span>
            <span class="tag ${selectedScenarioRevenue.monthlyRevenue >= 0 ? "success" : "danger"}">Ingreso ${SCENARIOS.find(item => item.key === state.selectedScenario)?.label.toLowerCase() || "activo"}: ${money(selectedScenarioRevenue.monthlyRevenue)}</span>
          </div>
        </div>

        <div class="section-title tight">
          <div>
            <h3>Costos individuales</h3>
            <p>Costos que pertenecen solo a este proyecto.</p>
          </div>
          <button class="btn secondary small" type="button" data-action="add-project-cost" data-project-id="${project.id}">Añadir costo</button>
        </div>

        <div>${renderProjectCosts(project)}</div>

        <div class="section-title subsection">
          <div>
            <h3>Modo de ingresos</h3>
            <p>Cambia entre los ingresos manuales originales y el modelo de suscripción.</p>
          </div>
          <div class="segmented" role="tablist" aria-label="Modo de ingresos del proyecto ${escapeHtml(project.name)}">
            <button class="toggle-btn ${project.incomeMode === "manual" ? "active" : ""}" type="button" data-action="set-income-mode" data-project-id="${project.id}" data-income-mode="manual">Pago manual</button>
            <button class="toggle-btn ${project.incomeMode === "subscription" ? "active" : ""}" type="button" data-action="set-income-mode" data-project-id="${project.id}" data-income-mode="subscription">Suscripción</button>
          </div>
        </div>

        ${project.incomeMode === "subscription" ? renderSubscriptionIncome(project) : renderManualIncome(project)}
      </article>
    `;
  }

  function renderProjectCosts(project) {
    if (!project.costs.length) {
      return `<div class="empty-state">Este proyecto no tiene costos individuales.</div>`;
    }

    return project.costs.map(cost => `
      <div class="field-row" data-project-id="${project.id}" data-project-cost-id="${cost.id}">
        <div>
          ${labelWithHelp("Concepto", "Describe un gasto mensual directo del proyecto.")}
          <input type="text" value="${escapeHtml(cost.name)}" data-action="update-project-cost-name" data-project-id="${project.id}" data-project-cost-id="${cost.id}" data-focus-key="project-cost-name-${project.id}-${cost.id}" />
        </div>
        <div>
          ${labelWithHelp("Valor mensual", "Monto mensual del costo individual.")}
          <input type="number" min="0" step="0.01" value="${cost.amount}" data-action="update-project-cost-amount" data-project-id="${project.id}" data-project-cost-id="${cost.id}" data-focus-key="project-cost-amount-${project.id}-${cost.id}" />
        </div>
        <button class="btn danger small" type="button" data-action="remove-project-cost" data-project-id="${project.id}" data-project-cost-id="${cost.id}">Eliminar</button>
      </div>
    `).join("");
  }

  function renderManualIncome(project) {
    return `
      <div class="section-title subsection">
        <div>
          <h3>Escenarios de ingreso</h3>
          <p>Escribe el ingreso mensual o anual. El otro campo se actualiza automáticamente.</p>
        </div>
      </div>
      <div class="grid grid-3">
        ${SCENARIOS.map(scenario => renderManualScenarioCard(project, scenario)).join("")}
      </div>
    `;
  }

  function renderManualScenarioCard(project, scenario) {
    const metrics = projectMetrics(project, scenario.key);
    const revenue = positiveNumber(project.manualScenarios?.[scenario.key]?.monthlyRevenue);
    const annual = revenue * 12;

    return `
      <div class="scenario-card" data-project-id="${project.id}" data-scenario-key="${scenario.key}">
        <h4 class="hinted-label"><span>${scenario.label}</span>${helpIcon(`Ingreso recurrente estimado para el ${scenario.label.toLowerCase()}.`)}</h4>
        <div class="scenario-meta">
          <div>
            ${labelWithHelp("Ingreso mensual", "Valor mensual esperado en este escenario.")}
            <input type="number" min="0" step="0.01" value="${revenue}" data-action="update-manual-monthly" data-project-id="${project.id}" data-scenario-key="${scenario.key}" data-focus-key="manual-monthly-${project.id}-${scenario.key}" />
          </div>
          <div>
            ${labelWithHelp("Ingreso anual", "Valor anual esperado en este escenario. Se divide para 12 para el cálculo mensual.")}
            <input type="number" min="0" step="0.01" value="${annual}" data-action="update-manual-annual" data-project-id="${project.id}" data-scenario-key="${scenario.key}" data-focus-key="manual-annual-${project.id}-${scenario.key}" />
          </div>
        </div>
        <div class="metric-list">
          <div class="metric-row"><span>Costos propios</span><strong>${money(metrics.ownCosts)}</strong></div>
          <div class="metric-row"><span>Costo general asignado</span><strong>${state.settings.globalCostAllocation === "none" ? "No asignado" : money(metrics.sharedCost)}</strong></div>
          <div class="metric-row"><span>Neto mensual</span><strong class="${metrics.monthlyNet >= 0 ? "positive" : "negative"}">${money(metrics.monthlyNet)}</strong></div>
          <div class="metric-row"><span>Recuperación</span><strong>${formatMonths(metrics.paybackMonths)}</strong></div>
          <div class="metric-row"><span>ROI en ${state.settings.analysisMonths} meses</span><strong class="${metrics.roi >= 0 ? "positive" : "negative"}">${percentage(metrics.roi)}</strong></div>
        </div>
      </div>
    `;
  }

  function renderSubscriptionIncome(project) {
    const activeRuleCount = project.subscription.rules.filter(rule => rule.enabled !== false).length;

    return `
      <div class="notice success-box subsection">
        <strong>Modo suscripción activo.</strong>
        Los valores manuales se conservan para volver al estado original cuando desactives esta modalidad.
      </div>

      <div class="section-title subsection">
        <div>
          <h3>Reglas de descuentos para suscripciones</h3>
          <p>Estas reglas solo afectan el cálculo de suscripciones. Los contratos de varios meses o años se mensualizan para mantener el modelo consistente.</p>
        </div>
        <button class="btn secondary small" type="button" data-action="add-subscription-rule" data-project-id="${project.id}">Añadir regla</button>
      </div>

      <div class="grid grid-2" style="margin-bottom:14px;">
        <div>
          ${labelWithHelp("Precio base mensual", "Precio mensual de la suscripción antes de descuentos.")}
          <input type="number" min="0" step="0.01" value="${project.subscription.baseMonthlyPrice}" data-action="update-subscription-base-price" data-project-id="${project.id}" data-focus-key="subscription-base-price-${project.id}" />
        </div>
        <div class="summary-card compact">
          <div class="label">Resumen de suscripción</div>
          <div class="summary-tags">
            <span class="tag success">Precio base: ${money(project.subscription.baseMonthlyPrice)}</span>
            <span class="tag ${activeRuleCount ? "warning" : "success"}">Reglas activas: ${activeRuleCount}</span>
          </div>
          <div class="hint">Si una regla asigna más clientes de los disponibles en un escenario, el exceso se ignora y se reporta en ese escenario.</div>
        </div>
      </div>

      <div class="subscription-rules">
        ${project.subscription.rules.length ? project.subscription.rules.map(rule => renderSubscriptionRule(project, rule)).join("") : `<div class="empty-state">No hay reglas de descuento. Todos los clientes pagan el precio base mensual.</div>`}
      </div>

      <div class="section-title subsection">
        <div>
          <h3>Escenarios de clientes</h3>
          <p>Define cuántos clientes o contratos tendría cada escenario. El ingreso mensual y anual se calculan automáticamente.</p>
        </div>
      </div>

      <div class="grid grid-3">
        ${SCENARIOS.map(scenario => renderSubscriptionScenarioCard(project, scenario)).join("")}
      </div>
    `;
  }

  function renderSubscriptionRule(project, rule) {
    const metrics = subscriptionRuleMetrics(project, rule);

    return `
      <article class="card subscription-rule ${rule.enabled === false ? "muted" : ""}" data-project-id="${project.id}" data-rule-id="${rule.id}">
        <div class="section-title tight">
          <div>
            <h4>Regla de descuento</h4>
            <p>Aplica sobre contratos incluidos en el modo suscripción.</p>
          </div>
          <button class="btn danger small" type="button" data-action="remove-subscription-rule" data-project-id="${project.id}" data-rule-id="${rule.id}">Eliminar</button>
        </div>

        <div class="grid grid-4">
          <div>
            ${labelWithHelp("Nombre", "Etiqueta libre para identificar la regla.")}
            <input type="text" value="${escapeHtml(rule.label)}" data-action="update-rule-label" data-project-id="${project.id}" data-rule-id="${rule.id}" data-focus-key="rule-label-${project.id}-${rule.id}" />
          </div>
          <div>
            ${labelWithHelp("Descuento %", "Porcentaje de descuento aplicado sobre el precio base mensual.")}
            <input type="number" min="0" max="100" step="0.01" value="${rule.discountPercent}" data-action="update-rule-discount" data-project-id="${project.id}" data-rule-id="${rule.id}" data-focus-key="rule-discount-${project.id}-${rule.id}" />
          </div>
          <div>
            ${labelWithHelp("Cantidad", "Cantidad incluida por contrato o paquete al que aplica la regla.")}
            <input type="number" min="0" step="1" value="${rule.quantity}" data-action="update-rule-quantity" data-project-id="${project.id}" data-rule-id="${rule.id}" data-focus-key="rule-quantity-${project.id}-${rule.id}" />
          </div>
          <div>
            <label class="checkbox-row" style="margin-top:29px;">
              <input type="checkbox" ${rule.enabled !== false ? "checked" : ""} data-action="update-rule-enabled" data-project-id="${project.id}" data-rule-id="${rule.id}" data-focus-key="rule-enabled-${project.id}-${rule.id}" />
              <span>Regla activa</span>
            </label>
          </div>
        </div>

        <div class="inline-fields" style="margin-top:12px;">
          <div>
            ${labelWithHelp("Tiempo del contrato", "Duración del contrato o suscripción asociado a esta regla.")}
            <input type="number" min="0" step="1" value="${rule.durationValue}" data-action="update-rule-duration-value" data-project-id="${project.id}" data-rule-id="${rule.id}" data-focus-key="rule-duration-value-${project.id}-${rule.id}" />
          </div>
          <div>
            <label>Unidad</label>
            <select data-action="update-rule-duration-unit" data-project-id="${project.id}" data-rule-id="${rule.id}" data-focus-key="rule-duration-unit-${project.id}-${rule.id}">
              <option value="days" ${rule.durationUnit === "days" ? "selected" : ""}>Días</option>
              <option value="months" ${rule.durationUnit === "months" ? "selected" : ""}>Meses</option>
              <option value="years" ${rule.durationUnit === "years" ? "selected" : ""}>Años</option>
            </select>
          </div>
        </div>

        <div class="grid grid-3" style="margin-top:12px;">
          ${SCENARIOS.map(scenario => `
            <div>
              ${labelWithHelp(`Clientes ${scenario.label.toLowerCase()}`, "Cantidad de clientes o contratos del escenario que usarían esta regla.")}
              <input type="number" min="0" step="1" value="${ruleScenarioClients(rule, scenario.key)}" data-action="update-rule-scenario-clients" data-project-id="${project.id}" data-rule-id="${rule.id}" data-scenario-key="${scenario.key}" data-focus-key="rule-clients-${project.id}-${rule.id}-${scenario.key}" />
            </div>
          `).join("")}
        </div>

        <div class="summary-tags" style="margin-top:12px;">
          <span class="tag success">Mensual equivalente: ${money(metrics.effectiveMonthlyValue)}</span>
          <span class="tag">Valor del contrato: ${money(metrics.contractValue)}</span>
          <span class="tag ${rule.enabled !== false ? "warning" : "danger"}">Duración: ${formatPeriod(rule.durationValue, rule.durationUnit)}</span>
        </div>
      </article>
    `;
  }

  function renderSubscriptionScenarioCard(project, scenario) {
    const metrics = projectMetrics(project, scenario.key);
    const revenue = metrics.revenue;

    return `
      <div class="scenario-card" data-project-id="${project.id}" data-scenario-key="${scenario.key}">
        <h4 class="hinted-label"><span>${scenario.label}</span>${helpIcon(`Clientes y facturación mensualizada para el ${scenario.label.toLowerCase()}.`)}</h4>
        <div class="scenario-meta scenario-meta-3">
          <div>
            ${labelWithHelp("Clientes / contratos", "Cantidad total de clientes o contratos del escenario.")}
            <input type="number" min="0" step="1" value="${revenue.totalClients}" data-action="update-subscription-scenario-clients" data-project-id="${project.id}" data-scenario-key="${scenario.key}" data-focus-key="subscription-scenario-clients-${project.id}-${scenario.key}" />
          </div>
          <div>
            <label>Ingreso mensual calculado</label>
            <div class="readonly-field mono">${money(revenue.monthlyRevenue)}</div>
          </div>
          <div>
            <label>Ingreso anual calculado</label>
            <div class="readonly-field mono">${money(revenue.annualRevenue)}</div>
          </div>
        </div>

        ${revenue.ignoredDiscountClients > 0 ? `<div class="notice danger-box" style="margin-top:12px;margin-bottom:0;">Se ignoraron ${revenue.ignoredDiscountClients} clientes de descuento porque superaban el total disponible en este escenario.</div>` : ""}

        <div class="metric-list">
          <div class="metric-row"><span>Clientes a precio base</span><strong>${revenue.fullPriceClients}</strong></div>
          <div class="metric-row"><span>Clientes con descuento</span><strong>${revenue.discountedClients}</strong></div>
          <div class="metric-row"><span>Precio promedio mensual</span><strong>${money(revenue.averageMonthlyPrice)}</strong></div>
          <div class="metric-row"><span>Costos propios</span><strong>${money(metrics.ownCosts)}</strong></div>
          <div class="metric-row"><span>Costo general asignado</span><strong>${state.settings.globalCostAllocation === "none" ? "No asignado" : money(metrics.sharedCost)}</strong></div>
          <div class="metric-row"><span>Neto mensual</span><strong class="${metrics.monthlyNet >= 0 ? "positive" : "negative"}">${money(metrics.monthlyNet)}</strong></div>
          <div class="metric-row"><span>Recuperación</span><strong>${formatMonths(metrics.paybackMonths)}</strong></div>
          <div class="metric-row"><span>ROI en ${state.settings.analysisMonths} meses</span><strong class="${metrics.roi >= 0 ? "positive" : "negative"}">${percentage(metrics.roi)}</strong></div>
        </div>
      </div>
    `;
  }

  function renderScenarioTabs() {
    const container = document.getElementById("scenarioTabs");
    container.innerHTML = SCENARIOS.map(scenario => `
      <button class="tab-btn ${state.selectedScenario === scenario.key ? "active" : ""}" type="button" data-action="select-scenario" data-scenario-key="${scenario.key}">
        ${scenario.label}
      </button>
    `).join("");
  }

  function renderPortfolioSummary() {
    const scenarioKey = state.selectedScenario;
    const scenarioLabel = SCENARIOS.find(item => item.key === scenarioKey)?.label || "Escenario";
    const metrics = portfolioMetrics(scenarioKey);

    document.getElementById("portfolioSummary").innerHTML = `
      <div class="summary-card">
        <div class="label">Inversión total</div>
        <div class="value">${money(metrics.investment)}</div>
        <div class="hint">Capital inicial comprometido en todos los proyectos.</div>
      </div>
      <div class="summary-card">
        <div class="label">Flujo neto mensual</div>
        <div class="value ${metrics.monthlyNet >= 0 ? "positive" : "negative"}">${money(metrics.monthlyNet)}</div>
        <div class="hint">Ingresos mensuales menos costos individuales y generales.</div>
      </div>
      <div class="summary-card">
        <div class="label">Recuperación estimada</div>
        <div class="value" style="font-size:1.4rem;">${formatMonths(metrics.paybackMonths)}</div>
        <div class="hint">Basado en el ${scenarioLabel.toLowerCase()}.</div>
      </div>
      <div class="summary-card">
        <div class="label">ROI en ${metrics.months} meses</div>
        <div class="value ${metrics.roi >= 0 ? "positive" : "negative"}">${percentage(metrics.roi)}</div>
        <div class="hint">${state.settings.roiMode === "cashGenerated" ? "Flujo neto acumulado / inversión." : "Flujo neto acumulado menos inversión."}</div>
      </div>
    `;

    renderPortfolioWarnings(metrics, scenarioLabel);
    renderPortfolioTable(scenarioKey);
  }

  function renderPortfolioWarnings(metrics, scenarioLabel) {
    const warnings = [];

    if (metrics.investment <= 0) {
      warnings.push({ type: "warning-box", text: "No hay inversión inicial registrada. El ROI pierde utilidad porque no existe una base de capital para comparar." });
    }
    if (metrics.monthlyNet <= 0) {
      warnings.push({ type: "danger-box", text: `En ${scenarioLabel.toLowerCase()}, el flujo neto mensual no cubre los costos actuales. Se requiere reducir gastos, subir precio o aumentar clientes.` });
    }
    if (metrics.costCoverageRatio < 1.2 && Number.isFinite(metrics.costCoverageRatio)) {
      warnings.push({ type: "warning-box", text: "La cobertura de costos es baja. Una caída pequeña de ingresos podría volver negativo el flujo mensual." });
    }
    if (metrics.monthlyMargin > 0 && metrics.monthlyMargin < 20) {
      warnings.push({ type: "warning-box", text: "El margen mensual neto es positivo, pero estrecho. Conviene modelar soporte, renovaciones y meses sin ventas." });
    }
    if (!warnings.length) {
      warnings.push({ type: "success-box", text: "El escenario seleccionado muestra flujo neto positivo. Valida igualmente supuestos de clientes, renovaciones, impuestos y soporte." });
    }

    document.getElementById("portfolioWarnings").innerHTML = warnings.map(item => `<div class="notice ${item.type}" style="margin-bottom:10px;">${item.text}</div>`).join("");
  }

  function renderPortfolioTable(scenarioKey) {
    const rows = state.projects.map(project => {
      const metrics = projectMetrics(project, scenarioKey);
      return `
        <tr>
          <td><strong>${escapeHtml(project.name)}</strong><div class="status-line">${project.incomeMode === "subscription" ? "Suscripción" : "Manual"}</div></td>
          <td>${money(metrics.investment)}</td>
          <td>${money(metrics.revenue.monthlyRevenue)}</td>
          <td>${money(metrics.ownCosts)}</td>
          <td>${state.settings.globalCostAllocation === "none" ? "No asignado" : money(metrics.sharedCost)}</td>
          <td class="${metrics.monthlyNet >= 0 ? "positive" : "negative"}"><strong>${money(metrics.monthlyNet)}</strong></td>
          <td>${formatMonths(metrics.paybackMonths)}</td>
          <td class="${metrics.roi >= 0 ? "positive" : "negative"}"><strong>${percentage(metrics.roi)}</strong></td>
        </tr>
      `;
    }).join("");

    document.getElementById("portfolioTableContainer").innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Proyecto</th>
            <th>Inversión</th>
            <th>Ingreso mensual</th>
            <th>Costos propios</th>
            <th>Costo general asignado</th>
            <th>Neto mensual</th>
            <th>Recuperación</th>
            <th>ROI</th>
          </tr>
        </thead>
        <tbody>${rows || `<tr><td colspan="8">No hay proyectos.</td></tr>`}</tbody>
      </table>
    `;
  }

  function renderInvestorQuestions() {
    const scenarioKey = state.selectedScenario;
    const scenarioLabel = SCENARIOS.find(item => item.key === scenarioKey)?.label || "Escenario";
    const metrics = portfolioMetrics(scenarioKey);
    const best = portfolioMetrics("best");
    const expected = portfolioMetrics("expected");
    const worst = portfolioMetrics("worst");
    const downside = worst.monthlyNet < 0
      ? `En el peor caso se perderían ${money(Math.abs(worst.monthlyNet))} por mes antes de cubrir costos.`
      : `En el peor caso todavía quedaría un flujo neto mensual de ${money(worst.monthlyNet)}.`;

    const items = [
      {
        q: "¿En cuánto tiempo recuperaría la inversión?",
        a: `En el ${scenarioLabel.toLowerCase()}, la recuperación estimada es ${formatMonths(metrics.paybackMonths)}.`
      },
      {
        q: `¿Cuál sería el retorno en ${metrics.months} meses?`,
        a: `El ROI estimado es ${percentage(metrics.roi)} y la utilidad acumulada después de inversión sería ${money(metrics.profitAfterInvestment)}.`
      },
      {
        q: "¿Qué pasa si el escenario sale peor de lo previsto?",
        a: downside
      },
      {
        q: "¿Qué tan sensible es el portafolio al volumen de ingresos?",
        a: `Comparación de flujo neto mensual: peor ${money(worst.monthlyNet)}, esperado ${money(expected.monthlyNet)}, mejor ${money(best.monthlyNet)}.`
      },
      {
        q: "¿Los ingresos alcanzan para cubrir costos?",
        a: coverageMessage(metrics)
      },
      {
        q: "¿Cuál es el principal punto débil del modelo?",
        a: "El modelo mensualiza suscripciones y descuentos; si los clientes tardan en llegar o renovar, la recuperación real será más lenta que la simulación lineal."
      }
    ];

    document.getElementById("investorQuestions").innerHTML = items.map(item => `
      <div class="summary-card">
        <h3 style="margin-bottom:8px;">${item.q}</h3>
        <p class="muted" style="margin-bottom:0;">${item.a}</p>
      </div>
    `).join("");
  }

  function renderInvestors() {
    const container = document.getElementById("investorsContainer");

    if (!state.investors.length) {
      container.innerHTML = `<div class="empty-state">No hay inversores registrados. Añade uno o más para habilitar reparticiones.</div>`;
      return;
    }

    container.innerHTML = `<div class="investor-list">${state.investors.map(investor => `
      <article class="card investor-card" data-investor-id="${investor.id}">
        <div class="section-title tight">
          <div>
            <h4>${escapeHtml(investor.name || "Inversor")}</h4>
            <p>Usa este registro para repartir utilidades en modo igualitario, equitativo o manual.</p>
          </div>
          <button class="btn danger small" type="button" data-action="remove-investor" data-investor-id="${investor.id}">Eliminar</button>
        </div>

        <div class="grid grid-2">
          <div>
            <label>Nombre</label>
            <input type="text" value="${escapeHtml(investor.name)}" data-action="update-investor-name" data-investor-id="${investor.id}" data-focus-key="investor-name-${investor.id}" />
          </div>
          <div>
            ${labelWithHelp("Monto invertido", "Capital aportado por este inversor. Sirve para la repartición equitativa.")}
            <input type="number" min="0" step="0.01" value="${investor.amountInvested}" data-action="update-investor-amount" data-investor-id="${investor.id}" data-focus-key="investor-amount-${investor.id}" />
          </div>
        </div>

        <div style="margin-top:12px;">
          <label>Notas</label>
          <textarea data-action="update-investor-notes" data-investor-id="${investor.id}" data-focus-key="investor-notes-${investor.id}" placeholder="Ejemplo: entra desde el mes 1, recibe informes trimestrales, tiene preferencia de salida...">${escapeHtml(investor.notes)}</textarea>
        </div>
      </article>
    `).join("")}</div>`;
  }

  function renderInvestorRequirement() {
    const container = document.getElementById("investorRequirement");
    const addDistributionButton = document.getElementById("addDistributionBtn");

    addDistributionButton.disabled = state.investors.length === 0;

    if (!state.investors.length) {
      container.innerHTML = `<div class="notice warning-box" style="margin-bottom:0;">Primero registra al menos un inversor para habilitar la sección de reparticiones.</div>`;
      return;
    }

    if (!state.distributions.length) {
      container.innerHTML = `<div class="notice danger-box" style="margin-bottom:0;">Si existe al menos un inversor, debes crear al menos una repartición.</div>`;
      return;
    }

    container.innerHTML = `<div class="notice success-box" style="margin-bottom:0;">Hay ${state.investors.length} inversor(es) registrados y ${state.distributions.length} repartición(es) configuradas.</div>`;
  }

  function refreshInvestorDerivedViews() {
    renderDistributions();
    renderInvestorRequirement();
  }

  function renderDistributions() {
    const container = document.getElementById("distributionsContainer");

    if (!state.investors.length) {
      container.innerHTML = `<div class="empty-state">Registra inversores para poder crear y calcular reparticiones.</div>`;
      return;
    }

    if (!state.distributions.length) {
      container.innerHTML = `<div class="empty-state">No hay reparticiones creadas. Añade al menos una para repartir ganancias a inversores.</div>`;
      return;
    }

    container.innerHTML = `<div class="distribution-list">${state.distributions.map(distribution => renderDistribution(distribution)).join("")}</div>`;
  }

  function renderDistribution(distribution) {
    const metrics = distributionMetrics(distribution, state.selectedScenario);
    const progress = Math.min(100, Math.max(0, metrics.manualTotal));

    return `
      <article class="card distribution-card" data-distribution-id="${distribution.id}">
        <div class="section-title tight">
          <div>
            <h4>${escapeHtml(distribution.label || "Repartición")}</h4>
            <p>Calculada sobre la ganancia neta del ${SCENARIOS.find(item => item.key === state.selectedScenario)?.label.toLowerCase() || "escenario activo"}.</p>
          </div>
          <button class="btn danger small" type="button" data-action="remove-distribution" data-distribution-id="${distribution.id}">Eliminar</button>
        </div>

        <div class="grid grid-3">
          <div>
            <label>Nombre de la repartición</label>
            <input type="text" value="${escapeHtml(distribution.label)}" data-action="update-distribution-label" data-distribution-id="${distribution.id}" data-focus-key="distribution-label-${distribution.id}" />
          </div>
          <div>
            ${labelWithHelp("% para inversores", "Porcentaje de la ganancia neta del periodo que se destina a inversores.")}
            <input type="number" min="0" max="100" step="0.01" value="${distribution.investorSharePercent}" data-action="update-distribution-share" data-distribution-id="${distribution.id}" data-focus-key="distribution-share-${distribution.id}" />
          </div>
          <div>
            <label>Modo de reparto</label>
            <select data-action="update-distribution-mode" data-distribution-id="${distribution.id}" data-focus-key="distribution-mode-${distribution.id}">
              <option value="equal" ${distribution.mode === "equal" ? "selected" : ""}>${DISTRIBUTION_MODES.equal}</option>
              <option value="proportional" ${distribution.mode === "proportional" ? "selected" : ""}>${DISTRIBUTION_MODES.proportional}</option>
              <option value="manual" ${distribution.mode === "manual" ? "selected" : ""}>${DISTRIBUTION_MODES.manual}</option>
            </select>
          </div>
        </div>

        <div class="inline-fields" style="margin-top:12px;">
          <div>
            <label>Periodo</label>
            <input type="number" min="0" step="1" value="${distribution.periodValue}" data-action="update-distribution-period-value" data-distribution-id="${distribution.id}" data-focus-key="distribution-period-value-${distribution.id}" />
          </div>
          <div>
            <label>Unidad del periodo</label>
            <select data-action="update-distribution-period-unit" data-distribution-id="${distribution.id}" data-focus-key="distribution-period-unit-${distribution.id}">
              <option value="days" ${distribution.periodUnit === "days" ? "selected" : ""}>Días</option>
              <option value="months" ${distribution.periodUnit === "months" ? "selected" : ""}>Meses</option>
              <option value="years" ${distribution.periodUnit === "years" ? "selected" : ""}>Años</option>
            </select>
          </div>
        </div>

        ${distribution.mode === "manual" ? `
          <div class="progress-meter" style="margin-top:12px;">
            <div class="progress-bar"><span style="width:${progress}%;"></span></div>
            <div class="progress-text">${metrics.manualTotal.toFixed(2)}% asignado del valor destinado a inversores. Debe llegar exactamente a 100%.</div>
          </div>
        ` : ""}

        <div class="subsection">
          <div class="section-title tight">
            <div>
              <h5>Inversores incluidos</h5>
              <p>Puedes sumar o quitar inversores ya registrados en esta repartición.</p>
            </div>
          </div>

          <div class="distribution-grid">
            ${state.investors.map(investor => renderDistributionInvestorRow(distribution, investor, metrics)).join("")}
          </div>
        </div>

        ${metrics.messages.map(message => `<div class="notice ${message.type}" style="margin-top:12px;margin-bottom:0;">${message.text}</div>`).join("")}

        <div class="summary-card compact" style="margin-top:12px;">
          <div class="summary-tags">
            <span class="tag success">Periodo: ${metrics.periodLabel}</span>
            <span class="tag ${metrics.periodNet > 0 ? "success" : "danger"}">Ganancia neta del periodo: ${money(metrics.periodNet)}</span>
            <span class="tag warning">Bolsa para inversores: ${money(metrics.investorPool)}</span>
            <span class="tag">Retenido por operación: ${money(metrics.retainedByOperation)}</span>
          </div>

          <div class="distribution-summary-table">
            <table>
              <thead>
                <tr>
                  <th>Inversor</th>
                  <th>% del pool</th>
                  <th>Pago estimado</th>
                </tr>
              </thead>
              <tbody>
                ${metrics.payouts.length ? metrics.payouts.map(payout => `
                  <tr>
                    <td>${escapeHtml(payout.name)}</td>
                    <td>${percentage(payout.sharePercent)}</td>
                    <td>${money(payout.amount)}</td>
                  </tr>
                `).join("") : `<tr><td colspan="3">No hay inversores seleccionados para esta repartición.</td></tr>`}
              </tbody>
            </table>
          </div>
        </div>
      </article>
    `;
  }

  function renderDistributionInvestorRow(distribution, investor, metrics) {
    const selected = distribution.investorIds.includes(investor.id);
    const payout = metrics.payouts.find(item => item.investorId === investor.id);
    const manualShare = clampPercent(distribution.manualShares?.[investor.id]);

    return `
      <div class="investor-select-row ${selected ? "selected" : ""}">
        <label class="checkbox-row">
          <input type="checkbox" ${selected ? "checked" : ""} data-action="toggle-distribution-investor" data-distribution-id="${distribution.id}" data-investor-id="${investor.id}" data-focus-key="distribution-investor-${distribution.id}-${investor.id}" />
          <span>${escapeHtml(investor.name)}</span>
        </label>
        <div class="status-line">Invertido: ${money(investor.amountInvested)}</div>
        ${distribution.mode === "manual" && selected ? `
          <div style="margin-top:10px;">
            <label>% manual dentro del pool</label>
            <input type="number" min="0" max="100" step="0.01" value="${manualShare}" data-action="update-manual-share" data-distribution-id="${distribution.id}" data-investor-id="${investor.id}" data-focus-key="distribution-manual-share-${distribution.id}-${investor.id}" />
          </div>
        ` : ""}
        <div class="status-line" style="margin-top:8px;">${selected ? `Participación estimada: ${percentage(payout?.sharePercent || 0)}. Pago estimado: ${money(payout?.amount || 0)}.` : "No incluido en esta repartición."}</div>
      </div>
    `;
  }

  function captureFocus() {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const focusKey = active.dataset.focusKey;
    if (!focusKey) return null;

    const snapshot = { focusKey };
    if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
      snapshot.selectionStart = active.selectionStart;
      snapshot.selectionEnd = active.selectionEnd;
    }

    return snapshot;
  }

  function restoreFocus(snapshot) {
    if (!snapshot) return;
    const escapedKey = window.CSS && CSS.escape ? CSS.escape(snapshot.focusKey) : snapshot.focusKey.replace(/(["\\])/g, "\\$1");
    const element = document.querySelector(`[data-focus-key="${escapedKey}"]`);
    if (!(element instanceof HTMLElement)) return;

    element.focus({ preventScroll: true });

    if ((element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) && snapshot.selectionStart != null && snapshot.selectionEnd != null) {
      element.setSelectionRange(snapshot.selectionStart, snapshot.selectionEnd);
    }
  }

  function rerender(preserveFocus = false) {
    const focusSnapshot = preserveFocus ? captureFocus() : null;
    render();
    restoreFocus(focusSnapshot);
  }

  function clearHelpTrigger(trigger) {
    if (!trigger) return;
    trigger.setAttribute("aria-expanded", "false");
    trigger.removeAttribute("aria-describedby");
  }

  function hideHelpPopover() {
    if (!helpPopover) return;
    clearHelpTrigger(activeHelpTrigger);
    activeHelpTrigger = null;
    helpPopover.classList.add("hidden");
    helpPopover.setAttribute("aria-hidden", "true");
    helpPopover.textContent = "";
    helpPopover.style.visibility = "";
    helpPopover.style.left = "";
    helpPopover.style.top = "";
  }

  function showHelpPopover(trigger) {
    if (!helpPopover || !trigger) return;
    const helpText = trigger.dataset.help || trigger.getAttribute("title") || trigger.getAttribute("aria-label");
    if (!helpText) return;

    if (activeHelpTrigger && activeHelpTrigger !== trigger) {
      clearHelpTrigger(activeHelpTrigger);
    }

    activeHelpTrigger = trigger;
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-describedby", "helpPopover");

    helpPopover.textContent = helpText;
    helpPopover.classList.remove("hidden");
    helpPopover.setAttribute("aria-hidden", "false");
    helpPopover.style.visibility = "hidden";
    helpPopover.style.left = "0px";
    helpPopover.style.top = "0px";

    const triggerRect = trigger.getBoundingClientRect();
    const popoverRect = helpPopover.getBoundingClientRect();
    const minLeft = window.scrollX + 12;
    const maxLeft = Math.max(minLeft, window.scrollX + document.documentElement.clientWidth - popoverRect.width - 12);
    const preferredLeft = window.scrollX + triggerRect.left + (triggerRect.width / 2) - (popoverRect.width / 2);
    const left = Math.min(Math.max(minLeft, preferredLeft), maxLeft);
    const showAbove = triggerRect.top >= popoverRect.height + 20;
    const top = window.scrollY + (showAbove ? triggerRect.top - popoverRect.height - 10 : triggerRect.bottom + 10);

    helpPopover.style.left = `${left}px`;
    helpPopover.style.top = `${Math.max(window.scrollY + 12, top)}px`;
    helpPopover.style.visibility = "visible";
  }

  function toggleHelpPopover(trigger) {
    if (activeHelpTrigger === trigger && helpPopover && !helpPopover.classList.contains("hidden")) {
      hideHelpPopover();
      return;
    }
    showHelpPopover(trigger);
  }

  function getProject(projectId) {
    return state.projects.find(project => project.id === projectId) || null;
  }

  function getProjectCost(project, costId) {
    return project.costs.find(cost => cost.id === costId) || null;
  }

  function getGlobalCost(costId) {
    return state.globalCosts.find(cost => cost.id === costId) || null;
  }

  function getRule(project, ruleId) {
    return project.subscription.rules.find(rule => rule.id === ruleId) || null;
  }

  function getInvestor(investorId) {
    return state.investors.find(investor => investor.id === investorId) || null;
  }

  function getDistribution(distributionId) {
    return state.distributions.find(distribution => distribution.id === distributionId) || null;
  }

  function handleClick(event) {
    if (!(event.target instanceof Element)) return;

    const helpTrigger = event.target.closest(".help-icon");
    if (helpTrigger) {
      event.preventDefault();
      toggleHelpPopover(helpTrigger);
      return;
    }

    if (!event.target.closest("#helpPopover")) {
      hideHelpPopover();
    }

    const target = event.target.closest("[data-action]");
    if (!target) return;

    const action = target.dataset.action;

    if (action === "select-scenario") {
      state.selectedScenario = target.dataset.scenarioKey;
      rerender();
      return;
    }

    if (action === "add-global-cost") {
      state.globalCosts.push({ id: uid(), name: "Nuevo costo general", amount: 0 });
      rerender();
      return;
    }

    if (action === "remove-global-cost") {
      state.globalCosts = state.globalCosts.filter(cost => cost.id !== target.dataset.globalCostId);
      rerender();
      return;
    }

    if (action === "add-project") {
      state.projects.push(createProject(`Proyecto ${state.projects.length + 1}`));
      rerender();
      return;
    }

    if (action === "remove-project") {
      state.projects = state.projects.filter(project => project.id !== target.dataset.projectId);
      rerender();
      return;
    }

    if (action === "add-project-cost") {
      const project = getProject(target.dataset.projectId);
      if (!project) return;
      project.costs.push({ id: uid(), name: "Nuevo costo", amount: 0 });
      rerender();
      return;
    }

    if (action === "remove-project-cost") {
      const project = getProject(target.dataset.projectId);
      if (!project) return;
      project.costs = project.costs.filter(cost => cost.id !== target.dataset.projectCostId);
      rerender();
      return;
    }

    if (action === "set-income-mode") {
      const project = getProject(target.dataset.projectId);
      if (!project) return;
      project.incomeMode = target.dataset.incomeMode === "subscription" ? "subscription" : "manual";
      rerender();
      return;
    }

    if (action === "add-subscription-rule") {
      const project = getProject(target.dataset.projectId);
      if (!project) return;
      project.subscription.rules.push(createSubscriptionRule(`Regla ${project.subscription.rules.length + 1}`));
      rerender();
      return;
    }

    if (action === "remove-subscription-rule") {
      const project = getProject(target.dataset.projectId);
      if (!project) return;
      project.subscription.rules = project.subscription.rules.filter(rule => rule.id !== target.dataset.ruleId);
      rerender();
      return;
    }

    if (action === "add-investor") {
      state.investors.push(createInvestor(`Inversor ${state.investors.length + 1}`));
      ensureRequiredDistribution();
      rerender();
      return;
    }

    if (action === "remove-investor") {
      state.investors = state.investors.filter(investor => investor.id !== target.dataset.investorId);
      cleanDistributions();
      rerender();
      return;
    }

    if (action === "add-distribution") {
      if (!state.investors.length) return;
      state.distributions.push(createDistribution(`Repartición ${state.distributions.length + 1}`, state.investors.map(investor => investor.id)));
      rerender();
      return;
    }

    if (action === "remove-distribution") {
      if (state.investors.length > 0 && state.distributions.length === 1) {
        window.alert("Mientras existan inversores registrados, debe existir al menos una repartición.");
        return;
      }
      state.distributions = state.distributions.filter(distribution => distribution.id !== target.dataset.distributionId);
      rerender();
      return;
    }

    if (action === "save-state") {
      saveToLocalStorage();
      return;
    }

    if (action === "export-state") {
      exportJson();
      return;
    }

    if (action === "print-page") {
      window.print();
      return;
    }

    if (action === "reset-state") {
      const confirmed = window.confirm("¿Reiniciar toda la simulación? Esta acción eliminará los datos guardados en este navegador si no exportaste antes.");
      if (!confirmed) return;

      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      state = createBlankState();
      uiState.saveStatus = "Simulador reiniciado.";
      rerender();
    }
  }

  function handleInput(target) {
    const action = target.dataset.action;
    if (!action) return;

    if (action === "update-analysis-months") {
      state.settings.analysisMonths = Math.max(1, positiveNumber(target.value) || 1);
      rerender(true);
      return;
    }

    if (action === "update-currency-symbol") {
      state.settings.currencySymbol = target.value || "$";
      rerender(true);
      return;
    }

    if (action === "update-global-cost-allocation") {
      state.settings.globalCostAllocation = target.value === "none" ? "none" : "equal";
      rerender(true);
      return;
    }

    if (action === "update-roi-mode") {
      state.settings.roiMode = target.value === "cashGenerated" ? "cashGenerated" : "netAfterInvestment";
      rerender(true);
      return;
    }

    if (action === "update-notes") {
      state.notes = target.value;
      return;
    }

    if (action.startsWith("update-global-cost")) {
      const cost = getGlobalCost(target.dataset.globalCostId);
      if (!cost) return;

      if (action === "update-global-cost-name") {
        cost.name = target.value;
        return;
      }

      if (action === "update-global-cost-amount") {
        cost.amount = positiveNumber(target.value);
        rerender(true);
        return;
      }
    }

    const project = getProject(target.dataset.projectId);
    if (project) {
      if (action === "update-project-name") {
        project.name = target.value;
        rerender(true);
        return;
      }

      if (action === "update-project-investment") {
        project.investment = positiveNumber(target.value);
        rerender(true);
        return;
      }

      const projectCost = getProjectCost(project, target.dataset.projectCostId);
      if (projectCost) {
        if (action === "update-project-cost-name") {
          projectCost.name = target.value;
          return;
        }
        if (action === "update-project-cost-amount") {
          projectCost.amount = positiveNumber(target.value);
          rerender(true);
          return;
        }
      }

      if (action === "update-manual-monthly") {
        project.manualScenarios[target.dataset.scenarioKey].monthlyRevenue = positiveNumber(target.value);
        rerender(true);
        return;
      }

      if (action === "update-manual-annual") {
        project.manualScenarios[target.dataset.scenarioKey].monthlyRevenue = positiveNumber(target.value) / 12;
        rerender(true);
        return;
      }

      if (action === "update-subscription-base-price") {
        project.subscription.baseMonthlyPrice = positiveNumber(target.value);
        rerender(true);
        return;
      }

      if (action === "update-subscription-scenario-clients") {
        project.subscription.scenarioClients[target.dataset.scenarioKey] = positiveNumber(target.value);
        rerender(true);
        return;
      }

      const rule = getRule(project, target.dataset.ruleId);
      if (rule) {
        if (action === "update-rule-label") {
          rule.label = target.value;
          return;
        }
        if (action === "update-rule-discount") {
          rule.discountPercent = clampPercent(target.value);
          rerender(true);
          return;
        }
        if (action === "update-rule-quantity") {
          rule.quantity = Math.max(1, positiveNumber(target.value) || 1);
          rerender(true);
          return;
        }
        if (action === "update-rule-duration-value") {
          rule.durationValue = Math.max(1, positiveNumber(target.value) || 1);
          rerender(true);
          return;
        }
        if (action === "update-rule-duration-unit") {
          rule.durationUnit = PERIOD_UNITS[target.value] ? target.value : "years";
          rerender(true);
          return;
        }
        if (action === "update-rule-scenario-clients") {
          rule.affectedClients[target.dataset.scenarioKey] = positiveNumber(target.value);
          rerender(true);
          return;
        }
        if (action === "update-rule-enabled") {
          rule.enabled = target.checked;
          rerender(true);
          return;
        }
      }
    }

    const investor = getInvestor(target.dataset.investorId);
    if (investor) {
      if (action === "update-investor-name") {
        investor.name = target.value;
        rerender(true);
        return;
      }
      if (action === "update-investor-amount") {
        investor.amountInvested = positiveNumber(target.value);
        refreshInvestorDerivedViews();
        return;
      }
      if (action === "update-investor-notes") {
        investor.notes = target.value;
        return;
      }
    }

    const distribution = getDistribution(target.dataset.distributionId);
    if (distribution) {
      if (action === "update-distribution-label") {
        distribution.label = target.value;
        rerender(true);
        return;
      }
      if (action === "update-distribution-share") {
        distribution.investorSharePercent = clampPercent(target.value);
        rerender(true);
        return;
      }
      if (action === "update-distribution-mode") {
        distribution.mode = DISTRIBUTION_MODES[target.value] ? target.value : "equal";
        rerender(true);
        return;
      }
      if (action === "update-distribution-period-value") {
        distribution.periodValue = Math.max(1, positiveNumber(target.value) || 1);
        rerender(true);
        return;
      }
      if (action === "update-distribution-period-unit") {
        distribution.periodUnit = PERIOD_UNITS[target.value] ? target.value : "months";
        rerender(true);
        return;
      }
      if (action === "toggle-distribution-investor") {
        if (target.checked) {
          if (!distribution.investorIds.includes(target.dataset.investorId)) {
            distribution.investorIds.push(target.dataset.investorId);
          }
        } else {
          distribution.investorIds = distribution.investorIds.filter(investorId => investorId !== target.dataset.investorId);
          delete distribution.manualShares[target.dataset.investorId];
        }
        rerender(true);
        return;
      }
      if (action === "update-manual-share") {
        distribution.manualShares[target.dataset.investorId] = clampPercent(target.value);
        rerender(true);
      }
    }
  }

  function bindEvents() {
    window.addEventListener("resize", () => {
      if (activeHelpTrigger) showHelpPopover(activeHelpTrigger);
    });

    window.addEventListener("scroll", () => {
      if (activeHelpTrigger) showHelpPopover(activeHelpTrigger);
    }, true);

    document.addEventListener("focusin", event => {
      if (!activeHelpTrigger || !(event.target instanceof Element)) return;
      if (event.target.closest(".help-icon") || event.target.closest("#helpPopover")) return;
      hideHelpPopover();
    });

    document.addEventListener("keydown", event => {
      if (event.key === "Escape") {
        hideHelpPopover();
        return;
      }

      if (!(event.target instanceof Element)) return;
      const helpTrigger = event.target.closest(".help-icon");
      if (!helpTrigger) return;
      if (event.key !== "Enter" && event.key !== " ") return;

      event.preventDefault();
      toggleHelpPopover(helpTrigger);
    });

    document.body.addEventListener("click", handleClick);

    document.body.addEventListener("input", event => {
      const target = event.target;
      if (!(target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement)) return;
      if (target.type === "checkbox" || target.type === "file") return;
      handleInput(target);
    });

    document.body.addEventListener("change", event => {
      const target = event.target;
      if (target instanceof HTMLSelectElement) {
        handleInput(target);
        return;
      }
      if (target instanceof HTMLInputElement && target.type === "checkbox") {
        handleInput(target);
      }
    });

    document.getElementById("importInput").addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = () => {
        try {
          state = normalizeState(JSON.parse(String(reader.result)));
          cleanDistributions();
          ensureRequiredDistribution();
          uiState.saveStatus = "JSON importado correctamente. Recuerda guardar si quieres conservarlo en este navegador.";
          rerender();
        } catch (error) {
          console.error(error);
          window.alert("No se pudo importar el archivo. Verifica que sea un JSON válido del simulador.");
        }
      };

      reader.readAsText(file);
      event.target.value = "";
    });
  }

  loadFromLocalStorage();
  cleanDistributions();
  ensureRequiredDistribution();
  bindEvents();
  render();
})();