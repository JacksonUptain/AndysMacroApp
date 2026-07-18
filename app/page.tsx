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
  { key: "today", label: "Today", summary: "Quick log" },
  { key: "foods", label: "Foods", summary: "Build library" },
  { key: "week", label: "Week", summary: "Review" },
  { key: "targets", label: "Targets", summary: "Goals" },
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
  const [quickQuery, setQuickQuery] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
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

  const foodRankById = useMemo(() => {
    const ranks = new Map<string, number>();
    entries.forEach((entry, index) => {
      if (!ranks.has(entry.foodId)) {
        ranks.set(entry.foodId, index);
      }
    });
    return ranks;
  }, [entries]);

  const quickFoods = useMemo(() => {
    const query = quickQuery.trim().toLowerCase();
    const rankedFoods = [...foods].sort((first, second) => {
      const firstRank = foodRankById.get(first.id) ?? Number.MAX_SAFE_INTEGER;
      const secondRank = foodRankById.get(second.id) ?? Number.MAX_SAFE_INTEGER;

      if (firstRank !== secondRank) {
        return firstRank - secondRank;
      }

      return foods.indexOf(first) - foods.indexOf(second);
    });

    if (!query) {
      return rankedFoods.slice(0, 8);
    }

    return rankedFoods.filter((food) => food.name.toLowerCase().includes(query));
  }, [foodRankById, foods, quickQuery]);

  const libraryFoods = useMemo(() => {
    const query = libraryQuery.trim().toLowerCase();
    const sortedFoods = [...foods].sort((first, second) =>
      first.name.localeCompare(second.name),
    );

    if (!query) {
      return sortedFoods;
    }

    return sortedFoods.filter((food) => food.name.toLowerCase().includes(query));
  }, [libraryQuery, foods]);

  const dailyEntryCountLabel =
    dailyEntries.length === 1 ? "1 food logged" : `${dailyEntries.length} foods logged`;
  const calorieTarget = targets.calories;
  const calorieProgress =
    calorieTarget > 0 ? Math.min((dailyTotals.calories / calorieTarget) * 100, 100) : 0;

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
    setActiveTab("today");
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

    const existingFood = foods.find(
      (food) => food.name.trim().toLowerCase() === name.toLowerCase(),
    );

    if (existingFood && logImmediately) {
      setFoodForm({ ...DEFAULT_FORM });
      setQuickQuery("");
      setLibraryQuery("");
      setFormError("");
      addEntry(existingFood, 1, `${existingFood.name} was already saved, so I logged it.`);
      setActiveTab("today");
      return;
    }

    if (existingFood) {
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
    setQuickQuery("");
    setLibraryQuery("");
    setFormError("");

    if (logImmediately) {
      addEntry(food, 1, `${food.name} saved and logged for ${readableDate(selectedDate)}.`);
      setActiveTab("today");
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
  }

  function handleTargetsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    showNotice("Targets saved.");
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            AM
          </div>
          <div>
            <p className="kicker">Fast macro logging</p>
            <h1>Andy&apos;s Macro Counter</h1>
          </div>
        </div>

        <div className="date-actions">
          <label className="date-picker" htmlFor="selected-date">
            <span>Day</span>
            <input
              id="selected-date"
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </label>
          <button
            className="ghost-button today-button"
            type="button"
            disabled={selectedDate === todayIso()}
            onClick={() => setSelectedDate(todayIso())}
          >
            Today
          </button>
        </div>
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
          <section className="today-hero" aria-labelledby="today-title">
            <div className="hero-copy">
              <p className="eyebrow">Today</p>
              <h2 id="today-title">{readableDate(selectedDate)}</h2>
              <span className="logged-badge">{dailyEntryCountLabel}</span>
            </div>

            <div className="calorie-focus">
              <span>Calories</span>
              <strong>{cleanNumber(dailyTotals.calories)}</strong>
              <small>
                {calorieTarget > 0
                  ? `${cleanNumber(totalRemaining(dailyTotals.calories, calorieTarget))} left`
                  : "No target set"}
              </small>
              <div className="progress-track" aria-hidden="true">
                <div style={{ width: `${calorieProgress}%` }} />
              </div>
            </div>

            <button
              className="ghost-button"
              type="button"
              onClick={clearDay}
              disabled={dailyEntries.length === 0}
            >
              Clear Day
            </button>
          </section>

          <section className="macro-snapshot" aria-label="Daily macro totals">
            {MACRO_FIELDS.filter((field) => field.key !== "calories").map((field) => {
              const target = targets[field.key];
              const total = dailyTotals[field.key];
              const progress = target > 0 ? Math.min((total / target) * 100, 100) : 0;

              return (
                <article className={`macro-stat macro-${field.key}`} key={field.key}>
                  <div>
                    <span>{field.label}</span>
                    <strong>
                      {cleanNumber(total)}
                      {field.unit}
                    </strong>
                  </div>
                  <small>
                    {target > 0
                      ? `${cleanNumber(totalRemaining(total, target))}${field.unit} left`
                      : "No target"}
                  </small>
                  <div className="progress-track" aria-hidden="true">
                    <div style={{ width: `${progress}%` }} />
                  </div>
                </article>
              );
            })}
          </section>

          <div className="today-grid">
            <section className="panel quick-add-panel" aria-labelledby="quick-add-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">One tap</p>
                  <h2 id="quick-add-title">Quick Add</h2>
                </div>

                <label className="search-field" htmlFor="quick-food-search">
                  <span>Search</span>
                  <input
                    id="quick-food-search"
                    type="search"
                    value={quickQuery}
                    placeholder="Search foods"
                    onChange={(event) => setQuickQuery(event.target.value)}
                  />
                </label>
              </div>

              <div className="quick-food-grid">
                {quickFoods.length === 0 ? (
                  <div className="empty-state action-empty">
                    <span>No saved foods match that search.</span>
                    <button
                      className="secondary-button"
                      type="button"
                      onClick={() => {
                        setActiveTab("foods");
                        setQuickQuery("");
                      }}
                    >
                      New Food
                    </button>
                  </div>
                ) : (
                  quickFoods.map((food, index) => (
                    <article className={`quick-card food-tone-${index % 4}`} key={food.id}>
                      <div>
                        <strong>{food.name}</strong>
                        <span>
                          {cleanNumber(food.calories)} cal | {cleanNumber(food.protein)}g
                          pro
                        </span>
                      </div>
                      <button
                        className="log-button"
                        type="button"
                        aria-label={`Log ${food.name}`}
                        onClick={() => addEntry(food)}
                      >
                        Log
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
                  <p className="empty-state">Nothing logged for this day yet.</p>
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
                          <div className={`macro-pill macro-${field.key}`} key={field.key}>
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
                        placeholder={
                          field.key === "calories"
                            ? "110"
                            : field.key === "protein"
                              ? "15"
                              : field.key === "carbs"
                                ? "13"
                                : "0"
                        }
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
                    Save + Log Today
                  </button>
                </div>
              </form>
            </section>

            <section className="panel" aria-labelledby="saved-foods-title">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">Saved</p>
                  <h2 id="saved-foods-title">{foods.length} Foods</h2>
                </div>

                <label className="search-field" htmlFor="library-food-search">
                  <span>Search</span>
                  <input
                    id="library-food-search"
                    type="search"
                    value={libraryQuery}
                    placeholder="Find a food"
                    onChange={(event) => setLibraryQuery(event.target.value)}
                  />
                </label>
              </div>

              <div className="food-table" role="table" aria-label="Saved foods">
                <div className="food-table-head" role="row">
                  <span role="columnheader">Food</span>
                  {MACRO_FIELDS.map((field) => (
                    <span key={field.key} role="columnheader">
                      {field.shortLabel}
                    </span>
                  ))}
                  <span role="columnheader">Action</span>
                </div>

                {libraryFoods.length === 0 ? (
                  <p className="empty-state">No saved foods match that search.</p>
                ) : (
                  libraryFoods.map((food) => (
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
                  ))
                )}
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
              <article className={`total-tile macro-${field.key}`} key={field.key}>
                <div className="metric-label">{field.label}</div>
                <strong>
                  {cleanNumber(weeklyTotals[field.key])}
                  {field.unit && <span>{field.unit}</span>}
                </strong>
                <small>7-day total</small>
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

          <form className="panel targets-panel" onSubmit={handleTargetsSubmit}>
            <div className="target-grid">
              {MACRO_FIELDS.map((field) => (
                <label className={`field target-field macro-${field.key}`} key={field.key}>
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
            <div className="form-actions single-action">
              <button className="primary-button" type="submit">
                Save Targets
              </button>
            </div>
          </form>
        </section>
      )}
    </main>
  );
}
