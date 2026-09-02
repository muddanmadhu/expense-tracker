const STORAGE_KEY = "pockettrack-expenses";
const CUSTOM_TYPES_KEY = "pockettrack-custom-types";
const BUDGET_KEY = "pockettrack-daily-budget";
const ADD_TYPE_VALUE = "__add_new_type__";
const DEFAULT_EXPENSE_TYPES = [
  "RESTAURANT",
  "UTILITY BILL",
  "GROCERY",
  "VEGETABLES & FRUITS",
  "NON-VEGETARIAN",
  "SCHOOL FEE",
  "TUITION FEE",
  "STATIONERY",
  "SHOPPING",
];

const form = document.querySelector("#expense-form");
const dateInput = document.querySelector("#date");
const typeInput = document.querySelector("#type");
const customTypeField = document.querySelector("#custom-type-field");
const customTypeInput = document.querySelector("#custom-type");
const subcategoryField = document.querySelector("#subcategory-field");
const subcategoryInput = document.querySelector("#subcategory");
const cancelEditButton = document.querySelector("#cancel-edit");
const submitLabel = document.querySelector("#submit-label");
const monthFilter = document.querySelector("#month-filter");
const exportExcelButton = document.querySelector("#export-excel");
const expenseList = document.querySelector("#expense-list");
const emptyState = document.querySelector("#empty-state");
const budgetSettingsToggle = document.querySelector("#budget-settings-toggle");
const budgetSettingsForm = document.querySelector("#budget-settings-form");
const dailyBudgetInput = document.querySelector("#daily-budget-amount");
const budgetSettingsClear = document.querySelector("#budget-settings-clear");
const budgetEmpty = document.querySelector("#budget-empty");
const budgetSummary = document.querySelector("#budget-summary");

let expenses = loadExpenses();
let customTypes = loadCustomTypes();
let editingExpenseId = null;
let dailyBudget = loadDailyBudget();

const currency = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 2,
});

const monthName = new Intl.DateTimeFormat("en-IN", {
  month: "short",
  year: "numeric",
});

function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function loadExpenses() {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(stored) ? stored : [];
  } catch {
    return [];
  }
}

function saveExpenses() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function loadCustomTypes() {
  try {
    const stored = JSON.parse(localStorage.getItem(CUSTOM_TYPES_KEY) || "[]");
    return Array.isArray(stored)
      ? [
          ...new Set(
            stored
              .filter((type) => typeof type === "string" && type.trim())
              .map((type) => type.trim().toUpperCase()),
          ),
        ]
      : [];
  } catch {
    return [];
  }
}

function saveCustomTypes() {
  localStorage.setItem(CUSTOM_TYPES_KEY, JSON.stringify(customTypes));
}

function renderExpenseTypes(selectedType = "") {
  const options = [...DEFAULT_EXPENSE_TYPES, ...customTypes];
  typeInput.innerHTML = `
    <option value="">Choose a category</option>
    ${options
      .map(
        (type) =>
          `<option ${type === selectedType ? "selected" : ""}>${escapeHtml(type)}</option>`,
      )
      .join("")}
    <option value="${ADD_TYPE_VALUE}">+ Add new expense type</option>`;
}

function updateTypeFields() {
  const isCustomType = typeInput.value === ADD_TYPE_VALUE;
  const isUtility = typeInput.value === "UTILITY BILL";

  customTypeField.hidden = !isCustomType;
  customTypeInput.required = isCustomType;
  subcategoryField.hidden = !isUtility;
  subcategoryInput.required = isUtility;

  if (!isCustomType) customTypeInput.value = "";
  if (!isUtility) subcategoryInput.value = "";
}

function resetExpenseForm() {
  editingExpenseId = null;
  form.reset();
  dateInput.value = localDateString();
  renderExpenseTypes();
  updateTypeFields();
  submitLabel.textContent = "Add expense";
  cancelEditButton.hidden = true;
}

function editExpense(expenseId) {
  const expense = expenses.find((item) => item.id === expenseId);
  if (!expense) {
    document.querySelector("#form-message").textContent =
      "This expense could not be found.";
    return;
  }

  const normalizedType = expense.type.toUpperCase();
  if (
    !DEFAULT_EXPENSE_TYPES.includes(normalizedType) &&
    !customTypes.includes(normalizedType)
  ) {
    customTypes.push(normalizedType);
    customTypes.sort((a, b) => a.localeCompare(b));
    saveCustomTypes();
  }

  editingExpenseId = expenseId;
  dateInput.value = expense.date;
  form.elements.amount.value = expense.amount;
  renderExpenseTypes(normalizedType);
  updateTypeFields();
  subcategoryInput.value = expense.subcategory || "";
  form.elements.mode.value = expense.mode;
  form.elements.description.value = expense.description || "";
  submitLabel.textContent = "Save changes";
  cancelEditButton.hidden = false;
  document.querySelector("#form-message").textContent = "Editing expense.";
  form.scrollIntoView({ behavior: "smooth", block: "center" });
}

function monthKey(date) {
  return date.slice(0, 7);
}

function offsetMonth(key, offset) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, month - 1 + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function formatMonth(key) {
  return monthName.format(new Date(`${key}-02T12:00:00`));
}

function total(items) {
  return items.reduce((sum, expense) => sum + expense.amount, 0);
}

function getMonthlyTotal(key) {
  return total(expenses.filter((expense) => monthKey(expense.date) === key));
}

function loadDailyBudget() {
  try {
    const stored = JSON.parse(localStorage.getItem(BUDGET_KEY) || "null");
    return stored && typeof stored.amount === "number" ? stored : null;
  } catch {
    return null;
  }
}

function saveDailyBudget() {
  if (dailyBudget) {
    localStorage.setItem(BUDGET_KEY, JSON.stringify(dailyBudget));
  } else {
    localStorage.removeItem(BUDGET_KEY);
  }
}

function addDays(dateStr, days) {
  const date = new Date(`${dateStr}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localDateString(date);
}

function monthStartDate(dateStr) {
  return `${monthKey(dateStr)}-01`;
}

function getDailySpend(dateStr) {
  return total(expenses.filter((expense) => expense.date === dateStr));
}

function getCarryForwardBalance(uptoDateExclusive) {
  if (!dailyBudget) return 0;
  let carry = 0;
  let day = monthStartDate(uptoDateExclusive);
  while (day < uptoDateExclusive) {
    carry += dailyBudget.amount - getDailySpend(day);
    day = addDays(day, 1);
  }
  return carry;
}

function detectDevice() {
  const userAgent = navigator.userAgent;
  const isTablet =
    /iPad|Tablet/i.test(userAgent) ||
    (/Android/i.test(userAgent) && !/Mobile/i.test(userAgent));
  const isMobile =
    navigator.userAgentData?.mobile ?? /Android|iPhone|iPod|Mobile/i.test(userAgent);
  const deviceClass = isTablet ? "TABLET" : isMobile ? "MOBILE" : "DESKTOP";

  let operatingSystem = "OTHER OS";
  if (/Windows/i.test(userAgent)) operatingSystem = "WINDOWS";
  else if (/Android/i.test(userAgent)) operatingSystem = "ANDROID";
  else if (/iPhone|iPad|iPod/i.test(userAgent)) operatingSystem = "IOS";
  else if (/Macintosh|Mac OS X/i.test(userAgent)) operatingSystem = "MACOS";
  else if (/Linux/i.test(userAgent)) operatingSystem = "LINUX";

  let browser = "WEB BROWSER";
  if (/Edg\//i.test(userAgent)) browser = "EDGE";
  else if (/OPR\//i.test(userAgent)) browser = "OPERA";
  else if (/Chrome\//i.test(userAgent)) browser = "CHROME";
  else if (/Firefox\//i.test(userAgent)) browser = "FIREFOX";
  else if (/Safari\//i.test(userAgent)) browser = "SAFARI";

  const androidModel = userAgent.match(/;\s*([^;()]+?)\s+Build\//i)?.[1];
  const deviceName =
    androidModel?.trim().toUpperCase() ||
    (/iPhone/i.test(userAgent)
      ? "IPHONE"
      : /iPad/i.test(userAgent)
        ? "IPAD"
        : deviceClass);

  return ["WEB", deviceName, operatingSystem, browser].join(" · ");
}

function xmlCell(value, type = "String") {
  const text = String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
  return `<Cell><Data ss:Type="${type}">${text}</Data></Cell>`;
}

function exportMonthlyReport() {
  const selectedMonth = monthFilter.value;
  const monthlyExpenses = expenses
    .filter((expense) => monthKey(expense.date) === selectedMonth)
    .sort((a, b) => a.date.localeCompare(b.date));

  if (!monthlyExpenses.length) return;

  const categoryTotals = monthlyExpenses.reduce((report, expense) => {
    const type = expense.type.toUpperCase();
    report[type] = (report[type] || 0) + expense.amount;
    return report;
  }, {});
  const rows = [
    [["POCKETTRACK EXPENSE REPORT"]],
    [["Month"], [formatMonth(selectedMonth)]],
    [["Total spent"], [getMonthlyTotal(selectedMonth), "Number"]],
    [],
    [["CATEGORY SUMMARY"]],
    [["Expense Type"], ["Amount (INR)"]],
    ...Object.entries(categoryTotals)
      .sort((a, b) => b[1] - a[1])
      .map(([type, amount]) => [[type], [amount, "Number"]]),
    [],
    [["EXPENSE DETAILS"]],
    [
      ["Date"],
      ["Expense Type"],
      ["Subcategory"],
      ["Payment Mode"],
      ["Tracked From"],
      ["Description"],
      ["Amount (INR)"],
    ],
    ...monthlyExpenses.map((expense) => [
      [`${expense.date}T00:00:00.000`, "DateTime"],
      [expense.type.toUpperCase()],
      [expense.subcategory || ""],
      [expense.mode],
      [expense.device || "WEB · DEVICE NOT RECORDED"],
      [expense.description || ""],
      [expense.amount, "Number"],
    ]),
  ];
  const worksheetRows = rows
    .map(
      (row) =>
        `<Row>${row.map(([value, type]) => xmlCell(value, type)).join("")}</Row>`,
    )
    .join("");
  const workbook = `<?xml version="1.0"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
 xmlns:o="urn:schemas-microsoft-com:office:office"
 xmlns:x="urn:schemas-microsoft-com:office:excel"
 xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
 <Worksheet ss:Name="Expense Report">
  <Table>${worksheetRows}</Table>
 </Worksheet>
</Workbook>`;
  const url = URL.createObjectURL(
    new Blob([workbook], { type: "application/vnd.ms-excel" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `expense-report-${selectedMonth}.xls`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value) {
  const element = document.createElement("div");
  element.textContent = value;
  return element.innerHTML;
}

function populateMonthFilter(preferredMonth) {
  const currentMonth = monthKey(localDateString());
  const availableMonths = new Set(expenses.map((expense) => monthKey(expense.date)));
  availableMonths.add(currentMonth);

  const selected = preferredMonth || monthFilter.value || currentMonth;
  monthFilter.innerHTML = [...availableMonths]
    .sort()
    .reverse()
    .map(
      (key) =>
        `<option value="${key}" ${key === selected ? "selected" : ""}>${formatMonth(key)}</option>`,
    )
    .join("");

  if (![...availableMonths].includes(selected)) {
    monthFilter.value = currentMonth;
  }
}

function renderSummary() {
  const currentMonth = monthKey(localDateString());
  const currentTotal = getMonthlyTotal(currentMonth);
  const previousTotal = getMonthlyTotal(offsetMonth(currentMonth, -1));
  const heroChange = document.querySelector("#hero-change");

  document.querySelector("#hero-total").textContent = currency.format(currentTotal);

  if (!currentTotal && !previousTotal) {
    heroChange.textContent = "No expenses yet";
  } else if (!previousTotal) {
    heroChange.textContent = "First month tracked";
  } else {
    const change = ((currentTotal - previousTotal) / previousTotal) * 100;
    heroChange.textContent = `${Math.abs(change).toFixed(0)}% ${change <= 0 ? "less" : "more"} than last month`;
  }
}

function renderProgress() {
  const selectedMonth = monthFilter.value;
  const previousMonth = offsetMonth(selectedMonth, -1);
  const selectedTotal = getMonthlyTotal(selectedMonth);
  const previousTotal = getMonthlyTotal(previousMonth);

  exportExcelButton.disabled = selectedTotal === 0;
  document.querySelector("#month-total").textContent = currency.format(selectedTotal);
  document.querySelector("#previous-total").textContent = currency.format(previousTotal);

  const comparison = document.querySelector("#comparison-message");
  if (!selectedTotal && !previousTotal) {
    comparison.textContent = "Add expenses to begin your monthly comparison.";
  } else if (!previousTotal) {
    comparison.innerHTML = `<b>${formatMonth(selectedMonth)}</b> is your first tracked month.`;
  } else {
    const difference = selectedTotal - previousTotal;
    const percent = Math.abs((difference / previousTotal) * 100).toFixed(0);
    comparison.innerHTML = `You spent <b>${percent}% ${difference <= 0 ? "less" : "more"}</b> than ${formatMonth(previousMonth)}.`;
  }

  const months = Array.from({ length: 6 }, (_, index) =>
    offsetMonth(selectedMonth, index - 5),
  );
  const values = months.map(getMonthlyTotal);
  const max = Math.max(...values, 1);

  document.querySelector("#monthly-chart").innerHTML = months
    .map(
      (key, index) => `
        <div class="chart-item ${key === selectedMonth ? "active" : ""}" title="${formatMonth(key)}: ${currency.format(values[index])}">
          <div class="chart-bar" style="height: ${Math.max((values[index] / max) * 110, 3)}px"></div>
          <span>${formatMonth(key).split(" ")[0]}</span>
        </div>`,
    )
    .join("");
}

function renderReport() {
  const selectedMonth = monthFilter.value;
  const monthlyExpenses = expenses.filter(
    (expense) => monthKey(expense.date) === selectedMonth,
  );
  const byCategory = monthlyExpenses.reduce((report, expense) => {
    const type = expense.type.toUpperCase();
    report[type] = (report[type] || 0) + expense.amount;
    return report;
  }, {});
  const categories = Object.entries(byCategory).sort((a, b) => b[1] - a[1]);
  const topCategory = document.querySelector("#top-category");
  const report = document.querySelector("#category-report");

  if (!categories.length) {
    topCategory.className = "top-category empty-insight";
    topCategory.innerHTML = `
      <span class="category-icon">—</span>
      <div><strong>No expenses this month</strong><small>Add an expense to see insights</small></div>`;
    report.innerHTML = "";
    return;
  }

  const [topName, topAmount] = categories[0];
  const monthlyTotal = total(monthlyExpenses);
  const share = ((topAmount / monthlyTotal) * 100).toFixed(0);
  topCategory.className = "top-category";
  topCategory.innerHTML = `
    <span class="category-icon">${share}%</span>
    <div><strong>${escapeHtml(topName)}</strong><small>${currency.format(topAmount)} · largest expense area</small></div>`;

  report.innerHTML = categories
    .slice(0, 5)
    .map(
      ([name, amount]) => `
        <div class="report-row">
          <div class="report-label"><span>${escapeHtml(name)}</span><span>${currency.format(amount)}</span></div>
          <div class="report-track"><div class="report-fill" style="width: ${(amount / topAmount) * 100}%"></div></div>
        </div>`,
    )
    .join("");
}

function renderHistory() {
  const sorted = [...expenses].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  );
  emptyState.hidden = sorted.length > 0;
  document.querySelector("#expense-count").textContent =
    `${sorted.length} expense${sorted.length === 1 ? "" : "s"}`;

  expenseList.innerHTML = sorted
    .map(
      (expense) => `
        <tr>
          <td>${new Intl.DateTimeFormat("en-IN", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${expense.date}T12:00:00`))}</td>
          <td class="expense-name">
            <strong>${escapeHtml(expense.type.toUpperCase())}</strong>
            ${
              expense.subcategory || expense.description
                ? `<small>${[expense.subcategory, expense.description]
                    .filter(Boolean)
                    .map(escapeHtml)
                    .join(" · ")}</small>`
                : ""
            }
          </td>
          <td><span class="mode-pill">${escapeHtml(expense.mode)}</span></td>
          <td class="device-info">${escapeHtml(expense.device || "WEB · DEVICE NOT RECORDED")}</td>
          <td>${currency.format(expense.amount)}</td>
          <td>
            <div class="row-actions">
              <button class="row-action edit-button" data-edit="${expense.id}" aria-label="Edit ${escapeHtml(expense.type)} expense" title="Edit">✎</button>
              <button class="row-action delete-button" data-delete="${expense.id}" aria-label="Delete ${escapeHtml(expense.type)} expense" title="Delete">×</button>
            </div>
          </td>
        </tr>`,
    )
    .join("");
}

function renderBudget() {
  if (!dailyBudget) {
    budgetEmpty.hidden = false;
    budgetSummary.hidden = true;
    budgetSettingsToggle.textContent = "Set budget";
    return;
  }

  budgetEmpty.hidden = true;
  budgetSummary.hidden = false;
  budgetSettingsToggle.textContent = "Edit budget";

  const today = localDateString();
  const carryForward = getCarryForwardBalance(today);
  const allowance = dailyBudget.amount + carryForward;
  const spentToday = getDailySpend(today);
  const remaining = allowance - spentToday;

  document.querySelector("#budget-allowance").textContent =
    currency.format(allowance);
  document.querySelector("#budget-spent").textContent =
    currency.format(spentToday);

  const statusBox = document.querySelector("#budget-status");
  const statusAmount = document.querySelector("#budget-status-amount");
  const statusLabel = document.querySelector("#budget-status-label");
  const isOver = remaining < 0;

  statusBox.classList.toggle("is-over", isOver);
  statusAmount.textContent = currency.format(Math.abs(remaining));
  statusLabel.textContent = isOver
    ? "over budget today"
    : "remaining today";

  const carryNote = document.querySelector("#budget-carry-note");
  if (carryForward === 0) {
    carryNote.textContent = `Daily budget of ${currency.format(dailyBudget.amount)} resets on the 1st of every month.`;
  } else if (carryForward > 0) {
    carryNote.textContent = `Includes ${currency.format(carryForward)} saved and carried forward from earlier this month.`;
  } else {
    carryNote.textContent = `Includes ${currency.format(Math.abs(carryForward))} overspent carried forward from earlier this month.`;
  }
}

function render(preferredMonth) {
  populateMonthFilter(preferredMonth);
  renderSummary();
  renderProgress();
  renderReport();
  renderHistory();
  renderBudget();
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const data = new FormData(form);
  const amount = Number(data.get("amount"));
  const isCustomType = data.get("type") === ADD_TYPE_VALUE;
  const customType = data
    .get("customType")
    .trim()
    .replace(/\s+/g, " ")
    .toUpperCase();
  const existingType = [...DEFAULT_EXPENSE_TYPES, ...customTypes].find(
    (type) => type.toLowerCase() === customType.toLowerCase(),
  );
  const expenseType = isCustomType
    ? existingType || customType
    : data.get("type");

  if (!Number.isFinite(amount) || amount <= 0) {
    document.querySelector("#form-message").textContent =
      "Enter an amount greater than zero.";
    return;
  }

  if (isCustomType && !customType) {
    document.querySelector("#form-message").textContent =
      "Enter a name for the new expense type.";
    customTypeInput.focus();
    return;
  }

  if (
    isCustomType &&
    !existingType
  ) {
    customTypes.push(customType);
    customTypes.sort((a, b) => a.localeCompare(b));
    saveCustomTypes();
  }

  const existingExpense = expenses.find(
    (expense) => expense.id === editingExpenseId,
  );
  const savedExpense = {
    id: editingExpenseId || crypto.randomUUID(),
    date: data.get("date"),
    amount,
    type: expenseType,
    subcategory: data.get("subcategory") || "",
    mode: data.get("mode"),
    device: existingExpense?.device || detectDevice(),
    description: data.get("description").trim(),
    createdAt: existingExpense?.createdAt || Date.now(),
  };

  if (editingExpenseId) {
    expenses = expenses.map((expense) =>
      expense.id === editingExpenseId ? savedExpense : expense,
    );
  } else {
    expenses.push(savedExpense);
  }

  saveExpenses();
  const successMessage = editingExpenseId
    ? "Expense updated successfully."
    : "Expense added successfully.";
  resetExpenseForm();
  document.querySelector("#form-message").textContent = successMessage;
  render(monthKey(data.get("date")));
  setTimeout(() => {
    document.querySelector("#form-message").textContent = "";
  }, 3000);
});

typeInput.addEventListener("change", updateTypeFields);
cancelEditButton.addEventListener("click", () => {
  resetExpenseForm();
  document.querySelector("#form-message").textContent = "Editing cancelled.";
});

expenseList.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit]");
  if (editButton) {
    editExpense(editButton.dataset.edit);
    return;
  }

  const deleteButton = event.target.closest("[data-delete]");
  if (!deleteButton) return;

  if (editingExpenseId === deleteButton.dataset.delete) resetExpenseForm();
  expenses = expenses.filter(
    (expense) => expense.id !== deleteButton.dataset.delete,
  );
  saveExpenses();
  render();
});

monthFilter.addEventListener("change", () => {
  renderProgress();
  renderReport();
});
exportExcelButton.addEventListener("click", exportMonthlyReport);

budgetSettingsToggle.addEventListener("click", () => {
  const isHidden = budgetSettingsForm.hidden;
  budgetSettingsForm.hidden = !isHidden;
  if (isHidden) {
    dailyBudgetInput.value = dailyBudget ? dailyBudget.amount : "";
    dailyBudgetInput.focus();
  }
});

budgetSettingsForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const amount = Number(dailyBudgetInput.value);
  if (!Number.isFinite(amount) || amount <= 0) {
    dailyBudgetInput.focus();
    return;
  }

  dailyBudget = { amount };
  saveDailyBudget();
  budgetSettingsForm.hidden = true;
  renderBudget();
});

budgetSettingsClear.addEventListener("click", () => {
  dailyBudget = null;
  saveDailyBudget();
  budgetSettingsForm.hidden = true;
  renderBudget();
});

document.querySelector("#today").textContent = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(new Date());
dateInput.value = localDateString();
renderExpenseTypes();
updateTypeFields();
render();
