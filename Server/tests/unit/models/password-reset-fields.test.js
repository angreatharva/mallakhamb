/**
 * The Admin schema had no resetPasswordToken / resetPasswordExpires paths, so
 * Mongoose's strict mode silently dropped the OTP the reset flow wrote: the
 * email went out, then every code was answered "No OTP found". No admin or
 * superadmin could ever reset a password. Every account type the reset flow
 * can reach must declare all three paths.
 */
const Admin = require('../../../src/models/Admin');
const Coach = require('../../../src/models/Coach');
const Player = require('../../../src/models/Player');
const JudgeAccount = require('../../../src/models/JudgeAccount');

describe.each([
  ['Admin', Admin],
  ['Coach', Coach],
  ['Player', Player],
  ['JudgeAccount', JudgeAccount],
])('%s schema', (_name, Model) => {
  it.each(['resetPasswordToken', 'resetPasswordExpires', 'resetPasswordAttempts'])(
    'declares %s, so a reset write is not dropped by strict mode',
    (path) => {
      expect(Model.schema.path(path)).toBeDefined();
    }
  );

  it('keeps the wrong-guess counter out of default reads', () => {
    expect(Model.schema.path('resetPasswordAttempts').options.select).toBe(false);
  });
});
