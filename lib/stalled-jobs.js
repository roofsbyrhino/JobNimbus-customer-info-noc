/**
 * Stalled Job Detection
 *
 * Finds jobs that have had no meaningful activity for N business days
 * (weekends excluded). Supports separate production and sales stage lists.
 */

const { getJobsByStages, getLastActivity, extractAddress } = require('./jobnimbus');

// ─── Stage Definitions ────────────────────────────────────────────────────────

const PRODUCTION_STAGES = [
  'Jobs to Be Scheduled',
  'Warranty to Be Scheduled',
  'Job Scheduled',
  'Tear Off in Progress',
  'Tear Off Done',
  'Inspection Done',
  'Install Scheduled',
  'Install in Progress',
  'Pending Final Inspection',
  'Final Inspection Done',
  'Needs Gutters',
  'Pending Final Walkthrough',
  // 'Job Completed' intentionally excluded — done is done
];

const SALES_STAGES = [
  'Estimate Sent',
  'Follow-Up 5',
  'Follow-Up 10',
  'Status Review',
  'Rehash Call Center',
  'Rehash Working',
  'Rehash Back to Sales',
  'Pending Sold',
];

// ─── Business Day Calculator ──────────────────────────────────────────────────

/**
 * Count the number of business days (Mon–Fri) between two dates.
 * The start date is inclusive, the end date is exclusive.
 *
 * @param {Date} from  Earlier date
 * @param {Date} to    Later date (typically today)
 * @returns {number}   Business days elapsed
 */
function businessDaysBetween(from, to) {
  let count = 0;
  const cursor = new Date(from);
  cursor.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);

  while (cursor < end) {
    const dow = cursor.getDay(); // 0 = Sun, 6 = Sat
    if (dow !== 0 && dow !== 6) count++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return count;
}

// ─── Unix timestamp → Date ────────────────────────────────────────────────────

function toDate(ts) {
  if (!ts) return null;
  // JobNimbus timestamps can be Unix seconds (10 digits) or ms (13 digits)
  const n = Number(ts);
  return new Date(n > 1e10 ? n : n * 1000);
}

// ─── Core: find stalled jobs in a given set of stages ────────────────────────

/**
 * @param {string[]} stages         Stage names to query
 * @param {number}   thresholdDays  Flag jobs with >= this many business days idle
 * @param {string}   boardLabel     'Production' or 'Sales' (for logging)
 * @returns {Object[]}              Sorted array of stalled job summaries
 */
async function findStalledJobs(stages, thresholdDays, boardLabel = '') {
  const jobs = await getJobsByStages(stages);
  const now = new Date();
  const stalled = [];

  // Pre-filter: skip any job whose date_updated is within threshold
  // (avoids an API call for obviously non-stalled jobs)
  const candidates = jobs.filter(job => {
    const updated = toDate(job.date_updated);
    if (!updated) return true; // include if unknown — safer to check
    return businessDaysBetween(updated, now) >= thresholdDays;
  });

  console.log(
    `[stalled-jobs] ${boardLabel} — ${jobs.length} active jobs, ` +
    `${candidates.length} candidates for ${thresholdDays}-day check`
  );

  // Fetch last activity for each candidate (in parallel, max 10 at a time)
  const BATCH = 10;
  for (let i = 0; i < candidates.length; i += BATCH) {
    const batch = candidates.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async job => {
        const activity = await getLastActivity(job.jnid);

        // Use the most recent of: job update time, last activity time
        const activityDate = activity ? toDate(activity.date_created) : null;
        const updatedDate  = toDate(job.date_updated);
        const lastSeen     = activityDate && updatedDate
          ? (activityDate > updatedDate ? activityDate : updatedDate)
          : (activityDate || updatedDate || new Date(0));

        const businessDays = businessDaysBetween(lastSeen, now);
        if (businessDays < thresholdDays) return null;

        // Truncate long notes to keep the report readable
        const rawNote  = activity?.note || '';
        const lastNote = rawNote.length > 140
          ? rawNote.slice(0, 137) + '…'
          : (rawNote || '(no notes recorded)');

        // Resolve assigned-to name
        const assigned =
          job.assigned_to?.[0]?.name ||
          job.sales_rep?.name ||
          job.estimator?.name ||
          'Unassigned';

        return {
          jobNumber:          job.number || job.jnid,
          customerName:       job.name || job.display_name || '',
          address:            extractAddress(job),
          stage:              job.status_name || job.status || '',
          assignedTo:         assigned,
          lastNote,
          lastActivityDate:   lastSeen.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          }),
          businessDaysStalled: businessDays,
        };
      })
    );

    for (const r of results) {
      if (r) stalled.push(r);
    }
  }

  // Most stalled first
  stalled.sort((a, b) => b.businessDaysStalled - a.businessDaysStalled);
  return stalled;
}

module.exports = {
  findStalledJobs,
  PRODUCTION_STAGES,
  SALES_STAGES,
  businessDaysBetween,
};
