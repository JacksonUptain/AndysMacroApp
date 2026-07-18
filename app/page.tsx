"use client";

import type { FormEvent } from "react";
import { useEffect, useMemo, useState } from "react";

type MacroKey = "calories" | "carbs" | "fat" | "protein";
type TabKey = "today" | "foods" | "week" | "targets";
type NoticeTone = "success" | "error";

type MacroValues = Record<MacroKey, number>;

type Food = MacroValues & {
  id: string;
  name: string;
  createdAt: string;
};

type LogEntry = MacroValues & {
  id: string;
  foodId: string;
  foodName: string;
  date: string;
  servings: number;
};

type FoodForm = Record<MacroKey, string> & {
  name: string;
};

type Notice = {
  message: string;
  tone: NoticeTone;
};

const STORAGE_KEY = "andys-macro-counter:v1";

const TABS: Array<{ key: TabKey; label: string; summary: string }> = [
  { key: "today", label: "Today", summary: "Log meals" },
  { key: "foods", label: "Foods", summary: "Save library" },
  { key: "week", label: "Week", summary: "Review totals" },
  { key: "targets", label: "Targets", summary: "Set goals" },
];

const MACRO_FIELDS: Array<{
  key: MacroKey;
  label: string;
  shortLabel: string;
  unit: string;
}> = [
  { key: "calories", label: "Calories", shortLabel: "Cal", unit: "" },
  { key: "protein", label: "Protein", shortLabel: "Pro", unit: "g" },
  { key: "carbs", label: "Carbohydrates", shortLabel: "Carb", unit: "g" },
  { key: "fat", label: "Fat", shortLabel: "Fat", unit: "g" },
];

const EMPTY_MACROS: MacroValues = {
  calories: 0,
  carbs: 0,
  fat: 0,
  protein: 0,
};

const DEFAULT_FOODS: Food[] = [
  {
    id: "food-siggis-yogurt",
    name: "Siggis Yogurt",
    calories: 110,
    fat: 0,
    carbs: 13,
    protein: 15,
    createdAt: "seed",
  },
  {
    id: "food-eggs",
    name: "Two Large Eggs",
    calories: 140,
    fat: 10,
    carbs: 1,
    protein: 12,
    createdAt: "seed",
  },
  {
    id: "food-rice",
    name: "Cooked White Rice, 1 cup",
    calories: 205,
    fat: 0,
    carbs: 45,
    protein: 4,
    createdAt: "seed",
  },
  {
    id: "food-chicken",
    name: "Grilled Chicken Breast, 4 oz",
    calories: 187,
    fat: 4,
    carbs: 0,
    protein: 35,
    createdAt: "seed",
  },
];

const DEFAULT_FORM: FoodForm = {
  name: "",
  calories: "",
  carbs: "",
  fat: "",
  protein: "",
};

function todayIso() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function dateOffset(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day + days);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function readableDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(year, month - 1, day));
}

function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function cleanNumber(value: number) {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function macroTotal(entries: LogEntry[]) {
  return entries.reduce<MacroValues>(
    (total, entry) => ({
      calories: total.calories + entry.calories * entry.servings,
      carbs: total.carbs + entry.carbs * entry.servings,
      fat: total.fat + entry.fat * entry.servings,
      protein: total.protein + entry.protein * entry.servings,
    }),
    { ...EMPTY_MACROS },
  );
}

function parseMacroInput(value: string) {
  const numberValue = Number(value);
  if (!Number.isFinite(numberValue) || numberValue < 0) {
    return null;
  }

  return Math.round(numberValue * 10) / 10;
}

function normalizeServings(value: number) {
  return Math.max(0.25, Math.round(value * 4) / 4);
}

function isFood(value: unknown): value is Food {
  if (!value || typeof value !== "object") {
    return false;
  }

  const food = value as Partial<Food>;
  return (
    typeof food.id === "string" &&
    typeof food.name === "string" &&
    typeof food.createdAt === "string" &&
    MACRO_FIELDS.every(({ key }) => typeof food[key] === "number")
  );
}

function isLogEntry(value: unknown): value is LogEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const entry = value as Partial<LogEntry>;
  return (
    typeof entry.id === "string" &&
    typeof entry.foodName === "string" &&
    typeof entry.date === "string" &&
    typeof entry.servings === "number" &&
    MACRO_FIELDS.every(({ key }) => typeof entry[key] === "number")
  );
}

function totalRemaining(total: number, target: number) {
  return Math.max(target - total, 0);
}

export default function Home() {
  const [foods, setFoods] = useState<Food[]>(DEFAULT_FOODS);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [targets, setTargets] = useState<MacroValues>(EMPTY_MACROS);
  const [selectedDate, setSelectedDate] = useState(todayIso);
  const [activeTab, setActiveTab] = useState<TabKey>("today");
  const [foodForm, setFoodForm] = useState<FoodForm>({ ...DEFAULT_FORM });
  const [foodQuery, setFoodQuery] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [hasHydrated, setHasHydrated] = useState(false);

  useEffect(() => {
    let isActive = true;

    window.queueMicrotask(() => {
      if (!isActive) {
        return;
      }

      const savedState = window.localStorage.getItem(STORAGE_KEY);

      if (savedState) {
        try {
          const parsed = JSON.parse(savedState) as {
            foods?: unknown;
            entries?: unknown;
            targets?: unknown;
          };

          if (Array.isArray(parsed.foods) && parsed.foods.every(isFood)) {
            setFoods(parsed.foods.length > 0 ? parsed.foods : DEFAULT_FOODS);
          }

          if (Array.isArray(parsed.entries) && parsed.entries.every(isLogEntry)) {
            setEntries(parsed.entries);
          }

          if (
            parsed.targets &&
            typeof parsed.targets === "object" &&
            MACRO_FIELDS.every(
              ({ key }) =>
                typeof (parsed.targets as Partial<MacroValues>)[key] === "number",
            )
          ) {
            setTargets(parsed.targets as MacroValues);
          }
        } catch {
          window.localStorage.removeItem(STORAGE_KEY);
        }
      }

      setHasHydrated(true);
    });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydrated) {
      return;
    }

    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ foods, entries, targets }),
    );
  }, [entries, foods, hasHydrated, targets]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 3800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const dailyEntries = useMemo(
    () => entries.filter((entry) => entry.date === selectedDate),
    [entries, selectedDate],
  );

  const dailyTotals = useMemo(() => macroTotal(dailyEntries), [dailyEntries]);

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, index) => dateOffset(selectedDate, index - 6)),
    [selectedDate],
  );

  const weeklyRows = useMemo(
    () =>
      weekDays.map((date) => {
        const dayEntries = entries.filter((entry) => entry.date === date);
        return {
          date,
          totals: macroTotal(dayEntries),
        };
      }),
    [entries, weekDays],
  );

  const weeklyTotals = useMemo(
    () =>
      weeklyRows.reduce<MacroValues>(
        (total, row) => ({
          calories: total.calories + row.totals.calories,
          carbs: total.carbs + row.totals.carbs,
          fat: total.fat + row.totals.fat,
          protein: total.protein + row.totals.protein,
        }),
        { ...EMPTY_MACROS },
      ),
    [weeklyRows],
  );

  const filteredFoods = useMemo(() => {
    const query = foodQuery.trim().toLowerCase();
    const sortedFoods = [...foods].sort((first, second) =>
      first.name.localeCompare(second.name),
    );

    if (!query) {
      return sortedFoods;
    }

    return sortedFoods.filter((food) => food.name.toLowerCase().includes(query));
  }, [foodQuery, foods]);

  function showNotice(message: string, tone: NoticeTone = "success") {
    setNotice({ message, tone });
  }

  function addEntry(food: Food, servings = 1, message?: string) {
    setEntries((currentEntries) => [
      {
        id: makeId("entry"),
        foodId: food.id,
        foodName: food.name,
        date: selectedDate,
        servings,
        calories: food.calories,
        carbs: food.carbs,
        fat: food.fat,
        protein: food.protein,
      },
      ...currentEntries,
    ]);
    showNotice(message ?? `${food.name} added to ${readableDate(selectedDate)}.`);
  }

  function createFood(logImmediately: boolean) {
    setFormError("");
    const name = foodForm.name.trim();

    if (!name) {
      setFormError("Food name is required.");
      showNotice("Food name is required.", "error");
      return;
    }

    const macroValues = MACRO_FIELDS.reduce<Partial<MacroValues>>((values, field) => {
      values[field.key] = parseMacroInput(foodForm[field.key]) ?? -1;
      return values;
    }, {});

    if (MACRO_FIELDS.some(({ key }) => macroValues[key] == null || macroValues[key]! < 0)) {
      setFormError("Macros must be zero or higher.");
      showNotice("Macros must be zero or higher.", "error");
      return;
    }

    const alreadyExists = foods.some(
      (food) => food.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (alreadyExists) {
      setFormError("That food is already saved.");
      showNotice("That food is already saved.", "error");
      return;
    }

    const food: Food = {
      id: makeId("food"),
      name,
      calories: macroValues.calories!,
      carbs: macroValues.carbs!,
      fat: macroValues.fat!,
      protein: macroValues.protein!,
      createdAt: new Date().toISOString(),
    };

    setFoods((currentFoods) => [food, ...currentFoods]);
    setFoodForm({ ...DEFAULT_FORM });
    setFoodQuery("");
    setFormError("");

    if (logImmediately) {
      addEntry(food, 1, `${food.name} saved and logged for ${readableDate(selectedDate)}.`);
      return;
    }

    showNotice(`${food.name} saved.`);
  }

  function handleFoodSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createFood(false);
  }

  function updateEntryServings(entryId: string, nextValue: number) {
    setEntries((currentEntries) =>
      currentEntries.map((entry) =>
        entry.id === entryId
          ? { ...entry, servings: normalizeServings(nextValue) }
          : entry,
      ),
    );
  }

  function removeEntry(entryId: string) {
    setEntries((currentEntries) =>
      currentEntries.filter((entry) => entry.id !== entryId),
    );
    showNotice("Food removed from the day.");
  }

  function removeFood(foodId: string) {
    const food = foods.find((item) => item.id === foodId);
    setFoods((currentFoods) => currentFoods.filter((item) => item.id !== foodId));
    showNotice(food ? `${food.name} deleted.` : "Food deleted.");
  }

  function clearDay() {
    if (dailyEntries.length === 0) {
      return;
    }

    const shouldClear = window.confirm(`Clear all foods for ${readableDate(selectedDate)}?`);
    if (!shouldClear) {
      return;
    }

    setEntries((currentEntries) =>
      currentEntries.filter((entry) => entry.date !== selectedDate),
    );
    showNotice(`${readableDate(selectedDate)} cleared.`);
  }

  function updateFoodForm(key: keyof FoodForm, value: string) {
    setFoodForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function updateTarget(key: MacroKey, value: string) {
    setTargets((currentTargets) => ({
      ...currentTargets,
      [key]: parseMacroInput(value) ?? 0,
    }));
    showNotice("Targets saved.");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div>
          <p className="kicker">Simple daily macro tracking</p>
          <h1>Andy&apos;s Macro Counter</h1>
        </div>

        <label className="date-picker" htmlFor="selected-date">
          <span>Selected day</span>
          <input
            id="selected-date"
            type="date"
            value={selectedDate}
            onChange={(event) => setSelectedDate(event.target.value)}
          />
        </label>
      </header>

      <nav className="tab-bar" aria-label="Macro counter sections">
        {TABS.map((tab) => (
          <button
            aria-current={activeTab === tab.key ? "page" : undefined}
            className="tab-button"
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
          >
            <span>{tab.label}</span>
            <small>{tab.summary}</small>
          </button>
        ))}
      </nav>

      <div
        className={`status-toast${notice ? " visible" : ""}${
          notice?.tone === "error" ? " error" : ""
        }`}
        role="status"
        aria-live="polite"
      >
        {notice?.message}
      </div>

      {activeTab === "today" && (
        <section className="tab-panel today-panel" aria-labelledby="today-title">
          <div className="section-intro">
            <div>
              <p className="eyebrow">Track today</p>
              <h2 id="today-title">{readableDate(selectedDate)}</h2>
            </div>
            <button
              className="ghost-button"
              type="button"
              onClick={clearDay}
              disabled={dailyEntries.length === 0}
            >
              Clear Day
            </button>
          </div>

          <section className="totals-strip" aria-label="Daily totals">
            {MACRO_FIELDS.map((field) => {
              const target = targets[field.key];
              const total = dailyTotals[field.key];
              const progress = target > 0 ? Math.min((total / target) * 100, 100) : 0;

              return (
                <article className="total-tile" key={field.key}>
                  <div className="metric-label">{field.label}</div>
                  <strong>
                    {cleanNumber(total)}
                    {field.unit && <span>{field.unit}</span>}
                  </strong>
                  <div className="progress-track" aria-hidden="true">
                    <div style={{ width: `${progress}%` }} />
                  </div>
                  <small>
                    {target > 0
                      ? `${cleanNumber(totalRemaining(total, target))}${field.unit} left`
                      : "No target"}
                  </small>
                </article>
              );
            })}
          </section>

          <div className="today-grid">
            <section className="panel" aria-labelledby="add-saved-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Add to day</p>
                  <h2 id="add-saved-title">Saved Foods</h2>
                </div>

                <label className="search-field" htmlFor="food-search">
                  <span>Search</span>
                  <input
                    id="food-search"
                    type="search"
                    value={foodQuery}
                    placeholder="Search saved foods"
                    onChange={(event) => setFoodQuery(event.target.value)}
                  />
                </label>
              </div>

              <div className="quick-food-list">
                {filteredFoods.length === 0 ? (
                  <p className="empty-state">No saved foods match that search.</p>
                ) : (
                  filteredFoods.map((food) => (
                    <article className="quick-food-row" key={food.id}>
                      <div>
                        <strong>{food.name}</strong>
                        <span>
                          {cleanNumber(food.calories)} cal | {cleanNumber(food.protein)}g
                          pro | {cleanNumber(food.carbs)}g carb | {cleanNumber(food.fat)}g
                          fat
                        </span>
                      </div>
                      <button
                        className="mini-button"
                        type="button"
                        onClick={() => addEntry(food)}
                      >
                        Add
                      </button>
                    </article>
                  ))
                )}
              </div>
            </section>

            <section className="panel day-log" aria-labelledby="day-log-title">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Logged</p>
                  <h2 id="day-log-title">Today&apos;s Foods</h2>
                </div>
              </div>

              <div className="entry-list">
                {dailyEntries.length === 0 ? (
                  <p className="empty-state">No foods logged for this date yet.</p>
                ) : (
                  dailyEntries.map((entry) => (
                    <article className="entry-row" key={entry.id}>
                      <div className="entry-food">
                        <strong>{entry.foodName}</strong>
                        <span>{cleanNumber(entry.calories)} cal per serving</span>
                      </div>

                      <div
                        className="serving-control"
                        aria-label={`${entry.foodName} servings`}
                      >
                        <button
                          type="button"
                          aria-label={`Decrease servings for ${entry.foodName}`}
                          onClick={() => updateEntryServings(entry.id, entry.servings - 0.25)}
                        >
                          -
                        </button>
                        <input
                          aria-label={`Servings for ${entry.foodName}`}
                          min="0.25"
                          step="0.25"
                          type="number"
                          value={entry.servings}
                          onChange={(event) =>
                            updateEntryServings(entry.id, Number(event.target.value))
                          }
                        />
                        <button
                          type="button"
                          aria-label={`Increase servings for ${entry.foodName}`}
                          onClick={() => updateEntryServings(entry.id, entry.servings + 0.25)}
                        >
                          +
                        </button>
                      </div>

                      <dl className="macro-pills">
                        {MACRO_FIELDS.map((field) => (
                          <div key={field.key}>
                            <dt>{field.shortLabel}</dt>
                            <dd>
                              {cleanNumber(entry[field.key] * entry.servings)}
                              {field.unit}
                            </dd>
                          </div>
                        ))}
                      </dl>

                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Remove ${entry.foodName}`}
                        title={`Remove ${entry.foodName}`}
                        onClick={() => removeEntry(entry.id)}
                      >
                        x
                      </button>
                    </article>
                  ))
                )}
              </div>
            </section>
          </div>
        </section>
      )}

      {activeTab === "foods" && (
        <section className="tab-panel" aria-labelledby="foods-title">
          <div className="section-intro">
            <div>
              <p className="eyebrow">Reusable foods</p>
              <h2 id="foods-title">Food Library</h2>
            </div>
          </div>

          <div className="library-grid">
            <section className="panel" aria-labelledby="new-food-title">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Create once</p>
                  <h2 id="new-food-title">New Food</h2>
                </div>
              </div>

              <form className="food-form" onSubmit={handleFoodSubmit}>
                <label className="field full-width">
                  <span>Food name</span>
                  <input
                    type="text"
                    value={foodForm.name}
                    placeholder="Siggis Yogurt"
                    onChange={(event) => updateFoodForm("name", event.target.value)}
                  />
                </label>

                <div className="macro-input-grid">
                  {MACRO_FIELDS.map((field) => (
                    <label className="field" key={field.key}>
                      <span>{field.label}</span>
                      <input
                        min="0"
                        step="0.1"
                        type="number"
                        value={foodForm[field.key]}
                        onChange={(event) => updateFoodForm(field.key, event.target.value)}
                      />
                    </label>
                  ))}
                </div>

                {formError && <p className="form-error">{formError}</p>}

                <div className="form-actions">
                  <button className="primary-button" type="submit">
                    Save Food
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => createFood(true)}
                  >
                    Save + Log
                  </button>
                </div>
              </form>
            </section>

            <section className="panel" aria-labelledby="saved-foods-title">
              <div className="panel-heading compact">
                <div>
                  <p className="eyebrow">Saved</p>
                  <h2 id="saved-foods-title">{foods.length} Foods</h2>
                </div>
              </div>

              <div className="food-table" role="table" aria-label="Saved foods">
                <div className="food-table-head" role="row">
                  <span role="columnheader">Food</span>
                  {MACRO_FIELDS.map((field) => (
                    <span key={field.key} role="columnheader">
                      {field.shortLabel}
                    </span>
                  ))}
                  <span role="columnheader">Edit</span>
                </div>

                {foods.map((food) => (
                  <article className="food-row" role="row" key={food.id}>
                    <strong role="cell">{food.name}</strong>
                    {MACRO_FIELDS.map((field) => (
                      <span role="cell" key={field.key}>
                        {cleanNumber(food[field.key])}
                        {field.unit}
                      </span>
                    ))}
                    <div className="row-actions" role="cell">
                      <button
                        className="mini-button"
                        type="button"
                        onClick={() => addEntry(food)}
                      >
                        Log
                      </button>
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={`Delete ${food.name}`}
                        title={`Delete ${food.name}`}
                        onClick={() => removeFood(food.id)}
                      >
                        x
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
        </section>
      )}

      {activeTab === "week" && (
        <section className="tab-panel" aria-labelledby="weekly-title">
          <div className="section-intro">
            <div>
              <p className="eyebrow">Last 7 days</p>
              <h2 id="weekly-title">Weekly Totals</h2>
            </div>
          </div>

          <section className="totals-strip" aria-label="Weekly totals">
            {MACRO_FIELDS.map((field) => (
              <article className="total-tile" key={field.key}>
                <div className="metric-label">{field.label}</div>
                <strong>
                  {cleanNumber(weeklyTotals[field.key])}
                  {field.unit && <span>{field.unit}</span>}
                </strong>
                <small>Last seven selected days</small>
              </article>
            ))}
          </section>

          <section className="panel weekly-panel">
            <div className="week-table" role="table" aria-label="Weekly macro totals">
              {weeklyRows.map((row) => (
                <article className="week-row" role="row" key={row.date}>
                  <strong role="cell">{readableDate(row.date)}</strong>
                  <span role="cell">{cleanNumber(row.totals.calories)} cal</span>
                  <span role="cell">{cleanNumber(row.totals.protein)}g pro</span>
                  <span role="cell">{cleanNumber(row.totals.carbs)}g carb</span>
                  <span role="cell">{cleanNumber(row.totals.fat)}g fat</span>
                </article>
              ))}

              <article className="week-row total" role="row">
                <strong role="cell">Total</strong>
                <span role="cell">{cleanNumber(weeklyTotals.calories)} cal</span>
                <span role="cell">{cleanNumber(weeklyTotals.protein)}g pro</span>
                <span role="cell">{cleanNumber(weeklyTotals.carbs)}g carb</span>
                <span role="cell">{cleanNumber(weeklyTotals.fat)}g fat</span>
              </article>
            </div>
          </section>
        </section>
      )}

      {activeTab === "targets" && (
        <section className="tab-panel" aria-labelledby="targets-title">
          <div className="section-intro">
            <div>
              <p className="eyebrow">Daily goals</p>
              <h2 id="targets-title">Targets</h2>
            </div>
          </div>

          <section className="panel targets-panel">
            <div className="target-grid">
              {MACRO_FIELDS.map((field) => (
                <label className="field" key={field.key}>
                  <span>{field.label}</span>
                  <input
                    min="0"
                    step="1"
                    type="number"
                    value={targets[field.key] || ""}
                    onChange={(event) => updateTarget(field.key, event.target.value)}
                  />
                </label>
              ))}
            </div>
          </section>
        </section>
      )}
    </main>
  );
}
