// Decides the next onboarding step from observed Merchant Center state.
// Pure on purpose: the register script observes state, asks this what to do, does it, repeats.
// That makes the flow resumable and idempotent without the model tracking where it was.
export function planNextStep({ contact, app, installTargets, productionUrl }) {
  if (!contact) {
    return { step: 'SET_CONTACT', automatable: true, reason: 'The Organization has no maintainer contact email.' };
  }
  if (!contact.verifiedEmail) {
    return { step: 'VERIFY_EMAIL', automatable: false, reason: `Open the verification link sent to ${contact.email}. Only a person can do this.` };
  }
  if (!app) {
    return { step: 'CREATE_APP', automatable: true, reason: 'No Custom Application is registered for this entryPointUriPath.' };
  }
  if (!productionUrl) {
    return { step: 'DEPLOY', automatable: false, reason: 'The app is registered but not hosted. Deploy it, then pass the production URL.' };
  }
  if (app.url !== productionUrl) {
    return { step: 'SYNC_URL', automatable: true, reason: `Registered URL is ${app.url}, expected ${productionUrl}.` };
  }
  if (app.status !== 'PRIVATE_USAGE') {
    return { step: 'SET_READY', automatable: true, reason: 'The app is still in Draft; installation requires Ready.' };
  }
  if (!installTargets?.length) {
    return { step: 'CHOOSE_TARGETS', automatable: false, reason: 'No Organizations chosen to install into. Run the install-plan picker.' };
  }
  for (const target of installTargets) {
    const next = planTarget(target);
    if (next) return next;
  }
  return { step: 'DONE', automatable: false, reason: 'Registered, Ready, and installed in every chosen Organization.' };
}

// One target = one Organization with either all projects or an exact allowlist.
// Returns the step that moves it toward the desired state, or null when it already matches.
function planTarget(target) {
  const { orgName, allProjects, projectKeys, actual } = target;
  const where = `${orgName} (${target.orgId})`;
  if (!actual) {
    return { step: 'INSTALL', automatable: true, target, reason: `Not installed in ${where}.` };
  }
  if (target.ensure) {
    // --project-key shorthand: add the key if missing, never remove or narrow anything.
    if (actual.installInAllProjects) return null;
    const have = new Set(actual.projectKeys);
    if (projectKeys.every((k) => have.has(k))) return null;
    const union = [...new Set([...actual.projectKeys, ...projectKeys])].sort();
    return { step: 'UPDATE_INSTALL', automatable: true, target: { ...target, projectKeys: union }, reason: `${where} lacks [${projectKeys.filter((k) => !have.has(k)).join(', ')}].` };
  }
  if (allProjects) {
    if (actual.installInAllProjects) return null;
    return mismatch(target, `${where} is installed on selected projects only, but all projects was chosen.`);
  }
  if (actual.installInAllProjects) {
    return mismatch(target, `${where} is installed in all projects, but an allowlist was chosen.`);
  }
  const want = new Set(projectKeys);
  const have = new Set(actual.projectKeys);
  const same = want.size === have.size && [...want].every((k) => have.has(k));
  if (same) return null;
  return { step: 'UPDATE_INSTALL', automatable: true, target, reason: `${where} has projects [${[...have].join(', ')}], wanted [${[...want].join(', ')}].` };
}

const mismatch = (target, reason) => ({
  step: 'INSTALL_MISMATCH',
  automatable: false,
  target,
  reason: `${reason} Switching mode means uninstalling and reinstalling, which may reset Team permissions. Decide explicitly.`,
});
