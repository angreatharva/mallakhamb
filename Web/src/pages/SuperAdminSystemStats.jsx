import { ResponsiveContainer } from '../components/responsive';
import { ResponsiveHeading } from '../components/responsive/ResponsiveTypography';

const SuperAdminSystemStats = () => {
  return (
    <ResponsiveContainer maxWidth="desktop" padding="responsive">
      <div className="bg-white rounded-xl shadow-lg p-6">
        <ResponsiveHeading level={3} className="text-gray-900 mb-4">
          System Statistics
        </ResponsiveHeading>
        <p className="text-gray-600">Detailed system statistics coming soon...</p>
      </div>
    </ResponsiveContainer>
  );
};

export default SuperAdminSystemStats;
