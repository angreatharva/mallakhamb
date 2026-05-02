// createJudges.js

require('dotenv').config({
  path: require('path').join(__dirname, '..', '.env.scripts')
});

const API_BASE_URL = process.env.API_BASE_URL || 'http://localhost:5000';
const LOGIN_ENDPOINT =
  process.env.LOGIN_ENDPOINT || '/api/superadmin/login';
const BULK_JUDGES_ENDPOINT =
  process.env.BULK_JUDGES_ENDPOINT || '/api/superadmin/judges/bulk';

const SUPERADMIN_EMAIL =
  process.env.SUPERADMIN_EMAIL || 'superadmin@gmail.com';

const SUPERADMIN_PASSWORD =
  process.env.SUPERADMIN_PASSWORD || 'Superadmin@2026';

const loginSuperAdmin = async () => {
  try {
    console.log('🔐 Logging in as superadmin...');
    console.log('📍 Login Endpoint:', `${API_BASE_URL}${LOGIN_ENDPOINT}`);

    const response = await fetch(`${API_BASE_URL}${LOGIN_ENDPOINT}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: SUPERADMIN_EMAIL,
        password: SUPERADMIN_PASSWORD,
      }),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('❌ Superadmin login failed');
      console.error('Status:', response.status, response.statusText);
      console.error('Response:', data);
      process.exit(1);
    }

    const token =
      data?.data?.token ||
      data?.token ||
      data?.accessToken ||
      data?.data?.accessToken;

    if (!token) {
      console.error('❌ Token not found in login response');
      console.error('Response:', data);
      process.exit(1);
    }

    console.log('✅ Superadmin login successful');
    return token;
  } catch (error) {
    console.error('❌ Login error:', error.message);
    process.exit(1);
  }
};

const createJudges = async () => {
  try {
    const token = await loginSuperAdmin();

    const payload = {
      gender: 'Male',
      ageGroup: 'Above18',
      competitionTypes: ['competition_1'],
      judges: [
        {
          judgeNo: 1,
          judgeType: 'Senior Judge',
          name: 'SR',
          username: 'srj_s',
          password: 'BRMC@2026',
        },
        {
          judgeNo: 2,
          judgeType: 'Judge 1',
          name: 'J2',
          username: 'j1_j',
          password: 'BRMC@2026',
        },
        {
          judgeNo: 3,
          judgeType: 'Judge 2',
          name: 'J3',
          username: 'j2_j',
          password: 'BRMC@2026',
        },
        {
          judgeNo: 4,
          judgeType: 'Judge 3',
          name: '',
          username: '',
          password: '',
        },
        {
          judgeNo: 5,
          judgeType: 'Judge 4',
          name: '',
          username: '',
          password: '',
        },
      ],
      competition: '69ef7a214bdc94418e56bdb0',
    };


    const endpoint = `${API_BASE_URL}${BULK_JUDGES_ENDPOINT}`;

    console.log('\n🚀 Sending bulk judges request...');
    console.log('📍 Endpoint:', endpoint);
    console.log('👤 Competition:', payload.competition);
    console.log('⚖️ Gender:', payload.gender);
    console.log('🧒 Age Group:', payload.ageGroup);
    console.log('🏆 Competition Types:', payload.competitionTypes.join(', '));
    console.log('👥 Judges Count:', payload.judges.length);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      console.error('❌ Create judges request failed');
      console.error('Status:', response.status, response.statusText);
      console.error('Response:', data);
      process.exit(1);
    }

    console.log('\n✅ Judges created successfully');
    console.log('📩 Message:', data?.message || 'Success');

    const created = data?.data?.created || [];
    const updated = data?.data?.updated || [];
    const errors = data?.data?.errors || [];

    console.log('\n📊 Summary');
    console.log(`- Created: ${created.length}`);
    console.log(`- Updated: ${updated.length}`);
    console.log(`- Errors : ${errors.length}`);

    if (created.length > 0) {
      console.log('\n🆕 Created Judges');
      created.forEach((judge, index) => {
        console.log(
          `${index + 1}. ${judge.judgeType} | ${judge.name} | ${judge.username}`
        );
      });
    }

    if (updated.length > 0) {
      console.log('\n♻️ Updated Judges');
      updated.forEach((judge, index) => {
        console.log(
          `${index + 1}. ${judge.judgeType} | ${judge.name} | ${judge.username}`
        );
      });
    }

    if (errors.length > 0) {
      console.log('\n⚠️ Errors');
      errors.forEach((err, index) => {
        console.log(`${index + 1}.`, err);
      });
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Script failed:', error.message);
    process.exit(1);
  }
};

createJudges();