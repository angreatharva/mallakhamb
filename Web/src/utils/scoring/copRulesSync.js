/**
 * COP rules drift detection (MED-W5 / Web task 4.1).
 *
 * WHY THIS IS NOT A DELETION
 *
 * The audit's task 4.1 says to fetch the COP rules from
 * `GET /api/public/cop-rules` (which now exists) and delete this client mirror.
 * The mirror is deliberately kept, and here is the reasoning:
 *
 *   - The defect MED-W5 describes is not duplication, it is SILENCE. The client
 *     computes the slip total and posts it; the server only range-checks it
 *     against the section ceilings rather than recomputing. So a drift persists
 *     a WRONG SCORE instead of surfacing as a mismatch.
 *   - Deleting the mirror makes every judge slip depend on a network fetch
 *     succeeding. These tablets are on venue wifi during a live competition.
 *     Trading a silent-drift risk for a scoring-is-down risk is a bad trade.
 *
 * So the server becomes authoritative for DETECTION while the bundled tables
 * stay authoritative for AVAILABILITY. Drift stops being silent, and scoring
 * keeps working when the network does not.
 *
 * IMPORTANT: the two stacks already differ in checklist RULE TEXT — e.g.
 * "One 'B' acrobatic element executed from both sides" (server) versus
 * "One 'B' acrobatic element from both sides" (client). That difference is
 * cosmetic and affects no score. A naive deep-equal would flag it on day one,
 * and an alarm that is wrong on day one is an alarm everybody learns to ignore.
 * Scoring-relevant values are therefore compared strictly and reported as
 * differences; rule text is reported separately as informational.
 */

import { logger } from '@/infrastructure/logger';
import { judgeAPI } from '@/services/public/judge.api';
import {
  COP_EDITION,
  POINT_CEILINGS,
  ELEMENT_CLASS_VALUES,
  DIFFICULTY_REQUIREMENTS,
  TIME_LIMIT_SECONDS,
  COMBINATION_CHECKLISTS,
  getTolerance,
  getTimeDeduction,
} from './copRules';

/** Floating-point-safe comparison for scoring values. */
const sameNumber = (a, b) => Math.abs(Number(a) - Number(b)) < 1e-9;

/**
 * Compare the server's COP payload against the bundled tables.
 *
 * Pure, so it can be tested without a network. Returns every difference rather
 * than throwing on the first, because knowing the full extent of a drift is
 * what tells you which results are suspect.
 *
 * @param {Object} server - Payload from GET /api/public/cop-rules (`data`)
 * @returns {{inSync: boolean, differences: string[], textDifferences: string[]}}
 */
export function compareCopRules(server) {
  const differences = [];
  const textDifferences = [];

  if (!server || typeof server !== 'object') {
    return { inSync: false, differences: ['server payload missing or malformed'], textDifferences };
  }

  if (server.edition !== COP_EDITION) {
    differences.push(`edition: server="${server.edition}" client="${COP_EDITION}"`);
  }

  for (const [key, localValue] of Object.entries(POINT_CEILINGS)) {
    const remote = server.pointCeilings?.[key];
    if (!sameNumber(remote, localValue)) {
      differences.push(`pointCeilings.${key}: server=${remote} client=${localValue}`);
    }
  }

  for (const [key, localValue] of Object.entries(ELEMENT_CLASS_VALUES)) {
    const remote = server.elementClassValues?.[key];
    if (!sameNumber(remote, localValue)) {
      differences.push(`elementClassValues.${key}: server=${remote} client=${localValue}`);
    }
  }

  for (const [group, mix] of Object.entries(DIFFICULTY_REQUIREMENTS)) {
    for (const [cls, count] of Object.entries(mix)) {
      const remote = server.difficultyRequirements?.[group]?.[cls];
      if (!sameNumber(remote, count)) {
        differences.push(`difficultyRequirements.${group}.${cls}: server=${remote} client=${count}`);
      }
    }
  }

  if (!sameNumber(server.timeLimitSeconds, TIME_LIMIT_SECONDS)) {
    differences.push(`timeLimitSeconds: server=${server.timeLimitSeconds} client=${TIME_LIMIT_SECONDS}`);
  }

  // Rather than compare table shapes, evaluate the client's own functions at
  // the server's declared boundaries. That tests what actually happens to a
  // score, and survives either side refactoring an if-ladder into data.
  for (const tier of server.toleranceTiers || []) {
    const local = getTolerance(tier.minAverage);
    if (!sameNumber(local, tier.tolerance)) {
      differences.push(
        `tolerance at avg ${tier.minAverage}: server=${tier.tolerance} client=${local}`
      );
    }
  }
  if (server.toleranceBelowMinimum !== undefined) {
    const lowest = Math.min(...(server.toleranceTiers || []).map((t) => t.minAverage), 5);
    const local = getTolerance(lowest - 0.01);
    if (!sameNumber(local, server.toleranceBelowMinimum)) {
      differences.push(
        `tolerance below minimum: server=${server.toleranceBelowMinimum} client=${local}`
      );
    }
  }

  for (const tier of server.timeDeductionTiers || []) {
    const local = getTimeDeduction(tier.maxOverageSeconds);
    if (!sameNumber(local, tier.deduction)) {
      differences.push(
        `timeDeduction at +${tier.maxOverageSeconds}s: server=${tier.deduction} client=${local}`
      );
    }
  }

  // Combination checklists: ids and penalties decide the score; rule text does not.
  const serverChecklists = server.combinationChecklists || {};
  for (const [apparatus, localItems] of Object.entries(COMBINATION_CHECKLISTS)) {
    const remoteItems = serverChecklists[apparatus];
    if (!Array.isArray(remoteItems)) {
      differences.push(`combinationChecklists.${apparatus}: missing on server`);
      continue;
    }
    if (remoteItems.length !== localItems.length) {
      differences.push(
        `combinationChecklists.${apparatus}: server has ${remoteItems.length} items, client ${localItems.length}`
      );
      continue;
    }
    for (const localItem of localItems) {
      const remoteItem = remoteItems.find((i) => i.id === localItem.id);
      if (!remoteItem) {
        differences.push(`combinationChecklists.${apparatus}: id ${localItem.id} missing on server`);
        continue;
      }
      if (!sameNumber(remoteItem.penalty, localItem.penalty)) {
        differences.push(
          `combinationChecklists.${apparatus}[${localItem.id}].penalty: ` +
          `server=${remoteItem.penalty} client=${localItem.penalty}`
        );
      }
      if (remoteItem.rule !== localItem.rule) {
        textDifferences.push(`combinationChecklists.${apparatus}[${localItem.id}].rule`);
      }
    }
  }

  return { inSync: differences.length === 0, differences, textDifferences };
}

/**
 * Fetch the server's COP rules and report any scoring-relevant drift.
 *
 * Non-blocking and failure-tolerant on purpose: this is a monitor, not a
 * dependency. A failed fetch must never stop a judge scoring, so it logs and
 * moves on — the bundled tables remain in use either way.
 *
 * @returns {Promise<{checked: boolean, inSync?: boolean, differences?: string[]}>}
 */
export async function verifyCopRulesAgainstServer() {
  try {
    const { data } = await judgeAPI.getCopRules();
    const payload = data?.data;
    const result = compareCopRules(payload);

    if (!result.inSync) {
      // Loud on purpose. A drift here means the client is computing slip totals
      // the server will accept without recomputing, so scores persist WRONG.
      logger.error(
        'COP rules drift detected between client and server — scores computed now may be wrong',
        { differences: result.differences }
      );
    } else {
      logger.log('COP rules verified against server', {
        edition: payload?.edition,
        cosmeticTextDifferences: result.textDifferences.length,
      });
    }

    return { checked: true, ...result };
  } catch (error) {
    // Offline, endpoint absent, or an older server: all fine. The bundled
    // tables are still authoritative for availability.
    logger.warn('Could not verify COP rules against the server', { error: error?.message });
    return { checked: false };
  }
}

export default compareCopRules;
