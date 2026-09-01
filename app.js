const STORAGE_KEY = "pockettrack-expenses";
const CUSTOM_TYPES_KEY = "pockettrack-custom-types";
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
const expenseList = document.querySelector("#expense-list");
const emptyState = document.querySelector("#empty-state");

let expenses = loadExpenses();
let customTypes = loadCustomTypes();
let editingExpenseId = null;

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

function render(preferredMonth) {
  populateMonthFilter(preferredMonth);
  renderSummary();
  renderProgress();
  renderReport();
  renderHistory();
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

document.querySelector("#today").textContent = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
}).format(new Date());
dateInput.value = localDateString();
renderExpenseTypes();
updateTypeFields();
render();
