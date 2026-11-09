/**
 * The category's running order, kept live — for the screens that list
 * athletes but are not the sequencing screen itself (the Scorer's sheet and
 * the Time Keeper's list).
 *
 * Both used to show the squad in registration order and never listened for
 * `performance_order_updated`, so a Senior Judge's or Scorer's re-sequence
 * never reached the people timing and scoring the athletes (bug 2026-11-09).
 *
 * The order is read once, then every change broadcast into the category's
 * room is applied directly from the event (it carries the whole order). A
 * failure to read it is quiet: the list falls back to squad order.
 */
import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import apiConfig from '@/config/api.config';
import { judgeLotsAPI } from '@/services/ordering/lots.api';
import { secureStorage } from '@/utils/auth/secureStorage';
import { logger } from '@/infrastructure/logger';
import { applyRunningOrder, eventMatchesCategory, indexPerformanceOrder } from '@/utils/ordering/performanceOrder';

/**
 * @param {{competitionId?: string, gender?: string, ageGroup?: string, competitionType?: string}|null} category
 * @returns {{teams: Map, players: Map}} the order index (empty until loaded)
 */
export function useRunningOrder(category) {
  const [orderIndex, setOrderIndex] = useState(() => indexPerformanceOrder(null));
  const { competitionId, gender, ageGroup, competitionType } = category || {};
  const ready = !!(competitionId && gender && ageGroup && competitionType);

  useEffect(() => {
    if (!ready) return undefined;
    let alive = true;
    const params = { competitionId, gender, ageGroup, competitionType };
    judgeLotsAPI.getOrder(params)
      .then((res) => { if (alive) setOrderIndex(indexPerformanceOrder(res.data?.data)); })
      .catch((error) => logger.warn('Could not load running order; keeping squad order', error));

    const socket = io(apiConfig.getSocketUrl(), {
      auth: { token: secureStorage.getItem('judge_token') },
      withCredentials: true,
    });
    socket.on('connect', () => {
      socket.emit('join_scoring_room', { roomId: `scoring_${gender}_${ageGroup}_${competitionType}` });
      // Anything changed while disconnected: read it again.
      judgeLotsAPI.getOrder(params)
        .then((res) => { if (alive) setOrderIndex(indexPerformanceOrder(res.data?.data)); })
        .catch(() => {});
    });
    socket.on('performance_order_updated', (event) => {
      if (!eventMatchesCategory(event, params)) return;
      if (event.competition && String(event.competition) !== String(competitionId)) return;
      setOrderIndex(indexPerformanceOrder(event));
    });
    return () => {
      alive = false;
      socket.disconnect();
    };
  }, [ready, competitionId, gender, ageGroup, competitionType]);

  return orderIndex;
}

/**
 * One team's rows (athlete × apparatus) in running order. Rows of the same
 * athlete stay together, in their original apparatus order.
 *
 * @param {Array<{playerId: string, name: string}>} rows
 * @param {string} teamId
 * @param {{players: Map}} orderIndex
 */
export function useOrderedTeamRows(rows, teamId, orderIndex) {
  return useMemo(() => applyRunningOrder(rows, orderIndex?.players, {
    key: (row) => `${String(teamId)}:${String(row.playerId)}`,
    name: (row) => row.name,
  }), [rows, teamId, orderIndex]);
}
