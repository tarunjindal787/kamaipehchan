const registry = new Map(); // worker_id -> [{ employer_name, rail_id, reference_id, payment_link_url, created_at }]

function addEmployerRail(worker_id, railEntry) {
  const existing = registry.get(worker_id) || [];
  existing.push(railEntry);
  registry.set(worker_id, existing);
  return railEntry;
}

function getEmployerRails(worker_id) {
  return registry.get(worker_id) || [];
}

module.exports = { addEmployerRail, getEmployerRails };
