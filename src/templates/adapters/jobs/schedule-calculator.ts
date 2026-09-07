import type { ProjectMode } from "../../../lib/addons.js";

export function jobScheduleCalculatorContent(mode: ProjectMode): string {
  const serviceImport = mode === "monorepo" ? "@repo/services/jobs" : "../../services/jobs";
  return `import "server-only";
import { JobError, type JobScheduleCalculatorPort } from "${serviceImport}";

interface CronParts {
  minute: Set<number>;
  hour: Set<number>;
  day: Set<number>;
  month: Set<number>;
  weekday: Set<number>;
  anyDay: boolean;
  anyWeekday: boolean;
}

function field(source: string, minimum: number, maximum: number, normalize?: (value: number) => number): Set<number> {
  const values = new Set<number>();
  for (const item of source.split(",")) {
    const [rangeSource, stepSource] = item.split("/");
    const step = stepSource === undefined ? 1 : Number(stepSource);
    if (!Number.isInteger(step) || step < 1) throw new Error("invalid cron step");
    const [start, end] =
      rangeSource === "*"
        ? [minimum, maximum]
        : rangeSource.includes("-")
          ? rangeSource.split("-").map(Number)
          : [Number(rangeSource), Number(rangeSource)];
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < minimum || end > maximum || start > end) {
      throw new Error("invalid cron field");
    }
    for (let value = start; value <= end; value += step) values.add(normalize ? normalize(value) : value);
  }
  return values;
}

function parse(expression: string): CronParts {
  const parts = expression.trim().split(" ").filter((part) => part.length > 0);
  if (parts.length !== 5) throw new Error("cron expression must contain five fields");
  return {
    minute: field(parts[0]!, 0, 59),
    hour: field(parts[1]!, 0, 23),
    day: field(parts[2]!, 1, 31),
    month: field(parts[3]!, 1, 12),
    weekday: field(parts[4]!, 0, 7, (value) => value === 7 ? 0 : value),
    anyDay: parts[2] === "*",
    anyWeekday: parts[4] === "*",
  };
}

const weekdayNumber: Readonly<Record<string, number>> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

function zonedParts(date: Date, timezone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    minute: "2-digit",
    hour: "2-digit",
    day: "2-digit",
    month: "2-digit",
    weekday: "short",
    hourCycle: "h23",
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
  const weekday = weekdayNumber[parts.weekday ?? ""];
  if (weekday === undefined) throw new Error("timezone weekday could not be resolved");
  return {
    minute: Number(parts.minute),
    hour: Number(parts.hour),
    day: Number(parts.day),
    month: Number(parts.month),
    weekday,
  };
}

function matches(cron: CronParts, value: ReturnType<typeof zonedParts>): boolean {
  const dayMatches = cron.day.has(value.day);
  const weekdayMatches = cron.weekday.has(value.weekday);
  const calendarDayMatches = cron.anyDay
    ? weekdayMatches
    : cron.anyWeekday
      ? dayMatches
      : dayMatches || weekdayMatches;
  return cron.minute.has(value.minute) && cron.hour.has(value.hour) && cron.month.has(value.month) && calendarDayMatches;
}

export const cronJobScheduleCalculator: JobScheduleCalculatorPort = {
  nextAfter(schedule, scheduledFor) {
    let cron: CronParts;
    try {
      cron = parse(schedule.expression);
      new Intl.DateTimeFormat("en-US", { timeZone: schedule.timezone }).format(scheduledFor);
    } catch (error) {
      throw new JobError("JOB_SCHEDULE_CALCULATION_FAILED", "The job schedule is invalid", { cause: error });
    }
    const start = Math.floor(scheduledFor.getTime() / 60_000) * 60_000 + 60_000;
    const searchMinutes = 366 * 24 * 60;
    for (let offset = 0; offset < searchMinutes; offset += 1) {
      const candidate = new Date(start + offset * 60_000);
      if (matches(cron, zonedParts(candidate, schedule.timezone))) return candidate;
    }
    throw new JobError("JOB_SCHEDULE_CALCULATION_FAILED", "No schedule occurrence exists within one year");
  },
};
`;
}
