// P012-T012 evaluation gate.
//
// Verifies that protocol, data and status statement are complete and
// mutually consistent (IMPLEMENTATION_PLAN §8):
//   - PROTOCOL.md / CONSENT.md exist and contain the frozen required elements.
//   - observations.csv parses and satisfies the frozen record rules.
//   - results.json exists, its status matches the participant count, and —
//     when measured — its metrics are exactly what scripts/evaluate.mjs
//     recomputes from the CSV (catches stale results and data contradictions).
//   - REPORT.md states the same status and participant count, and carries the
//     required no-claim sentence while the value is unmeasured, or the
//     pause-expansion statement after a measured PRODUCT_VALUE_FAIL.
//
// A legitimate USER_VALUE_NOT_MEASURED or an honestly reported
// PRODUCT_VALUE_FAIL does NOT fail this gate; the product conclusion must
// simply be preserved. Missing explanation, fabricated observations, or data
// contradictions exit non-zero.
//
// Usage: node scripts/evaluation-check.mjs
// Exit: 0 = gate passes; 1 = one or more checks failed (all failures listed).

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { validateObservations, computeMetrics, MIN_PARTICIPANTS } from "./evaluate.mjs";

const ROOT = resolve(import.meta.dirname ?? ".", "..");
const PROTOCOL_PATH = resolve(ROOT, "evaluation/PROTOCOL.md");
const CONSENT_PATH = resolve(ROOT, "evaluation/CONSENT.md");
const OBSERVATIONS_PATH = resolve(ROOT, "evaluation/observations.csv");
const RESULTS_PATH = resolve(ROOT, "evaluation/results.json");
const REPORT_PATH = resolve(ROOT, "evaluation/REPORT.md");

const PROTOCOL_REQUIRED = [
  "目标招募 **8 人**",
  "最低人数为 **6 人**",
  "探索性继续门槛",
  "USER_VALUE_NOT_MEASURED",
  "PRODUCT_VALUE_FAIL",
  "禁止用 Coding Agent 角色扮演替代参与者",
  "附录 A",
];

const CONSENT_REQUIRED = ["自愿", "匿名编号", "不记录", "退出", "不上传", "文字保护不等于事实核查"];

const NO_CLAIM_SENTENCE = "本报告不宣称任何节省时间或效果收益。";

function approxEqual(a, b, path, diffs) {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isNaN(a) && Number.isNaN(b)) return;
    if (Math.abs(a - b) > 1e-9) diffs.push(`${path}: recomputed ${a} != reported ${b}`);
    return;
  }
  if (a === null || b === null || typeof a !== typeof b) {
    if (a !== b) diffs.push(`${path}: recomputed ${JSON.stringify(a)} != reported ${JSON.stringify(b)}`);
    return;
  }
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) {
      diffs.push(`${path}: array length ${a.length} != ${b.length}`);
      return;
    }
    a.forEach((item, i) => approxEqual(item, b[i], `${path}[${i}]`, diffs));
    return;
  }
  if (typeof a === "object") {
    for (const key of Object.keys(a)) {
      if (!(key in b)) diffs.push(`${path}.${key}: missing in results.json`);
      else approxEqual(a[key], b[key], `${path}.${key}`, diffs);
    }
    for (const key of Object.keys(b)) {
      if (!(key in a)) diffs.push(`${path}.${key}: unexpected extra field in results.json`);
    }
    return;
  }
  if (a !== b) diffs.push(`${path}: recomputed ${JSON.stringify(a)} != reported ${JSON.stringify(b)}`);
}

function main() {
  const failures = [];
  const passes = [];
  const check = (name, ok, detail = "") => {
    if (ok) passes.push(name);
    else failures.push(detail ? `${name}: ${detail}` : name);
  };

  // 1. Protocol.
  if (!existsSync(PROTOCOL_PATH)) {
    failures.push("evaluation/PROTOCOL.md is missing");
  } else {
    const text = readFileSync(PROTOCOL_PATH, "utf8");
    for (const needle of PROTOCOL_REQUIRED) {
      check(`protocol contains "${needle}"`, text.includes(needle));
    }
  }

  // 2. Consent.
  if (!existsSync(CONSENT_PATH)) {
    failures.push("evaluation/CONSENT.md is missing");
  } else {
    const text = readFileSync(CONSENT_PATH, "utf8");
    for (const needle of CONSENT_REQUIRED) {
      check(`consent contains "${needle}"`, text.includes(needle));
    }
  }

  // 3. Observations: parse + frozen record rules.
  let rows = null;
  if (!existsSync(OBSERVATIONS_PATH)) {
    failures.push("evaluation/observations.csv is missing");
  } else {
    try {
      ({ rows } = validateObservations(readFileSync(OBSERVATIONS_PATH, "utf8")));
      check("observations.csv validates against frozen record rules", true);
    } catch (err) {
      failures.push(`observations.csv invalid: ${err.message}`);
    }
  }

  // 4. Results: status matches data; metrics recompute exactly.
  let results = null;
  if (!existsSync(RESULTS_PATH)) {
    failures.push("evaluation/results.json is missing (run npm run evaluate first)");
  } else {
    try {
      results = JSON.parse(readFileSync(RESULTS_PATH, "utf8"));
    } catch {
      failures.push("evaluation/results.json is not valid JSON");
    }
  }

  if (results && rows) {
    const participants = [...new Set(rows.map((r) => r.participant_id))].sort();
    check(
      "results.json participants_recruited matches observations.csv",
      results.participants_recruited === participants.length,
      `results.json says ${results.participants_recruited}, observations.csv has ${participants.length}`,
    );
    const validStatuses = ["USER_VALUE_NOT_MEASURED", "EXPLORATORY_PASS", "PRODUCT_VALUE_FAIL"];
    check("results.json status is a known value", validStatuses.includes(results.status), `status=${results.status}`);
    if (participants.length < MIN_PARTICIPANTS) {
      check(
        "status is USER_VALUE_NOT_MEASURED when participants < 6",
        results.status === "USER_VALUE_NOT_MEASURED",
        `participants=${participants.length}, status=${results.status}`,
      );
      check(
        "results.json states a reason when unmeasured",
        typeof results.reason_not_measured === "string" && results.reason_not_measured.length > 0,
      );
      check(
        "results.json metrics are null when unmeasured",
        results.metrics === null,
      );
    } else {
      check(
        "status is a measured outcome when participants >= 6",
        results.status === "EXPLORATORY_PASS" || results.status === "PRODUCT_VALUE_FAIL",
        `participants=${participants.length}, status=${results.status}`,
      );
      const recomputed = computeMetrics(rows);
      const diffs = [];
      if (recomputed && results.metrics) {
        approxEqual(recomputed, results.metrics, "metrics", diffs);
      } else {
        diffs.push("metrics missing on one side");
      }
      check("results.json metrics match a fresh recomputation from observations.csv", diffs.length === 0, diffs.join("; "));
      const expectedStatus = recomputed.thresholds.every((t) => t.passed) ? "EXPLORATORY_PASS" : "PRODUCT_VALUE_FAIL";
      check(
        "results.json status matches recomputed threshold outcomes",
        results.status === expectedStatus,
        `recomputed=${expectedStatus}, reported=${results.status}`,
      );
    }
  }

  // 5. Report: same status and count, required product-conclusion sentence.
  if (!existsSync(REPORT_PATH)) {
    failures.push("evaluation/REPORT.md is missing");
  } else if (results) {
    const text = readFileSync(REPORT_PATH, "utf8");
    check("REPORT.md states the same status as results.json", text.includes(results.status), `status=${results.status}`);
    check(
      "REPORT.md states the participant count",
      text.includes(`${results.participants_recruited} 人`),
      `expected "${results.participants_recruited} 人" in REPORT.md`,
    );
    if (results.status === "USER_VALUE_NOT_MEASURED") {
      check("REPORT.md carries the no-effect-claim sentence", text.includes(NO_CLAIM_SENTENCE));
    }
    if (results.status === "PRODUCT_VALUE_FAIL") {
      check("REPORT.md states the pause-expansion decision", text.includes("暂停扩展"));
    }
  }

  for (const p of passes) console.log(`PASS ${p}`);
  for (const f of failures) console.log(`FAIL ${f}`);
  if (failures.length === 0) {
    console.log(`evaluation:check PASS (${passes.length} checks)`);
  } else {
    console.log(`evaluation:check FAIL (${failures.length} failure(s), ${passes.length} passed)`);
    process.exit(1);
  }
}

main();
