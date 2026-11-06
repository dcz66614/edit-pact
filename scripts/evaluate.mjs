// P012-T012 evaluation runner.
//
// Reads evaluation/observations.csv (frozen columns, see evaluation/PROTOCOL.md §8),
// computes the frozen metrics of PROTOCOL.md §4.3, applies the frozen continuation
// thresholds of §5, and writes evaluation/results.json.
//
// Statuses:
//   USER_VALUE_NOT_MEASURED  participants < 6 (including 0) — no exploratory result.
//   EXPLORATORY_PASS         participants >= 6 and all 5 thresholds hold.
//   PRODUCT_VALUE_FAIL       participants >= 6 and any threshold fails.
//
// Exit codes: 0 on success (any of the three statuses above is a legitimate
// outcome); 2 when the input file is missing, malformed, or contradicts the
// frozen record rules (validation errors are printed, results.json is not written).
//
// This module exports its pure functions so scripts/evaluation-check.mjs can
// recompute the same numbers and verify results.json agrees with the CSV.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

export const EXPECTED_HEADER = [
  "participant_id",
  "order",
  "task_id",
  "method",
  "unwanted_adoptions",
  "correct_compose",
  "total_time_seconds",
  "setup_time_seconds",
  "completed",
  "willing_reuse",
  "states_limit",
];

export const TASK_IDS = ["T1", "T2", "T3", "T4"];
export const PARTICIPANT_IDS = ["P01", "P02", "P03", "P04", "P05", "P06", "P07", "P08"];
export const MIN_PARTICIPANTS = 6;
export const TARGET_PARTICIPANTS = 8;

// Thresholds per participant count: [threshold-1 numerator, threshold-5 numerator].
// PROTOCOL.md §5 freezes 8 -> [6, 5], 6 -> [5, 4], 7 -> [6, 5] (8-person ratio rounded up).
export const THRESHOLD_NUMERATORS = { 6: [5, 4], 7: [6, 5], 8: [6, 5] };

// Minimal CSV parser: handles quoted fields, embedded commas, CRLF.
// The frozen record format has no embedded quotes in practice, but the parser
// must not silently misread a row.
export function parseCsv(text) {
  const rows = [];
  let field = "";
  let row = [];
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      pushField();
    } else if (ch === "\n") {
      pushRow();
    } else if (ch === "\r") {
      // CRLF: ignore the CR, the LF ends the row.
    } else {
      field += ch;
    }
  }
  if (inQuotes) throw new Error("CSV has an unterminated quoted field");
  if (field !== "" || row.length > 0) pushRow();
  // Drop a final empty row produced by a trailing newline.
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === "") {
    rows.pop();
  }
  return rows;
}

function isIntIn(value, lo, hi) {
  if (!/^-?\d+$/.test(value)) return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= lo && n <= hi;
}

function isNumberGt(value, lo) {
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  return Number(value) > lo;
}

function isNumberGte(value, lo) {
  if (!/^\d+(\.\d+)?$/.test(value)) return false;
  return Number(value) >= lo;
}

// Validate the parsed rows against the frozen record rules (PROTOCOL.md §8).
// Returns { header, rows } with typed row objects, or throws an Error listing
// every violation found (all violations are reported, not just the first).
export function validateObservations(text) {
  const errors = [];
  const rawRows = parseCsv(text);
  if (rawRows.length === 0) throw new Error("observations.csv is empty (no header row)");
  const header = rawRows[0];
  if (
    header.length !== EXPECTED_HEADER.length ||
    !EXPECTED_HEADER.every((h, i) => header[i] === h)
  ) {
    throw new Error(
      `header mismatch: expected ${EXPECTED_HEADER.join(",")}, got ${header.join(",")}`,
    );
  }
  const rows = [];
  const seen = new Set();
  const byParticipant = new Map();
  rawRows.slice(1).forEach((cells, idx) => {
    const lineNo = idx + 2;
    if (cells.length !== EXPECTED_HEADER.length) {
      errors.push(`line ${lineNo}: expected ${EXPECTED_HEADER.length} columns, got ${cells.length}`);
      return;
    }
    const r = Object.fromEntries(EXPECTED_HEADER.map((h, i) => [h, cells[i]]));
    const prefix = `line ${lineNo} (${r.participant_id || "?"} ${r.task_id || "?"} ${r.method || "?"})`;
    if (!PARTICIPANT_IDS.includes(r.participant_id)) {
      errors.push(`${prefix}: participant_id must be P01-P08`);
    }
    if (r.order !== "AB" && r.order !== "BA") errors.push(`${prefix}: order must be AB or BA`);
    if (!TASK_IDS.includes(r.task_id)) errors.push(`${prefix}: task_id must be T1-T4`);
    if (r.method !== "baseline" && r.method !== "contract") {
      errors.push(`${prefix}: method must be baseline or contract`);
    }
    if (!isIntIn(r.unwanted_adoptions, 0, 1)) {
      errors.push(`${prefix}: unwanted_adoptions must be 0 or 1`);
    }
    if (!isIntIn(r.correct_compose, 0, 1)) {
      errors.push(`${prefix}: correct_compose must be 0 or 1`);
    }
    if (!isNumberGt(r.total_time_seconds, 0)) {
      errors.push(`${prefix}: total_time_seconds must be a number > 0`);
    }
    if (r.method === "contract") {
      if (!isNumberGte(r.setup_time_seconds, 0)) {
        errors.push(`${prefix}: setup_time_seconds must be a number >= 0 for contract rows`);
      }
    } else if (r.method === "baseline" && r.setup_time_seconds !== "") {
      errors.push(`${prefix}: setup_time_seconds must be empty for baseline rows`);
    }
    if (!isIntIn(r.completed, 0, 1)) errors.push(`${prefix}: completed must be 0 or 1`);
    if (r.willing_reuse !== "yes" && r.willing_reuse !== "no") {
      errors.push(`${prefix}: willing_reuse must be yes or no`);
    }
    if (r.states_limit !== "yes" && r.states_limit !== "no") {
      errors.push(`${prefix}: states_limit must be yes or no`);
    }
    const key = `${r.participant_id}|${r.task_id}|${r.method}`;
    if (seen.has(key)) errors.push(`${prefix}: duplicate row for ${key}`);
    seen.add(key);
    rows.push(r);
    if (!byParticipant.has(r.participant_id)) byParticipant.set(r.participant_id, []);
    byParticipant.get(r.participant_id).push(r);
  });

  for (const [pid, prs] of byParticipant) {
    const orders = new Set(prs.map((r) => r.order));
    if (orders.size > 1) errors.push(`${pid}: order must be the same on all rows (found ${[...orders].join(",")})`);
    if (prs.length !== 8) {
      errors.push(`${pid}: expected 8 rows (4 tasks x 2 methods), got ${prs.length}`);
    }
    const wr = new Set(prs.map((r) => r.willing_reuse));
    if (wr.size > 1) errors.push(`${pid}: willing_reuse must be identical on all rows`);
    const sl = new Set(prs.map((r) => r.states_limit));
    if (sl.size > 1) errors.push(`${pid}: states_limit must be identical on all rows`);
    for (const t of TASK_IDS) {
      for (const m of ["baseline", "contract"]) {
        if (!prs.some((r) => r.task_id === t && r.method === m)) {
          errors.push(`${pid}: missing row for task ${t} method ${m}`);
        }
      }
    }
  }

  if (errors.length > 0) {
    throw new Error(`observations.csv validation failed (${errors.length}):\n- ${errors.join("\n- ")}`);
  }
  return { header, rows };
}

// Median per PROTOCOL.md §4.3: ascending order, element ceil(n/2) (1-indexed).
export function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.ceil(sorted.length / 2) - 1];
}

function rate(numerator, denominator) {
  if (denominator === 0) return null;
  return numerator / denominator;
}

// Compute frozen metrics and threshold outcomes from validated rows.
// Returns the metrics object (without status) or null when participants < 6.
export function computeMetrics(rows) {
  const participants = [...new Set(rows.map((r) => r.participant_id))].sort();
  const n = participants.length;
  if (n < MIN_PARTICIPANTS) return null;

  const byMethod = (method) => rows.filter((r) => r.method === method);
  const sum = (rs, field) => rs.reduce((acc, r) => acc + Number(r[field]), 0);

  const baseline = byMethod("baseline");
  const contract = byMethod("contract");
  const completedBaseline = baseline.filter((r) => Number(r.completed) === 1);
  const completedContract = contract.filter((r) => Number(r.completed) === 1);

  // Per-participant unauthorized adoptions, contract vs own baseline.
  const perParticipant = participants.map((pid) => {
    const c = sum(rows.filter((r) => r.participant_id === pid && r.method === "contract"), "unwanted_adoptions");
    const b = sum(rows.filter((r) => r.participant_id === pid && r.method === "baseline"), "unwanted_adoptions");
    return { participant_id: pid, contract_adoptions: c, baseline_adoptions: b, contract_not_above_baseline: c <= b };
  });
  const t1Count = perParticipant.filter((p) => p.contract_not_above_baseline).length;

  const adoptionsContractTotal = sum(contract, "unwanted_adoptions");
  const adoptionsBaselineTotal = sum(baseline, "unwanted_adoptions");

  const medianTotalContract = median(completedContract.map((r) => Number(r.total_time_seconds)));
  const medianTotalBaseline = median(completedBaseline.map((r) => Number(r.total_time_seconds)));
  const medianSetupContract = median(completedContract.map((r) => Number(r.setup_time_seconds)));

  const reuseYes = participants.filter(
    (pid) => rows.find((r) => r.participant_id === pid).willing_reuse === "yes",
  ).length;
  const statesYes = participants.filter(
    (pid) => rows.find((r) => r.participant_id === pid).states_limit === "yes",
  ).length;

  const [t1Num, t5Num] = THRESHOLD_NUMERATORS[n] ?? THRESHOLD_NUMERATORS[8];

  const thresholds = [
    {
      id: "T1-not-above-own-baseline",
      rule: `at least ${t1Num}/${n} participants' contract adoptions <= own baseline adoptions`,
      observed: `${t1Count}/${n}`,
      passed: t1Count >= t1Num,
    },
    {
      id: "T2-total-adoptions-decrease",
      rule: "contract total unwanted adoptions < baseline total",
      observed: `${adoptionsContractTotal} < ${adoptionsBaselineTotal}`,
      passed: adoptionsContractTotal < adoptionsBaselineTotal,
    },
    {
      id: "T3-total-time-median-not-increase",
      rule: "contract median total time <= baseline median total time",
      observed: `${medianTotalContract} <= ${medianTotalBaseline}`,
      passed: medianTotalContract !== null && medianTotalBaseline !== null && medianTotalContract <= medianTotalBaseline,
    },
    {
      id: "T4-setup-median-le-45s",
      rule: "contract median setup time <= 45 seconds",
      observed: `${medianSetupContract} <= 45`,
      passed: medianSetupContract !== null && medianSetupContract <= 45,
    },
    {
      id: "T5-willing-reuse",
      rule: `at least ${t5Num}/${n} participants willing to reuse the contract method`,
      observed: `${reuseYes}/${n}`,
      passed: reuseYes >= t5Num,
    },
  ];

  return {
    participants: n,
    per_participant_adoptions: perParticipant,
    adoptions_total: { contract: adoptionsContractTotal, baseline: adoptionsBaselineTotal },
    correct_compose_rate: {
      contract: rate(sum(contract, "correct_compose"), contract.length),
      baseline: rate(sum(baseline, "correct_compose"), baseline.length),
    },
    median_total_time_seconds: { contract: medianTotalContract, baseline: medianTotalBaseline },
    median_setup_time_seconds_contract: medianSetupContract,
    incompletion_rate: {
      contract: rate(contract.length - completedContract.length, contract.length),
      baseline: rate(baseline.length - completedBaseline.length, baseline.length),
    },
    willing_reuse: { yes: reuseYes, total: n, rate: rate(reuseYes, n) },
    states_limit_yes: { yes: statesYes, total: n, rate: rate(statesYes, n) },
    thresholds,
  };
}

export function evaluate(text) {
  const { rows } = validateObservations(text);
  const participants = [...new Set(rows.map((r) => r.participant_id))].sort();
  const n = participants.length;

  const base = {
    project_id: "P012",
    protocol_version: "1.0.0",
    spec_version: "1.0.0",
    participants_recruited: n,
    participants_required_min: MIN_PARTICIPANTS,
    participants_target: TARGET_PARTICIPANTS,
    input_file: "evaluation/observations.csv",
    generator: "scripts/evaluate.mjs",
  };

  if (n < MIN_PARTICIPANTS) {
    return {
      ...base,
      status: "USER_VALUE_NOT_MEASURED",
      reason_not_measured:
        n === 0
          ? "No participants were recruited in this round: Sam was away, no invitations were sent, and no authorized recruitment channel was on standby. See evaluation/PROTOCOL.md §9."
          : `Only ${n} participant(s) recruited, below the frozen minimum of ${MIN_PARTICIPANTS} for an exploratory result. See evaluation/PROTOCOL.md §6.`,
      retest_plan:
        "When Sam recruits >= 6 participants, run the frozen protocol (evaluation/PROTOCOL.md v1.0.0) with the T009 prototype, then re-run npm run evaluate and npm run evaluation:check.",
      metrics: null,
      thresholds: null,
    };
  }

  const metrics = computeMetrics(rows);
  const allPassed = metrics.thresholds.every((t) => t.passed);
  return {
    ...base,
    status: allPassed ? "EXPLORATORY_PASS" : "PRODUCT_VALUE_FAIL",
    metrics,
    thresholds: metrics.thresholds,
  };
}

function parseArgs(argv) {
  const args = { input: null, output: "evaluation/results.json" };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && argv[i + 1]) args.input = argv[++i];
    else if (argv[i] === "--output" && argv[i + 1]) args.output = argv[++i];
    else if (argv[i].startsWith("--input=")) args.input = argv[i].slice("--input=".length);
    else if (argv[i].startsWith("--output=")) args.output = argv[i].slice("--output=".length);
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  if (!args.input) throw new Error("usage: node scripts/evaluate.mjs --input evaluation/observations.csv [--output evaluation/results.json]");
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const text = readFileSync(resolve(args.input), "utf8");
  const result = evaluate(text);
  result.generated_at_utc = new Date().toISOString();
  writeFileSync(resolve(args.output), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`status: ${result.status}`);
  console.log(`participants: ${result.participants_recruited}`);
  if (result.metrics) {
    console.log(
      `adoptions total: contract ${result.metrics.adoptions_total.contract}, baseline ${result.metrics.adoptions_total.baseline}`,
    );
    console.log(
      `median total time: contract ${result.metrics.median_total_time_seconds.contract}s, baseline ${result.metrics.median_total_time_seconds.baseline}s`,
    );
    console.log(`median setup time (contract): ${result.metrics.median_setup_time_seconds_contract}s`);
    console.log(`willing reuse: ${result.metrics.willing_reuse.yes}/${result.metrics.willing_reuse.total}`);
    for (const t of result.metrics.thresholds) {
      console.log(`threshold ${t.id}: ${t.passed ? "PASS" : "FAIL"} (${t.observed})`);
    }
  } else {
    console.log(`reason: ${result.reason_not_measured}`);
  }
  console.log(`wrote ${args.output}`);
}

const isMain = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`;
if (isMain) {
  try {
    main();
  } catch (err) {
    console.error(`evaluate: ${err.message}`);
    process.exit(2);
  }
}
