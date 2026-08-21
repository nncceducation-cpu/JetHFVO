import assert from "node:assert/strict";
import test from "node:test";
import { assessmentFingerprint, getIntegratedXrayGuidance, summarizeAssessment } from "../app/xray-guidance.ts";

const baseline = { imageQuality: "adequate", ettPosition: "appropriate", lungVolume: "target", findings: [] };

test("normal confirmed findings do not override physiology guidance", () => {
  const result = getIntegratedXrayGuidance(baseline);
  assert.equal(result.highestLevel, "support");
  assert.equal(result.priorities.length, 1);
  assert.match(result.priorities[0].title, /No radiographic override/);
});

test("tube malposition and pleural air take urgent priority", () => {
  const result = getIntegratedXrayGuidance({ ...baseline, ettPosition: "low", lungVolume: "high", findings: ["pleuralAir", "asymmetricAeration"] });
  assert.equal(result.highestLevel, "urgent");
  assert.match(result.priorities[0].title, /airway position/i);
  assert.ok(result.priorities.some((item) => /air-leak emergency/i.test(item.title)));
  assert.ok(result.priorities.every((item) => !/recruitment-focused/i.test(item.title)));
});

test("low volume without air leak maps to recruitment-focused guidance", () => {
  const result = getIntegratedXrayGuidance({ ...baseline, lungVolume: "low", findings: ["diffuseLowAeration"] });
  assert.equal(result.highestLevel, "support");
  assert.ok(result.priorities.some((item) => /recruitment-focused/i.test(item.title)));
});

test("PIE suppresses recruitment and favors the air-leak frame", () => {
  const result = getIntegratedXrayGuidance({ ...baseline, lungVolume: "low", findings: ["piePattern", "focalVolumeLoss"] });
  assert.equal(result.highestLevel, "caution");
  assert.ok(result.priorities.some((item) => /air-leak HFJV frame/i.test(item.title)));
  assert.ok(result.priorities.every((item) => !/recruitment-focused/i.test(item.title)));
});

test("fingerprints ignore checkbox ordering but detect changed observations", () => {
  const first = { ...baseline, findings: ["focalVolumeLoss", "asymmetricAeration"] };
  const reordered = { ...baseline, findings: ["asymmetricAeration", "focalVolumeLoss"] };
  const changed = { ...baseline, findings: ["focalVolumeLoss"] };
  assert.equal(assessmentFingerprint(first), assessmentFingerprint(reordered));
  assert.notEqual(assessmentFingerprint(first), assessmentFingerprint(changed));
});

test("summary includes the limited-image caveat", () => {
  const summary = summarizeAssessment({ ...baseline, imageQuality: "limited" });
  assert.ok(summary.includes("Technically limited image"));
});
