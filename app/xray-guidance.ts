export type ImageQuality = "adequate" | "limited";
export type EttPosition = "appropriate" | "high" | "low";
export type LungVolume = "low" | "target" | "high";
export type XrayFinding =
  | "diffuseLowAeration"
  | "focalVolumeLoss"
  | "asymmetricAeration"
  | "piePattern"
  | "pleuralAir";

export type XrayAssessment = {
  imageQuality: ImageQuality;
  ettPosition: EttPosition;
  lungVolume: LungVolume;
  findings: XrayFinding[];
};

export type GuidancePriority = {
  level: "urgent" | "caution" | "support";
  title: string;
  detail: string;
};

export const defaultXrayAssessment: XrayAssessment = {
  imageQuality: "adequate",
  ettPosition: "appropriate",
  lungVolume: "target",
  findings: [],
};

const findingLabels: Record<XrayFinding, string> = {
  diffuseLowAeration: "Diffuse low aeration / opacity",
  focalVolumeLoss: "Focal opacity with volume loss",
  asymmetricAeration: "Asymmetric aeration",
  piePattern: "PIE pattern",
  pleuralAir: "Pleural air / pneumothorax",
};

const ettLabels: Record<EttPosition, string> = {
  appropriate: "ET tube depth appears appropriate",
  high: "ET tube appears high",
  low: "ET tube appears low / endobronchial",
};

const volumeLabels: Record<LungVolume, string> = {
  low: "Low lung volume",
  target: "Target lung volume",
  high: "Hyperinflation",
};

export function assessmentFingerprint(value: XrayAssessment) {
  return JSON.stringify({ ...value, findings: [...value.findings].sort() });
}

export function summarizeAssessment(value: XrayAssessment) {
  return [
    ettLabels[value.ettPosition],
    volumeLabels[value.lungVolume],
    ...value.findings.map((finding) => findingLabels[finding]),
    ...(value.imageQuality === "limited" ? ["Technically limited image"] : []),
  ];
}

export function getIntegratedXrayGuidance(value: XrayAssessment) {
  const priorities: GuidancePriority[] = [];
  const has = (finding: XrayFinding) => value.findings.includes(finding);
  const airwayConcern = value.ettPosition !== "appropriate";
  const airLeak = has("pleuralAir") || has("piePattern");

  if (airwayConcern) {
    priorities.push({
      level: "urgent",
      title: "Resolve airway position before routine setting changes",
      detail:
        value.ettPosition === "low"
          ? "A low or endobronchial tube can cause asymmetric ventilation and collapse. Keep the team bedside and verify head position, tube depth, patency, and the repositioning plan."
          : "A high tube increases accidental extubation risk. Keep the team bedside and verify head position, tube depth, patency, and the repositioning plan.",
    });
  }

  if (has("pleuralAir")) {
    priorities.push({
      level: "urgent",
      title: "Use the unit air-leak emergency pathway",
      detail:
        "Assess immediately for tension physiology and obtain attending/RT support. Do not begin a recruitment maneuver until the pleural-air finding is clinically resolved or explicitly addressed.",
    });
  }

  if (has("piePattern")) {
    priorities.push({
      level: "caution",
      title: "Favor the air-leak HFJV frame",
      detail:
        "Use the lowest effective driving pressure and MAP, minimize conventional breaths, and consider a slower jet rate to lengthen expiration. Reassess expansion, gas exchange, and the leak.",
    });
  }

  if (value.lungVolume === "high") {
    priorities.push({
      level: "caution",
      title: "Look for gas trapping before adding pressure",
      detail:
        "Compare monitored HFJV PEEP with set CV PEEP, minimize unnecessary conventional breaths, and consider a lower jet rate to lengthen expiration. Distinguish trapping from excessive distending pressure before changing PEEP.",
    });
  }

  if (
    !airLeak &&
    (value.lungVolume === "low" || has("diffuseLowAeration") || has("focalVolumeLoss"))
  ) {
    priorities.push({
      level: "support",
      title: "Radiograph supports a recruitment-focused oxygenation check",
      detail:
        "Reassess PEEP/MAP, FiO₂, hemodynamics, and ET tube patency. Per local protocol, temporary 1–5/min conventional recruitment breaths may be considered when atelectasis is the problem, then reduced again after recruitment.",
    });
  }

  if (has("focalVolumeLoss") || has("asymmetricAeration")) {
    priorities.push({
      level: airwayConcern ? "urgent" : "caution",
      title: "Explain the focal or asymmetric pattern",
      detail:
        "Correlate with ET tube position, obstruction or secretions, head and body position, and the clinical examination before attributing the pattern to ventilator settings.",
    });
  }

  if (priorities.length === 0) {
    priorities.push({
      level: "support",
      title: "No radiographic override identified",
      detail:
        "The confirmed image supports continuing the selected physiology pathway. Adjust from gas exchange, oxygen requirement, chest vibration, hemodynamics, and the local plan rather than the radiograph alone.",
    });
  }

  if (value.imageQuality === "limited") {
    priorities.push({
      level: "caution",
      title: "Treat the image as limited evidence",
      detail:
        "Rotation, exposure, motion, or incomplete coverage can mimic asymmetry and alter apparent lung volume. Correlate with the official report and repeat imaging only when clinically indicated.",
    });
  }

  const highestLevel = priorities.some((item) => item.level === "urgent")
    ? "urgent"
    : priorities.some((item) => item.level === "caution")
      ? "caution"
      : "support";

  return { highestLevel, priorities };
}
