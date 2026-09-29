// 安装聚合器的可选 skill；对应模板目录 templates/skills/<name>/。
export const SKILL_CATALOG = [
  {
    id: 'trellis-pitaya-patch',
    name: 'pitaya-grill-prd',
    label: 'pitaya-grill-prd (Trellis patch · grill-me style PRD)',
    description: 'grill-me 风格的 PRD 澄清 skill，pitaya 的核心 patch。',
    templateDir: 'pitaya-grill-prd',
    default: true
  }
];

export function defaultSkillIds() {
  return SKILL_CATALOG.filter((item) => item.default).map((item) => item.id);
}

export function resolveSkills(ids) {
  const set = new Set(ids);
  return SKILL_CATALOG.filter((item) => set.has(item.id));
}
