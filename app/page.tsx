"use client";

import type { FormEvent } from "react";
import type { User } from "firebase/auth";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "firebase/auth";
import { onValue, ref, set } from "firebase/database";
import { useEffect, useMemo, useState } from "react";
import {
  firebaseAuth,
  firebaseDatabase,
  googleAuthProvider,
  initializeFirebaseAnalytics,
} from "./firebase";

type MacroKey = "calories" | "carbs" | "fat" | "protein";
type TabKey = "stats" | "add";
type PeriodKey = "day" | "week" | "month";
type NoticeTone = "success" | "error";
type SyncState = "checking" | "signedOut" | "loading" | "saving" | "saved" | "error";

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

type MacroState = {
  foods: Food[];
  entries: LogEntry[];
};

type RemoteMacroState = {
  needsRepair: boolean;
  state: MacroState;
};

const TABS: Array<{ key: TabKey; label: string }> = [
  { key: "add", label: "Add" },
  { key: "stats", label: "Stats" },
];

const PERIODS: Array<{ key: PeriodKey; label: string }> = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
  { key: "month", label: "Month" },
];

const MACRO_FIELDS: Array<{
  key: MacroKey;
  label: string;
  shortLabel: string;
  unit: string;
}> = [
  { key: "calories", label: "Calories", shortLabel: "Cal", unit: "" },
  { key: "protein", label: "Protein", shortLabel: "Protein", unit: "g" },
  { key: "carbs", label: "Carbs", shortLabel: "Carbs", unit: "g" },
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

function defaultMacroState(): MacroState {
  return {
    foods: DEFAULT_FOODS,
    entries: [],
  };
}

function serializeMacroState(state: MacroState) {
  return {
    ...state,
    updatedAt: new Date().toISOString(),
  };
}

function todayIso() {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 10);
}

function isoFromDate(date: Date) {
  const localDate = new Date(date);
  localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset());
  return localDate.toISOString().slice(0, 10);
}

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  return Number.isFinite(parseIsoDate(value).getTime());
}

function normalizeIsoDate(value: string) {
  return isIsoDate(value) ? value : todayIso();
}

function parseIsoDate(isoDate: string) {
  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function readableDate(isoDate: string) {
  return new Intl.DateTimeFormat("en", {
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(parseIsoDate(isoDate));
}

function monthLabel(isoDate: string) {
  return new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
  }).format(parseIsoDate(isoDate));
}

function periodDates(period: PeriodKey, isoDate: string) {
  if (period === "day") {
    return [isoDate];
  }

  const baseDate = parseIsoDate(isoDate);

  if (period === "week") {
    const weekStart = new Date(baseDate);
    weekStart.setDate(baseDate.getDate() - baseDate.getDay());
    return Array.from({ length: 7 }, (_, index) => {
      const date = new Date(weekStart);
      date.setDate(weekStart.getDate() + index);
      return isoFromDate(date);
    });
  }

  const firstDay = new Date(baseDate.getFullYear(), baseDate.getMonth(), 1);
  const lastDay = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, 0);
  const dayCount = lastDay.getDate();

  return Array.from({ length: dayCount }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(index + 1);
    return isoFromDate(date);
  });
}

function periodLabel(period: PeriodKey, isoDate: string) {
  if (period === "day") {
    return readableDate(isoDate);
  }

  if (period === "month") {
    return monthLabel(isoDate);
  }

  const days = periodDates("week", isoDate);
  return `${readableDate(days[0])} - ${readableDate(days[days.length - 1])}`;
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

function macroLine(values: MacroValues) {
  return `${cleanNumber(values.calories)} cal, ${cleanNumber(values.protein)}g protein, ${cleanNumber(values.carbs)}g carbs, ${cleanNumber(values.fat)}g fat`;
}

function makeLogEntry(food: Food, date: string): LogEntry {
  const entryDate = normalizeIsoDate(date);

  return {
    id: makeId("entry"),
    foodId: food.id,
    foodName: food.name,
    date: entryDate,
    servings: 1,
    calories: food.calories,
    carbs: food.carbs,
    fat: food.fat,
    protein: food.protein,
  };
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

function normalizeLogEntry(value: unknown): LogEntry | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const { id, foodId, foodName, date, servings, calories, carbs, fat, protein } =
    value as Partial<LogEntry>;
  if (
    typeof id !== "string" ||
    typeof foodName !== "string" ||
    typeof date !== "string" ||
    typeof servings !== "number" ||
    typeof calories !== "number" ||
    typeof carbs !== "number" ||
    typeof fat !== "number" ||
    typeof protein !== "number"
  ) {
    return null;
  }

  return {
    id,
    foodId:
      typeof foodId === "string" && foodId
        ? foodId
        : `legacy-${foodName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
    foodName,
    date: normalizeIsoDate(date),
    servings: normalizeServings(servings),
    calories,
    carbs,
    fat,
    protein,
  };
}

function firebaseListValues(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter(Boolean);
  }

  if (value && typeof value === "object") {
    return Object.values(value);
  }

  return null;
}

function normalizeMacroState(value: unknown): RemoteMacroState | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const state = value as Partial<Record<keyof MacroState, unknown>>;
  const foodValues = firebaseListValues(state.foods);
  const entryValues = firebaseListValues(state.entries);
  const foods = foodValues?.filter(isFood) ?? [];
  const entries = entryValues?.map(normalizeLogEntry).filter((entry) => entry !== null) ?? [];

  const hasCleanShape =
    Array.isArray(state.foods) &&
    Array.isArray(state.entries) &&
    foodValues?.length === foods.length &&
    entryValues?.length === entries.length &&
    foods.length > 0;

  return {
    needsRepair: !hasCleanShape,
    state: {
      foods: foods.length > 0 ? foods : DEFAULT_FOODS,
      entries,
    },
  };
}

function userMacroStatePath(uid: string) {
  return `users/${uid}/macroState`;
}

function shouldUseRedirectSignIn() {
  if (typeof window === "undefined") {
    return false;
  }

  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    /Android|iPhone|iPad|iPod/i.test(window.navigator.userAgent)
  );
}

function shouldRetryWithRedirect(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) {
    return false;
  }

  const code = String((error as { code?: unknown }).code);
  return (
    code === "auth/popup-blocked" ||
    code === "auth/cancelled-popup-request" ||
    code === "auth/operation-not-supported-in-this-environment"
  );
}

function userInitials(user: User) {
  const name = user.displayName ?? user.email ?? "Signed in";
  const parts = name.split(/[\s@._-]+/).filter(Boolean);
  return (
    parts
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "A"
  );
}

export default function Home() {
  const [foods, setFoods] = useState<Food[]>([]);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<TabKey>("add");
  const [period, setPeriod] = useState<PeriodKey>("day");
  const [statsDate, setStatsDate] = useState("");
  const [addDate, setAddDate] = useState("");
  const [foodForm, setFoodForm] = useState<FoodForm>({ ...DEFAULT_FORM });
  const [foodQuery, setFoodQuery] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [datesReady, setDatesReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authAction, setAuthAction] = useState(false);
  const [remoteReady, setRemoteReady] = useState(false);
  const [syncState, setSyncState] = useState<SyncState>("checking");
  const [syncError, setSyncError] = useState("");

  useEffect(() => {
    void initializeFirebaseAnalytics();

    window.queueMicrotask(() => {
      const initialDate = todayIso();
      setStatsDate(initialDate);
      setAddDate(initialDate);
      setDatesReady(true);
    });

    const unsubscribe = onAuthStateChanged(firebaseAuth, (currentUser) => {
      setUser(currentUser);
      setAuthReady(true);
      setRemoteReady(false);
      setSyncError("");
      setSyncState(currentUser ? "loading" : "signedOut");

      if (!currentUser) {
        setFoods([]);
        setEntries([]);
      }
    });

    void getRedirectResult(firebaseAuth).catch(() => {
      setNotice({
        message: "Google sign-in could not finish. Try again.",
        tone: "error",
      });
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!user) {
      return;
    }

    const userStateRef = ref(firebaseDatabase, userMacroStatePath(user.uid));
    return onValue(
      userStateRef,
      (snapshot) => {
        if (!snapshot.exists()) {
          const initialState = defaultMacroState();
          setFoods(initialState.foods);
          setEntries(initialState.entries);
          setSyncState("saving");
          void set(userStateRef, serializeMacroState(initialState))
            .then(() => {
              setSyncError("");
              setRemoteReady(true);
              setSyncState("saved");
            })
            .catch((error: unknown) => {
              setRemoteReady(false);
              setSyncError(error instanceof Error ? error.message : "Save failed.");
              setSyncState("error");
              setNotice({
                message: "Could not create your account data.",
                tone: "error",
              });
            });
          return;
        }

        const remoteMacroState = normalizeMacroState(snapshot.val());
        if (!remoteMacroState) {
          setRemoteReady(false);
          setSyncError("Your account data could not be read.");
          setSyncState("error");
          setNotice({
            message: "Could not load your saved account data.",
            tone: "error",
          });
          return;
        }

        setFoods(remoteMacroState.state.foods);
        setEntries(remoteMacroState.state.entries);
        setSyncError("");

        if (remoteMacroState.needsRepair) {
          setRemoteReady(false);
          setSyncState("saving");
          void set(userStateRef, serializeMacroState(remoteMacroState.state))
            .then(() => {
              setRemoteReady(true);
              setSyncState("saved");
            })
            .catch((error: unknown) => {
              setRemoteReady(false);
              setSyncError(error instanceof Error ? error.message : "Save failed.");
              setSyncState("error");
              setNotice({
                message: "Could not repair your account data.",
                tone: "error",
              });
            });
          return;
        }

        setRemoteReady(true);
        setSyncState("saved");
      },
      (error) => {
        setRemoteReady(false);
        setSyncError(error.message);
        setSyncState("error");
        setNotice({
          message: "Could not load your saved account data.",
          tone: "error",
        });
      },
    );
  }, [user]);

  useEffect(() => {
    if (!notice) {
      return;
    }

    const timer = window.setTimeout(() => setNotice(null), 2800);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const addDateEntries = useMemo(
    () => entries.filter((entry) => entry.date === addDate),
    [entries, addDate],
  );

  const periodDateList = useMemo(
    () => periodDates(period, statsDate),
    [period, statsDate],
  );

  const periodDateSet = useMemo(() => new Set(periodDateList), [periodDateList]);

  const periodEntries = useMemo(
    () => entries.filter((entry) => periodDateSet.has(entry.date)),
    [entries, periodDateSet],
  );

  const periodTotals = useMemo(() => macroTotal(periodEntries), [periodEntries]);

  const dailyBreakdown = useMemo(
    () =>
      periodDateList.map((date) => {
        const dayEntries = entries.filter((entry) => entry.date === date);
        return {
          date,
          entryCount: dayEntries.length,
          totals: macroTotal(dayEntries),
        };
      }),
    [entries, periodDateList],
  );

  const topFoods = useMemo(() => {
    const foodTotals = new Map<string, MacroValues & { servings: number }>();

    periodEntries.forEach((entry) => {
      const current = foodTotals.get(entry.foodName) ?? {
        ...EMPTY_MACROS,
        servings: 0,
      };

      foodTotals.set(entry.foodName, {
        calories: current.calories + entry.calories * entry.servings,
        carbs: current.carbs + entry.carbs * entry.servings,
        fat: current.fat + entry.fat * entry.servings,
        protein: current.protein + entry.protein * entry.servings,
        servings: current.servings + entry.servings,
      });
    });

    return Array.from(foodTotals.entries())
      .map(([name, totals]) => ({ name, ...totals }))
      .sort((first, second) => second.calories - first.calories)
      .slice(0, 5);
  }, [periodEntries]);

  const foodRankById = useMemo(() => {
    const ranks = new Map<string, number>();
    entries.forEach((entry, index) => {
      if (!ranks.has(entry.foodId)) {
        ranks.set(entry.foodId, index);
      }
    });
    return ranks;
  }, [entries]);

  const savedFoodOptions = useMemo(() => {
    const query = foodQuery.trim().toLowerCase();
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
  }, [foodQuery, foodRankById, foods]);

  const addDateEntryCountLabel =
    addDateEntries.length === 1
      ? "1 item logged"
      : `${addDateEntries.length} items logged`;

  const periodEntryCountLabel =
    periodEntries.length === 1
      ? "1 item"
      : `${periodEntries.length} items`;

  const visibleDailyBreakdown =
    period === "month"
      ? dailyBreakdown.filter((row) => row.entryCount > 0)
      : dailyBreakdown;

  const syncStatusLabel = useMemo(() => {
    if (!authReady || syncState === "checking") {
      return "Opening";
    }

    if (!user) {
      return "Sign in required";
    }

    if (syncState === "loading") {
      return "Loading";
    }

    if (syncState === "saving") {
      return "Saving";
    }

    if (syncState === "error") {
      return "Needs attention";
    }

    return "Saved";
  }, [authReady, syncState, user]);

  const accountName = user?.displayName ?? user?.email ?? "Account required";

  function showNotice(message: string, tone: NoticeTone = "success") {
    setNotice({ message, tone });
  }

  function saveMacroState(nextState: MacroState, successMessage?: string) {
    if (!user || !remoteReady) {
      showNotice("Sign in to save changes.", "error");
      return;
    }

    setFoods(nextState.foods);
    setEntries(nextState.entries);
    setSyncState("saving");
    setSyncError("");

    void set(
      ref(firebaseDatabase, userMacroStatePath(user.uid)),
      serializeMacroState(nextState),
    )
      .then(() => {
        setSyncError("");
        setSyncState("saved");

        if (successMessage) {
          showNotice(successMessage);
        }
      })
      .catch((error: unknown) => {
        setSyncError(error instanceof Error ? error.message : "Save failed.");
        setSyncState("error");
        setNotice({
          message: "Could not save your latest changes.",
          tone: "error",
        });
      });
  }

  async function signInWithGoogle() {
    setAuthAction(true);

    try {
      if (shouldUseRedirectSignIn()) {
        await signInWithRedirect(firebaseAuth, googleAuthProvider);
        return;
      }

      await signInWithPopup(firebaseAuth, googleAuthProvider);
    } catch (error) {
      if (shouldRetryWithRedirect(error)) {
        await signInWithRedirect(firebaseAuth, googleAuthProvider);
        return;
      }

      showNotice("Google sign-in could not start.", "error");
    } finally {
      setAuthAction(false);
    }
  }

  async function handleSignOut() {
    setAuthAction(true);

    try {
      await signOut(firebaseAuth);
      showNotice("Signed out.");
    } catch {
      showNotice("Could not sign out.", "error");
    } finally {
      setAuthAction(false);
    }
  }

  function logFood(food: Food, date = addDate, message?: string) {
    const entry = makeLogEntry(food, date);
    const entryDate = entry.date;
    const nextState = {
      foods,
      entries: [entry, ...entries],
    };

    setStatsDate(entryDate);
    saveMacroState(
      nextState,
      message ?? `${food.name} added to ${readableDate(entryDate)}.`,
    );
  }

  function createFood(logAfterSave: boolean) {
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

    if (existingFood) {
      if (logAfterSave) {
        const entry = makeLogEntry(existingFood, addDate);
        setFoodForm({ ...DEFAULT_FORM });
        setFoodQuery("");
        setStatsDate(entry.date);
        saveMacroState(
          {
            foods,
            entries: [entry, ...entries],
          },
          `${existingFood.name} was already saved, so it was added to ${readableDate(addDate)}.`,
        );
        return;
      }

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

    const nextFoods = [food, ...foods];
    const newEntry = logAfterSave ? makeLogEntry(food, addDate) : null;
    const nextEntries = newEntry ? [newEntry, ...entries] : entries;

    setFoodForm({ ...DEFAULT_FORM });
    setFoodQuery("");
    setFormError("");

    if (newEntry) {
      setStatsDate(newEntry.date);
      saveMacroState(
        {
          foods: nextFoods,
          entries: nextEntries,
        },
        `${food.name} saved and added to ${readableDate(addDate)}.`,
      );
      return;
    }

    saveMacroState(
      {
        foods: nextFoods,
        entries: nextEntries,
      },
      `${food.name} saved.`,
    );
  }

  function handleFoodSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createFood(true);
  }

  function updateFoodForm(key: keyof FoodForm, value: string) {
    setFoodForm((currentForm) => ({
      ...currentForm,
      [key]: value,
    }));
  }

  function updateEntryServings(entryId: string, nextValue: number) {
    saveMacroState({
      foods,
      entries: entries.map((entry) =>
        entry.id === entryId
          ? { ...entry, servings: normalizeServings(nextValue) }
          : entry,
      ),
    });
  }

  function removeEntry(entryId: string) {
    saveMacroState(
      {
        foods,
        entries: entries.filter((entry) => entry.id !== entryId),
      },
      "Item removed.",
    );
  }

  function clearStatsDay() {
    if (period !== "day" || periodEntries.length === 0) {
      return;
    }

    const shouldClear = window.confirm(`Clear all items for ${readableDate(statsDate)}?`);
    if (!shouldClear) {
      return;
    }

    saveMacroState(
      {
        foods,
        entries: entries.filter((entry) => entry.date !== statsDate),
      },
      `${readableDate(statsDate)} cleared.`,
    );
  }

  if (!datesReady || !authReady || !user || !remoteReady || syncState === "error") {
    const gateTitle = !datesReady || !authReady
      ? "Checking sign-in"
      : !user
        ? "Sign in to continue"
        : syncState === "error"
          ? "Account data needs attention"
          : "Loading your macro counter";
    const gateCopy = !datesReady || !authReady
      ? "One moment while your account status is checked."
      : !user
        ? "Use Google to open your food list, logs, and stats."
        : syncState === "error"
          ? "Try reloading, or sign out and sign in again."
          : "Your food list, logs, and stats are opening now.";

    return (
      <main className="app-shell auth-shell">
        <section className="auth-gate" aria-labelledby="auth-title">
          <div className="brand-lockup">
            <div className="brand-mark" aria-hidden="true">
              AM
            </div>
            <div>
              <p className="kicker">Personal macro tracker</p>
              <h1>Andy&apos;s Macro Counter</h1>
            </div>
          </div>

          <div className="auth-copy">
            <p className="eyebrow">{syncStatusLabel}</p>
            <h2 id="auth-title">{gateTitle}</h2>
            <p className="support-text">{gateCopy}</p>
            {syncError && <p className="error-detail">{syncError}</p>}
          </div>

          {!user ? (
            <button
              className="primary-button auth-button"
              type="button"
              disabled={!authReady || authAction}
              onClick={signInWithGoogle}
            >
              Sign in with Google
            </button>
          ) : (
            <div className="auth-actions">
              <button
                className="primary-button auth-button"
                type="button"
                onClick={() => window.location.reload()}
              >
                Try again
              </button>
              <button
                className="secondary-button auth-button"
                type="button"
                disabled={authAction}
                onClick={handleSignOut}
              >
                Sign out
              </button>
            </div>
          )}
        </section>

        <div
          className={`status-toast${notice ? " visible" : ""}${
            notice?.tone === "error" ? " error" : ""
          }`}
          role="status"
          aria-live="polite"
        >
          {notice?.message}
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="app-header">
        <div className="brand-lockup">
          <div className="brand-mark" aria-hidden="true">
            AM
          </div>
          <div>
            <p className="kicker">Personal macro tracker</p>
            <h1>Andy&apos;s Macro Counter</h1>
          </div>
        </div>

        <div className="account-panel" title={syncError || syncStatusLabel}>
          <div className="account-avatar" aria-hidden="true">
            {userInitials(user)}
          </div>
          <div className="account-copy">
            <span>{syncStatusLabel}</span>
            <strong>{accountName}</strong>
          </div>
          <button
            className="secondary-button account-button"
            type="button"
            disabled={authAction}
            onClick={handleSignOut}
          >
            Sign out
          </button>
        </div>
      </header>

      <nav className="tab-bar" aria-label="Macro counter tabs">
        {TABS.map((tab) => (
          <button
            aria-current={activeTab === tab.key ? "page" : undefined}
            className="tab-button"
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
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

      {activeTab === "add" && (
        <section className="tab-panel" aria-labelledby="add-title">
          <section className="page-topper add-topper">
            <div>
              <p className="eyebrow">Log food</p>
              <h2 id="add-title">Add Item</h2>
              <p className="support-text">
                Pick a saved food, or create it once and use it every day.
              </p>
            </div>

            <div className="date-card">
              <label className="date-picker" htmlFor="add-date">
                <span>Date</span>
                <input
                  id="add-date"
                  type="date"
                  value={addDate}
                  onChange={(event) => setAddDate(normalizeIsoDate(event.target.value))}
                />
              </label>
              <button
                className="secondary-button"
                type="button"
                disabled={addDate === todayIso()}
                onClick={() => setAddDate(todayIso())}
              >
                Today
              </button>
              <span className="count-badge">{addDateEntryCountLabel}</span>
            </div>
          </section>

          <section className="add-layout">
            <div className="flow-section saved-foods-section">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">Saved foods</p>
                  <h3>Tap Add and move on</h3>
                </div>
                <label className="search-field" htmlFor="food-search">
                  <span>Search</span>
                  <input
                    id="food-search"
                    type="search"
                    value={foodQuery}
                    placeholder="Siggis, eggs, rice..."
                    onChange={(event) => setFoodQuery(event.target.value)}
                  />
                </label>
              </div>

              {savedFoodOptions.length > 0 ? (
                <div className="food-option-list">
                  {savedFoodOptions.map((food, index) => (
                    <article
                      className={`food-option food-tone-${index % 4}`}
                      key={food.id}
                    >
                      <div className="food-option-copy">
                        <strong>{food.name}</strong>
                        <span>{macroLine(food)}</span>
                      </div>
                      <button
                        className="primary-button"
                        type="button"
                        onClick={() => logFood(food)}
                      >
                        Add
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No saved food found.</strong>
                  <span>Create it below once, then it will show up here.</span>
                </div>
              )}
            </div>

            <aside className="side-stack" aria-label="Add item tools">
              <form className="flow-section food-form" onSubmit={handleFoodSubmit}>
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">New food</p>
                    <h3>Save once</h3>
                  </div>
                </div>

                <label className="field" htmlFor="food-name">
                  <span>Food name</span>
                  <input
                    id="food-name"
                    value={foodForm.name}
                    placeholder="Siggis Yogurt"
                    onChange={(event) => updateFoodForm("name", event.target.value)}
                  />
                </label>

                <div className="macro-input-grid">
                  {MACRO_FIELDS.map((field) => (
                    <label className="field" htmlFor={`food-${field.key}`} key={field.key}>
                      <span>{field.label}</span>
                      <input
                        id={`food-${field.key}`}
                        inputMode="decimal"
                        min="0"
                        step="0.1"
                        type="number"
                        value={foodForm[field.key]}
                        placeholder="0"
                        onChange={(event) =>
                          updateFoodForm(field.key, event.target.value)
                        }
                      />
                    </label>
                  ))}
                </div>

                {formError && <p className="form-error">{formError}</p>}

                <div className="button-row">
                  <button className="primary-button" type="submit">
                    Save + Add
                  </button>
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => createFood(false)}
                  >
                    Save Only
                  </button>
                </div>
              </form>

              <section className="flow-section compact-list" aria-labelledby="logged-title">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">{readableDate(addDate)}</p>
                    <h3 id="logged-title">Added to This Date</h3>
                  </div>
                </div>

                {addDateEntries.length > 0 ? (
                  <div className="mini-entry-list">
                    {addDateEntries.slice(0, 5).map((entry) => (
                      <div className="mini-entry-row" key={entry.id}>
                        <div>
                          <strong>{entry.foodName}</strong>
                          <span>
                            {cleanNumber(entry.calories * entry.servings)} cal
                          </span>
                        </div>
                        <button
                          className="text-button danger"
                          type="button"
                          onClick={() => removeEntry(entry.id)}
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state small">
                    <strong>Nothing logged yet.</strong>
                    <span>Add from saved foods to start the day.</span>
                  </div>
                )}
              </section>
            </aside>
          </section>
        </section>
      )}

      {activeTab === "stats" && (
        <section className="tab-panel" aria-labelledby="stats-title">
          <section className="page-topper stats-topper">
            <div>
              <p className="eyebrow">Review</p>
              <h2 id="stats-title">Stats</h2>
              <p className="support-text">
                {periodLabel(period, statsDate)} - {periodEntryCountLabel} logged.
              </p>
            </div>

            <div className="stats-controls">
              <div className="period-control" aria-label="Stats period">
                {PERIODS.map((item) => (
                  <button
                    aria-pressed={period === item.key}
                    key={item.key}
                    type="button"
                    onClick={() => setPeriod(item.key)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>

              <label className="date-picker" htmlFor="stats-date">
                <span>Date</span>
                <input
                  id="stats-date"
                  type="date"
                  value={statsDate}
                  onChange={(event) => setStatsDate(normalizeIsoDate(event.target.value))}
                />
              </label>
            </div>
          </section>

          <section className="macro-snapshot" aria-label="Macro totals">
            {MACRO_FIELDS.map((field) => (
              <article className={`macro-tile macro-${field.key}`} key={field.key}>
                <span>{field.label}</span>
                <strong>
                  {cleanNumber(periodTotals[field.key])}
                  {field.unit && <small>{field.unit}</small>}
                </strong>
              </article>
            ))}
          </section>

          {period === "day" ? (
            <section className="flow-section" aria-labelledby="day-foods-title">
              <div className="section-heading">
                <div>
                  <p className="eyebrow">{readableDate(statsDate)}</p>
                  <h3 id="day-foods-title">Logged Items</h3>
                </div>
                <button
                  className="secondary-button"
                  type="button"
                  disabled={periodEntries.length === 0}
                  onClick={clearStatsDay}
                >
                  Clear Day
                </button>
              </div>

              {periodEntries.length > 0 ? (
                <div className="entry-list">
                  {periodEntries.map((entry) => (
                    <article className="entry-row" key={entry.id}>
                      <div className="entry-food">
                        <strong>{entry.foodName}</strong>
                        <span>{macroLine(entry)}</span>
                      </div>

                      <div className="serving-control" aria-label={`${entry.foodName} servings`}>
                        <button
                          type="button"
                          onClick={() =>
                            updateEntryServings(entry.id, entry.servings - 0.25)
                          }
                        >
                          -
                        </button>
                        <input
                          aria-label="Servings"
                          inputMode="decimal"
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
                          onClick={() =>
                            updateEntryServings(entry.id, entry.servings + 0.25)
                          }
                        >
                          +
                        </button>
                      </div>

                      <dl className="entry-macros">
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
                        className="text-button danger"
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                      >
                        Remove
                      </button>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state">
                  <strong>No items logged for this day.</strong>
                  <span>Use the Add tab to log a saved food in seconds.</span>
                </div>
              )}
            </section>
          ) : (
            <section className="stats-grid">
              <section className="flow-section" aria-labelledby="breakdown-title">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">{periodLabel(period, statsDate)}</p>
                    <h3 id="breakdown-title">Daily Breakdown</h3>
                  </div>
                </div>

                {visibleDailyBreakdown.length > 0 ? (
                  <div className="breakdown-list">
                    {visibleDailyBreakdown.map((row) => (
                      <article className="breakdown-row" key={row.date}>
                        <div>
                          <strong>{readableDate(row.date)}</strong>
                          <span>
                            {row.entryCount === 1
                              ? "1 item"
                              : `${row.entryCount} items`}
                          </span>
                        </div>
                        <dl>
                          {MACRO_FIELDS.map((field) => (
                            <div key={field.key}>
                              <dt>{field.shortLabel}</dt>
                              <dd>
                                {cleanNumber(row.totals[field.key])}
                                {field.unit}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state">
                    <strong>No logged days in this month.</strong>
                    <span>Add foods for any date and they will appear here.</span>
                  </div>
                )}
              </section>

              <section className="flow-section" aria-labelledby="top-foods-title">
                <div className="section-heading compact">
                  <div>
                    <p className="eyebrow">Most calories</p>
                    <h3 id="top-foods-title">Top Foods</h3>
                  </div>
                </div>

                {topFoods.length > 0 ? (
                  <div className="top-food-list">
                    {topFoods.map((food) => (
                      <article className="top-food-row" key={food.name}>
                        <div>
                          <strong>{food.name}</strong>
                          <span>{cleanNumber(food.servings)} servings</span>
                        </div>
                        <b>{cleanNumber(food.calories)} cal</b>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-state small">
                    <strong>No top foods yet.</strong>
                    <span>Log items in this period to see what shows up most.</span>
                  </div>
                )}
              </section>
            </section>
          )}
        </section>
      )}
    </main>
  );
}
