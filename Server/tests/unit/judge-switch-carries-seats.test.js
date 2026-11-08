/**
 * Switching a judge's meet returns their seats there WITH the token
 * (bug fix 2026-11-08).
 *
 * The phone used to learn the seats from a second request after switching. On
 * slow venue data that request was late or dropped, the phone stored an empty
 * seat list, and the Senior Judge saw no other judge's marks while "Edit my
 * score" opened a blank slip. One answer means the two can never disagree.
 */
const JudgeService = require('../../src/services/user/judge.service');

const MEET = '6a8a9286fe57edf060353b1a';

function service(assignments) {
  const svc = Object.create(JudgeService.prototype);
  svc.getAssignments = jest.fn().mockResolvedValue(assignments);
  svc.competitionRepository = { findById: jest.fn().mockResolvedValue({ _id: MEET, name: 'Meet' }) };
  svc.tokenService = { generateToken: jest.fn().mockReturnValue('token') };
  svc.logger = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return svc;
}

describe('JudgeService.setCompetitionContext', () => {
  it('returns the seats at that meet alongside the token', async () => {
    const seat = {
      _id: 'a1', competition: MEET, gender: 'Male', ageGroup: 'Under10',
      competitionTypes: ['competition_1'], apparatus: 'Pole Mallakhamb',
      judgeType: 'Senior Judge', judgeNo: 0, secret: 'not for the client',
    };
    const result = await service([seat]).setCompetitionContext('acc', MEET);

    expect(result.token).toBe('token');
    expect(result.assignments).toEqual([{
      _id: 'a1', competition: MEET, gender: 'Male', ageGroup: 'Under10',
      competitionTypes: ['competition_1'], apparatus: 'Pole Mallakhamb',
      judgeType: 'Senior Judge', judgeNo: 0,
    }]);
  });

  it('still refuses a meet the judge has no seat at', async () => {
    await expect(service([]).setCompetitionContext('acc', MEET)).rejects.toThrow('Not assigned');
  });
});
